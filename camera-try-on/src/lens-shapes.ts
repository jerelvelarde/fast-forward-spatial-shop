/**
 * Lens outlines shared by the 3D try-on model and the server-rendered product
 * art, so the preview image and the worn frames always match.
 *
 * Units: the distance between the wearer's outer eye corners is 1. Points are
 * for the lens on the +x side, relative to that lens's centre, y up, and wound
 * counter-clockwise. Mirror x for the other lens.
 */
import type { GlassesStyle } from './products.js';

export interface LensSpec {
  /** Lens centre distance from the bridge midline. */
  centerX: number;
  /** Lens centre height relative to the eye line (negative = lower). */
  centerY: number;
  /** Rim thickness around the lens. */
  rim: number;
  /** Hinge height relative to the lens centre. */
  hingeY: number;
  points: Array<[number, number]>;
}

const SEGMENTS = 64;

function sample(fn: (c: number, s: number) => [number, number]): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    points.push(fn(Math.cos(t), Math.sin(t)));
  }
  return points;
}

const signedPow = (value: number, power: number) => Math.sign(value) * Math.abs(value) ** power;

export function lensSpec(shape: GlassesStyle['shape']): LensSpec {
  switch (shape) {
    case 'aviator':
      // Flat brow, teardrop that drops toward the nose (inner side is -x).
      return {
        centerX: 0.36, centerY: -0.04, rim: 0.018, hingeY: 0.13,
        points: sample((c, s) => {
          const x = 0.29 * signedPow(c, 0.85);
          const y = s > 0 ? 0.17 * signedPow(s, 0.55) : s * (0.2 + 0.09 * Math.max(0, -c) ** 0.8);
          return [x, y];
        }),
      };
    case 'wayfarer':
      // Rounded trapezoid, wider at the top with a lifted outer brow.
      return {
        centerX: 0.34, centerY: -0.01, rim: 0.055, hingeY: 0.12,
        points: sample((c, s) => {
          let x = 0.25 * signedPow(c, 0.5);
          let y = 0.17 * signedPow(s, 0.5);
          x *= 1 + 0.13 * (y / 0.17);
          if (y > 0) y += 0.035 * Math.max(0, x / 0.25);
          return [x, y];
        }),
      };
    case 'round':
      return {
        centerX: 0.33, centerY: -0.02, rim: 0.032, hingeY: 0.08,
        points: sample((c, s) => [0.235 * c, 0.235 * s]),
      };
  }
}

/** Offset a convex-ish outline outward along its radial direction. */
export function offsetOutline(points: Array<[number, number]>, distance: number): Array<[number, number]> {
  return points.map(([x, y]) => {
    const length = Math.hypot(x, y) || 1;
    return [x + (x / length) * distance, y + (y / length) * distance];
  });
}

export function outlineBounds(points: Array<[number, number]>) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}
