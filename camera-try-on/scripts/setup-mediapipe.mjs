import { cp, mkdir } from 'node:fs/promises';

// Serve the exact installed MediaPipe WASM runtime from our own origin so the
// JS API and the WASM binary can never drift apart.
const destination = new URL('../public/mediapipe/wasm/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url), destination, { recursive: true });
