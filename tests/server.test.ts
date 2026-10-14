import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProducts, searchCatalog, searchIntent } from '../server/catalog.js';
import { handleApi } from '../server/http.js';
import { authorizeTryOn, parsePhoto, tryOnEnabled } from '../server/try-on.js';

function variant(overrides: Record<string, unknown> = {}) {
  return { id: 'variant-1', title: 'Trail 40 camping backpack', url: 'https://store.example/products/trail?variant=1&utm_source=shopify', price: { amount: 14999, currency: 'USD' }, availability: { available: true }, media: [{ type: 'image', url: 'https://cdn.shopify.com/example.jpg' }], seller: { name: 'Camp Shop' }, ...overrides };
}
const catalog = (variants: unknown[], title = 'Trail 40 camping backpack') => ({ products: [{ title, description: { plain: '<p>A pack for hiking.</p>' }, variants }] });

test('budget parser enforces strict cap, lower budgets, and spoken default', () => {
  assert.equal(searchIntent('camping backpack under 150 US dollars').budget, 15000);
  assert.equal(searchIntent('backpack below $99.50').budget, 9950);
  assert.equal(searchIntent('camping backpack under 200 dollars').budget, 15000);
  assert.equal(searchIntent('camping backpack under one hundred and fifty dollars').budget, 15000);
  assert.throws(() => searchIntent('backpack under 80 EUR'), /US dollars/);
  assert.throws(() => searchIntent('buy a computer'), /camping backpacks/);
});

test('spoken lower budgets never silently become the default maximum', () => {
  const examples: [string, number][] = [
    ['under eighty dollars', 8000],
    ['under one hundred twenty five US dollars', 12500],
    ['below one hundred and twenty-five dollars', 12500],
    ['under nineteen dollars', 1900],
    ['under a hundred dollars', 10000],
    ['for seventy five dollars', 7500],
    ['below eighty', 8000],
  ];
  for (const [phrase, budget] of examples) assert.equal(searchIntent(`camping backpack ${phrase}`).budget, budget, phrase);
  assert.equal(searchIntent('camping backpack with a 40 liter capacity').budget, 15000);
  for (const phrase of ['under -50 dollars', 'under eightyish dollars', 'under fifty point five dollars', 'under 99.999 dollars', 'under 1 hundred dollars', 'under twenty five hundred dollars', 'under zero dollars', 'under minus fifty dollars', 'for -50 dollars', 'under an affordable budget', 'under']) {
    assert.throws(() => searchIntent(`camping backpack ${phrase}`), /positive budget/, phrase);
  }
});

test('catalog excludes exact budget, other currency, out of stock, and missing media', () => {
  const valid = variant();
  const products = normalizeProducts(catalog([
    valid,
    variant({ id: 'at-budget', price: { amount: 15000, currency: 'USD' } }),
    variant({ id: 'wrong-currency', price: { amount: 9000, currency: 'CAD' } }),
    variant({ id: 'sold-out', availability: { available: false } }),
    variant({ id: 'missing-photo', media: [] }),
  ]), 15000);
  assert.equal(products.length, 1);
  assert.equal(products[0].url, valid.url);
  assert.equal(products[0].id, valid.id);
  assert.equal(products[0].description, 'A pack for hiking.');
  assert.equal(normalizeProducts(catalog([valid]), 10000).length, 0);
});

test('catalog rejects unrelated school products and unsafe links', () => {
  const school = { products: [{ title: 'School backpack', description: { plain: 'For school and office' }, variants: [variant()] }] };
  assert.equal(normalizeProducts(school, 15000).length, 0);
  assert.equal(normalizeProducts(catalog([variant({ url: 'javascript:alert(1)' })]), 15000).length, 0);
});

test('search preserves upstream request contract and forwards merchant notices', async () => {
  const result = await searchCatalog('camping backpack under $100', async (url, init) => {
    assert.equal(url, 'https://mcp.shop.com/');
    const request = JSON.parse(String(init?.body));
    assert.equal(request.params.arguments.catalog.filters.price.max, 9999);
    assert.equal(init?.cache, 'no-store');
    return Response.json({ result: { structuredContent: { ...catalog([variant({ price: { amount: 9500, currency: 'USD' } })]), messages: [{ message: 'Shipping varies by merchant.' }] } } });
  });
  assert.equal(result.products.length, 1);
  assert.match(result.message, /Shipping varies/);
});

test('MCP errors and malformed success responses do not look like empty inventory', async () => {
  for (const payload of [{ error: { message: 'no' } }, { result: { isError: true } }, { result: {} }]) {
    await assert.rejects(searchCatalog('camping backpack', async () => Response.json(payload)), /Shopify/);
  }
});

test('paid generation requires configuration AND an exact private token', () => {
  assert.equal(tryOnEnabled({}), false);
  assert.throws(() => authorizeTryOn('anything', {}), /needs AI_GATEWAY/);
  const env = { AI_GATEWAY_API_KEY: 'not-real', TRY_ON_ACCESS_TOKEN: 'private-demo-token-1234' };
  assert.equal(tryOnEnabled(env), true);
  assert.throws(() => authorizeTryOn('', env), /private demo access token/);
  assert.throws(() => authorizeTryOn('private-demo-token-xxxx', env), /private demo access token/);
  assert.doesNotThrow(() => authorizeTryOn(env.TRY_ON_ACCESS_TOKEN, env));
});

test('photo validator rejects URLs, spoofed types, and oversized files', () => {
  assert.throws(() => parsePhoto('https://localhost/private.png'), /valid JPEG/);
  assert.throws(() => parsePhoto('data:image/png;base64,aGVsbG8='), /contents/);
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(parsePhoto(`data:image/png;base64,${bytes.toString('base64')}`).mediaType, 'image/png');
  assert.throws(() => parsePhoto(`data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`), /smaller than 2 MB/);
});

test('HTTP errors use correct status and never return cacheable catalog or config', async () => {
  const config = await handleApi(new Request('http://localhost/api/config'));
  assert.equal(config.status, 200);
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.equal((await handleApi(new Request('http://localhost/api/search'))).status, 405);
  assert.equal((await handleApi(new Request('http://localhost/api/nope'))).status, 404);
  const malformed = new Request('http://localhost/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[' });
  assert.equal((await handleApi(malformed)).status, 400);
  const tooLarge = new Request('http://localhost/api/try-on', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(4 * 1024 * 1024) }, body: '{}' });
  assert.equal((await handleApi(tooLarge)).status, 413);
});

test('transcription route shares the app API and rejects missing config or invalid audio', async () => {
  const prior = process.env.AI_GATEWAY_API_KEY;
  try {
    delete process.env.AI_GATEWAY_API_KEY;
    const unavailable = await handleApi(new Request('http://localhost/api/transcribe', { method: 'POST', body: new FormData() }));
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get('cache-control'), 'no-store');
    process.env.AI_GATEWAY_API_KEY = 'test-only-key';
    const invalid = new FormData();
    invalid.append('audio', new File(['not audio'], 'request.txt', { type: 'text/plain' }));
    assert.equal((await handleApi(new Request('http://localhost/api/transcribe', { method: 'POST', body: invalid }))).status, 400);
    assert.equal((await handleApi(new Request('http://localhost/api/transcribe'))).status, 405);
  } finally {
    if (prior === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = prior;
  }
});
