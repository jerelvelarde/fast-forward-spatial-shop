import { styleFor } from '../src/products.js';
import { findProduct, listProducts } from './catalog.js';
import { productSvg } from './product-art.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

/** Fetch-style handler shared by the Vite dev middleware and the Vercel function. */
export async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed.' }, 405);

  if (url.pathname === '/api/products') return json({ products: listProducts() });

  const image = url.pathname.match(/^\/api\/products\/([a-z0-9-]+)\/image\.svg$/);
  if (image) {
    const product = findProduct(image[1]);
    if (!product) return json({ error: 'Product not found.' }, 404);
    const variant = product.variants.find(v => v.id === url.searchParams.get('variant')) ?? product.variants[0];
    return new Response(productSvg(styleFor(product, variant), `${product.name}, ${variant.name}`), {
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  return json({ error: 'Not found.' }, 404);
}
