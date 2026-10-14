import { GestureRecognizer, type GestureAction, type HandPoint } from './gestures.js';

export interface HandTrackingStatus {
  phase: 'loading' | 'ready' | 'tracking' | 'error' | 'stopped';
  message: string;
}
type WorkerResult = { type: 'ready' } | { type: 'result'; points: HandPoint[] | null; time: number } | { type: 'error'; message: string };

/** Local-only inference over an already running video; never opens a camera. */
export class HandTracking {
  private worker: Worker | null = null;
  private version = 0;
  private frame = 0;
  private startupTimer = 0;
  private pendingStart: (() => void) | null = null;
  private lastStatus = '';
  private gestures = new GestureRecognizer();

  constructor(
    private video: HTMLVideoElement,
    private onAction: (action: GestureAction) => void,
    private onStatus: (status: HandTrackingStatus) => void,
  ) {}

  private status(phase: HandTrackingStatus['phase'], message: string) {
    const next = `${phase}:${message}`;
    if (this.lastStatus === next) return;
    this.lastStatus = next;
    this.onStatus({ phase, message });
  }

  stop() {
    this.version++;
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.startupTimer);
    this.pendingStart?.();
    this.pendingStart = null;
    this.gestures.reset();
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.postMessage({ type: 'stop' });
      // Give the worker a chance to close its detector, then reclaim any stuck initialization.
      window.setTimeout(() => worker.terminate(), 200);
    }
    this.status('stopped', 'Hand controls are paused.');
  }

  async start(): Promise<void> {
    this.stop();
    const version = this.version;
    this.status('loading', 'Loading hand controls on this device…');
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      this.status('error', 'This browser cannot run hand controls. Use the arrow buttons and select a card instead.');
      return;
    }
    let worker: Worker;
    try { worker = new Worker(new URL('./hand-tracking.worker.ts', import.meta.url), { type: 'module' }); }
    catch { this.status('error', 'Hand controls could not start. Use the arrow buttons and select a card instead.'); return; }
    this.worker = worker;
    let busy = false;
    let lastFrameTime = -Infinity;
    let lastVideoTime = -1;
    const fail = (message: string) => {
      if (version !== this.version) return;
      this.stop();
      this.status('error', message);
    };
    const tick = (time: number) => {
      if (version !== this.version) return;
      this.frame = requestAnimationFrame(tick);
      if (busy || document.hidden || this.video.readyState < 2 || !this.video.videoWidth || time - lastFrameTime < 100 || this.video.currentTime === lastVideoTime) return;
      busy = true;
      lastFrameTime = time;
      lastVideoTime = this.video.currentTime;
      // Bound frame transfer cost; preserve aspect ratio. Only one bitmap can be in flight.
      const scale = Math.min(1, 640 / Math.max(this.video.videoWidth, this.video.videoHeight));
      void createImageBitmap(this.video, { resizeWidth: Math.max(1, Math.round(this.video.videoWidth * scale)), resizeHeight: Math.max(1, Math.round(this.video.videoHeight * scale)) }).then(bitmap => {
        if (version !== this.version) { bitmap.close(); return; }
        try { worker.postMessage({ type: 'frame', bitmap, time }, [bitmap]); }
        catch { bitmap.close(); fail('The camera frame could not reach hand controls. Restart them or use the arrow buttons.'); }
      }).catch(() => fail('The camera frame could not be read. Restart hand controls or use the arrow buttons.'));
    };
    await new Promise<void>(resolve => {
      this.pendingStart = resolve;
      this.startupTimer = window.setTimeout(() => fail('Hand controls took too long to load. Try again or use the arrow buttons.'), 25_000);
      worker.onerror = () => fail('Hand controls could not load in this browser. Try again or use the arrow buttons.');
      worker.onmessage = ({ data }: MessageEvent<WorkerResult>) => {
        if (version !== this.version) return;
        if (data.type === 'error') { fail(data.message); return; }
        if (data.type === 'ready') {
          window.clearTimeout(this.startupTimer);
          this.pendingStart = null;
          this.status('ready', 'Show one open hand. Swipe left or right to browse; hold a pinch to select.');
          this.frame = requestAnimationFrame(tick);
          resolve();
          return;
        }
        busy = false;
        this.status(data.points ? 'tracking' : 'ready', data.points ? 'Hand found. Swipe an open palm, or hold a thumb-and-index pinch to select.' : 'Show one open hand in the camera to browse.');
        const action = this.gestures.update(data.points, data.time);
        if (action) this.onAction(action);
      };
      const base = new URL(import.meta.env.BASE_URL, window.location.href);
      worker.postMessage({ type: 'init', wasmPath: new URL('hand-tracking/wasm', base).href, modelPath: new URL('hand-tracking/hand_landmarker.task', base).href });
    });
  }
}
