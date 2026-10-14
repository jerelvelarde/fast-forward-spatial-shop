// Development-only fixtures: synthetic speech, catalog and checkout; no purchases.
import { mountDesktop } from '../../src/desktop.js';
import { store } from '../../src/store.js';
const get = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const output = get('#test-results');
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); output.textContent += `PASS ${message}\n`; }
async function until(check: () => boolean) { const end = performance.now() + 10000; while (!check()) { if (performance.now() > end) throw new Error('Browser state timed out'); await new Promise(resolve => setTimeout(resolve, 50)); } }
get<HTMLButtonElement>('#run-tests').onclick = async () => {
  get<HTMLButtonElement>('#run-tests').disabled = true; output.textContent = '';
  const originalFetch = window.fetch;
  const recorderDescriptor = Object.getOwnPropertyDescriptor(window, 'MediaRecorder');
  Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: undefined });
  const speechDescriptor = Object.getOwnPropertyDescriptor(window, 'SpeechRecognition');
  const transcript = 'buy this backpack';
  class FixtureSpeech {
    onresult: ((event: unknown) => void) | null = null; onend: (() => void) | null = null;
    start() { queueMicrotask(() => { this.onresult?.({ results: [[{ transcript }]] }); this.onend?.(); }); }
    stop() { this.onend?.(); } abort() { this.onend?.(); }
  }
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FixtureSpeech });
  const products = ['one', 'two'].map(id => ({ id, title: `Camping pack ${id}`, price: 9900, currency: 'USD', description: 'Synthetic checkout fixture', seller: 'Fixture merchant', imageUrl: '/ui/placeholder.svg', url: 'https://example.com/pack' }));
  let requests: Record<string, unknown>[] = []; let exits = 0; let fail = false;
  window.fetch = async (input, init) => {
    const path = String(input);
    if (path === '/api/config') return Response.json({ tryOnEnabled: false });
    if (path === '/api/search') return Response.json({ products, query: 'camping backpack checkout browser fixture', message: 'Synthetic test inventory' });
    if (path === '/api/checkout') {
      const body = JSON.parse(String(init?.body)); requests.push(body);
      if (fail) return Response.json({ error: 'Fixture connection failure. Retry checkout.' }, { status: 502 });
      return Response.json({ id: `checkout-${body.productId}`, status: 'requires_escalation', quantity: 1, product: products.find(p => p.id === body.productId), continueUrl: `https://example.com/checkout/${body.productId}`, totals: [{ label: 'Subtotal', amount: 9900 }, { label: 'Estimated total', amount: 9900 }] });
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  await store.search('camping backpack checkout browser fixture');
  const dispose = mountDesktop(get('#desktop'), { enterVR() {}, exitVR() { exits++; document.body.classList.remove('xr-active'); } });
  try {
    await store.configure();
    get<HTMLTextAreaElement>('#search-query').value = 'checkout';
    get<HTMLFormElement>('.search-form').requestSubmit();
    await until(() => store.getState().checkoutStatus === 'ready' && get('#checkout-cancel').hidden);
    assert(get<HTMLDialogElement>('.tryon-dialog').open && !get('.checkout-review').hidden, 'typed checkout opens review');
    assert(get('.tryon-body').hidden && get('#checkout-title').textContent === 'Camping pack one', 'review shows the selected product without camera controls');
    assert(get<HTMLAnchorElement>('#checkout-continue').href === 'https://example.com/checkout/one' && !get('#checkout-continue').hidden, 'merchant continuation link is shown');
    assert(get('.checkout-review').querySelectorAll('[data-status="done"]').length === 2, 'both AG-UI checkout tool calls finish');
    assert(get('#checkout-message').textContent?.includes('No order has been placed'), 'review clearly distinguishes checkout from an order');
    assert(!('photoDataUrl' in requests[0]) && !('accessToken' in requests[0]), 'checkout sends no photo or demo credential');
    get<HTMLButtonElement>('#checkout-back').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    store.select('two');
    assert(get('#checkout-continue').hidden && !get('#checkout-continue').hasAttribute('href'), 'selection changes remove the old checkout link');
    document.body.classList.add('xr-active');
    const priorExits = exits;
    window.dispatchEvent(new Event('trail:voice'));
    await until(() => store.getState().checkoutStatus === 'ready' && get('#checkout-cancel').hidden);
    assert(requests[1].productId === 'two', 'spoken buy this backpack uses the current selection');
    assert(exits > priorExits && !document.body.classList.contains('xr-active'), 'voice checkout exits immersive mode for merchant review');
    get<HTMLButtonElement>('#checkout-back').click(); await new Promise(resolve => setTimeout(resolve, 50));
    fail = true; get<HTMLButtonElement>('#buy-selected').click();
    await until(() => store.getState().checkoutStatus === 'error' && get('#checkout-cancel').hidden);
    assert(get('#checkout-continue').hidden && !get<HTMLButtonElement>('#checkout-retry').disabled, 'failed checkout hides payment link and enables retry');
    fail = false; get<HTMLButtonElement>('#checkout-retry').click();
    await until(() => store.getState().checkoutStatus === 'ready' && get('#checkout-cancel').hidden);
    assert(requests[2].requestId === requests[3].requestId && requests[3].checkoutId === 'checkout-two', 'retry refreshes the same checkout session');
    output.textContent += 'ALL CHECKOUT CHECKS PASSED\n';
  } catch (error) { output.textContent += `FAIL ${error instanceof Error ? error.message : String(error)}\n`; }
  finally { dispose(); if (recorderDescriptor) Object.defineProperty(window, 'MediaRecorder', recorderDescriptor); window.fetch = originalFetch; if (speechDescriptor) Object.defineProperty(window, 'SpeechRecognition', speechDescriptor); else Reflect.deleteProperty(window, 'SpeechRecognition'); get<HTMLButtonElement>('#run-tests').disabled = false; }
};
