import { gateway } from '@ai-sdk/gateway';
import { experimental_transcribe as transcribe } from 'ai';

export async function POST(request: Request): Promise<Response> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json({ error: 'Speech transcription is not configured yet.' }, { status: 503 });
  }
  try {
    const form = await request.formData();
    const audio = form.get('audio');
    if (!(audio instanceof File) || audio.size === 0 || audio.size > 5_000_000) {
      return Response.json({ error: 'Record a short audio clip under 5 MB.' }, { status: 400 });
    }
    if (!audio.type.startsWith('audio/')) {
      return Response.json({ error: 'The uploaded file must be audio.' }, { status: 400 });
    }
    const result = await transcribe({
      model: gateway.transcriptionModel('openai/gpt-4o-mini-transcribe'),
      audio: new Uint8Array(await audio.arrayBuffer()),
      abortSignal: AbortSignal.timeout(20000),
    });
    const text = result.text.trim();
    if (!text) return Response.json({ error: 'No speech was detected. Try again.' }, { status: 422 });
    return Response.json({ text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Transcription failed. You can still type your request.' }, { status: 502 });
  }
}
