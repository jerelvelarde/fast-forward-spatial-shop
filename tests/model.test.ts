import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeModel, downloadModelAsset, getBackpackModel, modelEnabled, PREPARED_MODEL_URL, PREPARED_VARIANT_ID, startBackpackModel } from '../server/model.js';

test('Meshy generation requires both server configuration and the exact private token', () => {
  assert.equal(modelEnabled({}), true);
  assert.throws(() => authorizeModel('anything', {}), /needs MESHY_API_KEY/);
  const env = { MESHY_API_KEY: 'test-key', TRY_ON_ACCESS_TOKEN: 'private-demo-token-1234' };
  assert.equal(modelEnabled(env), true);
  assert.throws(() => authorizeModel('private-demo-token-xxxx', env), /private demo access token/);
  assert.equal(authorizeModel(env.TRY_ON_ACCESS_TOKEN, env), 'test-key');
});

test('finished Meshy GLB streams through the same-origin API for browsers without Meshy CORS', async () => {
  const previousKey = process.env.MESHY_API_KEY;
  const previousToken = process.env.TRY_ON_ACCESS_TOKEN;
  process.env.MESHY_API_KEY = 'test-key';
  process.env.TRY_ON_ACCESS_TOKEN = 'private-demo-token-1234';
  let calls = 0;
  const fetcher: typeof fetch = async input => {
    calls++;
    if (calls === 1) {
      assert.match(String(input), /multi-image-to-3d\/test-task-1234$/);
      return Response.json({ status: 'SUCCEEDED', model_urls: { glb: 'https://assets.meshy.ai/model.glb?Expires=123' } });
    }
    assert.equal(String(input), 'https://assets.meshy.ai/model.glb?Expires=123');
    return new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4]), { headers: { 'Content-Length': '8' } });
  };
  try {
    const response = await downloadModelAsset({ taskId: 'test-task-1234', accessToken: process.env.TRY_ON_ACCESS_TOKEN }, fetcher);
    assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(Buffer.from(await response.arrayBuffer()).toString('ascii', 0, 4), 'glTF');
    assert.equal(calls, 2);
  } finally {
    if (previousKey === undefined) delete process.env.MESHY_API_KEY; else process.env.MESHY_API_KEY = previousKey;
    if (previousToken === undefined) delete process.env.TRY_ON_ACCESS_TOKEN; else process.env.TRY_ON_ACCESS_TOKEN = previousToken;
  }
});

test('the prepared Shopify variant returns its saved Quest model without a new Meshy job', async () => {
  const previousKey = process.env.MESHY_API_KEY;
  const previousToken = process.env.TRY_ON_ACCESS_TOKEN;
  process.env.MESHY_API_KEY = 'test-key';
  process.env.TRY_ON_ACCESS_TOKEN = 'private-demo-token-1234';
  let calls = 0;
  const fetcher: typeof fetch = async input => {
    calls++;
    assert.equal(String(input), 'https://mcp.shop.com/');
    return Response.json({ result: { structuredContent: { products: [{ title: '30L Backpack Military Style Outdoor Waterproof Rucksack', variants: [{ id: PREPARED_VARIANT_ID, title: 'Black', url: 'https://example.com/bag?variant=36808158601', price: { amount: 5000, currency: 'USD' }, availability: { available: true }, media: [{ type: 'image', url: 'https://cdn.shopify.com/bag.jpg' }] }] }] } } });
  };
  try {
    const result = await startBackpackModel({ productId: PREPARED_VARIANT_ID, query: 'camping backpack under $100', accessToken: 'private-demo-token-1234' }, fetcher);
    assert.deepEqual(result, { status: 'ready', modelUrl: PREPARED_MODEL_URL, productId: PREPARED_VARIANT_ID });
    assert.equal(calls, 1);
  } finally {
    if (previousKey === undefined) delete process.env.MESHY_API_KEY; else process.env.MESHY_API_KEY = previousKey;
    if (previousToken === undefined) delete process.env.TRY_ON_ACCESS_TOKEN; else process.env.TRY_ON_ACCESS_TOKEN = previousToken;
  }
});

test('selected Shopify variant sends only its verified JPEG and PNG images to Meshy', async () => {
  const previousKey = process.env.MESHY_API_KEY;
  const previousToken = process.env.TRY_ON_ACCESS_TOKEN;
  process.env.MESHY_API_KEY = 'test-key';
  process.env.TRY_ON_ACCESS_TOKEN = 'private-demo-token-1234';
  const productId = 'gid://shopify/ProductVariant/model-test-unique';
  const catalogProductId = 'gid://shopify/p/model-test';
  let generated = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input) === 'https://mcp.shop.com/' && (init?.headers as Record<string, string>)?.['Mcp-Name'] === 'get_product') {
      assert.equal(JSON.parse(String(init?.body)).params.arguments.catalog.id, catalogProductId);
      return Response.json({ result: { structuredContent: { product: { id: catalogProductId, media: [
        { type: 'image', url: 'https://cdn.shopify.com/red.jpg' },
        { type: 'image', url: 'https://cdn.shopify.com/front.jpg' },
        { type: 'image', url: 'https://cdn.shopify.com/side.jpg' },
      ], variants: [{ id: productId, options: [{ name: 'Color', label: 'Black' }], media: [{ type: 'image', url: 'https://cdn.shopify.com/back.jpg' }] }] } } } });
    }
    if (String(input) === 'https://mcp.shop.com/') return Response.json({ result: { structuredContent: { products: [{ id: catalogProductId, title: 'Outdoor camping backpack', description: { plain: 'Hiking pack' }, variants: [{ id: productId, title: 'Black', url: 'https://example.com/bag?variant=1', price: { amount: 5000, currency: 'USD' }, availability: { available: true }, media: [
      { type: 'image', url: 'https://cdn.shopify.com/a.jpg' },
      { type: 'image', url: 'https://cdn.shopify.com/b.png' },
      { type: 'image', url: 'https://cdn.shopify.com/c.webp' },
      { type: 'image', url: 'https://evil.example/d.jpg' },
    ] }] }] } } });
    assert.equal(String(input), 'https://api.meshy.ai/openapi/v1/multi-image-to-3d');
    assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, 'Bearer test-key');
    const request = JSON.parse(String(init?.body));
    assert.deepEqual(request.image_urls, ['https://cdn.shopify.com/a.jpg', 'https://cdn.shopify.com/b.png', 'https://cdn.shopify.com/back.jpg', 'https://cdn.shopify.com/front.jpg']);
    assert.equal(request.ai_model, 'meshy-6-lite');
    assert.equal(request.target_polycount, 30000);
    assert.equal(request.texture_resolution, '2k');
    generated++;
    return Response.json({ result: 'test-task-1234' });
  };
  try {
    await assert.rejects(startBackpackModel({ action: 'start', productId: 'wrong', query: 'camping backpack under $100', accessToken: 'private-demo-token-1234' }, fetcher), /no longer in the Shopify results/);
    assert.equal(generated, 0);
    const started = await startBackpackModel({ action: 'start', productId, query: 'camping backpack under $100', accessToken: 'private-demo-token-1234' }, fetcher);
    assert.equal(started.status, 'pending');
    if (started.status !== 'pending') throw new Error('Expected a Meshy task');
    assert.equal(started.taskId, 'test-task-1234');
    assert.equal(generated, 1);
    const ready = await getBackpackModel({ taskId: started.taskId, accessToken: 'private-demo-token-1234' }, async () => Response.json({ status: 'SUCCEEDED', progress: 100, model_urls: { glb: 'https://assets.meshy.ai/model.glb?Expires=123' } }));
    assert.equal(ready.modelUrl, 'https://assets.meshy.ai/model.glb?Expires=123');
  } finally {
    if (previousKey === undefined) delete process.env.MESHY_API_KEY; else process.env.MESHY_API_KEY = previousKey;
    if (previousToken === undefined) delete process.env.TRY_ON_ACCESS_TOKEN; else process.env.TRY_ON_ACCESS_TOKEN = previousToken;
  }
});
