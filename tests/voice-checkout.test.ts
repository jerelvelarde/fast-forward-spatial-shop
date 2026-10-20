import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from '../server/http.js';
import { SAMPLE_PRODUCTS } from '../server/sample-products.js';
import { parseProduct, parseVoiceCommand, voiceCheckout } from '../server/voice-checkout.js';

const product = SAMPLE_PRODUCTS[0];
const requestId = 'b190758b-b1e7-4d9b-8055-f2d1bf678389';
function shopMcp(calls: Record<string, any>[] = [], overrides: Record<string, unknown> = {}): typeof fetch {
  return async (url, init) => {
    assert.equal(url, 'https://mcp.shop.com/');
    const rpc = JSON.parse(String(init?.body)); calls.push(rpc.params);
    const quantity = rpc.params.arguments.checkout.line_items[0].quantity;
    return Response.json({ result: { structuredContent: { id: 'session-1', status: 'incomplete', currency: 'USD', continue_url: 'https://shop.app/checkout/session-1?token=fixture', line_items: [{ item: { id: product.id, price: product.price }, quantity }], totals: [{ type: 'total', amount: product.price * quantity }], ...overrides } } });
  };
}
function voiceRequest(fields: Record<string, string | Blob>, search = ''): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request(`http://localhost/api/voice-checkout${search}`, { method: 'POST', body: form });
}
const audio = () => new File([new Uint8Array([1, 2, 3])], 'request.webm', { type: 'audio/webm' });

test('spoken confirmations become a checkout quantity', () => {
  const examples: [string, number][] = [
    ['Buy it', 1], ['Yes, buy this one.', 1], ['I’ll take two', 2], ['Buy 3 of these', 3], ['purchase a pair of these', 2],
    ['Check out with four', 4], ['Buy this backpack for 25 dollars', 1], ['order the 30L one', 1], ['Buy two, size ten', 2],
  ];
  for (const [phrase, quantity] of examples) assert.equal(parseVoiceCommand(phrase).quantity, quantity, phrase);
});

test('cancellations, unclear speech, ambiguous and large quantities never check out', () => {
  for (const phrase of ["Don't buy it", 'cancel', 'wait, buy it', 'what colors does it come in', 'nice backpack']) assert.throws(() => parseVoiceCommand(phrase), /Nothing was added|to check out/, phrase);
  assert.throws(() => parseVoiceCommand('buy two or three'), /one quantity/);
  assert.throws(() => parseVoiceCommand('buy nine'), /1 to 5/);
});

test('sample products use the server copy and caller product info is validated', () => {
  assert.equal(parseProduct(JSON.stringify({ id: product.id, price: 1, sellerDomain: 'evil.example' })), product);
  const custom = parseProduct({ id: 'gid://shopify/ProductVariant/1', title: 'Tent', price: 9900, currency: 'USD', url: 'https://store.example/products/tent', sellerDomain: 'store.myshopify.com' });
  assert.equal(custom.sellerDomain, 'store.myshopify.com');
  assert.throws(() => parseProduct('{'), /JSON/);
  assert.throws(() => parseProduct({ ...custom, url: 'http://store.example/x' }), /HTTPS/);
  assert.throws(() => parseProduct({ ...custom, price: 12.5 }), /cents/);
  assert.throws(() => parseProduct({ ...custom, sellerDomain: '' }), /merchant/);
});

test('voice audio is transcribed and turned into a UCP create_checkout with the spoken quantity', async () => {
  const calls: Record<string, any>[] = [];
  let heard: File | undefined;
  const result = await voiceCheckout(voiceRequest({ product: JSON.stringify({ id: product.id }), audio: audio(), requestId }), {
    fetcher: shopMcp(calls), transcribe: async file => { heard = file as File; return 'Buy two of these'; },
  });
  assert.equal(heard?.type, 'audio/webm');
  assert.equal(result.transcript, 'Buy two of these');
  assert.equal(result.quantity, 2);
  assert.deepEqual(result.command, { name: 'create_checkout', arguments: { shop: product.sellerDomain, checkout: { line_items: [{ item: { id: product.id }, quantity: 2 }], context: { address_country: 'US', currency: 'USD' } }, meta: { 'idempotency-key': requestId } } });
  assert.deepEqual(calls[0], { ...calls[0], name: 'create_checkout', arguments: result.command.arguments });
  assert.equal(result.redirectUrl, 'https://shop.app/checkout/session-1?token=fixture');
  assert.equal(calls.length, 1);
});

test('typed transcript fallback works and the merchant response is still verified', async () => {
  const result = await voiceCheckout(voiceRequest({ product: JSON.stringify({ id: product.id }), transcript: 'buy it' }), { fetcher: shopMcp() });
  assert.equal(result.quantity, 1);
  assert.match((result.command.arguments.meta as Record<string, string>)['idempotency-key'], /^[0-9a-f-]{36}$/);
  for (const overrides of [{ continue_url: 'https://evil.example/checkout' }, { status: 'completed' }, { line_items: [{ item: { id: product.id, price: product.price + 1 }, quantity: 1 }] }]) {
    await assert.rejects(voiceCheckout(voiceRequest({ product: JSON.stringify({ id: product.id }), transcript: 'buy it' }), { fetcher: shopMcp([], overrides) }));
  }
});

test('cancelled voice never calls Shop MCP', async () => {
  let called = false;
  await assert.rejects(voiceCheckout(voiceRequest({ product: JSON.stringify({ id: product.id }), transcript: "no, don't buy it" }), { fetcher: async () => { called = true; return Response.json({}); } }), /Nothing was added/);
  assert.equal(called, false);
});

test('voice checkout routes, methods and errors', async () => {
  const samples = await handleApi(new Request('http://localhost/api/sample-products'));
  assert.equal(samples.status, 200);
  assert.equal((await samples.json()).products.length, SAMPLE_PRODUCTS.length);
  assert.equal((await handleApi(new Request('http://localhost/api/voice-checkout'))).status, 405);
  const missingVoice = await handleApi(voiceRequest({ product: JSON.stringify({ id: product.id }) }));
  assert.equal(missingVoice.status, 400);
  const json = await handleApi(new Request('http://localhost/api/voice-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  assert.equal(json.status, 415);
});

test('redirect=1 answers with a 303 to the merchant checkout', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = shopMcp();
  try {
    const response = await handleApi(voiceRequest({ product: JSON.stringify({ id: product.id }), transcript: 'buy it' }, '?redirect=1'));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'https://shop.app/checkout/session-1?token=fixture');
  } finally { globalThis.fetch = realFetch; }
});
