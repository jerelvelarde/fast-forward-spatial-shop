import type { ViewFit } from './body-fit.js';

/** Plane on which tracked content is placed, in camera-space units. */
export const TRACK_DEPTH = 1;

/**
 * The live camera frame source, shared between CameraFeedSystem (which owns
 * it and draws the backdrop) and TryOnSystem (which tracks it).
 */
export const feed = {
  source: null as HTMLVideoElement | HTMLCanvasElement | null,
  width: 0,
  height: 0,
  /** Selfie preview: mirror the image like a mirror. */
  mirror: true,
  /** Changes whenever the source shows a new frame. */
  frameTime: -1,
  /** Viewport mapping at TRACK_DEPTH, refreshed every frame. */
  fit: { videoAspect: 16 / 9, viewAspect: 16 / 9, mirror: true, halfW: 1, halfH: 1, depth: TRACK_DEPTH } as ViewFit,
  /**
   * Show an analysed frame instead of the live video, so worn products never
   * lag behind the image. Ownership of the bitmap passes to the backdrop.
   * `null` returns to the live video.
   */
  present: (bitmap: ImageBitmap | null): void => { bitmap?.close(); },
  /** Switch between front and back cameras (no-op until the camera starts). */
  flip: (): void => {},
  /** Restart the camera after a permission or device error. */
  retry: (): void => {},
};
