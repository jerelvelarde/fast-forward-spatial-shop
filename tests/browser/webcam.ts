// Development-only regression harness: no actual camera, catalog or paid AI calls.
import { mountDesktop } from '../../src/desktop.js';
import { store } from '../../src/store.js';

const output = document.querySelector<HTMLPreElement>('#test-results')!;
const run = document.querySelector<HTMLButtonElement>('#run-tests')!;
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
  output.textContent += `PASS ${message}\n`;
}
async function until(check: () => boolean, timeout = 30000) {
  const end = performance.now() + timeout;
  while (!check()) {
    if (performance.now() > end) throw new Error('Timed out waiting for browser state');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
const get = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
run.onclick = async () => {
  run.disabled = true;
  output.textContent = '';
  const realFetch = window.fetch;
  const mediaDescriptor = Object.getOwnPropertyDescriptor(navigator.mediaDevices, 'getUserMedia');
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#425c38'; context.fillRect(0, 0, 640, 480);
  const before = canvas.toDataURL('image/png');
  context.fillStyle = '#9bc655'; context.fillRect(200, 100, 180, 280);
  const after = canvas.toDataURL('image/png');
  const products = [1, 2].map(id => ({ id: String(id), title: `Fixture camping pack ${id}`, description: 'Synthetic regression fixture', price: 9900, currency: 'USD', imageUrl: after, url: 'https://example.com', seller: 'Test fixture' }));
  window.fetch = async input => {
    const path = String(input);
    if (path === '/api/config') return Response.json({ tryOnEnabled: true });
    if (path === '/api/search') return Response.json({ products, query: 'camping under 150 USD', message: 'Synthetic test inventory' });
    if (path === '/api/try-on') return Response.json({ imageDataUrl: after });
    return realFetch(input);
  };
  let stream: MediaStream | undefined;
  let tick: ReturnType<typeof setInterval> | undefined;
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
    stream = canvas.captureStream(10);
    tick = setInterval(() => { context.fillStyle = '#425c38'; context.fillRect(0, 0, 640, 480); }, 100);
    return stream;
  } });
  const dispose = mountDesktop(get('#desktop'), { enterVR() {}, exitVR() {} });
  try {
    await store.configure();
    await store.search('camping under 150 USD');
    get<HTMLButtonElement>('#open-tryon').click();
    store.setPhoto(before);
    await store.generateTryOn('fixture-only');
    assert(get<HTMLImageElement>('#before-image').src === before, 'original photo remains unchanged');
    assert(get<HTMLImageElement>('#after-image').src === after && !get('#after-image').hidden, 'generated image appears beside original');
    get<HTMLButtonElement>('#webcam-next').click();
    assert(store.getState().selectedId === '2', 'dialog browsing changes selected backpack');
    assert(get('#after-image').hidden && get<HTMLImageElement>('#before-image').src === before, 'changing backpack clears old after image but preserves before');
    get<HTMLButtonElement>('#use-webcam').click();
    await until(() => !get<HTMLButtonElement>('#capture-photo').disabled);
    assert(stream?.getVideoTracks()[0]?.readyState === 'live', 'synthetic webcam starts');
    await until(() => get('#hand-status').textContent === 'Show one open hand in the camera to browse.' || /cannot|could not|stopped|too long/i.test(get('#hand-status').textContent ?? ''));
    assert(get('#hand-status').textContent === 'Show one open hand in the camera to browse.', `real MediaPipe worker inference: ${get('#hand-status').textContent}`);
    get<HTMLButtonElement>('#confirm-backpack').click();
    assert(get('#gesture-selection').textContent?.startsWith('Selected.'), 'selection pauses gestures and confirms product');
    assert(stream?.getVideoTracks()[0]?.readyState === 'live', 'selection keeps camera available for capture');
    get<HTMLButtonElement>('#capture-photo').click();
    await until(() => store.getState().photoDataUrl?.startsWith('data:image/jpeg;') === true);
    assert(stream?.getVideoTracks()[0]?.readyState === 'ended', 'capture releases camera tracks');
    assert(!get('.photo-comparison').hidden && get('#after-image').hidden, 'captured before photo is shown with empty after slot');
    get<HTMLButtonElement>('#close-tryon').click();
    output.textContent += 'ALL CHECKS PASSED — synthetic media only; physical gestures still need a person.\n';
  } catch (error) {
    get<HTMLDialogElement>('.tryon-dialog')?.close();
    output.textContent += `FAIL ${error instanceof Error ? error.message : String(error)}\n`;
  } finally {
    dispose();
    stream?.getTracks().forEach(track => track.stop());
    if (tick) clearInterval(tick);
    window.fetch = realFetch;
    if (mediaDescriptor) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', mediaDescriptor);
    else Reflect.deleteProperty(navigator.mediaDevices, 'getUserMedia');
    run.disabled = false;
  }
};
