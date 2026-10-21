import type { Mood } from './behavior.js';

export interface MotionPose {
  x: number; y: number; angle: number; sx: number; sy: number;
  frame: number; headAngle: number;
  armLeft: number; armRight: number; legLeft: number; legRight: number;
  liftLeft: number; liftRight: number;
}

export function motionTarget(mood: Mood, elapsed: number, time: number, heldVelocity = 0, musicEnergy = 0, musicPhase = 0, look?: number): MotionPose {
  const p: MotionPose = { x: 0, y: Math.sin(time * 1.8) * 0.35, angle: Math.sin(time * 1.1) * 0.004,
    sx: 1 + Math.sin(time * 1.8) * 0.005, sy: 1 - Math.sin(time * 1.8) * 0.004,
    frame: look === undefined ? 0 : 8 + look, headAngle: 0,
    armLeft: 0, armRight: 0, legLeft: 0, legRight: 0, liftLeft: 0, liftRight: 0 };
  const t = elapsed;
  if (mood === 'greeting' || mood === 'delighted') {
    p.frame = mood === 'delighted' ? 1 : 0;
    p.armLeft = 0.35 + Math.sin(t * 8) * 0.09;
    p.headAngle = Math.sin(t * 4) * 0.035;
    p.y = (1 - Math.cos(t * 7)) * (mood === 'delighted' ? 2.5 : 0.7);
  } else if (mood === 'dance' || (['idle', 'curious'].includes(mood) && musicEnergy > 0.02)) {
    const phase = musicEnergy > 0 ? musicPhase : t * 5.2;
    const intensity = musicEnergy > 0 ? musicEnergy : 0.65;
    const sway = Math.sin(phase);
    p.frame = mood === 'dance' || look === undefined ? 1 : 8 + look;
    p.x = sway * 2.8 * intensity; p.y = (1 - Math.cos(phase * 2)) * 1.5 * intensity;
    p.angle = sway * 0.025 * intensity; p.headAngle = look === undefined ? Math.sin(phase - 0.45) * 0.055 * intensity : 0;
    p.armLeft = 0.26 + sway * 0.08 * intensity; p.armRight = -0.26 + sway * 0.08 * intensity;
    p.legLeft = sway * 0.07 * intensity; p.legRight = -sway * 0.07 * intensity;
    p.liftLeft = -Math.max(0, sway) * 2.2 * intensity; p.liftRight = -Math.max(0, -sway) * 2.2 * intensity;
  } else if (mood === 'dizzy') {
    p.frame = 2; p.headAngle = Math.sin(t * 3.2) * 0.075;
    p.angle = Math.sin(t * 3.2 - 0.5) * 0.018;
    p.armLeft = 0.22; p.armRight = -0.22; p.sx = 1.015; p.sy = 0.975;
  } else if (mood === 'angry' || mood === 'pout') {
    p.frame = 3; p.armLeft = -0.1; p.armRight = 0.1;
    if (mood === 'angry') { const stamp = Math.sin(t * 10); p.liftLeft = -Math.max(0, stamp) * 2; p.liftRight = -Math.max(0, -stamp) * 2; p.headAngle = Math.sin(t * 5) * 0.018; }
  } else if (mood === 'held') {
    p.frame = 5; p.angle = Math.max(-0.14, Math.min(0.14, heldVelocity * 0.00009));
    p.armLeft = 0.28 + Math.sin(t * 6) * 0.05; p.armRight = -0.28 + Math.sin(t * 6) * 0.05;
    p.legLeft = Math.sin(t * 7) * 0.09; p.legRight = -Math.sin(t * 7) * 0.09;
    p.y = 3; p.sy = 1.025; p.sx = 0.99;
  } else if (mood === 'jump') {
    const u = Math.min(1, t / 0.9);
    if (u < 0.18) { const squash = Math.sin(u / 0.18 * Math.PI); p.sy = 1 - squash * 0.1; p.sx = 1 + squash * 0.08; }
    else { const flight = Math.sin((u - 0.18) / 0.82 * Math.PI); p.y = flight * 32; p.legLeft = flight * 0.12; p.legRight = -flight * 0.12; p.armLeft = flight * 0.35; p.armRight = -flight * 0.35; }
    p.frame = 1;
  } else if (mood === 'landing') {
    const recoil = Math.exp(-t * 8) * Math.cos(t * 18); p.sx = 1 + recoil * 0.11; p.sy = 1 - recoil * 0.11;
  } else if (mood === 'sleeping') {
    p.frame = 6; p.sy = 1 + Math.sin(time * 1.4) * 0.009;
  } else if (mood === 'waking') {
    p.frame = 4; p.armLeft = Math.sin(Math.min(1, t / 0.75) * Math.PI) * 0.35; p.armRight = -p.armLeft;
  } else if (mood === 'petted') {
    p.frame = 1; p.headAngle = Math.sin(t * 2.5) * 0.025; p.sx = 1.012; p.sy = 0.99;
  } else if (mood === 'feeding') {
    p.armLeft = Math.sin(Math.min(1, t / 2) * Math.PI) * 0.22; p.armRight = -p.armLeft;
    const u = Math.min(1, t / 1.3);
    const dx = -55 * (1 - u), dy = -25 + Math.sin(u * Math.PI) * 35 + u * 25;
    p.frame = t > 1.3 ? 1 : 8 + (Math.round(Math.atan2(dx, dy) / (2 * Math.PI) * 16) + 16) % 16;
  } else if (mood === 'chasing') {
    const hop = Math.sin(t * 7); p.y = Math.max(0, hop) * 4.5; p.legLeft = hop * 0.11; p.legRight = -hop * 0.11; p.armLeft = 0.28; p.armRight = -0.28;
  } else if (mood === 'curious') p.headAngle = Math.sin(t * 2) * 0.055;
  return p;
}

export class MotionSmoother {
  private pose = motionTarget('idle', 0, 0);
  update(target: MotionPose, dt: number): MotionPose {
    const blend = 1 - Math.exp(-Math.min(0.05, dt) * 22);
    for (const key of Object.keys(this.pose) as (keyof MotionPose)[]) {
      if (key === 'frame') this.pose.frame = target.frame;
      else this.pose[key] += (target[key] - this.pose[key]) * blend;
    }
    return this.pose;
  }
}
