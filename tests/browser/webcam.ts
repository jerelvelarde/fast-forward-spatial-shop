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
  const products = [1, 2, 3, 4].map(id => ({ id: String(id), title: `Fixture camping pack ${id}`, description: 'Synthetic regression fixture', price: 9900, currency: 'USD', imageUrl: after, url: 'https://example.com', seller: 'Test fixture' }));
  let generationCalls = 0;
  let generatedPhoto = '';
  let generationToken = '';
  window.fetch = async (input, init) => {
    const path = String(input);
    if (path === '/api/config') return Response.json({ tryOnEnabled: true });
    if (path === '/api/search') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({ products: body.query === '__fixture-reset__' ? [] : products, query: 'camping under 150 USD', message: 'Synthetic test inventory' });
    }
    if (path === '/api/try-on') {
      generationCalls++;
      const body = JSON.parse(String(init?.body ?? '{}'));
      generatedPhoto = body.photoDataUrl;
      generationToken = body.accessToken;
      return Response.json({ imageDataUrl: after });
    }
    return realFetch(input, init);
  };
  let stream: MediaStream | undefined;
  const streams = new Set<MediaStream>();
  const ticks = new Map<MediaStream, ReturnType<typeof setInterval>>();
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
    const captured = canvas.captureStream(10);
    stream = captured; streams.add(captured);
    const tick = setInterval(() => { context.fillStyle = '#425c38'; context.fillRect(0, 0, 640, 480); }, 100);
    ticks.set(captured, tick);
    for (const track of captured.getTracks()) {
      const originalStop = track.stop.bind(track);
      track.stop = () => {
        originalStop();
        if (captured.getTracks().every(item => item.readyState === 'ended')) { clearInterval(tick); ticks.delete(captured); }
      };
    }
    return captured;
  } });
  // The store is a singleton; reset fixture state so the harness is repeatable.
  await store.search('__fixture-reset__');
  store.setPhoto(null);
  const dispose = mountDesktop(get('#desktop'), { enterVR() {}, exitVR() {} });
  try {
    await store.configure();
    assert(get('h1').textContent === 'What are you looking for?', 'initial view leads with the shopping prompt');
    assert(get<HTMLTextAreaElement>('#search-query').value === '' && !get<HTMLFormElement>('.search-form').hidden, 'initial composer is empty and ready for a request');
    assert(get('.trail-header').hidden && get('.product-dock').hidden, 'initial view hides shopping controls until products exist');
    assert(streams.size === 0, 'mounting the prompt does not request a camera');
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
    const arProducts = get('.webcam-ar-products');
    const cameraStage = get('.person-preview');
    assert(cameraStage.contains(arProducts) && !arProducts.hidden && getComputedStyle(arProducts).display !== 'none' && arProducts.getBoundingClientRect().width > 0, 'AR shopping cards appear over the live camera stage');
    assert(arProducts.querySelectorAll('.ar-product-card').length === 3, 'AR carousel displays three floating cards from four available products');
    assert(arProducts.querySelector<HTMLElement>('.ar-product-card.selected')?.dataset.productId === store.getState().selectedId, 'AR selected card matches the selected backpack');
    store.move(1);
    assert(store.getState().selectedId === '3' && arProducts.querySelector<HTMLElement>('.ar-product-card.selected')?.dataset.productId === '3', 'browsing updates the selected floating AR card');
    const otherCard = arProducts.querySelector<HTMLButtonElement>('.ar-product-card:not(.selected)')!;
    const otherProductId = otherCard.dataset.productId;
    assert(!!otherProductId, 'a neighboring AR card retains its exact catalog product ID');
    otherCard.click();
    assert(store.getState().selectedId === otherProductId && arProducts.querySelector<HTMLElement>('.ar-product-card.selected')?.dataset.productId === otherProductId, 'clicking a floating card selects that exact backpack');
    get<HTMLButtonElement>('#confirm-backpack').click();
    assert(get('#gesture-selection').textContent?.startsWith('Selected.'), 'selection pauses gestures and confirms product');
    assert(stream?.getVideoTracks()[0]?.readyState === 'live', 'selection keeps camera available for capture');
    get<HTMLButtonElement>('#capture-photo').click();
    await until(() => store.getState().photoDataUrl?.startsWith('data:image/jpeg;') === true);
    assert(stream?.getVideoTracks()[0]?.readyState === 'ended', 'capture releases camera tracks');
    assert(!get('.photo-comparison').hidden && get('#after-image').hidden, 'captured before photo is shown with empty after slot');
    assert(arProducts.hidden || getComputedStyle(arProducts).display === 'none', 'capture hides the AR shopping overlay');
    const rawPhoto = new Image();
    rawPhoto.src = store.getState().photoDataUrl!;
    await rawPhoto.decode();
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = rawPhoto.naturalWidth; rawCanvas.height = rawPhoto.naturalHeight;
    const rawContext = rawCanvas.getContext('2d')!; rawContext.drawImage(rawPhoto, 0, 0);
    const rawPixels = [[10, 10], [320, 240], [100, 350], [500, 100]].map(([x, y]) => rawContext.getImageData(x, y, 1, 1).data);
    assert(rawPhoto.naturalWidth === 640 && rawPhoto.naturalHeight === 480 && rawPixels.every(pixel => [66, 92, 56].every((value, channel) => Math.abs(pixel[channel] - value) <= 8)), 'before image contains raw camera pixels without shopping cards');
    assert(get<HTMLImageElement>('#before-image').src === store.getState().photoDataUrl, 'before comparison preserves the original raw capture');

    const token = get<HTMLInputElement>('#access-token');
    token.value = 'fixture-only'; token.dispatchEvent(new Event('input', { bubbles: true }));
    const command = get<HTMLInputElement>('#dialog-command');
    command.value = 'take a picture and try it on';
    const generationBeforeCommand = generationCalls;
    get<HTMLFormElement>('#dialog-command-form').requestSubmit();
    await until(() => !get('#capture-countdown').hidden);
    assert(stream?.getVideoTracks()[0]?.readyState === 'live', 'combined command starts synthetic camera before capture');
    await until(() => get('.tryon-dialog .tool-progress').querySelectorAll('li[data-status="done"]').length === 3 && get('#cancel-tools').hidden);
    const donePills = [...get('.tryon-dialog .tool-progress').querySelectorAll('li[data-status="done"]')].map(item => item.textContent);
    assert(donePills.join('|') === '✓ Take picture|✓ Generate try-on|✓ Show before & after', 'AG-UI progress confirms all three tools completed in order');
    assert(generationCalls === generationBeforeCommand + 1 && generationToken === 'fixture-only', 'combined command makes one mocked generation request with the fixture token');
    assert(generatedPhoto.startsWith('data:image/jpeg;') && generatedPhoto === store.getState().photoDataUrl, 'generation receives the newly captured webcam photo');
    assert(get<HTMLImageElement>('#before-image').src === generatedPhoto && get<HTMLImageElement>('#after-image').src === after && !get('#after-image').hidden && !get('.photo-comparison').hidden, 'combined command shows captured before and generated after');
    assert([...streams].every(item => item.getTracks().every(track => track.readyState === 'ended')) && ticks.size === 0, 'completed camera sessions release tracks and synthetic frame timers');

    const generationBeforeCancel = generationCalls;
    const photoBeforeCancel = store.getState().photoDataUrl;
    get<HTMLFormElement>('#dialog-command-form').requestSubmit();
    await until(() => !get('#capture-countdown').hidden);
    assert(stream?.getVideoTracks()[0]?.readyState === 'live', 'second command reaches countdown with a live synthetic camera');
    get<HTMLButtonElement>('#cancel-tools').click();
    await until(() => get('#capture-countdown').hidden && get('#cancel-tools').hidden && stream?.getVideoTracks()[0]?.readyState === 'ended');
    // Wait beyond the complete countdown so a stale task would have reached generation.
    await new Promise(resolve => setTimeout(resolve, 3300));
    assert(generationCalls === generationBeforeCancel, 'cancelling the countdown never calls generation');
    assert(store.getState().photoDataUrl === photoBeforeCancel, 'cancelled capture preserves the previous photo');
    assert([...streams].every(item => item.getTracks().every(track => track.readyState === 'ended')) && ticks.size === 0, 'cancellation releases camera tracks and all frame timers');
    assert(get('.tryon-dialog .tool-progress').querySelectorAll('li[data-status="done"]').length === 0, 'cancelled run does not mark stale tools done');
    get<HTMLButtonElement>('#close-tryon').click();
    output.textContent += 'ALL CHECKS PASSED — synthetic media only; physical gestures still need a person.\n';
  } catch (error) {
    get<HTMLDialogElement>('.tryon-dialog')?.close();
    output.textContent += `FAIL ${error instanceof Error ? error.message : String(error)}\n`;
  } finally {
    dispose();
    streams.forEach(item => item.getTracks().forEach(track => track.stop()));
    ticks.forEach(tick => clearInterval(tick));
    window.fetch = realFetch;
    if (mediaDescriptor) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', mediaDescriptor);
    else Reflect.deleteProperty(navigator.mediaDevices, 'getUserMedia');
    run.disabled = false;
  }
};
