import { ApiError, searchCatalog } from './catalog.js';
import type { CheckoutResult, Product } from '../src/contracts.js';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function checkoutUrl(value: unknown, product: Product): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    const hosts = [new URL(product.url).hostname, product.sellerDomain, 'shop.app', 'shop.com', 'checkout.shopify.com'];
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname)) return '';
    return value; // Preserve the merchant's complete continuation URL, including its query.
  } catch { return ''; }
}

/** Creates a reviewable checkout, never submits payment or completes an order. */
export async function prepareCheckout(body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<CheckoutResult> {
  if (typeof body.productId !== 'string' || body.productId.length > 1000 || typeof body.query !== 'string') throw new ApiError(400, 'Select a product before checkout.');
  if (!Number.isSafeInteger(body.expectedPrice) || Number(body.expectedPrice) <= 0 || typeof body.requestId !== 'string' || !uuid.test(body.requestId)) throw new ApiError(400, 'Checkout needs the displayed price and a valid request ID.');
  if (body.checkoutId !== undefined && (typeof body.checkoutId !== 'string' || !body.checkoutId || body.checkoutId.length > 2000)) throw new ApiError(400, 'Invalid checkout session.');
  const catalog = await searchCatalog(body.query, fetcher);
  const product = catalog.products.find(item => item.id === body.productId);
  if (!product) throw new ApiError(409, 'This product is no longer available within your budget. Search again before checkout.');
  if (product.price !== body.expectedPrice) throw new ApiError(409, 'The price has changed. Search again and review the new price before checkout.');
  if (!product.sellerDomain) throw new ApiError(422, 'This listing has no verified checkout merchant. Open its store page to buy.');
  const name = body.checkoutId ? 'get_checkout' : 'create_checkout';
  const args = body.checkoutId ? { shop: product.sellerDomain, id: body.checkoutId } : {
    shop: product.sellerDomain,
    checkout: { line_items: [{ item: { id: product.id }, quantity: 1 }], context: { address_country: 'US', currency: 'USD' } },
    meta: { 'idempotency-key': body.requestId },
  };
  let data: Record<string, unknown>;
  try {
    const response = await fetcher('https://mcp.shop.com/', {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': name },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'fast-forward-spatial-shop', version: '0.1.0' }, 'io.modelcontextprotocol/clientCapabilities': {} } } }),
    });
    if (!response.ok) throw new Error();
    const rpc = object(await response.json()); const result = object(rpc.result);
    if (rpc.error || result.isError) throw new Error();
    data = object(result.structuredContent);
    if (!Object.keys(data).length && Array.isArray(result.content)) {
      const text = result.content.find(item => object(item).type === 'text');
      data = object(JSON.parse(String(object(text).text)));
    }
  } catch { throw new ApiError(502, 'Checkout could not connect. Retry to recover the same checkout request, or open the merchant store.'); }
  const checkout = typeof data.id === 'string' ? data : object(data.checkout);
  const continueUrl = checkoutUrl(checkout.continue_url, product);
  if (typeof checkout.id !== 'string' || !continueUrl || checkout.currency !== 'USD') throw new ApiError(502, 'The merchant did not return a valid USD checkout link. Open the merchant store to continue.');
  if (!['incomplete', 'requires_escalation', 'ready_for_complete'].includes(String(checkout.status))) throw new ApiError(409, 'This checkout is no longer open. Continue on the merchant store.');
  const lines = Array.isArray(checkout.line_items) ? checkout.line_items : [];
  if (lines.length !== 1 || object(object(lines[0]).item).id !== product.id || object(lines[0]).quantity !== 1) throw new ApiError(502, 'The merchant checkout did not match the selected product. Open the store to review.');
  if (object(object(lines[0]).item).price !== product.price) throw new ApiError(409, 'The checkout price has changed. Search again and review the new price before checkout.');
  const labels: Record<string, string> = { subtotal: 'Subtotal', fulfillment: 'Shipping', tax: 'Tax', total: 'Estimated total', discount: 'Discount' };
  const totals = (Array.isArray(checkout.totals) ? checkout.totals : []).map(object)
    .filter(total => typeof total.type === 'string' && labels[total.type] && Number.isSafeInteger(total.amount) && Number(total.amount) >= 0)
    .map(total => ({ label: labels[String(total.type)], amount: Number(total.amount) }));
  return { id: checkout.id, status: String(checkout.status), continueUrl, product, quantity: 1, totals };
}
