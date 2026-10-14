import { Color } from '@iwsdk/core';

const SIZE = 16;
const INTERVAL_MS = 400;

/**
 * Estimates the room's lighting from the camera image: the average colour of
 * the upper and lower halves drive a hemisphere light, overall brightness
 * drives intensity. Products then pick up warm/cool/dim rooms naturally.
 */
export class LightProbe {
  readonly sky = new Color(1, 1, 1);
  readonly ground = new Color(0.5, 0.5, 0.5);
  /** Relative scene brightness, ~0 (dark) to ~1 (bright). */
  brightness = 0.6;

  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private last = 0;
  private readonly targetSky = new Color(1, 1, 1);
  private readonly targetGround = new Color(0.5, 0.5, 0.5);
  private targetBrightness = 0.6;

  update(source: CanvasImageSource | null, dt: number) {
    const now = performance.now();
    if (source && now - this.last > INTERVAL_MS) {
      this.last = now;
      this.sample(source);
    }
    const t = 1 - Math.exp(-dt * 3);
    this.sky.lerp(this.targetSky, t);
    this.ground.lerp(this.targetGround, t);
    this.brightness += (this.targetBrightness - this.brightness) * t;
  }

  private sample(source: CanvasImageSource) {
    if (!this.context) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.canvas.height = SIZE;
      this.context = this.canvas.getContext('2d', { willReadFrequently: true });
      if (!this.context) return;
    }
    try {
      this.context.drawImage(source, 0, 0, SIZE, SIZE);
      const { data } = this.context.getImageData(0, 0, SIZE, SIZE);
      const half = (SIZE * SIZE * 4) / 2;
      const average = (from: number, to: number, out: Color) => {
        let r = 0, g = 0, b = 0;
        for (let i = from; i < to; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
        const n = (to - from) / 4;
        out.setRGB(r / n / 255, g / n / 255, b / n / 255, 'srgb');
        return out;
      };
      average(0, half, this.targetSky);
      average(half, data.length, this.targetGround);
      const luminance = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      this.targetBrightness = Math.min(1, (luminance(this.targetSky) + luminance(this.targetGround)) / 2 / 0.25);
      // Keep the hue but normalise brightness; intensity carries the level.
      for (const color of [this.targetSky, this.targetGround]) {
        const max = Math.max(color.r, color.g, color.b, 1e-3);
        color.multiplyScalar(1 / max).lerp(WHITE, 0.55);
      }
    } catch {
      // A tainted or not-yet-ready source; try again next interval.
    }
  }
}

const WHITE = new Color(1, 1, 1);
