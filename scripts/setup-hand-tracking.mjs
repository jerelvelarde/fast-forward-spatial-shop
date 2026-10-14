import { cp, mkdir } from 'node:fs/promises';

// Serve the exact installed MediaPipe runtime from our own origin.
const destination = new URL('../public/hand-tracking/wasm/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url), destination, { recursive: true });
