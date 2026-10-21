import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GreetingVoicePlayer } from '../src/shared/voice.js';

class Clip {
  currentTime = 0;
  plays = 0;
  pauses = 0;
  ended = () => {};
  play(): Promise<void> { this.plays++; return Promise.resolve(); }
  pause(): void { this.pauses++; }
  addEventListener(_type: 'ended', listener: () => void): void { this.ended = listener; }
}

test('completed greetings play three distinct variations without repeats', () => {
  const clips = [new Clip(), new Clip(), new Clip()];
  const player = new GreetingVoicePlayer(clips, () => assert.fail('Playback failed'), () => 0.4);
  const indices = [];
  for (let i = 0; i < 3; i++) {
    const index = player.request();
    indices.push(index);
    clips[index].ended();
  }
  assert.equal(new Set(indices).size, 3);
  assert.deepEqual(clips.map(clip => clip.plays), [1, 1, 1]);
});

test('rapid clicks finish the current sound and queue one different greeting', () => {
  const clips = [new Clip(), new Clip(), new Clip()];
  const player = new GreetingVoicePlayer(clips, () => assert.fail('Playback failed'), () => 0.4);
  const first = player.request();
  const pending = player.request();
  assert.notEqual(pending, first);
  for (let i = 0; i < 30; i++) assert.equal(player.request(), pending);
  assert.equal(clips.reduce((sum, clip) => sum + clip.plays, 0), 1);
  assert.equal(clips.reduce((sum, clip) => sum + clip.pauses, 0), 0);
  clips[first].ended();
  assert.equal(clips[pending].plays, 1);
  clips[pending].ended();
  assert.equal(clips.reduce((sum, clip) => sum + clip.plays, 0), 2);
});

test('muting or dragging clears pending audio', () => {
  for (const mute of [true, false]) {
    const clips = [new Clip(), new Clip(), new Clip()];
    const player = new GreetingVoicePlayer(clips, () => assert.fail('Playback failed'));
    const first = player.request();
    player.request();
    if (mute) player.setMuted(true);
    else player.stop();
    clips[first].ended();
    assert.equal(clips.reduce((sum, clip) => sum + clip.plays, 0), 1);
    if (mute) {
      player.request();
      assert.equal(clips.reduce((sum, clip) => sum + clip.plays, 0), 1);
      player.setMuted(false);
    }
    player.request();
    assert.equal(clips.reduce((sum, clip) => sum + clip.plays, 0), 2);
  }
});
