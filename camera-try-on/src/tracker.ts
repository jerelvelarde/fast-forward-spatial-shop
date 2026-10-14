import type { TrackResult, TrackTask, WorkerInput, WorkerOutput } from './tracker-protocol.js';

export type TaskPhase = 'idle' | 'loading' | 'ready' | 'error';

/** Longest side of the frames analysed (and shown while something is worn). */
const MAX_FRAME_SIDE = 1280;

/**
 * Main-thread side of the tracking worker. One frame is in flight at a time;
 * the newest result is held until the try-on system consumes it.
 */
export class Tracker {
  readonly phases: Record<TrackTask, TaskPhase> = { face: 'idle', pose: 'idle' };
  /** Detector round trips per second, for adaptive UI hints. */
  fps = 0;
  onPhase: ((task: TrackTask, phase: TaskPhase) => void) | null = null;

  private worker: Worker | null = null;
  private busy = false;
  private latest: TrackResult | null = null;
  private lastSent = 0;
  private lastSourceTime = -1;
  private sentAt = 0;

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./tracker.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<WorkerOutput>) => {
      if (data.type === 'status') {
        this.phases[data.task] = data.phase;
        this.onPhase?.(data.task, data.phase);
        return;
      }
      this.busy = false;
      const elapsed = performance.now() - this.sentAt;
      this.fps = this.fps * 0.85 + (1000 / Math.max(1, elapsed)) * 0.15;
      this.latest?.bitmap.close();
      this.latest = data;
    };
    worker.onerror = event => {
      console.error('[tracker] worker error', event.message);
      this.busy = false;
      for (const task of ['face', 'pose'] as const) {
        if (this.phases[task] !== 'idle') { this.phases[task] = 'error'; this.onPhase?.(task, 'error'); }
      }
    };
    this.worker = worker;
    const base = new URL(import.meta.env.BASE_URL, window.location.href);
    this.post({ type: 'init', wasmPath: new URL('mediapipe/wasm', base).href });
    return worker;
  }

  private post(message: WorkerInput, transfer: Transferable[] = []) {
    (this.worker ?? this.start()).postMessage(message, transfer);
  }

  /**
   * Send the current frame of `source` if the worker is free and the source
   * has a new frame. `sourceTime` changes whenever the source has a new frame.
   */
  pump(source: CanvasImageSource, width: number, height: number, sourceTime: number, tasks: TrackTask[]) {
    if (!tasks.length || this.busy || !width || !height || sourceTime === this.lastSourceTime) return;
    if (document.hidden) return;
    this.start();
    this.busy = true;
    this.lastSourceTime = sourceTime;
    const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(width, height));
    createImageBitmap(source, { resizeWidth: Math.round(width * scale), resizeHeight: Math.round(height * scale), resizeQuality: 'medium' })
      .then(bitmap => {
        // MediaPipe requires strictly increasing timestamps per detector.
        const time = Math.max(performance.now(), this.lastSent + 1);
        this.lastSent = time;
        this.sentAt = performance.now();
        this.post({ type: 'frame', bitmap, time, tasks }, [bitmap]);
      })
      .catch(() => { this.busy = false; });
  }

  /** Start loading detectors in the background so try-on starts instantly. */
  warm(tasks: TrackTask[]) {
    this.post({ type: 'warm', tasks });
  }

  /** Take ownership of the newest result (caller must close its bitmap). */
  take(): TrackResult | null {
    const result = this.latest;
    this.latest = null;
    return result;
  }

  stop() {
    this.worker?.postMessage({ type: 'stop' } satisfies WorkerInput);
    this.worker = null;
    this.latest?.bitmap.close();
    this.latest = null;
  }
}
