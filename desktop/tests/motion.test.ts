import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionTarget, MotionSmoother } from '../src/shared/motion.js';
import { MusicSignal } from '../src/shared/music-signal.js';
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
  for (let i = 60; i < 120; i++) value = signal.update(0.06, i % 15 === 0 ? 0.8 : 0.1, i / 30);
  assert.ok(value.energy > 0.4);
  for (let i = 120; i < 180; i++) value = signal.update(0, 0, i / 30);
  assert.equal(value.energy, 0);
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
