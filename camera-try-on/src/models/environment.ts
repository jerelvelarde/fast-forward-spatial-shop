import { PMREMGenerator, type Texture, type WebGLRenderer } from '@iwsdk/core';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

let environment: Texture | null = null;

/**
 * A studio-style reflection map for products. Metal frames and lenses need
 * bright, high-contrast surroundings to read as metal and glass; the scene's
 * soft gradient IBL alone makes them look flat.
 */
export function initProductEnvironment(renderer: WebGLRenderer) {
  if (environment) return;
  const generator = new PMREMGenerator(renderer);
  environment = generator.fromScene(new RoomEnvironment(), 0.03).texture;
  generator.dispose();
}

export const productEnvironment = () => environment;
