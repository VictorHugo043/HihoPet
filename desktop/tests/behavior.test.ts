import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PetBehavior, OrbitTracker, ShuffleBag } from '../src/shared/behavior.js';

test('a fast one-way drag lands without becoming dizzy', () => {
  const pet = new PetBehavior();
  pet.beginDrag(0);
  for (let i = 0; i < 12; i++) pet.drag(i * 120, i * 10, i * 0.1);
  pet.endDrag(1.2);
  assert.equal(pet.mood, 'landing');
  pet.update(2);
  assert.equal(pet.mood, 'idle');
});

test('repeated fast reversals lead through dizziness, anger and recovery', () => {
  const pet = new PetBehavior();
  pet.beginDrag(0);
  for (let i = 0; i < 9; i++) pet.drag(i % 2 ? -60 : 60, 0, i * 0.1);
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

test('smooth human turns trigger despite slowing to zero at each extremum', () => {
  for (const diagonal of [false, true]) {
    const pet = new PetBehavior();
    pet.beginDrag(0, 70, diagonal ? 70 : 0);
    for (let i = 1; i <= 150; i++) {
      const t = i / 60;
      const x = 70 * Math.cos(t * 2 * Math.PI / 0.7);
      pet.drag(x, diagonal ? x : 0, t);
    }
    assert.equal(pet.shakeLevel, 1);
    pet.endDrag(2.6);
    assert.equal(pet.mood, 'dizzy');
  }
});

test('slow reversals and tiny high-frequency jitter do not cause dizziness', () => {
  for (const [amplitude, period] of [[80, 5], [5, 0.15]]) {
    const pet = new PetBehavior();
    pet.beginDrag(0, amplitude, 0);
    for (let i = 1; i <= 900; i++) {
      const t = i / 60;
      pet.drag(amplitude * Math.cos(t * 2 * Math.PI / period), 0, t);
    }
    pet.endDrag(15.1);
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

test('five minutes without attention sleeps and ordinary waking does not become angry', () => {
  const pet = new PetBehavior();
  pet.interact(20);
  pet.autoSleep(319.9, false); assert.equal(pet.mood, 'idle');
  pet.curious(320); pet.autoSleep(320, false); assert.equal(pet.mood, 'sleeping');
  pet.toggleSleep(321); assert.equal(pet.mood, 'waking');
  pet.update(322); assert.equal(pet.mood, 'idle');
  pet.autoSleep(620, false); assert.equal(pet.mood, 'idle');
  pet.autoSleep(621, false); assert.equal(pet.mood, 'sleeping');
});

test('attention, dragging and active music postpone automatic sleep', () => {
  const pet = new PetBehavior();
  pet.interact(290); pet.autoSleep(300, false); assert.equal(pet.mood, 'idle');
  for (let time = 300; time <= 1200; time += 60) pet.autoSleep(time, true);
  assert.equal(pet.mood, 'idle');
  pet.autoSleep(1499, false); assert.equal(pet.mood, 'idle');
  pet.beginDrag(1500); pet.autoSleep(1900, false); assert.equal(pet.mood, 'held');
  pet.endDrag(1900); pet.update(1901); pet.autoSleep(1901, false);
  assert.equal(pet.mood, 'idle');
});

test('continuous circles trigger in either direction', () => {
  for (const direction of [-1, 1]) {
    const orbit = new OrbitTracker();
    let triggered = false;
    for (let i = 0; i <= 360; i++) {
      const angle = direction * i / 360 * 4.1 * Math.PI;
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

test('close and off-centre circles accumulate without resetting near the body', () => {
  for (const radius of [45, 85, 190]) {
    const orbit = new OrbitTracker();
    let triggered = false;
    for (let i = 0; i <= 300; i++) {
      const angle = i / 300 * 4.5 * Math.PI;
      const x = radius * Math.sin(angle);
      const y = radius * Math.cos(angle) + radius * 0.3;
      if (orbit.observe(x, y, i / 60)) triggered = true;
    }
    assert.equal(triggered, true, `radius ${radius}`);
  }
});

test('two deliberate slow circles retain progress across more than ten seconds', () => {
  const orbit = new OrbitTracker();
  let triggered = false;
  for (let i = 0; i <= 900; i++) {
    const angle = i / 900 * 4.2 * Math.PI;
    if (orbit.observe(100 * Math.sin(angle), 100 * Math.cos(angle), i / 60)) triggered = true;
  }
  assert.equal(triggered, true);
});
