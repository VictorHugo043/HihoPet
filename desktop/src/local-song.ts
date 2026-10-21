import type { MusicSample } from './bridge.js';
import { MusicSignal } from './shared/music-signal.js';

/** Analyse the decoded local track before the speaker gain, without loopback capture latency. */
export class LocalSong {
  private context: AudioContext | undefined;
  private source: AudioBufferSourceNode | undefined;
  private analyser: AnalyserNode | undefined;
  private gain: GainNode | undefined;
  private wave = new Float32Array(1024);
  private spectrum = new Uint8Array(512);
  private signal = new MusicSignal();
  private generation = 0;
  private muted = false;
  active = false;

  constructor(private readonly onState: (active: boolean) => void) {}

  async play(data: Uint8Array): Promise<void> {
    this.stop();
    const run = ++this.generation;
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    try {
      const buffer = await context.decodeAudioData(Uint8Array.from(data).buffer);
      if (run !== this.generation) return;
      const source = context.createBufferSource(); source.buffer = buffer;
      const analyser = context.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.05;
      const gain = context.createGain(); gain.gain.value = this.muted ? 0 : 0.65;
      source.connect(analyser); analyser.connect(gain); gain.connect(context.destination);
      this.source = source; this.analyser = analyser; this.gain = gain; this.signal = new MusicSignal();
      await context.resume();
      if (run !== this.generation) return;
      source.onended = () => { if (run === this.generation) this.stop(); };
      source.start(); this.active = true; this.onState(true);
    } catch (error) {
      if (run !== this.generation) return;
      this.stop(); throw error;
    }
  }

  sample(time: number): MusicSample {
    if (!this.active || !this.analyser || !this.context) return { active: false, energy: 0, phase: 0 };
    this.analyser.getFloatTimeDomainData(this.wave); this.analyser.getByteFrequencyData(this.spectrum);
    let square = 0; for (const sample of this.wave) square += sample * sample;
    const bins = Math.max(1, Math.floor(200 / (this.context.sampleRate / this.analyser.fftSize)));
    let bass = 0; for (let i = 1; i <= bins; i++) bass += this.spectrum[i] / 255;
    return { active: true, ...this.signal.update(Math.sqrt(square / this.wave.length), bass / bins, time) };
  }

  setMuted(muted: boolean): void { this.muted = muted; if (this.gain) this.gain.gain.value = muted ? 0 : 0.65; }

  stop(): void {
    this.generation++;
    if (this.source) { this.source.onended = null; if (this.active) this.source.stop(); }
    this.active = false; this.source = undefined; this.analyser = undefined; this.gain = undefined;
    void this.context?.close(); this.context = undefined;
    this.onState(false);
  }
}
