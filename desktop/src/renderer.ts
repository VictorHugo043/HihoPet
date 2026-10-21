import { Artwork } from './artwork.js';
import { OrbitTracker, PetBehavior, PettingTracker, type Mood } from './shared/behavior.js';
import { MotionSmoother, motionTarget } from './shared/motion.js';
import { VoicePlayer } from './shared/voice.js';
import { voiceCatalog, greetingCount, dizzyVoice, angryVoice } from './shared/voice-catalog.js';
import type { PointerSample, Settings, MusicSample } from './bridge.js';

const canvas = document.querySelector<HTMLCanvasElement>('#pet')!;
const bubble = document.querySelector<HTMLDivElement>('#speech')!;
const context = canvas.getContext('2d')!;
const artwork = new Artwork();
const behavior = new PetBehavior();
const orbit = new OrbitTracker();
const petting = new PettingTracker();
const motion = new MotionSmoother();
const voices: HTMLAudioElement[] = [];
let voicePlayer: VoicePlayer;
let settings: Settings = { muted: false, scale: 1.5 };
let pointer: PointerSample | undefined;
let pointerMovedAt = 0, previousTime = 0, nextCuriosity = 12, pressedAt = -Infinity;
let previousMood: Mood | undefined;
let hit = false, feedingVoiced = false;
let down: { x: number; y: number; pointerId: number } | undefined;
let suppressClickUntil = 0, pixelRatio = 1, speechUntil = 0, speechBeganAt = 0, suppressMusicUntil = 0;
let chasingUntil = 0, gazeAngle = 0;
let music: MusicSample = { active: false, energy: 0, phase: 0 };
let musicReceivedAt = 0;

const descriptions: Record<Mood, string> = {
  idle: '正在休息', greeting: '正在打招呼', delighted: '开心欢呼', jump: '正在跳跃', held: '被拎起来了',
  landing: '落地回弹', dizzy: '晕乎乎', waking: '正在醒来', angry: '正在生气跺脚',
  pout: '正在消气', dance: '正在跳舞', sleeping: '正在睡觉', curious: '好奇地看看',
  petted: '被摸头，舒服地眯眼', feeding: '正在吃雪球', chasing: '正在追着鼠标玩'
};

function say(text: string, duration: number): void {
  bubble.textContent = text;
  speechBeganAt = performance.now() / 1000;
  speechUntil = speechBeganAt + Math.max(2, duration);
}
function stopVoice(): void { voicePlayer?.stop(); }
function greet(): void {
  const time = performance.now() / 1000;
  if (behavior.dragging || ['dizzy', 'waking'].includes(behavior.mood)) return;
  const index = voicePlayer.request();
  behavior.tap(index, time, Math.min(2.6, Math.max(1.2, voices[index].duration + 0.25)));
  nextCuriosity = time + 18;
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
    orbit.reset(); stopVoice(); speechUntil = 0; chasingUntil = 0;
    canvas.classList.add('held');
    window.hiho.startDrag();
  }
  if (behavior.dragging) behavior.drag(event.screenX, event.screenY, time);
});
canvas.addEventListener('pointerup', event => { if (event.button === 0) finishDrag(); });
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
  if (!sample.moved) return;
  const time = performance.now() / 1000;
  pointerMovedAt = time;
  if (down || !['idle', 'curious', 'pout'].includes(behavior.mood)) return;
  const over = artwork.hit(sample.localX * pixelRatio, sample.localY * pixelRatio);
  if (petting.observe(sample.localX / settings.scale, sample.localY / settings.scale, time, over.head) && behavior.pet(time)) {
    orbit.reset(); voicePlayer.emote(2); return;
  }
  if (!['idle', 'curious'].includes(behavior.mood)) return;
  const dx = (sample.localX - window.innerWidth / 2) / settings.scale;
  const dy = (window.innerHeight - 24 - 100 * settings.scale - sample.localY) / settings.scale;
  if (orbit.observe(dx, dy, time)) behavior.becomeDizzy(time);
});
window.hiho.onAction(action => {
  const time = performance.now() / 1000;
  if (action.type === 'dance') behavior.dance(time);
  else if (action.type === 'sleep') { stopVoice(); orbit.reset(); behavior.toggleSleep(time); }
  else if (action.type === 'feed') {
    if (behavior.feed(time)) { feedingVoiced = false; say('雪球！❄', 1); }
  } else if (action.type === 'chase') {
    chasingUntil = action.active ? time + 15 : 0;
    if (!action.active && behavior.mood === 'chasing') behavior.start('idle', time);
    if (action.active) say('一起玩，ho！', 1.5);
  } else if (action.type === 'music') { music = action.sample; musicReceivedAt = time; }
  else if (action.type === 'settings') { settings = action.settings; voicePlayer?.setMuted(settings.muted); }
});
function resizeCanvas(): void {
  pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * pixelRatio); canvas.height = Math.round(window.innerHeight * pixelRatio);
}
window.addEventListener('resize', resizeCanvas);

function snowball(t: number): void {
  if (t >= 1.7) return;
  const p = Math.min(1, t / 1.3);
  const radius = 6 * (1 - Math.max(0, (t - 1.3) / 0.4));
  context.save(); context.translate(-55 * (1 - p), -65 - Math.sin(p * Math.PI) * 35 - p * 25);
  const gradient = context.createRadialGradient(-2, -2, 0, 0, 0, radius);
  gradient.addColorStop(0, '#fff'); gradient.addColorStop(1, '#b7dcff');
  context.fillStyle = gradient; context.strokeStyle = '#75b9ed'; context.lineWidth = 0.5;
  context.beginPath(); context.arc(0, 0, radius, 0, 2 * Math.PI); context.fill(); context.stroke(); context.restore();
}

function drawSpeech(time: number, x: number, y: number): void {
  if (time >= speechUntil) return;
  const elapsed = time - speechBeganAt;
  const pop = 1 - 0.12 * Math.exp(-elapsed * 13) * Math.cos(elapsed * 22);
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.font = '600 15px -apple-system, BlinkMacSystemFont, sans-serif';
  const width = Math.max(92, context.measureText(bubble.textContent ?? '').width + 36);
  x = Math.max(width / 2 + 8, Math.min(window.innerWidth - width / 2 - 8, x));
  context.translate(x, Math.max(30, y)); context.scale(pop, pop);
  context.globalAlpha = Math.min(1, elapsed / 0.08, (speechUntil - time) / 0.2);
  context.fillStyle = '#fffffff5'; context.strokeStyle = '#a9cff2'; context.lineWidth = 1;
  context.shadowColor = '#26589820'; context.shadowBlur = 10; context.shadowOffsetY = 3;
  context.beginPath(); context.roundRect(-width / 2, -20, width, 38, 18); context.fill(); context.stroke();
  context.shadowColor = 'transparent';
  context.beginPath(); context.moveTo(-5, 17); context.lineTo(0, 23); context.lineTo(5, 17); context.fill();
  context.fillStyle = '#2456a5'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(bubble.textContent ?? '', 0, -1);
  context.restore();
}
function animate(milliseconds: number): void {
  const time = milliseconds / 1000;
  const dt = previousTime ? Math.min(1 / 20, Math.max(1 / 240, time - previousTime)) : 1 / 60;
  previousTime = time;
  behavior.update(time);
  if (behavior.mood === 'idle' && time < chasingUntil) behavior.start('chasing', time, chasingUntil - time);
  if (behavior.mood === 'idle' && time > nextCuriosity && time - pointerMovedAt > 2.3 && music.energy < 0.02) {
    behavior.curious(time); nextCuriosity = time + 15 + Math.random() * 10;
  }
  if (previousMood !== behavior.mood) {
    if (behavior.mood !== 'idle') orbit.reset();
    if (behavior.mood === 'dizzy') voicePlayer.emote(dizzyVoice);
    else if (behavior.mood === 'angry') voicePlayer.emote(angryVoice);
    else if (behavior.mood === 'sleeping') say('Zzz…', 2);
    canvas.setAttribute('aria-label', `Hiho：${descriptions[behavior.mood]}。单击打招呼，双击跳跃，轻抚头部或右键更多互动`);
    window.hiho.mood(behavior.mood === 'sleeping', ['idle', 'chasing'].includes(behavior.mood));
    previousMood = behavior.mood;
  }
  const t = Math.max(0, time - behavior.beganAt);
  if (behavior.mood === 'feeding' && t > 1.3 && !feedingVoiced) { feedingVoiced = true; voicePlayer.emote(2); }
  const gazeX = pointer && time - pointerMovedAt < 2.3 ? (pointer.localX - window.innerWidth / 2) / settings.scale : 0;
  const gazeY = pointer && time - pointerMovedAt < 2.3 ? (window.innerHeight - 24 - 100 * settings.scale - pointer.localY) / settings.scale : 0;
  const energy = music.active && time - musicReceivedAt < 0.5 && time > suppressMusicUntil && ['idle', 'curious'].includes(behavior.mood) ? music.energy : 0;
  let look: number | undefined;
  if (pointer && time - pointerMovedAt < 2.3 && Math.hypot(gazeX, gazeY) > 20 && Math.hypot(gazeX, gazeY) < 360 && ['idle', 'curious'].includes(behavior.mood)) {
    const desired = Math.atan2(gazeX, gazeY);
    const delta = Math.atan2(Math.sin(desired - gazeAngle), Math.cos(desired - gazeAngle));
    gazeAngle += delta * (1 - Math.exp(-dt * 14));
    look = (Math.round(gazeAngle / (2 * Math.PI) * 16) + 16) % 16;
  }
  const target = motionTarget(behavior.mood, t, time, pointer?.vx ?? 0, energy, music.phase, look);
  if (behavior.mood === 'held' && behavior.shakeLevel >= 1) target.frame = 2;
  const press = time - pressedAt;
  if (press >= 0 && press < 0.18 && !behavior.dragging) { const squeeze = Math.sin(press / 0.18 * Math.PI) * 0.04; target.sx += squeeze; target.sy -= squeeze; }
  const pose = motion.update(target, dt);
  if (Math.min(2, window.devicePixelRatio || 1) !== pixelRatio) resizeCanvas();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.translate(window.innerWidth / 2 + pose.x * settings.scale, window.innerHeight - 24 - pose.y * settings.scale);
  context.scale(settings.scale * pose.sx, settings.scale * pose.sy); context.rotate(pose.angle);
  artwork.draw(context, pose, time);
  if (behavior.mood === 'feeding') snowball(t);
  if (behavior.mood === 'petted') {
    context.save(); context.font = '11px sans-serif'; context.fillStyle = '#76b3ef';
    context.fillText('♡', -30 + Math.sin(t * 2) * 3, -130 - t * 5); context.fillText('♡', 28, -123 - t * 6); context.restore();
  }
  const headTop = context.getTransform().transformPoint(new DOMPoint(0, -145));
  drawSpeech(time, headTop.x / pixelRatio, headTop.y / pixelRatio - 31);
  const nextHit = behavior.dragging || (pointer ? artwork.hit(pointer.localX * pixelRatio, pointer.localY * pixelRatio).opaque : false);
  if (hit !== nextHit) { hit = nextHit; window.hiho.hit(hit); }
  requestAnimationFrame(animate);
}
async function boot(): Promise<void> {
  await Promise.all([artwork.load(), ...voiceCatalog.map((voice, index) => new Promise<void>((resolve, reject) => {
    const audio = new Audio(new URL(`assets/${voice.file}.mp3`, import.meta.url).href);
    voices[index] = audio; audio.preload = 'auto'; audio.volume = 0.65;
    audio.addEventListener('loadedmetadata', () => resolve(), { once: true });
    audio.addEventListener('error', () => reject(new Error('Missing voice')), { once: true }); audio.load();
  }))]);
  settings = await window.hiho.ready();
  voicePlayer = new VoicePlayer(voices, () => say('声音暂时没准备好，ho…', 2), { greetingCount, onStart: index => {
    const duration = voices[index].duration;
    say(voiceCatalog[index].text, duration + 0.45);
    suppressMusicUntil = performance.now() / 1000 + duration + 0.4;
  } });
  voicePlayer.setMuted(settings.muted); resizeCanvas(); nextCuriosity = performance.now() / 1000 + 12;
  requestAnimationFrame(animate);
}
boot().catch(() => window.hiho.fatal());
