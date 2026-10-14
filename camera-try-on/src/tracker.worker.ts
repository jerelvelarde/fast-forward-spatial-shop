/**
 * Face + body tracking off the main thread. Each frame arrives as an
 * ImageBitmap and is returned with its results, so the app can display the
 * exact frame the landmarks were computed from (overlay never lags the video).
 */
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { TrackTask, WorkerInput, WorkerOutput } from './tracker-protocol.js';

const MODELS = {
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  poseLite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  poseFull: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};
/** Longest side of the person mask sent back for occlusion. */
const MASK_SIZE = 256;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerInput>) => void) | null;
  postMessage(message: WorkerOutput, transfer?: Transferable[]): void;
  close(): void;
};

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
let files: Promise<Fileset> | null = null;
let useGpu = typeof OffscreenCanvas !== 'undefined';
let face: FaceLandmarker | null = null;
let pose: PoseLandmarker | null = null;
const loading = new Map<TrackTask, Promise<void>>();
const failed = new Set<TrackTask>();

function baseOptions(modelAssetPath: string) {
  return useGpu
    ? { baseOptions: { modelAssetPath, delegate: 'GPU' as const }, canvas: new OffscreenCanvas(1, 1) }
    : { baseOptions: { modelAssetPath, delegate: 'CPU' as const } };
}

async function create(task: TrackTask) {
  const fileset = await files!;
  if (task === 'face') {
    face = await FaceLandmarker.createFromOptions(fileset, {
      ...baseOptions(MODELS.face), runningMode: 'VIDEO', numFaces: 1,
      minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
  } else {
    pose = await PoseLandmarker.createFromOptions(fileset, {
      ...baseOptions(useGpu ? MODELS.poseFull : MODELS.poseLite), runningMode: 'VIDEO', numPoses: 1,
      outputSegmentationMasks: true,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
  }
}

function ensure(task: TrackTask): boolean {
  if (task === 'face' ? face : pose) return true;
  if (failed.has(task) || loading.has(task)) return false;
  scope.postMessage({ type: 'status', task, phase: 'loading' });
  const promise = create(task)
    .catch(async error => {
      if (!useGpu) throw error;
      // GPU delegates are not available in every worker; retry on CPU.
      console.warn(`[tracker] GPU ${task} tracking unavailable, using CPU`, error);
      useGpu = false;
      await create(task);
    })
    .then(() => scope.postMessage({ type: 'status', task, phase: 'ready' }))
    .catch(error => {
      console.error(`[tracker] ${task} tracking failed to load`, error);
      failed.add(task);
      scope.postMessage({ type: 'status', task, phase: 'error' });
    })
    .finally(() => loading.delete(task));
  loading.set(task, promise);
  return false;
}

function downsampleMask(source: Uint8Array | Float32Array, width: number, height: number) {
  const scale = Math.min(1, MASK_SIZE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(w * h);
  const float = source instanceof Float32Array;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) / scale));
      const value = source[sy * width + sx];
      out[y * w + x] = float ? Math.round(Math.min(1, Math.max(0, value)) * 255) : value;
    }
  }
  return { data: out, width: w, height: h };
}

scope.onmessage = ({ data }) => {
  if (data.type === 'init') {
    files = FilesetResolver.forVisionTasks(data.wasmPath, true);
    return;
  }
  if (data.type === 'warm') {
    data.tasks.forEach(ensure);
    return;
  }
  if (data.type === 'stop') {
    face?.close(); pose?.close();
    scope.close();
    return;
  }

  const { bitmap, time, tasks } = data;
  const out: Extract<WorkerOutput, { type: 'result' }> = {
    type: 'result', time, bitmap, width: bitmap.width, height: bitmap.height,
    face: null, pose: null, poseWorld: null, mask: null, maskWidth: 0, maskHeight: 0,
  };
  const transfer: Transferable[] = [bitmap];
  try {
    if (tasks.includes('face') && ensure('face') && face) {
      const result = face.detectForVideo(bitmap, time);
      const points = result.faceLandmarks[0];
      if (points) {
        out.face = new Float32Array(points.length * 3);
        points.forEach((p, i) => { out.face![i * 3] = p.x; out.face![i * 3 + 1] = p.y; out.face![i * 3 + 2] = p.z; });
        transfer.push(out.face.buffer);
      }
    }
    if (tasks.includes('pose') && ensure('pose') && pose) {
      const result = pose.detectForVideo(bitmap, time);
      const points = result.landmarks[0];
      const world = result.worldLandmarks[0];
      if (points && world) {
        out.pose = new Float32Array(points.length * 4);
        out.poseWorld = new Float32Array(world.length * 3);
        points.forEach((p, i) => {
          out.pose![i * 4] = p.x; out.pose![i * 4 + 1] = p.y; out.pose![i * 4 + 2] = p.z; out.pose![i * 4 + 3] = p.visibility ?? 1;
        });
        world.forEach((p, i) => { out.poseWorld![i * 3] = p.x; out.poseWorld![i * 3 + 1] = p.y; out.poseWorld![i * 3 + 2] = p.z; });
        transfer.push(out.pose.buffer, out.poseWorld.buffer);
      }
      const mask = result.segmentationMasks?.[0];
      if (mask && points) {
        const small = downsampleMask(mask.hasUint8Array() ? mask.getAsUint8Array() : mask.getAsFloat32Array(), mask.width, mask.height);
        out.mask = small.data; out.maskWidth = small.width; out.maskHeight = small.height;
        transfer.push(small.data.buffer);
      }
      result.segmentationMasks?.forEach(m => m.close());
    }
  } catch (error) {
    console.error('[tracker] frame failed', error);
  }
  scope.postMessage(out, transfer);
};
