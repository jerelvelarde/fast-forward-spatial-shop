import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleApi } from '../server/http.js';
import type { ProductsResponse } from '../src/products.js';

const get = (path: string) => handleApi(new Request(`http://localhost${path}`));

test('GET /api/products returns the demo catalog', async () => {
  const response = await get('/api/products');
  assert.equal(response.status, 200);
  const { products } = (await response.json()) as ProductsResponse;
  assert.equal(products.length, 8);
  assert.deepEqual([...new Set(products.map(p => p.tryOn.kind))].sort(), ['backpack', 'cap', 'glasses']);
  for (const product of products) {
    assert.ok(product.variants.length > 0);
    assert.equal(product.imageUrl, product.variants[0].imageUrl);
    assert.ok(product.price.amount > 0);
  }
});

test('product images are SVG per colour variant', async () => {
  const response = await get('/api/products/summit-28/image.svg?variant=ember');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /image\/svg\+xml/);
  const svg = await response.text();
  assert.match(svg, /^<svg/);
  assert.match(svg, /#b5492f/i);
  assert.match(svg, /aria-label="Summit 28L Daypack, Ember"/);
});

test('unknown products and routes are 404, writes are rejected', async () => {
  assert.equal((await get('/api/products/nope/image.svg')).status, 404);
  assert.equal((await get('/api/other')).status, 404);
  assert.equal((await handleApi(new Request('http://localhost/api/products', { method: 'POST' }))).status, 405);
});
