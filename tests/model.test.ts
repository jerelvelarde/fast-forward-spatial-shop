import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadModelAsset, getBackpackModel, modelApiKey, modelEnabled, PREPARED_MODEL_URL, PREPARED_VARIANT_ID, startBackpackModel } from '../server/model.js';

test('Meshy generation uses only the server-side key', () => {
  assert.equal(modelEnabled({}), true);
  assert.throws(() => modelApiKey({}), /needs MESHY_API_KEY/);
  const env = { MESHY_API_KEY: 'test-key' };
  assert.equal(modelEnabled(env), true);
  assert.equal(modelApiKey(env), 'test-key');
});

test('finished Meshy GLB streams through the same-origin API for browsers without Meshy CORS', async () => {
  const previousKey = process.env.MESHY_API_KEY;
  process.env.MESHY_API_KEY = 'test-key';
  const productId = 'gid://shopify/ProductVariant/asset-test-unique';
  const startFetcher: typeof fetch = async input => {
    if (String(input) === 'https://mcp.shop.com/') return Response.json({ result: { structuredContent: { products: [{ title: 'Rain jacket', variants: [{ id: productId, title: 'Blue', url: 'https://example.com/jacket?variant=1', price: { amount: 5000, currency: 'USD' }, availability: { available: true }, media: [{ type: 'image', url: 'https://cdn.shopify.com/jacket.jpg' }] }] }] } } });
    return Response.json({ result: 'test-task-1234' });
  };
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
    const started = await startBackpackModel({ productId, query: 'rain jacket under $100' }, startFetcher, 'asset-test');
    assert.equal(started.status, 'pending');
    if (started.status !== 'pending') throw new Error('Expected a Meshy task');
    await assert.rejects(downloadModelAsset({ taskId: started.taskId, ticket: 'invalid' }, fetcher), /not available in this browser/);
    assert.equal(calls, 0);
    const response = await downloadModelAsset({ taskId: started.taskId, ticket: started.ticket }, fetcher);
    assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(Buffer.from(await response.arrayBuffer()).toString('ascii', 0, 4), 'glTF');
    assert.equal(calls, 2);
  } finally {
    if (previousKey === undefined) delete process.env.MESHY_API_KEY; else process.env.MESHY_API_KEY = previousKey;
  }
});

test('the prepared Shopify variant returns its saved Quest model without a new Meshy job', async () => {
  const previousKey = process.env.MESHY_API_KEY;
  process.env.MESHY_API_KEY = 'test-key';
  let calls = 0;
  const fetcher: typeof fetch = async input => {
    calls++;
    assert.equal(String(input), 'https://mcp.shop.com/');
    return Response.json({ result: { structuredContent: { products: [{ title: '30L Backpack Military Style Outdoor Waterproof Rucksack', variants: [{ id: PREPARED_VARIANT_ID, title: 'Black', url: 'https://example.com/bag?variant=36808158601', price: { amount: 5000, currency: 'USD' }, availability: { available: true }, media: [{ type: 'image', url: 'https://cdn.shopify.com/bag.jpg' }] }] }] } } });
  };
  try {
    const result = await startBackpackModel({ productId: PREPARED_VARIANT_ID, query: 'camping backpack under $100' }, fetcher);
    assert.deepEqual(result, { status: 'ready', modelUrl: PREPARED_MODEL_URL, productId: PREPARED_VARIANT_ID });
    assert.equal(calls, 1);
  } finally {
    if (previousKey === undefined) delete process.env.MESHY_API_KEY; else process.env.MESHY_API_KEY = previousKey;
  }
});

test('selected Shopify variant sends only its verified JPEG and PNG images to Meshy', async () => {
  const previousKey = process.env.MESHY_API_KEY;
  process.env.MESHY_API_KEY = 'test-key';
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
    await assert.rejects(startBackpackModel({ action: 'start', productId: 'wrong', query: 'camping backpack under $100' }, fetcher), /no longer in the Shopify results/);
    assert.equal(generated, 0);
    const started = await startBackpackModel({ action: 'start', productId, query: 'camping backpack under $100' }, fetcher, 'gallery-test');
    assert.equal(started.status, 'pending');
    if (started.status !== 'pending') throw new Error('Expected a Meshy task');
    assert.equal(started.taskId, 'test-task-1234');
    assert.equal(generated, 1);
    const ready = await getBackpackModel({ taskId: started.taskId, ticket: started.ticket }, async () => Response.json({ status: 'SUCCEEDED', progress: 100, model_urls: { glb: 'https://assets.meshy.ai/model.glb?Expires=123' } }));
    assert.equal(ready.modelUrl, 'https://assets.meshy.ai/model.glb?Expires=123');
  } finally {
    if (previousKey === undefined) delete process.env.MESHY_API_KEY; else process.env.MESHY_API_KEY = previousKey;
  }
});

test('concurrent requests reuse one paid Meshy task for the selected product', async () => {
  const previousKey = process.env.MESHY_API_KEY;
  process.env.MESHY_API_KEY = 'test-key';
  const productId = 'gid://shopify/ProductVariant/concurrent-test';
  let paidStarts = 0;
  const fetcher: typeof fetch = async input => {
    if (String(input) === 'https://mcp.shop.com/') return Response.json({ result: { structuredContent: { products: [{ title: 'Camp tent', variants: [{ id: productId, title: 'Green', url: 'https://example.com/tent?variant=1', price: { amount: 8000, currency: 'USD' }, availability: { available: true }, media: [{ type: 'image', url: 'https://cdn.shopify.com/tent.jpg' }] }] }] } } });
    paidStarts++;
    return Response.json({ result: 'concurrent-task-1234' });
  };
  try {
    const body = { productId, query: 'camp tent under $100' };
    const [first, second] = await Promise.all([startBackpackModel(body, fetcher, 'concurrent-test'), startBackpackModel(body, fetcher, 'concurrent-test')]);
    assert.equal(first.status, 'pending');
    assert.deepEqual(second, first);
    assert.equal(paidStarts, 1);
  } finally {
    if (previousKey === undefined) delete process.env.MESHY_API_KEY; else process.env.MESHY_API_KEY = previousKey;
  }
});

test('public model starts are limited per client while existing tasks remain reusable', async () => {
  const previousKey = process.env.MESHY_API_KEY;
  process.env.MESHY_API_KEY = 'test-key';
  let paidStarts = 0;
  try {
    let first: { productId: string; query: string } | undefined;
    for (let index = 0; index < 7; index++) {
      const body = { productId: `gid://shopify/ProductVariant/rate-test-${index}`, query: 'camp tent under $100' };
      first ??= body;
      const fetcher: typeof fetch = async input => {
        if (String(input) === 'https://mcp.shop.com/') return Response.json({ result: { structuredContent: { products: [{ title: 'Camp tent', variants: [{ id: body.productId, title: 'Green', url: `https://example.com/tent?variant=${index}`, price: { amount: 8000, currency: 'USD' }, availability: { available: true }, media: [{ type: 'image', url: 'https://cdn.shopify.com/tent.jpg' }] }] }] } } });
        paidStarts++;
        return Response.json({ result: `rate-test-task-${index}` });
      };
      if (index < 6) assert.equal((await startBackpackModel(body, fetcher, 'rate-limit-test')).status, 'pending');
      else await assert.rejects(startBackpackModel(body, fetcher, 'rate-limit-test'), /generation is busy/);
    }
    assert.equal(paidStarts, 6);
    assert.ok(first);
    const reused = await startBackpackModel(first, async () => Response.json({ result: { structuredContent: { products: [{ title: 'Camp tent', variants: [{ id: first!.productId, title: 'Green', url: 'https://example.com/tent?variant=0', price: { amount: 8000, currency: 'USD' }, availability: { available: true }, media: [{ type: 'image', url: 'https://cdn.shopify.com/tent.jpg' }] }] }] } } }), 'rate-limit-test');
    assert.equal(reused.status, 'pending');
    assert.equal(paidStarts, 6);
  } finally {
    if (previousKey === undefined) delete process.env.MESHY_API_KEY; else process.env.MESHY_API_KEY = previousKey;
  }
});
