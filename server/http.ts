import { ApiError, searchCatalog, searchIntent } from './catalog.js';
import { generateTryOn, tryOnEnabled } from './try-on.js';
import { transcribeAudio } from './transcribe.js';

export const MAX_REQUEST_BYTES = 3 * 1024 * 1024;
const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'Send a JSON request.');
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) throw new ApiError(413, 'Request is too large. Choose a photo smaller than 2 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Request body is required.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > MAX_REQUEST_BYTES) { await reader.cancel(); throw new ApiError(413, 'Request is too large. Choose a photo smaller than 2 MB.'); }
    chunks.push(chunk.value);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid body');
    return body as Record<string, unknown>;
  } catch { throw new ApiError(400, 'Request must be a JSON object.'); }
}

export async function handleApi(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  try {
    if (!['/api/config', '/api/search', '/api/try-on', '/api/transcribe'].includes(path)) return json({ error: 'API route not found.' }, 404);
    const method = path === '/api/config' ? 'GET' : 'POST';
    if (request.method !== method) return new Response(JSON.stringify({ error: `Use ${method} for this endpoint.` }), { status: 405, headers: { Allow: method, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (path === '/api/config') return json({ tryOnEnabled: tryOnEnabled(), transcriptionEnabled: Boolean(process.env.AI_GATEWAY_API_KEY?.trim()) });
    if (path === '/api/transcribe') return json(await transcribeAudio(request));
    const body = await readJson(request);
    if (path === '/api/search') return json(await searchCatalog(searchIntent(body.query).query));
    return json(await generateTryOn(body));
  } catch (error) {
    return error instanceof ApiError ? json({ error: error.message }, error.status) : json({ error: 'The service could not complete the request. Please try again.' }, 502);
  }
}
