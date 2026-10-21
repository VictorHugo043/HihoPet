import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PetBehavior, OrbitTracker, ShuffleBag } from '../src/shared/behavior.js';

test('a fast one-way drag lands without becoming dizzy', () => {
  const pet = new PetBehavior();
  pet.beginDrag(0);
  for (let i = 0; i < 12; i++) pet.drag(1800, 100, i * 0.1);
  pet.endDrag(1.2);
  assert.equal(pet.mood, 'landing');
  pet.update(2);
  assert.equal(pet.mood, 'idle');
});

test('repeated fast reversals lead through dizziness, anger and recovery', () => {
  const pet = new PetBehavior();
  pet.beginDrag(0);
  for (let i = 0; i < 7; i++) pet.drag(i % 2 ? -2000 : 2000, 0, i * 0.15);
  assert.equal(pet.shakeLevel, 1);
  pet.endDrag(1);
  assert.equal(pet.mood, 'dizzy');
  assert.equal(pet.tap(0, 1.1, 1), false);
  pet.jump(1.2);
  assert.equal(pet.mood, 'dizzy');
  pet.update(4.2);
  assert.equal(pet.mood, 'waking');
  pet.update(4.9);
  assert.equal(pet.mood, 'angry');
  pet.update(7.9);
  assert.equal(pet.mood, 'pout');
  pet.update(9.2);
  assert.equal(pet.mood, 'idle');
});

test('slow movement and widely separated reversals do not trigger dizziness', () => {
  for (const [speed, interval] of [[300, 0.15], [1800, 1]] as const) {
    const pet = new PetBehavior();
    pet.beginDrag(0);
    for (let i = 0; i < 10; i++) pet.drag(i % 2 ? -speed : speed, 0, i * interval);
    pet.endDrag(10);
    assert.equal(pet.mood, 'landing');
  }
});

test('ordinary waking is gentle and long time gaps finish finite actions', () => {
  const pet = new PetBehavior();
  pet.toggleSleep(0);
  pet.update(1000);
  assert.equal(pet.mood, 'sleeping');
  pet.toggleSleep(1000);
  assert.equal(pet.mood, 'waking');
  pet.update(1001);
  assert.equal(pet.mood, 'idle');
  pet.becomeDizzy(1002);
  pet.update(2000);
  assert.equal(pet.mood, 'idle');
});

test('jump includes its landing phase', () => {
  const pet = new PetBehavior();
  pet.jump(0);
  pet.update(0.95);
  assert.equal(pet.mood, 'landing');
  pet.update(1.5);
  assert.equal(pet.mood, 'idle');
});

test('continuous circles trigger in either direction', () => {
  for (const direction of [-1, 1]) {
    const orbit = new OrbitTracker();
    let triggered = false;
    for (let i = 0; i <= 360; i++) {
      const angle = direction * i / 360 * 6 * Math.PI;
      triggered ||= orbit.observe(190 * Math.sin(angle), 190 * Math.cos(angle), i / 60);
    }
    assert.equal(triggered, true);
  }
});

test('back-and-forth gaze and leaving the orbit area reset progress', () => {
  const orbit = new OrbitTracker();
  for (let i = 0; i < 600; i++) {
    const angle = Math.sin(i * 0.05) * 1.5;
    assert.equal(orbit.observe(190 * Math.sin(angle), 190 * Math.cos(angle), i / 60), false);
  }
  orbit.reset();
  for (let loop = 0; loop < 4; loop++) {
    for (let i = 0; i < 120; i++) {
      const angle = i / 120 * 2 * Math.PI;
      assert.equal(orbit.observe(190 * Math.sin(angle), 190 * Math.cos(angle), loop * 2.1 + i / 60), false);
    }
    assert.equal(orbit.observe(0, 700, loop * 2.1 + 2), false);
  }
});

test('greetings use all three variations without immediate repetition', () => {
  let seed = 17;
  const bag = new ShuffleBag(3, () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; });
  let previous = -1;
  for (let group = 0; group < 40; group++) {
    const batch = [];
    for (let i = 0; i < 3; i++) {
      const next = bag.next();
      assert.notEqual(next, previous);
      previous = next;
      batch.push(next);
    }
    assert.equal(new Set(batch).size, 3);
  }
});
