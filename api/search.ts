import { searchShop } from './_shop';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { text?: unknown };
    if (typeof body.text !== 'string' || body.text.length > 300) {
      return Response.json({ error: 'Send a text request of at most 300 characters.' }, { status: 400 });
    }
    return Response.json(await searchShop(body.text), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed.';
    const status = message.includes('product to search') || message.includes('price limit') ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}
