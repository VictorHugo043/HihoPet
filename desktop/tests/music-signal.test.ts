import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicSignal } from '../src/shared/music-signal.js';

type Levels = (time: number) => { rms: number; bass: number };
function analyse(duration: number, levels: Levels, jitter = false): { time: number; pulse: number }[] {
  const signal = new MusicSignal(), frames = [];
  for (let i = 0, time = 0; time < duration; i++, time += (jitter ? [0.012, 0.02, 0.018][i % 3] : 1 / 60)) {
    const { rms, bass } = levels(time);
    frames.push({ time, pulse: signal.update(rms, bass, time).pulse });
  }
  return frames;
}
function peaks(frames: { time: number; pulse: number }[], threshold = 0.8): number[] {
  return frames.filter((frame, i) => frame.pulse > threshold && frame.pulse >= (frames[i - 1]?.pulse ?? 0) &&
    frame.pulse > (frames[i + 1]?.pulse ?? 0)).map(frame => frame.time);
}
function attacks(time: number, beats: number[], decay = 25): number {
  return beats.reduce((sum, beat) => {
    const age = time - beat;
    return sum + (age >= 0 && age < 0.25 ? Math.exp(-age * decay) : 0);
  }, 0);
}

test('system listening follows drums rather than interleaved vocal and high-frequency attacks', () => {
  const beats = Array.from({ length: 16 }, (_, i) => 0.5 + i * 60 / 129);
  const decorations = Array.from({ length: 65 }, (_, i) => 0.12 + i * 0.117);
  for (const gain of [0.25, 0.65, 1]) {
    const detected = peaks(analyse(8, time => {
      const drum = attacks(time, beats), other = attacks(time, decorations, 40);
      return { rms: gain * (0.015 + drum * 0.15 + other * 0.2), bass: gain * (0.006 + drum * 0.1 + other * 0.002) };
    }, true));
    assert.equal(detected.length, beats.length, `gain ${gain}: decorations must not add beats`);
    beats.forEach((beat, i) => assert.ok(detected[i] - beat >= 0 && detected[i] - beat < 0.085));
  }
});

test('system drum detection accommodates different tempos and a faster section', () => {
  const patterns = [90, 120, 150, 180].map(bpm => Array.from({ length: 12 }, (_, i) => 0.5 + i * 60 / bpm));
  patterns.push([0.5, 1.1667, 1.8333, 2.5, 2.8333, 3.1667, 3.5, 3.8333]);
  for (const beats of patterns) {
    const detected = peaks(analyse(beats.at(-1)! + 0.5, time => ({
      rms: 0.01 + attacks(time, beats) * 0.18, bass: 0.005 + attacks(time, beats) * 0.12
    })));
    assert.equal(detected.length, beats.length);
    beats.forEach((beat, i) => assert.ok(Math.abs(detected[i] - beat) < 0.085));
  }
});

test('without drums full-band attacks produce gentler, spaced pulses', () => {
  const notes = Array.from({ length: 50 }, (_, i) => 0.5 + i * 0.1);
  const frames = analyse(6, time => ({ rms: 0.01 + attacks(time, notes, 40) * 0.18, bass: 0.001 }));
  const detected = peaks(frames, 0.2);
  assert.ok(detected.length >= 5 && detected.length <= 11);
  assert.ok(Math.max(...frames.map(frame => frame.pulse)) <= 0.35);
  for (let i = 1; i < detected.length; i++) assert.ok(detected[i] - detected[i - 1] >= 0.44);
});

test('steady bass and silence do not generate repeated live drum pulses', () => {
  for (const level of [0, 0.015, 0.08, 0.3]) {
    const frames = analyse(5, time => ({ rms: level * 1.5, bass: level * (1 + 0.03 * Math.sin(time * 2 * Math.PI * 17)) }));
    assert.equal(peaks(frames.filter(frame => frame.time > 1), 0.1).length, 0);
  }
});

test('a drumless passage switches to gentle fallback after the drum phrase finishes', () => {
  const beats = [0.5, 1, 1.5, 2], notes = [2.25, 2.75, 3.25, 3.75, 4.25, 4.75, 5.25];
  const frames = analyse(6, time => ({ rms: 0.01 + attacks(time, beats) * 0.18 + attacks(time, notes) * 0.15,
    bass: 0.002 + attacks(time, beats) * 0.12 }));
  assert.equal(peaks(frames).length, beats.length);
  assert.equal(peaks(frames.filter(frame => frame.time > 2.2 && frame.time < 4), 0.2).length, 0);
  assert.ok(peaks(frames.filter(frame => frame.time > 4), 0.2).length >= 2);
});
