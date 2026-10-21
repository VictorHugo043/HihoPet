import type { PetBehavior } from './shared/behavior.js';

export type SpriteFrame = { sheet: HTMLImageElement; x: number; y: number; width: number; height: number; alpha: Uint8Array };

export class Artwork {
  readonly rows: SpriteFrame[][] = [];
  readonly extra = new Map<string, SpriteFrame[]>();

  async load(): Promise<void> {
    const atlas = await this.image('codex');
    if (atlas.width !== 1536 || atlas.height !== 2288) throw new Error('Invalid base atlas');
    const counts = [6, 8, 8, 4, 5, 8, 6, 6, 6, 8, 8];
    const raw = this.pixels(atlas);
    counts.forEach((count, row) => this.rows.push(Array.from({ length: count }, (_, col) => this.frame(atlas, raw, col * 192, row * 208, 192, 208))));
    await Promise.all(['held', 'dizzy', 'angry', 'sleep', 'dance', 'greeting', 'jump'].map(async name => {
      const sheet = await this.image(name);
      const count = name === 'jump' ? 12 : 8;
      if (sheet.width !== 1536 || sheet.height !== count / 4 * 416) throw new Error('Invalid animation');
      const pixels = this.pixels(sheet);
      this.extra.set(name, Array.from({ length: count }, (_, i) => this.frame(sheet, pixels, i % 4 * 384, Math.floor(i / 4) * 416, 384, 416)));
    }));
  }

  private async image(name: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.src = new URL(`assets/${name}.png`, import.meta.url).href;
    await image.decode();
    return image;
  }

  private pixels(image: HTMLImageElement): Uint8ClampedArray {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height).data;
  }

  private frame(sheet: HTMLImageElement, pixels: Uint8ClampedArray, x: number, y: number, width: number, height: number): SpriteFrame {
    const alpha = new Uint8Array(192 * 208);
    const scale = width / 192;
    for (let py = 0; py < 208; py++) for (let px = 0; px < 192; px++) {
      alpha[py * 192 + px] = pixels[((y + py * scale) * sheet.width + x + px * scale) * 4 + 3];
    }
    return { sheet, x, y, width, height, alpha };
  }

  select(behavior: PetBehavior, time: number, look?: number): SpriteFrame {
    const t = Math.max(0, time - behavior.beganAt);
    const standard = (row: number, rate: number): SpriteFrame => this.rows[row][Math.floor(t * rate) % this.rows[row].length];
    const custom = (name: string, index: number): SpriteFrame => {
      const frames = this.extra.get(name)!;
      return frames[Math.max(0, Math.min(frames.length - 1, index))];
    };
    switch (behavior.mood) {
      case 'idle': {
        if (look !== undefined) return this.rows[9 + Math.floor(look / 8)][look % 8];
        const sequence = [0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 3, 4, 5, 5, 5, 5];
        return this.rows[0][sequence[Math.floor(t * 5) % sequence.length]];
      }
      case 'greeting': case 'delighted': return custom('greeting', (Math.floor(t * 9) + behavior.greetingVariant * 2) % 8);
      case 'jump': return custom('jump', Math.min(11, Math.floor(t / 0.9 * 12)));
      case 'held': return behavior.shakeLevel >= 1 ? custom('dizzy', 2 + Math.floor(t * 12) % 5) : custom('held', Math.floor(t * 11) % 8);
      case 'landing': return this.rows[0][0];
      case 'dizzy': return custom('dizzy', [2, 3, 4, 5, 6, 5, 4, 3][Math.floor(t * 11) % 8]);
      case 'waking': return custom('sleep', Math.max(0, 3 - Math.floor(t * 5)));
      case 'angry': return custom('angry', Math.floor(t * 12) % 8);
      case 'pout': return custom('angry', 7);
      case 'dance': return custom('dance', Math.floor(t * 12) % 8);
      case 'sleeping': return custom('sleep', t < 1.6 ? Math.floor(t * 5) : 4 + Math.floor((t - 1.6) * 2) % 4);
      case 'curious': return standard(7, 5);
    }
  }
}
