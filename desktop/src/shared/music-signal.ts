import { beatPulse, type MusicFrame } from './music-track.js';

type Attack = { time: number; bass: number; level: number; bassFlux: number; flux: number; bassThreshold: number; threshold: number };

/** Causal onset detection from full-band and 40–180 Hz linear RMS levels. */
export class MusicSignal {
  private lastBeat = -Infinity;
  private lastDrum = -Infinity;
  private period = 0.5;
  private intervals: number[] = [];
  private previousTime: number | undefined;
  private phase = 0;
  private energy = 0;
  private bass = 0;
  private level = 0;
  private averageBassFlux = 0.002;
  private averageFlux = 0.002;
  private previous: Attack | undefined;
  private pulseStrength = 1;

  update(rms: number, bass: number, time: number): MusicFrame {
    const dt = this.previousTime === undefined ? 1 / 60 : Math.max(1 / 240, Math.min(0.2, time - this.previousTime));
    this.previousTime = time;
    const mix = 1 - Math.exp(-dt * 50);
    const nextBass = this.bass + (bass - this.bass) * mix;
    const nextLevel = this.level + (rms - this.level) * mix;
    const bassFlux = Math.max(0, nextBass - this.bass) / (dt * 60);
    const flux = Math.max(0, nextLevel - this.level) / (dt * 60);
    const previous = this.previous;
    // One frame of peak confirmation rejects small rises within a single drum attack.
    if (previous && previous.level > 0.006) {
      const refractory = Math.max(0.28, Math.min(0.32, this.period * 0.6));
      const drum = previous.bassFlux > previous.bassThreshold && previous.bassFlux >= bassFlux &&
        previous.bass > previous.level * 0.16 && time - this.lastDrum > refractory;
      const fallback = time - this.lastDrum > 2 && time - this.lastBeat > 0.45 &&
        previous.flux > previous.threshold && previous.flux >= flux;
      if (drum || fallback) {
        if (drum) {
          const interval = previous.time - this.lastDrum;
          if (interval >= 0.28 && interval <= 1.2) {
            this.intervals.push(interval);
            if (this.intervals.length > 5) this.intervals.shift();
            const sorted = [...this.intervals].sort((a, b) => a - b);
            this.period += (sorted[Math.floor(sorted.length / 2)] - this.period) * 0.3;
          }
          this.lastDrum = previous.time;
        }
        this.lastBeat = time;
        this.pulseStrength = drum ? 1 : 0.35;
        this.phase += Math.atan2(Math.sin(-this.phase), Math.cos(-this.phase)) * 0.2;
      }
    }
    this.previous = { time, bass: nextBass, level: nextLevel, bassFlux, flux,
      bassThreshold: Math.max(0.0025, this.averageBassFlux * 2.4, nextBass * 0.1),
      threshold: Math.max(0.004, this.averageFlux * 3, nextLevel * 0.15) };
    this.averageBassFlux += (bassFlux - this.averageBassFlux) * (1 - Math.exp(-dt * 3));
    this.averageFlux += (flux - this.averageFlux) * (1 - Math.exp(-dt * 3));
    this.bass = nextBass; this.level = nextLevel;
    const target = rms < 0.003 ? 0 : rms / (rms + 0.045);
    this.energy += (target - this.energy) * (1 - Math.exp(-dt * (target > this.energy ? 40 : 8)));
    this.phase += dt / this.period * 2 * Math.PI;
    const age = time - this.lastBeat;
    // A short continuous attack replaces the anticipation available to a decoded local track.
    const pulse = age < 1 / 60 ? (1 - Math.cos(age * 60 * Math.PI)) / 2 : beatPulse(age - 1 / 60);
    return { energy: this.energy < 0.015 ? 0 : this.energy, phase: this.phase % (2 * Math.PI),
      pulse: pulse * this.pulseStrength };
  }
}
