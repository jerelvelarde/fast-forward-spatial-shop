// Standalone local test server for the voice-to-Shop handoff page.
// Run from the repository root with Node 23+:
// node --experimental-strip-types --env-file-if-exists=.env.local scripts/dev-voice-shop.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { searchShop } from '../api/_shop.ts';

const port = Number(process.env.VOICE_SHOP_PORT || 4317);
const page = new URL('../public/voice-shop-test.html', import.meta.url);

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 6_000_000) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(302, { Location: '/voice-shop-test.html' });
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === '/voice-shop-test.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(await readFile(page));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/search') {
      const { text } = JSON.parse((await readBody(request)).toString('utf8'));
      if (typeof text !== 'string' || text.length > 300) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Send a text request of at most 300 characters.' }));
        return;
      }
      const result = await searchShop(text);
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(result));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/transcribe') {
      const { POST } = await import('../api/transcribe.ts');
      const body = await readBody(request);
      const transcription = await POST(new Request('http://localhost/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': request.headers['content-type'] || '' },
        body: new Uint8Array(body),
      }));
      response.writeHead(transcription.status, Object.fromEntries(transcription.headers));
      response.end(Buffer.from(await transcription.arrayBuffer()));
      return;
    }
    response.writeHead(404);
    response.end('Not found');
  } catch (error) {
    response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Request failed.' }));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Open http://127.0.0.1:${port}/voice-shop-test.html`);
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.log('Typed Shop search works now. Add AI_GATEWAY_API_KEY to .env.local for speech.');
  }
});
