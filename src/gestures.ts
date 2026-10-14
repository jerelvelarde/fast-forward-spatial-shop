export type GestureAction = 'next' | 'previous' | 'select';
export interface HandPoint { x: number; y: number; z?: number }

interface Sample { x: number; y: number; time: number }
const distance = (a: HandPoint, b: HandPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Converts camera landmarks into deliberate actions, with mirrored-preview directions. */
export class GestureRecognizer {
  private samples: Sample[] = [];
  private pinchSince: number | null = null;
  private pinchFired = false;
  private cooldownUntil = 0;
  private swipeArmed = true;
  private lastTime = -Infinity;

  reset() {
    this.samples = [];
    this.pinchSince = null;
    this.pinchFired = false;
    this.cooldownUntil = 0;
    this.swipeArmed = true;
    this.lastTime = -Infinity;
  }

  update(points: readonly HandPoint[] | null, time: number): GestureAction | null {
    if (!Number.isFinite(time) || time <= this.lastTime) return null;
    const gap = time - this.lastTime;
    this.lastTime = time;
    if (!points || points.length < 21 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      this.samples = [];
      this.pinchSince = null;
      this.swipeArmed = true;
      // Keep a fired pinch latched until an observed release, even across brief tracking loss.
      return null;
    }
    if (gap > 300) { this.samples = []; this.pinchSince = null; }
    const palmWidth = distance(points[5], points[17]);
    if (palmWidth < 0.04 || palmWidth > 0.65) { this.samples = []; this.pinchSince = null; return null; }
    const pinchRatio = distance(points[4], points[8]) / palmWidth;
    if (pinchRatio >= 0.42) { this.pinchSince = null; this.pinchFired = false; }
    const pinching = pinchRatio < 0.28 || (this.pinchSince !== null && pinchRatio < 0.42);
    if (pinching) {
      this.samples = [];
      if (this.pinchSince === null) this.pinchSince = time;
      if (!this.pinchFired && time - this.pinchSince >= 500 && time >= this.cooldownUntil) {
        this.pinchFired = true;
        this.cooldownUntil = time + 900;
        return 'select';
      }
      return null;
    }
    const openPalm = [[8, 6], [12, 10], [16, 14], [20, 18]].every(([tip, joint]) => distance(points[0], points[tip]) > distance(points[0], points[joint]) * 1.15);
    if (!openPalm) { this.samples = []; return null; }
    const center = [0, 5, 9, 13, 17].reduce((sum, index) => ({ x: sum.x + points[index].x / 5, y: sum.y + points[index].y / 5 }), { x: 0, y: 0 });
    // Detection receives unmirrored frames, while the browsing preview is mirrored.
    const sample = { x: 1 - center.x, y: center.y, time };
    this.samples.push(sample);
    this.samples = this.samples.filter(item => time - item.time <= 600);
    if (!this.swipeArmed) {
      const recent = this.samples.filter(item => time - item.time <= 300);
      if (recent.length >= 3 && time - recent[0].time >= 180 && Math.max(...recent.map(item => item.x)) - Math.min(...recent.map(item => item.x)) < 0.025) {
        this.swipeArmed = true;
        this.samples = [sample];
      }
      return null;
    }
    if (this.samples.length < 3 || time < this.cooldownUntil) return null;
    const first = this.samples[0];
    const elapsed = time - first.time;
    const dx = sample.x - first.x;
    const dy = sample.y - first.y;
    const travel = this.samples.slice(1).reduce((total, item, index) => total + Math.abs(item.x - this.samples[index].x), 0);
    if (elapsed < 150 || Math.abs(dx) < Math.max(0.14, palmWidth * 1.2) || Math.abs(dy) > 0.1 || Math.abs(dx) / (elapsed / 1000) < 0.35 || Math.abs(dx) / Math.max(travel, 0.001) < 0.8) return null;
    this.swipeArmed = false;
    this.cooldownUntil = time + 900;
    this.samples = [sample];
    return dx < 0 ? 'next' : 'previous';
  }
}
