export class MusicSignal {
  private average = 0.01;
  private lastBeat = -Infinity;
  private period = 0.5;
  private previousTime = 0;
  private phase = 0;
  private energy = 0;

  update(rms: number, bass: number, time: number): { energy: number; phase: number } {
    const dt = this.previousTime ? Math.max(0, Math.min(0.2, time - this.previousTime)) : 1 / 30;
    this.previousTime = time;
    this.average += (bass - this.average) * (1 - Math.exp(-dt * 2));
    if (rms > 0.005 && bass > Math.max(0.025, this.average * 1.35) && time - this.lastBeat > 0.28) {
      const interval = time - this.lastBeat;
      if (interval >= 0.3 && interval <= 1.2) this.period += (interval - this.period) * 0.25;
      this.lastBeat = time;
      this.phase += Math.atan2(Math.sin(-this.phase), Math.cos(-this.phase)) * 0.2;
    }
    const target = rms < 0.003 ? 0 : Math.min(1, Math.sqrt(rms / 0.12));
    this.energy += (target - this.energy) * (1 - Math.exp(-dt * (target > this.energy ? 12 : 5)));
    this.phase += dt / this.period * 2 * Math.PI;
    return { energy: this.energy < 0.015 ? 0 : this.energy, phase: this.phase % (2 * Math.PI) };
  }
}
