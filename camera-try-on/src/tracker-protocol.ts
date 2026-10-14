export type TrackTask = 'face' | 'pose';

export type WorkerInput =
  | { type: 'init'; wasmPath: string }
  | { type: 'frame'; bitmap: ImageBitmap; time: number; tasks: TrackTask[] }
  /** Download and initialise detectors ahead of the first try-on. */
  | { type: 'warm'; tasks: TrackTask[] }
  | { type: 'stop' };

export type WorkerOutput =
  | { type: 'status'; task: TrackTask; phase: 'loading' | 'ready' | 'error' }
  | {
      type: 'result';
      time: number;
      /** The analysed frame, returned for synchronised display. */
      bitmap: ImageBitmap;
      width: number;
      height: number;
      /** 478 face landmarks, xyz interleaved, normalised to the frame. */
      face: Float32Array | null;
      /** 33 pose landmarks, xyz + visibility interleaved, normalised to the frame. */
      pose: Float32Array | null;
      /** 33 pose landmarks in metres, hip-centred, xyz interleaved. */
      poseWorld: Float32Array | null;
      /** Person segmentation confidence (0–255), row 0 = top of frame. */
      mask: Uint8Array | null;
      maskWidth: number;
      maskHeight: number;
    };

export type TrackResult = Extract<WorkerOutput, { type: 'result' }>;
