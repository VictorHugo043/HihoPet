export type Mood = 'idle' | 'greeting' | 'delighted' | 'jump' | 'held' | 'landing' | 'dizzy' | 'waking' | 'angry' | 'pout' | 'dance' | 'sleeping' | 'curious' | 'petted' | 'feeding' | 'chasing';

/** Monotonic seconds keep gesture recognition independent of display refresh rate. */
export class PetBehavior {
  mood: Mood = 'idle';
  beganAt = 0;
  dragging = false;
  shakeLevel = 0;
  greetingVariant = 0;
  private deadline = Infinity;
  private shaken = false;
  private grumpyWake = false;
  private reversals: number[] = [];
  private dragAnchor = { x: 0, y: 0 };
  private dragPeak = { x: 0, y: 0 };
  private dragDirection = { x: 0, y: 0 };
  private strokeAt = 0;
  private lastInteraction = 0;

  interact(time: number): void { this.lastInteraction = time; }

  autoSleep(time: number, musicActive: boolean): void {
    if (this.dragging || musicActive) { this.interact(time); return; }
    if (['idle', 'curious'].includes(this.mood) && time - this.lastInteraction >= 300) {
      this.grumpyWake = false;
      this.start('sleeping', time);
    }
  }

  start(mood: Mood, time: number, duration = Infinity): void {
    this.mood = mood;
    this.beganAt = time;
    this.deadline = time + duration;
  }

  tap(variant: number, time: number, duration: number): boolean {
    if (this.dragging || ['dizzy', 'waking'].includes(this.mood)) return false;
    this.greetingVariant = variant;
    this.interact(time);
    this.grumpyWake = false;
    this.start(variant % 3 === 1 ? 'delighted' : 'greeting', time, duration);
    return true;
  }

  jump(time: number): void {
    if (this.dragging || ['dizzy', 'waking'].includes(this.mood)) return;
    this.grumpyWake = false;
    this.interact(time);
    this.start('jump', time, 0.9);
  }

  beginDrag(time: number, x = 0, y = 0): void {
    this.interact(time);
    this.dragging = true;
    this.shaken = false;
    this.shakeLevel = 0;
    this.grumpyWake = false;
    this.reversals = [];
    this.dragAnchor = this.dragPeak = { x, y };
    this.dragDirection = { x: 0, y: 0 };
    this.strokeAt = time;
    this.start('held', time);
  }

  drag(x: number, y: number, time: number): void {
    if (!this.dragging) return;
    this.reversals = this.reversals.filter(t => time - t <= 3);
    const dx = x - this.dragAnchor.x, dy = y - this.dragAnchor.y;
    const length = Math.hypot(dx, dy);
    if (!this.dragDirection.x && !this.dragDirection.y) {
      if (length < 24) return;
      this.dragDirection = { x: dx / length, y: dy / length };
      this.dragPeak = { x, y };
      this.strokeAt = time;
    } else {
      const along = (x - this.dragPeak.x) * this.dragDirection.x + (y - this.dragPeak.y) * this.dragDirection.y;
      if (along >= 0) this.dragPeak = { x, y };
      // Measure a complete return stroke, including the natural slowdown at its turn.
      else if (along <= -24) {
        if (time - this.strokeAt <= 0.8) this.reversals.push(time);
        this.dragAnchor = this.dragPeak;
        const rx = x - this.dragPeak.x, ry = y - this.dragPeak.y;
        const distance = Math.hypot(rx, ry);
        this.dragDirection = { x: rx / distance, y: ry / distance };
        this.dragPeak = { x, y };
        this.strokeAt = time;
      }
    }
    this.shakeLevel = this.shaken ? 1 : Math.min(1, this.reversals.length / 4);
    if (this.reversals.length >= 4) this.shaken = true;
  }

  endDrag(time: number): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.interact(time);
    if (this.shaken) this.becomeDizzy(time);
    else this.start('landing', time, 0.55);
  }

  becomeDizzy(time: number): void {
    if (this.dragging) return;
    this.grumpyWake = true;
    this.start('dizzy', time, 3.1);
  }

  toggleSleep(time: number): void {
    if (this.dragging) return;
    this.grumpyWake = false;
    this.interact(time);
    this.start(this.mood === 'sleeping' ? 'waking' : 'sleeping', time, this.mood === 'sleeping' ? 0.9 : Infinity);
  }

  dance(time: number): void {
    if (this.dragging) return;
    this.grumpyWake = false;
    this.interact(time);
    this.start('dance', time, 7.5);
  }

  curious(time: number): void {
    if (this.mood === 'idle' && !this.dragging) this.start('curious', time, 2.1);
  }

  pet(time: number): boolean {
    if (!['idle', 'curious', 'pout'].includes(this.mood) || this.dragging) return false;
    this.interact(time); this.start('petted', time, 2.4);
    return true;
  }

  feed(time: number): boolean {
    if (this.dragging || ['dizzy', 'waking', 'sleeping'].includes(this.mood)) return false;
    this.interact(time); this.start('feeding', time, 3.2);
    return true;
  }

  update(time: number): void {
    if (this.dragging) return;
    while (time >= this.deadline) {
      const next = this.deadline;
      if (this.mood === 'dizzy') this.start('waking', next, 0.75);
      else if (this.mood === 'waking' && this.grumpyWake) this.start('angry', next, 3);
      else if (this.mood === 'angry') this.start('pout', next, 1.2);
      else if (this.mood === 'jump') this.start('landing', next, 0.55);
      else {
        this.grumpyWake = false;
        this.shakeLevel = 0;
        this.start('idle', next);
      }
    }
  }
}

export class PettingTracker {
  private previous: { x: number; y: number; time: number } | undefined;
  private travel = 0;
  private direction = 0;
  private turns = 0;
  private startedAt = 0;
  private cooldown = 0;
  private strokeAnchor = 0;

  reset(): void {
    this.previous = undefined;
    this.travel = this.turns = this.direction = 0;
  }

  observe(x: number, y: number, time: number, overHead: boolean): boolean {
    if (!overHead || time < this.cooldown) { this.reset(); return false; }
    if (!this.previous || time - this.previous.time > 0.35 || time - this.startedAt > 2.5) {
      this.previous = { x, y, time }; this.startedAt = time; this.travel = this.turns = this.direction = 0;
      this.strokeAnchor = x;
      return false;
    }
    const dx = x - this.previous.x;
    const distance = Math.hypot(dx, y - this.previous.y);
    const speed = distance / Math.max(1 / 240, time - this.previous.time);
    this.previous = { x, y, time };
    if (speed > 850) { this.travel = this.turns = 0; return false; }
    this.travel += distance;
    if (Math.abs(x - this.strokeAnchor) >= 8) {
      const direction = Math.sign(x - this.strokeAnchor);
      if (this.direction && direction !== this.direction) this.turns++;
      this.direction = direction;
      this.strokeAnchor = x;
    }
    if (this.travel >= 75 && this.turns >= 2) {
      this.cooldown = time + 3;
      this.previous = undefined;
      return true;
    }
    return false;
  }
}

/** Accumulates continuous circles, with angle unwrapping and a small reversal tolerance. */
export class OrbitTracker {
  private lastAngle: number | undefined;
  private lastTime = 0;
  private startedAt = 0;
  private travel = 0;
  private direction = 0;
  private reverseTravel = 0;

  reset(): void {
    this.lastAngle = undefined;
    this.travel = this.direction = this.reverseTravel = 0;
  }

  observe(x: number, y: number, time: number): boolean {
    const radius = Math.hypot(x, y);
    if (radius < 20 || radius > 360) { this.reset(); return false; }
    const angle = Math.atan2(x, y);
    if (this.lastAngle === undefined || time - this.lastTime >= 0.7 || time - this.startedAt >= 20) {
      this.reset();
      this.lastAngle = angle;
      this.startedAt = this.lastTime = time;
      return false;
    }
    const delta = Math.atan2(Math.sin(angle - this.lastAngle), Math.cos(angle - this.lastAngle));
    this.lastAngle = angle;
    this.lastTime = time;
    if (Math.abs(delta) >= 1.5) { this.reset(); return false; }
    if (Math.abs(delta) <= 0.0001) return false;
    const sign = Math.sign(delta);
    if (!this.direction) this.direction = sign;
    if (sign === this.direction) {
      this.travel += Math.abs(delta);
      this.reverseTravel = 0;
    } else {
      this.reverseTravel += Math.abs(delta);
      this.travel = Math.max(0, this.travel - Math.abs(delta));
      if (this.reverseTravel > 0.16) {
        this.direction = sign;
        this.travel = this.reverseTravel;
        this.reverseTravel = 0;
        this.startedAt = time;
      }
    }
    if (this.travel >= 4 * Math.PI) { this.reset(); return true; }
    return false;
  }
}

export class ShuffleBag {
  private bag: number[] = [];
  private previous = -1;
  constructor(private readonly count: number, private readonly random: () => number = Math.random) {
    if (count < 1) throw new Error('At least one greeting is required');
  }
  next(): number {
    if (!this.bag.length) {
      this.bag = Array.from({ length: this.count }, (_, i) => i);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      const last = this.bag.length - 1;
      if (this.count > 1 && this.bag[last] === this.previous) [this.bag[0], this.bag[last]] = [this.bag[last], this.bag[0]];
    }
    this.previous = this.bag.pop()!;
    return this.previous;
  }
}
