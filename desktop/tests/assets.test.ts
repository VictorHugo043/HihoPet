import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('packaged animation atlases have their contracted dimensions', async () => {
  for (const name of ['codex', 'held', 'dizzy', 'angry', 'sleep', 'dance', 'greeting', 'jump']) {
    const png = await readFile(new URL(`../src/assets/${name}.png`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1536, name);
    assert.equal(png.readUInt32BE(20), name === 'codex' ? 2288 : name === 'jump' ? 1248 : 832, name);
    assert.equal(png[25], 6, `${name} must retain RGBA transparency`);
  }
});

test('all three voice variations are present and distinct', async () => {
  const hashes = [];
  for (const index of [1, 2, 3]) {
    const audio = await readFile(new URL(`../src/assets/heeho-${index}.mp3`, import.meta.url));
    assert.ok(audio.length > 4000);
    hashes.push(createHash('sha256').update(audio).digest('hex'));
  }
  assert.equal(new Set(hashes).size, 3);
});
