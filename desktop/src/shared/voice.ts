import { ShuffleBag } from './behavior.js';

interface VoiceClip {
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: 'ended', listener: () => void): void;
}

/** Keeps one pending greeting so rapid clicks neither cut syllables nor build a long queue. */
export class VoicePlayer {
  private readonly bag: ShuffleBag;
  private active: number | undefined;
  private pending: number | undefined;
  private muted = false;

  constructor(private readonly clips: VoiceClip[], private readonly onError: () => void,
    private readonly options: { greetingCount: number; onStart: (index: number) => void; random?: () => number }) {
    this.bag = new ShuffleBag(options.greetingCount, options.random);
    clips.forEach((clip, index) => clip.addEventListener('ended', () => {
      if (this.active !== index) return;
      this.active = undefined;
      const next = this.pending;
      this.pending = undefined;
      if (next !== undefined && !this.muted) this.play(next);
    }));
  }

  request(): number {
    if (this.muted) {
      const index = this.bag.next();
      this.options.onStart(index);
      return index;
    }
    if (this.active !== undefined) return this.pending ??= this.bag.next();
    const index = this.bag.next();
    this.play(index);
    return index;
  }

  emote(index: number): void {
    this.stop();
    if (this.muted) this.options.onStart(index);
    else this.play(index);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  stop(): void {
    this.active = this.pending = undefined;
    this.clips.forEach(clip => { clip.pause(); clip.currentTime = 0; });
  }

  private play(index: number): void {
    this.active = index;
    this.options.onStart(index);
    this.clips[index].currentTime = 0;
    this.clips[index].play().catch(error => {
      if (error?.name !== 'AbortError' && this.active === index) this.onError();
    });
  }
}
