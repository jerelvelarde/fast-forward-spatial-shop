import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/store.js';
import type { Product } from '../src/contracts.js';

const products: Product[] = ['one', 'two'].map((id, index) => ({ id, title: `Camping backpack ${id}`, price: 5000 + index, currency: 'USD', description: 'Hiking pack', seller: 'Test', url: 'https://example.com/pack', imageUrl: 'https://example.com/pack.png' }));
const result = (query: string) => Response.json({ products, query, message: 'Live results' });

test('a late search cannot replace a more recent search', async t => {
  const pending: { resolve: (r: Response) => void; signal: AbortSignal }[] = [];
  t.mock.method(globalThis, 'fetch', (_url: unknown, init: RequestInit) => new Promise<Response>(resolve => pending.push({ resolve, signal: init.signal! })));
  const first = store.search('camping backpack under 100');
  const second = store.search('camping backpack under 50');
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve(result('camping backpack under 50')); await second;
  pending[0].resolve(result('camping backpack under 100')); await first;
  assert.equal(store.getState().query, 'camping backpack under 50');
  store.move(-1); assert.equal(store.getState().selectedId, 'two');
  store.move(1); assert.equal(store.getState().selectedId, 'one');
});

test('changing the chosen backpack discards its in-flight try-on', async t => {
  let finish!: (r: Response) => void;
  let signal: AbortSignal | undefined;
  let sent: Record<string, string> = {};
  t.mock.method(globalThis, 'fetch', (url: string, init?: RequestInit) => {
    if (url === '/api/config') return Promise.resolve(Response.json({ tryOnEnabled: true }));
    if (url === '/api/search') return Promise.resolve(result('camping backpack under 150'));
    signal = init!.signal!;
    sent = JSON.parse(String(init!.body));
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  await store.configure(); await store.search();
  store.setPhoto('data:image/png;base64,cGhvdG8=');
  store.setAccessToken('test-only-private-token');
  const generation = store.generateTryOn();
  assert.equal(sent.productId, 'one');
  assert.equal(sent.accessToken, 'test-only-private-token');
  store.select('two');
  assert.equal(signal?.aborted, true);
  finish(Response.json({ imageDataUrl: 'data:image/png;base64,b2xk' })); await generation;
  assert.equal(store.getState().tryOnImage, null);
  assert.equal(store.getState().selectedId, 'two');
});

test('missing configuration never sends a photo to the generation endpoint', async t => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    return Response.json(url === '/api/config' ? { tryOnEnabled: false } : { products, query: 'camping backpack', message: 'Found' });
  });
  await store.configure(); await store.search();
  store.setPhoto('data:image/png;base64,cGhvdG8=');
  await store.generateTryOn();
  assert.equal(urls.includes('/api/try-on'), false);
  assert.equal(store.getState().tryOnStatus, 'error');
  assert.match(store.getState().tryOnMessage, /AI_GATEWAY_API_KEY/);
});


test('explicit cancellation discards a late generated image', async t => {
  let finish!: (r: Response) => void;
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', (url: string, init?: RequestInit) => {
    if (url === '/api/config') return Promise.resolve(Response.json({ tryOnEnabled: true }));
    if (url === '/api/search') return Promise.resolve(result('camping backpack'));
    signal = init!.signal!;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  await store.configure(); await store.search();
  store.setPhoto('data:image/png;base64,cGhvdG8=');
  const generation = store.generateTryOn();
  store.cancelTryOn();
  assert.equal(signal?.aborted, true);
  finish(Response.json({ imageDataUrl: 'data:image/png;base64,b2xk' })); await generation;
  assert.equal(store.getState().tryOnStatus, 'idle');
  assert.equal(store.getState().tryOnImage, null);
});

test('checkout retries reuse request identity, then refresh the returned session without photos or credentials', async t => {
  const sent: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/search') return result('camping checkout retry fixture');
    sent.push(JSON.parse(String(init?.body)));
    if (sent.length === 1) return Response.json({ error: 'Temporary failure' }, { status: 502 });
    return Response.json({ id: 'checkout-fixture', quantity: 1, product: products[0], status: 'requires_escalation', continueUrl: 'https://example.com/checkout', totals: [] });
  });
  await store.search('camping checkout retry fixture');
  await store.prepareCheckout(); assert.equal(store.getState().checkoutStatus, 'error');
  await store.prepareCheckout(); assert.equal(store.getState().checkoutStatus, 'ready');
  await store.prepareCheckout();
  assert.equal(sent[0].requestId, sent[1].requestId);
  assert.equal(sent[1].requestId, sent[2].requestId);
  assert.equal(sent[2].checkoutId, 'checkout-fixture');
  assert.ok(sent.every(body => !('photoDataUrl' in body) && !('accessToken' in body)));
  store.select('two');
  assert.equal(store.getState().checkout, null);
});

test('selection change and cancellation discard late checkout responses and prevent duplicate requests', async t => {
  let finish!: (r: Response) => void;
  let signal!: AbortSignal;
  let count = 0;
  t.mock.method(globalThis, 'fetch', (url: string, init?: RequestInit) => {
    if (url === '/api/search') return Promise.resolve(result('camping checkout cancellation fixture'));
    count++; signal = init!.signal!;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  await store.search('camping checkout cancellation fixture');
  const pending = store.prepareCheckout(); await store.prepareCheckout(); assert.equal(count, 1);
  store.select('two'); assert.equal(signal.aborted, true);
  finish(Response.json({ id: 'old', quantity: 1, product: products[0], continueUrl: 'https://example.com/old' })); await pending;
  assert.equal(store.getState().checkout, null);
  const cancelled = store.prepareCheckout(); store.cancelCheckout(); assert.equal(signal.aborted, true);
  finish(Response.json({ id: 'cancelled', quantity: 1, product: products[1], continueUrl: 'https://example.com/cancelled' })); await cancelled;
  assert.equal(store.getState().checkoutStatus, 'idle');
});

test('explicit selection confirms even the initially focused bag without starting generation or checkout', async t => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => { urls.push(url); return result('camping selection feedback fixture'); });
  await store.search('camping selection feedback fixture');
  store.confirmSelection('one');
  assert.match(store.getState().assistantMessage, /Selected: Camping backpack one/);
  store.confirmSelection('two');
  assert.equal(store.getState().selectedId, 'two');
  assert.match(store.getState().assistantMessage, /Selected: Camping backpack two/);
  store.confirmSelection('unknown');
  assert.equal(store.getState().selectedId, 'two');
  assert.deepEqual(urls, ['/api/search']);
});
