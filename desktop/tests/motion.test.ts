import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionTarget, MotionSmoother } from '../src/shared/motion.js';
import { MusicSignal } from '../src/shared/music-signal.js';
import { beatPulse } from '../src/shared/music-track.js';
import { PetBehavior, PettingTracker } from '../src/shared/behavior.js';

test('dance and dizziness keep a stable expression and small continuous motion', () => {
  for (const mood of ['dance', 'dizzy'] as const) {
    let previous = motionTarget(mood, 0, 0);
    for (let i = 1; i <= 600; i++) {
      const next = motionTarget(mood, i / 60, i / 60);
      assert.equal(next.frame, previous.frame);
      assert.ok(Math.abs(next.headAngle - previous.headAngle) < 0.012);
      assert.ok(Math.abs(next.x - previous.x) < 0.5);
      assert.ok(Math.abs(next.y - previous.y) < 0.6);
      previous = next;
    }
  }
});

test('state changes ease limb rotations rather than snapping to a new pose', () => {
  const smoother = new MotionSmoother();
  const pose = { ...smoother.update(motionTarget('idle', 0, 0), 1 / 60) };
  const next = smoother.update(motionTarget('greeting', 0.2, 0.2), 1 / 60);
  assert.ok(next.armLeft > pose.armLeft);
  assert.ok(next.armLeft < 0.5);
});

test('gaze selects real directional artwork without translating the head', () => {
  const right = motionTarget('idle', 0, 0, 0, 0, 0, 4);
  const left = motionTarget('idle', 0, 0, 0, 0, 0, 12);
  assert.equal(right.frame, 12);
  assert.equal(left.frame, 20);
  assert.equal(right.headAngle, 0);
  assert.equal(left.headAngle, 0);
  assert.ok(!('headX' in right) && !('headY' in right));
});

test('music preserves directional gaze and cannot replace emotional expressions', () => {
  for (let direction = 0; direction < 16; direction++) {
    for (const energy of [0, 0.01, 0.03, 0.6]) {
      assert.equal(motionTarget('idle', 0, 0, 0, energy, 1, direction).frame, 8 + direction);
    }
  }
  assert.equal(motionTarget('dizzy', 0, 0, 0, 0.6, 1, 4).frame, 2);
  assert.equal(motionTarget('angry', 0, 0, 0, 0.6, 1, 4).frame, 3);
});

test('recovered shake returns to gaze without replaying emotional poses', () => {
  const pet = new PetBehavior();
  pet.beginDrag(0);
  for (let i = 0; i < 9; i++) pet.drag(i % 2 ? -60 : 60, 0, i * 0.1);
  pet.endDrag(1);
  for (let i = 0; i < 600; i++) {
    const time = 10 + i / 60;
    pet.update(time);
    assert.equal(pet.mood, 'idle');
    assert.equal(pet.shakeLevel, 0);
    const frame = motionTarget(pet.mood, time - pet.beganAt, time, 0, 0.5, time, i % 16).frame;
    assert.ok(frame >= 8 && frame < 24);
  }
});

test('music motion stays still in silence and fades after sound stops', () => {
  const signal = new MusicSignal();
  for (let i = 0; i < 60; i++) assert.equal(signal.update(0, 0, i / 30).energy, 0);
  let value = { energy: 0, phase: 0 };
  for (let i = 60; i < 120; i++) value = signal.update(0.06, i % 15 === 0 ? 0.04 : 0.008, i / 30);
  assert.ok(value.energy > 0.4);
  for (let i = 120; i < 180; i++) value = signal.update(0, 0, i / 30);
  assert.equal(value.energy, 0);
});

test('music deforms one seated pose with a fixed base and volume-dependent compression', () => {
  for (const mode of ['system', 'song'] as const) {
    let previous = motionTarget('idle', 0, 0, 0, 1, 0, undefined, mode, 1);
    let lowestScale = 1;
    for (let i = 1; i <= 600; i++) {
      const time = i / 60;
      const age = time % 0.5;
      const next = motionTarget('idle', time, time, 0, 1, time * Math.PI * 4, i % 16, mode, beatPulse(age) + beatPulse(age - 0.5));
      assert.equal(next.frame, 24);
      assert.equal(next.x, 0); assert.equal(next.y, 0); assert.equal(next.angle, 0);
      assert.ok(Math.abs(next.sy - previous.sy) < 0.18);
      assert.ok(next.sx > 0 && next.sy > 0 && Math.abs(next.yaw) < 0.3);
      lowestScale = Math.min(lowestScale, next.sy);
      previous = next;
    }
    assert.ok(lowestScale < 0.55);
    const quiet = motionTarget('idle', 0, 0, 0, 0, 1, undefined, mode);
    assert.equal(quiet.frame, 24); assert.equal(quiet.y, 0);
    assert.equal(quiet.sx, 1); assert.equal(quiet.sy, 1); assert.equal(quiet.yaw, 0);
    assert.equal(motionTarget('dizzy', 0, 0, 0, 1, 1, undefined, mode).frame, 2);
    const quietBeat = motionTarget('idle', 0, 0, 0, 0.15, 0, undefined, mode, 1);
    const loudBeat = motionTarget('idle', 0, 0, 0, 0.9, 0, undefined, mode, 1);
    assert.ok(loudBeat.sy < quietBeat.sy - 0.3 && loudBeat.sx > quietBeat.sx);
  }
});

test('confirmed system drum attacks compress within four display frames', () => {
  const signal = new MusicSignal();
  signal.update(0, 0, 1);
  const smoother = new MotionSmoother();
  let next;
  for (let frame = 1; frame <= 4; frame++) {
    const value = signal.update(0.12, 0.08, 1 + frame / 60);
    next = smoother.update(motionTarget('idle', 0, 0, 0, value.energy, value.phase, undefined, 'system', value.pulse), 1 / 60, true);
  }
  assert.ok(next);
  assert.ok(next.sy < 0.81);
  assert.equal(next.y, 0);
});

test('loud audio retains volume differences instead of clipping to a fixed amplitude', () => {
  const levels = [0.01, 0.06, 0.18, 0.4].map(rms => {
    const signal = new MusicSignal();
    let energy = 0;
    for (let i = 0; i < 60; i++) energy = signal.update(rms, rms, i / 60).energy;
    return energy;
  });
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] > levels[i - 1] + 0.08);
});

test('petting needs deliberate gentle back-and-forth motion on the head', () => {
  const petting = new PettingTracker();
  let triggered = false;
  for (let i = 0; i < 120; i++) if (petting.observe(30 * Math.sin(i / 60 * Math.PI * 3), 0, i / 60, true)) triggered = true;
  assert.equal(triggered, true);
  const passing = new PettingTracker();
  for (let i = 0; i < 100; i++) assert.equal(passing.observe(i * 3, 0, i / 60, true), false);
});

test('slow caresses accumulate even when each sample moves less than two pixels', () => {
  const petting = new PettingTracker();
  let triggered = false;
  for (let i = 0; i < 180; i++) if (petting.observe(18 * Math.sin(i / 60 * 2 * Math.PI / 1.5), 0, i / 60, true)) triggered = true;
  assert.equal(triggered, true);
});
