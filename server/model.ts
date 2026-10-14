import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError, searchCatalog } from './catalog.js';
import { PREPARED_VARIANT_ID } from '../src/contracts.js';
import type { Product } from '../src/contracts.js';

const MESHY_URL = 'https://api.meshy.ai/openapi/v1/multi-image-to-3d';
export { PREPARED_VARIANT_ID };
export const PREPARED_MODEL_URL = '/demo/rich-with-backpack.glb';
const taskIds = new Map<string, string>();
const pendingStarts = new Map<string, Promise<string>>();
const taskStarts = new Map<string, number[]>();
const START_WINDOW_MS = 60 * 60 * 1000;
const MAX_STARTS_PER_CLIENT = 6;
const MAX_STARTS_PER_INSTANCE = 30;
const TICKET_SECONDS = 48 * 60 * 60;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function modelEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // The prepared Shopify variant is a bundled public asset. Other variants need Meshy.
  return true;
}

export function modelApiKey(env: NodeJS.ProcessEnv = process.env): string {
  if (!env.MESHY_API_KEY?.trim()) throw new ApiError(503, 'Live 3D generation needs MESHY_API_KEY on the server.');
  return env.MESHY_API_KEY;
}

function taskTicket(taskId: string, key: string, expires = Math.floor(Date.now() / 1000) + TICKET_SECONDS): string {
  const signature = createHmac('sha256', key).update(`${taskId}.${expires}`).digest('base64url');
  return `${expires}.${signature}`;
}

function verifyTaskTicket(taskId: unknown, ticket: unknown, key: string): asserts taskId is string {
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9-]{8,100}$/.test(taskId)) throw new ApiError(400, 'Invalid model task ID.');
  if (typeof ticket !== 'string' || !/^\d{10}\.[A-Za-z0-9_-]{43}$/.test(ticket)) throw new ApiError(401, 'This 3D task is not available in this browser. Generate the product again.');
  const [expiry] = ticket.split('.');
  const seconds = Number(expiry);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < now || seconds > now + TICKET_SECONDS) throw new ApiError(401, 'This 3D task has expired. Generate the product again.');
  const expected = Buffer.from(taskTicket(taskId, key, seconds));
  const provided = Buffer.from(ticket);
  if (expected.length !== provided.length || !timingSafeEqual(provided, expected)) throw new ApiError(401, 'This 3D task is not available in this browser. Generate the product again.');
}

function reserveStart(client: string): () => void {
  const now = Date.now();
  for (const [key, times] of taskStarts) {
    const recent = times.filter(time => now - time < START_WINDOW_MS);
    if (recent.length) taskStarts.set(key, recent); else taskStarts.delete(key);
  }
  const clientKey = `client:${client}`;
  const recent = taskStarts.get(clientKey) ?? [];
  const global = taskStarts.get('global') ?? [];
  if (recent.length >= MAX_STARTS_PER_CLIENT || global.length >= MAX_STARTS_PER_INSTANCE) throw new ApiError(429, '3D demo generation is busy. Try again later or use the prepared backpack preview.');
  recent.push(now); global.push(now);
  taskStarts.set(clientKey, recent); taskStarts.set('global', global);
  return () => {
    for (const key of [clientKey, 'global']) {
      const times = taskStarts.get(key);
      if (times) taskStarts.set(key, times.filter(time => time !== now));
    }
  };
}

function shopifyImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'cdn.shopify.com' && !parsed.port && /\.(?:jpe?g|png)$/i.test(parsed.pathname);
  } catch { return false; }
}

const colors = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'pink', 'purple', 'brown', 'tan', 'khaki', 'gray', 'grey', 'navy', 'olive', 'beige', 'camo'];
function otherColorImage(url: string, selectedColor: string): boolean {
  if (!selectedColor) return false;
  const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').toLowerCase().replace(/[^a-z]+/g, ' ');
  const selected = new Set(selectedColor.toLowerCase().split(/[^a-z]+/));
  return colors.some(color => !selected.has(color) && new RegExp(`\\b${color}\\b`).test(filename));
}

async function productGalleryImages(product: Product, fetcher: typeof fetch): Promise<string[]> {
  const fallback = (product.imageUrls?.length ? product.imageUrls : [product.imageUrl]).filter(shopifyImage);
  if (!product.catalogProductId) return fallback.slice(0, 4);
  try {
    const response = await fetcher('https://mcp.shop.com/', {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'get_product' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_product', arguments: { catalog: { id: product.catalogProductId } }, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'fast-forward-spatial-shop', version: '0.1.0' }, 'io.modelcontextprotocol/clientCapabilities': {} } } }),
    });
    if (!response.ok) return fallback.slice(0, 4);
    const payload = record(await response.json());
    const detail = record(record(payload.result).structuredContent);
    const fullProduct = record(detail.product);
    if (fullProduct.id !== product.catalogProductId) return fallback.slice(0, 4);
    const variant = (Array.isArray(fullProduct.variants) ? fullProduct.variants : []).map(record).find(item => item.id === product.id);
    if (!variant) return fallback.slice(0, 4);
    const color = (Array.isArray(variant.options) ? variant.options : []).map(record).find(option => String(option.name).toLowerCase() === 'color');
    const selectedColor = typeof color?.label === 'string' ? color.label : '';
    const media = [...(Array.isArray(variant.media) ? variant.media : []), ...(Array.isArray(fullProduct.media) ? fullProduct.media : [])].map(record);
    const gallery = media.filter(item => item.type === 'image' && typeof item.url === 'string' && shopifyImage(item.url) && !otherColorImage(item.url, selectedColor)).map(item => String(item.url));
    return [...new Set([...fallback, ...gallery])].slice(0, 4);
  } catch { return fallback.slice(0, 4); }
}

async function meshy(path: string, key: string, options?: RequestInit, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(`${MESHY_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${key}`, ...(options?.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
  } catch { throw new ApiError(502, 'Meshy could not connect. Try again.'); }
  const data = record(await response.json().catch(() => ({})));
  if (!response.ok) {
    if (response.status === 402) throw new ApiError(402, 'Meshy API credits are required to generate this 3D model.');
    if (response.status === 401 || response.status === 403) throw new ApiError(502, 'Meshy rejected the server API key.');
    if (response.status === 429) throw new ApiError(429, 'Meshy is rate limiting requests. Try again shortly.');
    throw new ApiError(502, typeof data.message === 'string' ? `Meshy: ${data.message.slice(0, 180)}` : 'Meshy could not start or retrieve this model.');
  }
  return data;
}

export async function startBackpackModel(body: Record<string, unknown>, fetcher: typeof fetch = fetch, client = 'local'): Promise<{ status: 'pending'; taskId: string; ticket: string; productId: string } | { status: 'ready'; modelUrl: string; productId: string }> {
  if (typeof body.productId !== 'string' || body.productId.length > 300 || typeof body.query !== 'string') throw new ApiError(400, 'Select a product from your current search first.');
  const catalog = await searchCatalog(body.query, fetcher);
  const product = catalog.products.find(item => item.id === body.productId);
  if (!product) throw new ApiError(409, 'This product is no longer in the Shopify results. Search again.');
  if (product.id === PREPARED_VARIANT_ID) return { status: 'ready', modelUrl: PREPARED_MODEL_URL, productId: product.id };
  const key = modelApiKey();
  const existing = taskIds.get(product.id);
  if (existing) return { status: 'pending', taskId: existing, ticket: taskTicket(existing, key), productId: product.id };
  let pending = pendingStarts.get(product.id);
  if (!pending) {
    pending = (async () => {
      const images = await productGalleryImages(product, fetcher);
      if (!images.length) throw new ApiError(422, 'This product has no supported JPEG or PNG Shopify photo for Meshy. Choose another.');
      const release = reserveStart(client);
      try {
        const result = await meshy('', key, {
          method: 'POST',
          body: JSON.stringify({ image_urls: images, ai_model: 'meshy-6-lite', geometry_resolution: 'standard', should_texture: true, texture_resolution: '2k', should_remesh: true, topology: 'triangle', target_polycount: 30000, target_formats: ['glb'], auto_size: true }),
        }, fetcher);
        if (typeof result.result !== 'string' || result.result.length < 8) throw new ApiError(502, 'Meshy did not return a model task ID.');
        taskIds.set(product.id, result.result);
        return result.result;
      } catch (error) { release(); throw error; }
    })();
    pendingStarts.set(product.id, pending);
    void pending.finally(() => pendingStarts.delete(product.id)).catch(() => {});
  }
  const taskId = await pending;
  return { status: 'pending', taskId, ticket: taskTicket(taskId, key), productId: product.id };
}

export async function getBackpackModel(body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<{ status: 'pending' | 'ready' | 'failed'; taskId: string; progress: number; modelUrl?: string; message?: string }> {
  const key = modelApiKey();
  verifyTaskTicket(body.taskId, body.ticket, key);
  const task = await meshy(`/${encodeURIComponent(body.taskId)}`, key, undefined, fetcher);
  const status = String(task.status);
  const progress = Number.isFinite(task.progress) ? Math.max(0, Math.min(100, Number(task.progress))) : 0;
  if (status === 'FAILED' || status === 'CANCELED') {
    for (const [productId, taskId] of taskIds) if (taskId === body.taskId) taskIds.delete(productId);
    return { status: 'failed', taskId: body.taskId, progress, message: String(record(task.task_error).message || 'Meshy could not generate this product.').slice(0, 180) };
  }
  if (status === 'SUCCEEDED') {
    const url = record(task.model_urls).glb;
    if (typeof url !== 'string' || !url.startsWith('https://assets.meshy.ai/')) throw new ApiError(502, 'Meshy finished without a valid GLB URL.');
    return { status: 'ready', taskId: body.taskId, progress: 100, modelUrl: url };
  }
  return { status: 'pending', taskId: body.taskId, progress };
}

/** Stream a finished Meshy GLB from our origin because Meshy's asset host omits CORS headers. */
export async function downloadModelAsset(body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<Response> {
  const status = await getBackpackModel(body, fetcher);
  if (status.status !== 'ready' || !status.modelUrl) throw new ApiError(409, 'The 3D model is not ready yet.');
  let upstream: Response;
  try { upstream = await fetcher(status.modelUrl, { signal: AbortSignal.timeout(60000), cache: 'no-store' }); }
  catch { throw new ApiError(502, 'The finished 3D file could not be downloaded from Meshy.'); }
  if (!upstream.ok || !upstream.body) throw new ApiError(502, 'The finished 3D file is unavailable. Retry or generate a new model.');
  const size = Number(upstream.headers.get('content-length'));
  if (Number.isFinite(size) && size > 64 * 1024 * 1024) {
    await upstream.body.cancel();
    throw new ApiError(413, 'This 3D model is too large for Quest. Choose a different product.');
  }
  return new Response(upstream.body, { headers: { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...(Number.isFinite(size) && size > 0 ? { 'Content-Length': String(size) } : {}) } });
}
