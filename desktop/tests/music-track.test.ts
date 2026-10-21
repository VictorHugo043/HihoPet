import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicTrack } from '../src/shared/music-track.js';
import { motionTarget, MotionSmoother } from '../src/shared/motion.js';

const rate = 12000;
function percussion(beats: number[], amplitudes = beats.map(() => 0.45)): Float32Array {
  return Float32Array.from({ length: Math.ceil((beats.at(-1)! + 1) * rate) }, (_, i) => {
    const time = i / rate;
    let sample = 0.005 * Math.sin(time * 2 * Math.PI * 440);
    for (let j = 0; j < beats.length; j++) {
      const age = time - beats[j];
      if (age >= 0 && age < 0.2) sample += amplitudes[j] * Math.sin(age * 2 * Math.PI * 80) * Math.exp(-age * 35);
    }
    return sample;
  });
}

test('local compression follows real drum onsets across different and changing tempos', () => {
  const patterns = [90, 120, 150].map(bpm => Array.from({ length: 10 }, (_, i) => 0.5 + i * 60 / bpm));
  patterns.push([0.5, 1, 1.5, 2, 2.4, 2.8, 3.2, 3.6]);
  for (const beats of patterns) {
    const track = new MusicTrack([percussion(beats)], rate), smoother = new MotionSmoother();
    const samples: { time: number; sy: number }[] = [];
    for (let time = 0; time < beats.at(-1)! + 0.4; time += 1 / 120) {
      const frame = track.sample(time);
      const pose = smoother.update(motionTarget('idle', time, time, 0, frame.energy, frame.phase, undefined, 'song', frame.pulse), 1 / 120, true);
      samples.push({ time, sy: pose.sy });
    }
    for (const beat of beats) {
      const region = samples.filter(frame => Math.abs(frame.time - beat) < 0.08);
      const peak = region.reduce((a, b) => a.sy < b.sy ? a : b);
      assert.ok(Math.abs(peak.time - beat) < 0.035, `compression must land on ${beat.toFixed(3)}s`);
      assert.ok(peak.sy < 0.8);
    }
  }
});

test('steady bass and silence do not invent drum beats', () => {
  for (const frequency of [0, 60, 80, 100, 440]) {
    const data = Float32Array.from({ length: rate * 4 }, (_, i) => 0.2 * Math.sin(i / rate * frequency * 2 * Math.PI));
    const track = new MusicTrack([data], rate);
    for (let time = 1; time < 3; time += 1 / 120) assert.equal(track.sample(time).pulse, 0);
  }
});

test('weak pickups do not steal the following strong drum beat', () => {
  const data = percussion([0.4, 0.5, 0.9, 1, 1.4, 1.5], [0.1, 0.45, 0.1, 0.45, 0.1, 0.45]);
  const track = new MusicTrack([data], rate);
  for (const beat of [0.5, 1, 1.5]) {
    assert.ok(track.sample(beat).pulse > 0.8);
    assert.ok(track.sample(beat - 0.1).pulse < 0.1);
  }
});

test('anticipating an upcoming beat does not snap the secondary motion phase', () => {
  const track = new MusicTrack([percussion([0.5, 1, 1.5])], rate);
  for (let time = 0.7; time < 1.2; time += 0.002) {
    const a = track.sample(time).phase, b = track.sample(time + 0.002).phase;
    assert.ok(Math.abs(Math.sin(a) - Math.sin(b)) < 0.04);
    assert.ok(Math.abs(Math.cos(a) - Math.cos(b)) < 0.04);
  }
});

test('local loudness changes compression strength and opposite stereo phases retain beats', () => {
  const data = percussion([0.5, 1.5], [0.1, 0.45]);
  const track = new MusicTrack([data, data.map(value => -value)], rate);
  const quiet = track.sample(0.5), loud = track.sample(1.5);
  assert.ok(quiet.pulse > 0.8 && loud.pulse > 0.8);
  assert.ok(loud.energy > quiet.energy + 0.2);
  assert.deepEqual(track.sample(-1), { energy: 0, phase: 0, pulse: 0 });
  assert.deepEqual(track.sample(100), { energy: 0, phase: 0, pulse: 0 });
});
