export interface MusicFrame { energy: number; phase: number; pulse: number }

/** Continuous anticipation, compression on the onset, then a small elastic rebound. */
export function beatPulse(age: number): number {
  if (age < -0.08 || age > 0.34) return 0;
  if (age < 0) return (1 - Math.cos((age + 0.08) / 0.08 * Math.PI)) / 2;
  if (age < 0.12) return (1 + Math.cos(age / 0.12 * Math.PI)) / 2;
  return -0.24 * Math.sin((age - 0.12) / 0.22 * Math.PI) ** 2;
}

export class MusicTrack {
  private readonly step: number;
  private readonly energy: Float32Array;
  private readonly beats: number[] = [];

  constructor(channels: readonly Float32Array[], sampleRate: number) {
    const length = channels[0]?.length ?? 0;
    const hop = Math.max(1, Math.round(sampleRate * 0.005));
    this.step = hop / sampleRate;
    const count = Math.ceil(length / hop);
    const levels = new Float32Array(count), bass = new Float32Array(count);
    const low = new Float64Array(channels.length), high = new Float64Array(channels.length);
    const a = 1 - Math.exp(-2 * Math.PI * 180 / sampleRate);
    const b = 1 - Math.exp(-2 * Math.PI * 40 / sampleRate);
    for (let bin = 0; bin < count; bin++) {
      let square = 0, bassSquare = 0;
      const start = bin * hop, end = Math.min(length, start + hop);
      for (let c = 0; c < channels.length; c++) {
        const channel = channels[c];
        for (let i = start; i < end; i++) {
          const sample = channel[i];
          low[c] += (sample - low[c]) * a; high[c] += (sample - high[c]) * b;
          square += sample * sample; bassSquare += (low[c] - high[c]) ** 2;
        }
      }
      const samples = (end - start) * channels.length;
      levels[bin] = Math.sqrt(square / Math.max(1, samples));
      bass[bin] = Math.sqrt(bassSquare / Math.max(1, samples));
    }
    this.energy = new Float32Array(count);
    const envelope = new Float32Array(count), lowEnvelope = new Float32Array(count);
    const flux = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let square = 0, lowSquare = 0, samples = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(count - 1, i + 4); j++) { square += levels[j] ** 2; lowSquare += bass[j] ** 2; samples++; }
      const rms = Math.sqrt(square / samples);
      envelope[i] = rms; lowEnvelope[i] = Math.sqrt(lowSquare / samples);
      this.energy[i] = rms < 0.003 ? 0 : rms / (rms + 0.045);
    }
    for (let i = 0; i < count; i++) flux[i] = Math.max(0, lowEnvelope[i] - (lowEnvelope[i - 2] ?? 0)) + Math.max(0, envelope[i] - (envelope[i - 2] ?? 0)) * 0.35;
    let averageFlux = 0.002, last = -Infinity;
    for (let i = 1; i < count - 1; i++) {
      const threshold = Math.max(0.0035, averageFlux * 2.2, lowEnvelope[i] * 0.08);
      if (flux[i] > threshold && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] &&
          envelope[i] > 0.006 && i * this.step - last > 0.18) {
        const radius = Math.round(0.24 / this.step);
        let strongest = true;
        // Full-track lookahead keeps a weak pickup from stealing the following kick.
        for (let j = Math.max(1, i - radius); j <= Math.min(count - 2, i + radius); j++) {
          if (flux[j] > flux[i] || (flux[j] === flux[i] && j < i)) { strongest = false; break; }
        }
        if (strongest) { last = i * this.step; this.beats.push(last); }
      }
      averageFlux += (flux[i] - averageFlux) * (1 - Math.exp(-this.step * 3));
    }
  }

  sample(time: number): MusicFrame {
    if (time < 0 || time >= this.energy.length * this.step) return { energy: 0, phase: 0, pulse: 0 };
    const index = time / this.step, left = Math.floor(index), mix = index - left;
    const energy = this.energy[left] * (1 - mix) + (this.energy[left + 1] ?? this.energy[left]) * mix;
    let lo = 0, hi = this.beats.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.beats[mid] <= time + 0.08) lo = mid + 1; else hi = mid; }
    let pulse = 0;
    for (let i = lo - 1; i >= 0 && time - this.beats[i] < 0.6; i--) pulse += beatPulse(time - this.beats[i]);
    const preceding = lo > 0 && this.beats[lo - 1] > time ? lo - 2 : lo - 1;
    const previous = this.beats[preceding];
    const next = this.beats[preceding + 1] ?? (previous ?? time) + 0.5;
    return { energy, phase: previous === undefined ? 0 : ((time - previous) / Math.max(0.18, next - previous) * 2 * Math.PI) % (2 * Math.PI),
      pulse: Math.max(-0.3, Math.min(1, pulse)) };
  }
}
