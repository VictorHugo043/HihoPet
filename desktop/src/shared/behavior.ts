export type Mood = 'idle' | 'greeting' | 'delighted' | 'jump' | 'held' | 'landing' | 'dizzy' | 'waking' | 'angry' | 'pout' | 'dance' | 'sleeping' | 'curious';

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
  private previousVelocity = { x: 0, y: 0 };

  start(mood: Mood, time: number, duration = Infinity): void {
    this.mood = mood;
    this.beganAt = time;
    this.deadline = time + duration;
  }

  tap(variant: number, time: number, duration: number): boolean {
    if (this.dragging || ['dizzy', 'waking'].includes(this.mood)) return false;
    this.greetingVariant = variant;
    this.grumpyWake = false;
    this.start(variant % 3 === 1 ? 'delighted' : 'greeting', time, duration);
    return true;
  }

  jump(time: number): void {
    if (this.dragging || ['dizzy', 'waking'].includes(this.mood)) return;
    this.grumpyWake = false;
    this.start('jump', time, 0.9);
  }

  beginDrag(time: number): void {
    this.dragging = true;
    this.shaken = false;
    this.shakeLevel = 0;
    this.grumpyWake = false;
    this.reversals = [];
    this.previousVelocity = { x: 0, y: 0 };
    this.start('held', time);
  }

  drag(x: number, y: number, time: number): void {
    if (!this.dragging) return;
    const speed = Math.hypot(x, y);
    const previousSpeed = Math.hypot(this.previousVelocity.x, this.previousVelocity.y);
    const dot = x * this.previousVelocity.x + y * this.previousVelocity.y;
    this.reversals = this.reversals.filter(t => time - t <= 1.8);
    // A fast one-way reposition is not a shake; repeated substantial reversals are required.
    if (speed > 650 && previousSpeed > 650 && dot < -0.45 * speed * previousSpeed &&
        time - (this.reversals.at(-1) ?? -Infinity) > 0.095) this.reversals.push(time);
    if (speed > 150) this.previousVelocity = { x, y };
    this.shakeLevel = Math.min(1, this.reversals.length / 5);
    if (this.reversals.length >= 5) this.shaken = true;
  }

  endDrag(time: number): void {
    if (!this.dragging) return;
    this.dragging = false;
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
    this.start(this.mood === 'sleeping' ? 'waking' : 'sleeping', time, this.mood === 'sleeping' ? 0.9 : Infinity);
  }

  dance(time: number): void {
    if (this.dragging) return;
    this.grumpyWake = false;
    this.start('dance', time, 7.5);
  }

  curious(time: number): void {
    if (this.mood === 'idle' && !this.dragging) this.start('curious', time, 2.1);
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
    if (radius < 100 || radius > 550) { this.reset(); return false; }
    const angle = Math.atan2(x, y);
    if (this.lastAngle === undefined || time - this.lastTime >= 0.35 || time - this.startedAt >= 8) {
      this.reset();
      this.lastAngle = angle;
      this.startedAt = this.lastTime = time;
      return false;
    }
    const delta = Math.atan2(Math.sin(angle - this.lastAngle), Math.cos(angle - this.lastAngle));
    this.lastAngle = angle;
    this.lastTime = time;
    if (Math.abs(delta) >= 0.75) { this.reset(); return false; }
    if (Math.abs(delta) <= 0.004) return false;
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
    if (this.travel >= 5 * Math.PI) { this.reset(); return true; }
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
