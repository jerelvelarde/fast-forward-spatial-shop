import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

type Input = { type: 'init'; wasmPath: string; modelPath: string } | { type: 'frame'; bitmap: ImageBitmap; time: number } | { type: 'stop' };
const scope = self as unknown as { onmessage: ((event: MessageEvent<Input>) => void) | null; postMessage(message: unknown): void; close(): void };
let detector: HandLandmarker | null = null;
let stopped = false;

scope.onmessage = async ({ data }) => {
  if (data.type === 'stop') {
    stopped = true;
    detector?.close();
    detector = null;
    scope.close();
    return;
  }
  if (data.type === 'init') {
    try {
      // A module worker needs the ES-module WASM loader; the classic loader's
      // ModuleFactory stays module-local when imported and cannot initialize Tasks.
      const files = await FilesetResolver.forVisionTasks(data.wasmPath, true);
      const created = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.modelPath, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: 0.65, minHandPresenceConfidence: 0.65, minTrackingConfidence: 0.65,
      });
      if (stopped) { created.close(); return; }
      detector = created;
      scope.postMessage({ type: 'ready' });
    } catch (error) { console.error('Hand controls initialization failed:', error); if (!stopped) scope.postMessage({ type: 'error', message: 'Hand controls could not load. Check the connection and try again, or use the arrow buttons.' }); }
    return;
  }
  try {
    if (!detector || stopped) return;
    const result = detector.detectForVideo(data.bitmap, data.time);
    scope.postMessage({ type: 'result', points: result.landmarks[0] ?? null, time: data.time });
  } catch { if (!stopped) scope.postMessage({ type: 'error', message: 'Hand tracking stopped. Restart hand controls or use the arrow buttons.' }); }
  finally { data.bitmap.close(); }
};
