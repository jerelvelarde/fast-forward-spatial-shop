import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareCheckout, checkoutUrl } from '../server/checkout.js';
import { handleApi } from '../server/http.js';
import type { Product } from '../src/contracts.js';

const id = 'opaque-variant:full-id:001';
const request = { productId: id, query: 'camping backpack under 150 USD', expectedPrice: 9900, requestId: 'b190758b-b1e7-4d9b-8055-f2d1bf678389' };
const variant = { id, title: 'Camping backpack', price: { amount: 9900, currency: 'USD' }, availability: { available: true }, url: 'https://merchant.example/products/pack', media: [{ type: 'image', url: 'https://cdn.shopify.com/pack.jpg' }], seller: { name: 'Merchant', domain: 'merchant.myshopify.com' } };
const checkout = { id: 'session-1', status: 'requires_escalation', currency: 'USD', continue_url: 'https://shop.app/checkout/session-1?token=fixture', line_items: [{ item: { id, price: 9900 }, quantity: 1 }], totals: [{ type: 'subtotal', amount: 9900 }, { type: 'total', amount: 9900 }] };
function upstream(overrides: Record<string, unknown> = {}, productOverrides: Record<string, unknown> = {}, calls: Record<string, any>[] = []): typeof fetch {
  return async (url, init) => {
    assert.equal(url, 'https://mcp.shop.com/');
    const rpc = JSON.parse(String(init?.body)); calls.push(rpc.params);
    return Response.json({ result: { structuredContent: rpc.params.name === 'search_catalog' ? { products: [{ title: 'Camping backpack', variants: [{ ...variant, ...productOverrides }] }] } : { ...checkout, ...overrides } } });
  };
}

test('checkout uses exact verified seller and variant, quantity one and idempotency key', async () => {
  const calls: Record<string, any>[] = [];
  const result = await prepareCheckout(request, upstream({}, {}, calls));
  assert.equal(calls[1].name, 'create_checkout');
  assert.deepEqual(calls[1].arguments, { shop: variant.seller.domain, checkout: { line_items: [{ item: { id }, quantity: 1 }], context: { address_country: 'US', currency: 'USD' } }, meta: { 'idempotency-key': request.requestId } });
  assert.equal(result.continueUrl, checkout.continue_url);
  assert.equal(result.quantity, 1);
  assert.equal(result.totals[1].label, 'Estimated total');
  assert.ok(calls.every(call => call.name !== 'complete_checkout'));
});

test('existing checkout is refreshed rather than recreated', async () => {
  const calls: Record<string, any>[] = [];
  await prepareCheckout({ ...request, checkoutId: checkout.id }, upstream({}, {}, calls));
  assert.equal(calls[1].name, 'get_checkout');
  assert.deepEqual(calls[1].arguments, { shop: variant.seller.domain, id: checkout.id });
});

test('stale price, sold-out item and absent merchant stop checkout creation', async () => {
  for (const overrides of [{ price: { amount: 10000, currency: 'USD' } }, { availability: { available: false } }, { seller: { name: 'Missing domain' } }]) {
    const calls: Record<string, any>[] = [];
    await assert.rejects(prepareCheckout(request, upstream({}, overrides, calls)));
    assert.equal(calls.length, 1);
  }
});

test('mismatched checkout lines, price, currency, completion and unsafe links fail closed', async () => {
  for (const overrides of [
    { line_items: [{ item: { id: 'other', price: 9900 }, quantity: 1 }] },
    { line_items: [{ item: { id, price: 9900 }, quantity: 2 }] },
    { line_items: [{ item: { id, price: 10000 }, quantity: 1 }] },
    { currency: 'CAD' }, { status: 'completed' }, { continue_url: 'https://evil.example/checkout' },
  ]) await assert.rejects(prepareCheckout(request, upstream(overrides)));
});

test('continuation URL is HTTPS and merchant-bound', () => {
  const product = { url: variant.url, sellerDomain: variant.seller.domain } as Product;
  assert.equal(checkoutUrl(checkout.continue_url, product), checkout.continue_url);
  for (const url of ['javascript:alert(1)', 'http://shop.app/checkout', 'https://shop.app.evil.example/x', 'https://user:pass@shop.app/x', 'https://shop.app:8443/x']) assert.equal(checkoutUrl(url, product), '');
});

test('invalid input and provider errors return safe checkout errors', async () => {
  await assert.rejects(prepareCheckout({ ...request, requestId: 'bad' }), /request ID/);
  let calls = 0;
  await assert.rejects(prepareCheckout(request, async (url, init) => {
    if (++calls === 1) return upstream()(url, init);
    return Response.json({ error: { message: 'private-upstream-secret' } });
  }), error => error instanceof Error && /Retry/.test(error.message) && !/private/.test(error.message));
  assert.equal((await handleApi(new Request('http://localhost/api/checkout'))).status, 405);
  const response = await handleApi(new Request('http://localhost/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
