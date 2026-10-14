import { CanvasTexture, Color, MeshBasicMaterial, RepeatWrapping } from '@iwsdk/core';

/**
 * Invisible depth-only material. Meshes using it stand in for the wearer's
 * head or body so the far side of a product is hidden behind them.
 */
export function occluderMaterial(): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ colorWrite: false });
  material.depthWrite = true;
  return material;
}

/** Render occluders before everything they hide. */
export const OCCLUDER_ORDER = -10;

let fabricNormal: CanvasTexture | null = null;

/**
 * Tileable ripstop-nylon normal map, generated once. Gives fabric surfaces a
 * woven micro-structure that catches the light.
 */
export function fabricNormalMap(): CanvasTexture {
  if (fabricNormal) return fabricNormal;
  const size = 128;
  const height = new Float32Array(size * size);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const weave = Math.sin((x / size) * Math.PI * 64) * Math.sin((y / size) * Math.PI * 64) * 0.35;
      const grid = (x % 16 < 2 || y % 16 < 2) ? 0.8 : 0;
      height[y * size + x] = weave + grid + random() * 0.25;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 1.2;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = ((-dx / length) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((dy / length) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  fabricNormal = new CanvasTexture(canvas);
  fabricNormal.wrapS = fabricNormal.wrapT = RepeatWrapping;
  return fabricNormal;
}

export const color = (hex: string) => new Color(hex);

export function shade(hex: string, amount: number): Color {
  const c = new Color(hex);
  return amount >= 0 ? c.lerp(new Color('#ffffff'), amount) : c.multiplyScalar(1 + amount);
}

