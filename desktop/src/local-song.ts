import type { MusicSample } from './bridge.js';
import { MusicTrack } from './shared/music-track.js';

/** Read an analysed score against the hardware output clock, independently of speaker gain. */
export class LocalSong {
  private context: AudioContext | undefined;
  private source: AudioBufferSourceNode | undefined;
  private gain: GainNode | undefined;
  private track: MusicTrack | undefined;
  private startedAt = 0;
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
      this.track = new MusicTrack(Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i)), buffer.sampleRate);
      const gain = context.createGain(); gain.gain.value = this.muted ? 0 : 0.65;
      source.connect(gain); gain.connect(context.destination);
      this.source = source; this.gain = gain;
      await context.resume();
      if (run !== this.generation) return;
      source.onended = () => { if (run === this.generation) this.stop(); };
      this.startedAt = context.currentTime + 0.02;
      source.start(this.startedAt); this.active = true; this.onState(true);
    } catch (error) {
      if (run !== this.generation) return;
      this.stop(); throw error;
    }
  }

  sample(time: number): MusicSample {
    if (!this.active || !this.track || !this.context) return { active: false, energy: 0, phase: 0, pulse: 0 };
    const timestamp = this.context.getOutputTimestamp();
    // Map the display frame's performance clock to the samples reaching the output device.
    const audible = timestamp.performanceTime && timestamp.contextTime !== undefined ?
      timestamp.contextTime + time - timestamp.performanceTime / 1000 : this.context.currentTime - this.context.outputLatency;
    return { active: true, ...this.track.sample(audible - this.startedAt) };
  }

  setMuted(muted: boolean): void { this.muted = muted; if (this.gain) this.gain.gain.value = muted ? 0 : 0.65; }

  stop(): void {
    this.generation++;
    if (this.source) { this.source.onended = null; if (this.active) this.source.stop(); }
    this.active = false; this.source = undefined; this.track = undefined; this.gain = undefined;
    void this.context?.close(); this.context = undefined;
    this.onState(false);
  }
}
