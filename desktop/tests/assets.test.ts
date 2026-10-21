import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { voiceCatalog } from '../src/shared/voice-catalog.js';
import { inflateSync } from 'node:zlib';

test('connected character poses retain their dimensions and transparency', async () => {
  for (const [name, width, height] of [['character', 1536, 2496], ['seated', 384, 416]] as const) {
    const png = await readFile(new URL(`../src/assets/${name}.png`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), width, name);
    assert.equal(png.readUInt32BE(20), height, name);
    assert.equal(png[25], 6, `${name} must retain RGBA transparency`);
  }
});

test('every standing and seated pose connects the face and torso through opaque neck pixels', async () => {
  for (const name of ['character', 'seated']) {
    const png = await readFile(new URL(`../src/assets/${name}.png`, import.meta.url));
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    const chunks = [];
    for (let offset = 8; offset < png.length;) {
      const size = png.readUInt32BE(offset), type = png.subarray(offset + 4, offset + 8).toString();
      if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + size));
      offset += size + 12;
    }
    const raw = inflateSync(Buffer.concat(chunks));
    const stride = width * 4, pixels = new Uint8Array(stride * height);
    const paeth = (a: number, b: number, c: number): number => {
      const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
      return da <= db && da <= dc ? a : db <= dc ? b : c;
    };
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      for (let x = 0; x < stride; x++) {
        const i = y * stride + x, a = x >= 4 ? pixels[i - 4] : 0, b = y ? pixels[i - stride] : 0;
        const c = y && x >= 4 ? pixels[i - stride - 4] : 0;
        const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
        pixels[i] = raw[y * (stride + 1) + x + 1] + predictor;
      }
    }
    const columns = width / 384;
    for (let frame = 0; frame < columns * height / 416; frame++) {
      const seen = new Uint8Array(384 * 416), queue = new Int32Array(384 * 416);
      const opaque = (p: number): boolean => pixels[((Math.floor(frame / columns) * 416 + Math.floor(p / 384)) * width + frame % columns * 384 + p % 384) * 4 + 3] > 28;
      let head = 0, tail = 1, connected = false;
      queue[0] = 320 * 384 + 192; seen[queue[0]] = 1;
      while (head < tail) {
        const p = queue[head++], x = p % 384, y = Math.floor(p / 384);
        if (x >= 150 && x < 225 && y >= 185 && y < 245) { connected = true; break; }
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy, next = ny * 384 + nx;
          if (nx >= 0 && nx < 384 && ny >= 0 && ny < 416 && !seen[next] && opaque(next)) { seen[next] = 1; queue[tail++] = next; }
        }
      }
      assert.ok(connected, `${name} pose ${frame} must keep its face attached to its torso`);
    }
  }
});

test('greetings and emotional recordings are present and distinct', async () => {
  const hashes = [];
  for (const voice of voiceCatalog) {
    const audio = await readFile(new URL(`../src/assets/${voice.file}.mp3`, import.meta.url));
    assert.ok(audio.length > 4000);
    hashes.push(createHash('sha256').update(audio).digest('hex'));
  }
  assert.equal(new Set(hashes).size, voiceCatalog.length);
});
