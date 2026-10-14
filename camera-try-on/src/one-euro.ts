/**
 * One Euro filter (Casiez et al. 2012): heavy smoothing when still, low lag
 * when moving fast. Used to steady landmarks without the "floating" feel.
 */
export class OneEuro {
  private x = 0;
  private dx = 0;
  private initialized = false;

  constructor(private minCutoff = 1.5, private beta = 0.5, private dCutoff = 1) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, dt: number): number {
    if (!this.initialized || dt <= 0) {
      this.initialized = true;
      this.x = value;
      this.dx = 0;
      return value;
    }
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() { this.initialized = false; }
}

/** Three One Euro filters for a vector. */
export class OneEuro3 {
  private fx: OneEuro; private fy: OneEuro; private fz: OneEuro;
  constructor(minCutoff?: number, beta?: number) {
    this.fx = new OneEuro(minCutoff, beta);
    this.fy = new OneEuro(minCutoff, beta);
    this.fz = new OneEuro(minCutoff, beta);
  }
  filter(v: { x: number; y: number; z: number }, dt: number) {
    v.x = this.fx.filter(v.x, dt);
    v.y = this.fy.filter(v.y, dt);
    v.z = this.fz.filter(v.z, dt);
    return v;
  }
  reset() { this.fx.reset(); this.fy.reset(); this.fz.reset(); }
}
