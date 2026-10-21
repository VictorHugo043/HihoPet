import { beatPulse, type MusicFrame } from './music-track.js';

export class MusicSignal {
  private lastBeat = -Infinity;
  private period = 0.5;
  private previousTime = 0;
  private phase = 0;
  private energy = 0;
  private previousBass = 0;
  private previousRms = 0;
  private averageFlux = 0.005;

  update(rms: number, bass: number, time: number): MusicFrame {
    const dt = this.previousTime ? Math.max(0, Math.min(0.2, time - this.previousTime)) : 1 / 30;
    this.previousTime = time;
    const flux = Math.max(0, bass - this.previousBass) + Math.max(0, rms - this.previousRms) * 2;
    if (rms > 0.005 && flux > Math.max(0.025, this.averageFlux * 2.2) && time - this.lastBeat > 0.18) {
      const interval = time - this.lastBeat;
      if (interval >= 0.3 && interval <= 1.2) this.period += (interval - this.period) * 0.25;
      this.lastBeat = time;
      this.phase += Math.atan2(Math.sin(-this.phase), Math.cos(-this.phase)) * 0.2;
    }
    this.averageFlux += (flux - this.averageFlux) * (1 - Math.exp(-dt * 3));
    this.previousBass = bass; this.previousRms = rms;
    const target = rms < 0.003 ? 0 : rms / (rms + 0.045);
    this.energy += (target - this.energy) * (1 - Math.exp(-dt * (target > this.energy ? 40 : 8)));
    this.phase += dt / this.period * 2 * Math.PI;
    return { energy: this.energy < 0.015 ? 0 : this.energy, phase: this.phase % (2 * Math.PI),
      pulse: beatPulse(time - this.lastBeat - 0.025) };
  }
}
