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
