import { signal } from '@iwsdk/core';
import type { Product, TryOnKind } from './products.js';

export type CameraStatus = 'starting' | 'active' | 'error';

export interface WornItem { productId: string; variantId: string }

export type TrackingHint =
  | 'idle'          // nothing worn
  | 'loading'       // tracking model downloading
  | 'searching'     // worn, but no face/body found
  | 'step-back'     // body tracking needs shoulders and hips in view
  | 'tracking'
  | 'error';

/** UI-facing state shared by the DOM overlay and the IWSDK systems. */
export const appState = {
  products: signal<Product[]>([]),
  productsError: signal<string | null>(null),
  camera: signal<CameraStatus>('starting'),
  cameraMessage: signal(''),
  /** Whether more than one camera exists, so the flip button is useful. */
  canFlipCamera: signal(false),
  worn: signal<Partial<Record<TryOnKind, WornItem>>>({}),
  /** The product whose details are open in the sheet. */
  focusedId: signal<string | null>(null),
  hint: signal<TrackingHint>('idle'),
  bag: signal<string[]>([]),
};
