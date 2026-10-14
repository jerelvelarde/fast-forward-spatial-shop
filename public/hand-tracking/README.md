# Local hand-tracking assets

`hand_landmarker.task` is Google's HandLandmarker (full), float16 model bundle,
downloaded 2026-10-14 from the official model link in the
[MediaPipe model documentation](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/index#models).

Source: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task

SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`

The committed file pins the downloaded model rather than fetching `latest` at
runtime. The WASM runtime comes from the pinned `@mediapipe/tasks-vision` 1.1.0
npm dependency (Apache-2.0), copied by `scripts/setup-hand-tracking.mjs` before
development/build. Generated WASM files are ignored by Git. Runtime assets are
served from this app's origin; webcam frames are processed locally.
