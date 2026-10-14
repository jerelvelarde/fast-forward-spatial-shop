// Development-only visual preview: supplied demo frame, live catalog, no real camera or paid AI.
import { mountDesktop } from '../../src/desktop.js';
import { store } from '../../src/store.js';

const frame = new Image();
frame.src = '/demo/person.png';
await frame.decode();
const canvas = document.createElement('canvas');
canvas.width = frame.naturalWidth; canvas.height = frame.naturalHeight;
const context = canvas.getContext('2d')!;
const draw = () => context.drawImage(frame, 0, 0);
draw();
const tracks = new Set<MediaStreamTrack>();
const timers = new Set<ReturnType<typeof setInterval>>();
const originalMedia = Object.getOwnPropertyDescriptor(navigator.mediaDevices, 'getUserMedia');
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async (constraints: MediaStreamConstraints) => {
  if (constraints.audio) throw new Error('Microphone disabled in simulated preview');
  const stream = canvas.captureStream(10);
  const timer = setInterval(draw, 100); timers.add(timer);
  stream.getTracks().forEach(track => {
    tracks.add(track);
    const stop = track.stop.bind(track);
    track.stop = () => { stop(); clearInterval(timer); timers.delete(timer); tracks.delete(track); };
  });
  return stream;
} });
const realFetch = window.fetch;
window.fetch = (input, init) => String(input) === '/api/config'
  ? Promise.resolve(Response.json({ tryOnEnabled: false }))
  : realFetch(input, init);
const dispose = mountDesktop(document.getElementById('desktop')!, { enterVR() {}, exitVR() {} });
await store.search('Find a camping backpack under 150 USD');
const label = document.querySelector<HTMLElement>('.preview-label')!;
label.textContent = 'SIMULATED WEBCAM · SUPPLIED DEMO FRAME';
const button = document.querySelector<HTMLButtonElement>('#webcam-mode')!;
button.textContent = 'Preview AR with demo frame';
window.addEventListener('pagehide', () => {
  dispose(); tracks.forEach(track => track.stop()); timers.forEach(timer => clearInterval(timer));
  window.fetch = realFetch;
  if (originalMedia) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', originalMedia);
  else Reflect.deleteProperty(navigator.mediaDevices, 'getUserMedia');
}, { once: true });
