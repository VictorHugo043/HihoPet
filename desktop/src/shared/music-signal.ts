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
  private previousBeat = -Infinity;
  private previousStrength = 1;
  private predictedBeat = -Infinity;
  private beatEnergy = 0;

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
        let beat = time;
        if (drum) {
          const interval = previous.time - this.lastDrum;
          if (interval >= 0.28 && interval <= 1.2) {
            this.intervals.push(interval);
            if (this.intervals.length > 5) this.intervals.shift();
            const sorted = [...this.intervals].sort((a, b) => a - b);
            this.period += (sorted[Math.floor(sorted.length / 2)] - this.period) * 0.3;
          } else this.intervals = [];
          // Band filtering, the RMS window and envelope smoothing put the detected
          // peak about 35 ms behind the attack. Keep the visual beat on that attack.
          const onset = previous.time - 0.035;
          const predicted = Math.abs(onset - this.predictedBeat) < this.period * 0.2;
          beat = predicted ? this.predictedBeat + Math.max(-0.01, Math.min(0.01, onset - this.predictedBeat)) : time;
          const recent = this.intervals.slice(-3).sort((a, b) => a - b);
          const median = recent[1];
          const locked = recent.length === 3 && recent.every(value => Math.abs(value - median) < Math.max(0.035, median * 0.08));
          if (locked) this.period = median;
          // Predict only the next beat of a confirmed steady phrase. A pause or
          // tempo change cannot leave a free-running animation behind.
          this.predictedBeat = locked ? (predicted ? beat : onset) + this.period : -Infinity;
          this.lastDrum = previous.time;
          this.beatEnergy = previous.level / (previous.level + 0.045);
        } else this.predictedBeat = -Infinity;
        this.previousBeat = this.lastBeat; this.previousStrength = this.pulseStrength;
        this.lastBeat = beat;
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
    if (time - this.lastDrum < 0.08) this.beatEnergy = Math.max(this.beatEnergy, target);
    this.phase += dt / this.period * 2 * Math.PI;
    const pulseAt = (beat: number, strength: number): number => {
      const age = time - beat;
      if (strength === 1) return beatPulse(age);
      return strength * (age < 1 / 60 ? (1 - Math.cos(age * 60 * Math.PI)) / 2 : beatPulse(age - 1 / 60));
    };
    const anticipated = this.energy > 0.04 ? beatPulse(time - this.predictedBeat) : 0;
    const pulse = pulseAt(this.lastBeat, this.pulseStrength) + pulseAt(this.previousBeat, this.previousStrength) + anticipated;
    // The next attack's loudness has not reached capture yet. The preceding drum
    // supplies its anticipation envelope; observed volume resumes after the attack.
    const energy = Math.max(this.energy, this.beatEnergy * Math.max(0, anticipated));
    return { energy: energy < 0.015 ? 0 : energy, phase: this.phase % (2 * Math.PI),
      pulse: Math.max(-0.3, Math.min(1, pulse)) };
  }
}
