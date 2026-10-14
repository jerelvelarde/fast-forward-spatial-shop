import assert from 'node:assert/strict';
import test from 'node:test';
import { WebcamCapture, webcamErrorMessage, type WebcamState } from '../src/webcam.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function streamFixture() {
  let stops = 0;
  const track = { stop: () => stops++, onended: null as (() => void) | null };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { stream, track, stops: () => stops };
}
function videoFixture() {
  return { srcObject: null, play: async () => {}, pause: () => {}, videoWidth: 0, videoHeight: 0, readyState: 0 } as unknown as HTMLVideoElement;
}

test('closing while permission is pending releases the late stream without starting video', async () => {
  const media = deferred<MediaStream>();
  const video = videoFixture();
  const session = streamFixture();
  const states: WebcamState[] = [];
  const camera = new WebcamCapture(video, state => states.push(state), () => media.promise);
  const starting = camera.start();
  camera.stop();
  media.resolve(session.stream);
  await starting;
  assert.equal(session.stops(), 1);
  assert.equal(video.srcObject, null);
  assert.equal(states[states.length - 1]?.phase, 'idle');
});

test('a newer request cannot be replaced by an older permission result', async () => {
  const pending = [deferred<MediaStream>(), deferred<MediaStream>()];
  const sessions = [streamFixture(), streamFixture()];
  const video = videoFixture();
  let index = 0;
  const camera = new WebcamCapture(video, () => {}, () => pending[index++].promise);
  const first = camera.start();
  const second = camera.start();
  pending[1].resolve(sessions[1].stream);
  await second;
  pending[0].resolve(sessions[0].stream);
  await first;
  assert.equal(video.srcObject, sessions[1].stream);
  assert.equal(sessions[0].stops(), 1);
  assert.equal(sessions[1].stops(), 0);
  camera.stop();
  assert.equal(sessions[1].stops(), 1);
});

test('playback failure releases the camera and reports recovery options', async () => {
  const video = videoFixture();
  video.play = async () => { throw new DOMException('denied', 'NotAllowedError'); };
  const session = streamFixture();
  const states: WebcamState[] = [];
  const camera = new WebcamCapture(video, state => states.push(state), async () => session.stream);
  await camera.start();
  assert.equal(session.stops(), 1);
  assert.equal(video.srcObject, null);
  assert.equal(states[states.length - 1]?.phase, 'error');
  assert.match(states[states.length - 1]!.message, /upload a photo/);
});

test('a disconnected webcam stops its session', async () => {
  const video = videoFixture();
  const session = streamFixture();
  const states: WebcamState[] = [];
  const camera = new WebcamCapture(video, state => states.push(state), async () => session.stream);
  await camera.start();
  session.track.onended?.();
  assert.equal(video.srcObject, null);
  assert.equal(session.stops(), 1);
  assert.match(states[states.length - 1]!.message, /disconnected/);
});

test('capture does not save a black frame before the camera has video data', async () => {
  const states: WebcamState[] = [];
  const session = streamFixture();
  const camera = new WebcamCapture(videoFixture(), state => states.push(state), async () => session.stream);
  await camera.start();
  assert.equal(await camera.capture(), null);
  assert.equal(session.stops(), 0);
  assert.match(states[states.length - 1]!.message, /warming up/);
  camera.stop();
});

test('capture preserves aspect ratio, stops the camera, and rejects an oversized image', async () => {
  const session = streamFixture();
  const video = videoFixture();
  const states: WebcamState[] = [];
  let attempts = 0;
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (callback: (blob: Blob) => void) => { attempts++; callback(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)])); },
  };
  Object.assign(video, { videoWidth: 3840, videoHeight: 2160, readyState: 4, ownerDocument: { createElement: () => canvas } });
  const camera = new WebcamCapture(video, state => states.push(state), async () => session.stream);
  await camera.start();
  assert.equal(await camera.capture(), null);
  assert.equal(canvas.width, 1600);
  assert.equal(canvas.height, 900);
  assert.equal(attempts, 4);
  assert.equal(session.stops(), 1);
  assert.equal(video.srcObject, null);
  assert.equal(states[states.length - 1]?.phase, 'error');
});

test('camera errors offer specific alternatives', () => {
  assert.match(webcamErrorMessage(new DOMException('', 'NotFoundError')), /No webcam/);
  assert.match(webcamErrorMessage(new DOMException('', 'NotReadableError')), /another app/);
  assert.match(webcamErrorMessage(new Error('unknown')), /upload a photo/);
});

test('successful capture returns a compressed JPEG and leaves the camera off', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  class PhotoReader {
    result = 'data:image/jpeg;base64,cGhvdG8=';
    onload: (() => void) | null = null;
    readAsDataURL(blob: Blob) { assert.equal(blob.type, 'image/jpeg'); this.onload?.(); }
  }
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: PhotoReader });
  try {
    const session = streamFixture();
    const video = videoFixture();
    const states: WebcamState[] = [];
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (callback: (blob: Blob) => void, type: string, quality: number) => {
        assert.equal(type, 'image/jpeg'); assert.equal(quality, 0.88);
        callback(new Blob(['photo'], { type }));
      },
    };
    Object.assign(video, { videoWidth: 640, videoHeight: 480, readyState: 4, ownerDocument: { createElement: () => canvas } });
    const camera = new WebcamCapture(video, state => states.push(state), async () => session.stream);
    await camera.start();
    assert.equal(await camera.capture(), 'data:image/jpeg;base64,cGhvdG8=');
    assert.equal(canvas.width, 640);
    assert.equal(canvas.height, 480);
    assert.equal(session.stops(), 1);
    assert.equal(video.srcObject, null);
    assert.equal(states[states.length - 1]?.phase, 'idle');
  } finally {
    if (original) Object.defineProperty(globalThis, 'FileReader', original);
    else Reflect.deleteProperty(globalThis, 'FileReader');
  }
});
