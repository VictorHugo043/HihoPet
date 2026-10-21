import { Artwork, type SpriteFrame } from './artwork.js';
import { OrbitTracker, PetBehavior, type Mood } from './shared/behavior.js';
import { GreetingVoicePlayer } from './shared/voice.js';
import type { PointerSample, Settings } from './bridge.js';

const canvas = document.querySelector<HTMLCanvasElement>('#pet')!;
const context = canvas.getContext('2d')!;
const artwork = new Artwork();
const behavior = new PetBehavior();
const orbit = new OrbitTracker();
const voices: HTMLAudioElement[] = [];
let voicePlayer: GreetingVoicePlayer;
let settings: Settings = { muted: false, scale: 1.5 };
let pointer: PointerSample | undefined;
let pointerMovedAt = 0;
let previousTime = 0;
let nextCuriosity = 12;
let angle = 0;
let angleVelocity = 0;
let pressedAt = -Infinity;
let previousMood: Mood | undefined;
let hit = false;
let down: { x: number; y: number; pointerId: number } | undefined;
let suppressClickUntil = 0;
let pixelRatio = 1;

const descriptions: Record<Mood, string> = {
  idle: '正在休息', greeting: '正在打招呼', delighted: '开心欢呼', jump: '正在跳跃', held: '被拎起来了',
  landing: '落地回弹', dizzy: '晕乎乎', waking: '正在醒来', angry: '正在生气跺脚',
  pout: '正在消气', dance: '正在跳舞', sleeping: '正在睡觉', curious: '好奇地看看'
};

function stopVoice(): void { voicePlayer.stop(); }

function greet(): void {
  const time = performance.now() / 1000;
  if (behavior.dragging || ['dizzy', 'waking'].includes(behavior.mood)) return;
  const index = voicePlayer.request();
  if (behavior.tap(index, time, Math.min(2.4, Math.max(1.1, voices[index].duration + 0.2)))) {
    nextCuriosity = time + 18;
  }
}

function finishDrag(): void {
  if (!down) return;
  if (behavior.dragging) {
    behavior.endDrag(performance.now() / 1000);
    suppressClickUntil = performance.now() + 250;
  }
  window.hiho.endDrag();
  canvas.classList.remove('held');
  down = undefined;
}

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pressedAt = performance.now() / 1000;
  down = { x: event.screenX, y: event.screenY, pointerId: event.pointerId };
  canvas.setPointerCapture(event.pointerId);
  window.hiho.prepareDrag();
});
canvas.addEventListener('pointermove', event => {
  if (!down || event.pointerId !== down.pointerId) return;
  const time = performance.now() / 1000;
  if (!behavior.dragging && Math.hypot(event.screenX - down.x, event.screenY - down.y) > 5) {
    behavior.beginDrag(time, down.x, down.y);
    orbit.reset();
    angle = angleVelocity = 0;
    stopVoice();
    canvas.classList.add('held');
    window.hiho.startDrag();
  }
  if (behavior.dragging) behavior.drag(event.screenX, event.screenY, time);
});
canvas.addEventListener('pointerup', event => {
  if (event.button === 0) finishDrag();
});
canvas.addEventListener('pointercancel', finishDrag);
canvas.addEventListener('lostpointercapture', finishDrag);
canvas.addEventListener('click', event => {
  if (performance.now() < suppressClickUntil) return;
  if (event.detail === 2) behavior.jump(performance.now() / 1000);
  else greet();
});
canvas.addEventListener('contextmenu', event => { event.preventDefault(); window.hiho.contextMenu(); });
canvas.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); greet(); }
  else if (event.key === ' ') { event.preventDefault(); behavior.jump(performance.now() / 1000); }
});

window.hiho.onPointer(sample => {
  pointer = sample;
  const time = performance.now() / 1000;
  if (sample.moved) pointerMovedAt = time;
});
window.hiho.onAction(action => {
  const time = performance.now() / 1000;
  if (action.type === 'dance') behavior.dance(time);
  else if (action.type === 'sleep') { stopVoice(); orbit.reset(); behavior.toggleSleep(time); }
  else if (action.type === 'settings') {
    settings = action.settings;
    voicePlayer.setMuted(settings.muted);
  }
});

function resizeCanvas(): void {
  pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * pixelRatio);
  canvas.height = Math.round(window.innerHeight * pixelRatio);
}
window.addEventListener('resize', resizeCanvas);

function isOpaque(frame: SpriteFrame, transform: DOMMatrix, x: number, y: number): boolean {
  const point = transform.inverse().transformPoint(new DOMPoint(x * pixelRatio, y * pixelRatio));
  const px = Math.floor(point.x + 96), py = Math.floor(point.y + 208);
  if (px < 0 || py < 0 || px >= 192 || py >= 208) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const sx = px + dx, sy = py + dy;
    if (sx >= 0 && sx < 192 && sy >= 0 && sy < 208 && frame.alpha[sy * 192 + sx] > 28) return true;
  }
  return false;
}

function animate(milliseconds: number): void {
  const time = milliseconds / 1000;
  const dt = previousTime ? Math.min(1 / 20, Math.max(1 / 240, time - previousTime)) : 1 / 60;
  previousTime = time;
  behavior.update(time);
  if (behavior.mood === 'idle' && time > nextCuriosity && time - pointerMovedAt > 2.3) {
    behavior.curious(time);
    nextCuriosity = time + 15 + Math.random() * 10;
  }
  let look: number | undefined;
  if (behavior.mood === 'idle' && pointer && time - pointerMovedAt < 2.3) {
    const dx = (pointer.localX - window.innerWidth / 2) / settings.scale;
    const dy = (window.innerHeight - 24 - 100 * settings.scale - pointer.localY) / settings.scale;
    const distance = Math.hypot(dx, dy);
    if (distance > 20 && distance < 360) {
      look = (Math.round(Math.atan2(dx, dy) / (2 * Math.PI) * 16) + 16) % 16;
      if (orbit.observe(dx, dy, time)) { behavior.becomeDizzy(time); look = undefined; }
    }
  }
  if (behavior.mood !== 'idle' || look === undefined) orbit.reset();
  if (previousMood !== behavior.mood) {
    canvas.setAttribute('aria-label', `Hiho：${descriptions[behavior.mood]}。单击打招呼，双击跳跃，拖动玩耍，右键更多互动`);
    window.hiho.mood(behavior.mood === 'sleeping');
    previousMood = behavior.mood;
  }
  const frame = artwork.select(behavior, time, look);
  const t = Math.max(0, time - behavior.beganAt);
  let x = 0, y = 0, rotation = 0, sx = 1, sy = 1, pivot = 0;
  switch (behavior.mood) {
    case 'idle': case 'curious': {
      const breath = Math.sin(time * 1.75);
      sx += breath * 0.009;
      sy -= breath * 0.006;
      rotation = Math.sin(time * 1.15) * 0.007;
      break;
    }
    case 'greeting': rotation = Math.sin(t * 6) * 0.035; y = Math.abs(Math.sin(t * 4)) * 3; break;
    case 'delighted':
      y = Math.abs(Math.sin(t * 7)) * 12;
      sx += Math.sin(t * 14) * 0.035;
      sy -= Math.sin(t * 14) * 0.03;
      break;
    case 'jump': {
      const p = Math.min(1, t / 0.9);
      y = Math.sin(p * Math.PI) * 22;
      rotation = Math.sin(p * Math.PI * 2) * 0.035;
      break;
    }
    case 'held': {
      const target = Math.max(-0.32, Math.min(0.32, (pointer?.vx ?? 0) * 0.00018));
      angleVelocity += ((target - angle) * 140 - angleVelocity * 15) * dt;
      angle += angleVelocity * dt;
      rotation = angle + Math.sin(t * 7) * 0.018;
      pivot = 154;
      sy = 1.025 + Math.sin(t * 9) * 0.012;
      sx = 0.985;
      y = 5;
      break;
    }
    case 'landing': {
      const recoil = Math.exp(-t * 7) * Math.cos(t * 19);
      sx += 0.15 * recoil;
      sy -= 0.15 * recoil;
      rotation = angle * Math.exp(-t * 9);
      break;
    }
    case 'dizzy': rotation = Math.sin(t * 7.5) * 0.08; x = Math.sin(t * 7.5) * 4; sy += Math.sin(t * 15) * 0.02; break;
    case 'waking': sy = 1 + Math.sin(Math.min(1, t / 0.75) * Math.PI) * 0.045; break;
    case 'angry': y = Math.abs(Math.sin(t * 13)) * 3.5; rotation = Math.sin(t * 8) * 0.025; break;
    case 'pout': rotation = 0.025 * (1 - Math.min(1, t / 1.2)); break;
    case 'dance':
      x = Math.sin(t * 7) * 8;
      y = Math.abs(Math.sin(t * 7)) * 8;
      rotation = Math.sin(t * 7) * 0.07;
      sx += Math.sin(t * 14) * 0.025;
      sy -= Math.sin(t * 14) * 0.025;
      break;
    case 'sleeping': sy = 1 + Math.sin(time * 1.4) * 0.013; sx = 1 - Math.sin(time * 1.4) * 0.006; break;
  }
  const press = time - pressedAt;
  if (press >= 0 && press < 0.18 && !behavior.dragging) {
    const squeeze = Math.sin(press / 0.18 * Math.PI) * 0.045;
    sx += squeeze;
    sy -= squeeze;
  }
  if (Math.min(2, window.devicePixelRatio || 1) !== pixelRatio) resizeCanvas();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.translate(window.innerWidth / 2 + x, window.innerHeight - 24 - y);
  context.scale(settings.scale * sx, settings.scale * sy);
  context.translate(0, -pivot);
  context.rotate(rotation);
  context.translate(0, pivot);
  context.drawImage(frame.sheet, frame.x, frame.y, frame.width, frame.height, -96, -208, 192, 208);
  const nextHit = behavior.dragging || (pointer ? isOpaque(frame, context.getTransform(), pointer.localX, pointer.localY) : false);
  if (hit !== nextHit) { hit = nextHit; window.hiho.hit(hit); }
  requestAnimationFrame(animate);
}

async function boot(): Promise<void> {
  await Promise.all([artwork.load(), ...[1, 2, 3].map(index => new Promise<void>((resolve, reject) => {
    const audio = new Audio(new URL(`assets/heeho-${index}.mp3`, import.meta.url).href);
    voices[index - 1] = audio;
    audio.preload = 'auto';
    audio.volume = 0.65;
    audio.addEventListener('loadedmetadata', () => resolve(), { once: true });
    audio.addEventListener('error', () => reject(new Error('Missing voice')), { once: true });
    audio.load();
  }))]);
  settings = await window.hiho.ready();
  voicePlayer = new GreetingVoicePlayer(voices, () => window.hiho.fatal());
  voicePlayer.setMuted(settings.muted);
  resizeCanvas();
  nextCuriosity = performance.now() / 1000 + 12;
  requestAnimationFrame(animate);
}
boot().catch(() => window.hiho.fatal());
