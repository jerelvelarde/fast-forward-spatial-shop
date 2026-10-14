import { createGateway, transcribe } from 'ai';
import { ApiError } from './catalog.js';

const MAX_AUDIO_BYTES = 2_500_000;
const MAX_MULTIPART_BYTES = 3 * 1024 * 1024;

export async function transcribeAudio(request: Request): Promise<{ text: string }> {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) throw new ApiError(503, 'Speech transcription needs AI_GATEWAY_API_KEY on the server. You can type your request.');
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new ApiError(415, 'Send a recorded audio file.');
  if (Number(request.headers.get('content-length')) > MAX_MULTIPART_BYTES) throw new ApiError(413, 'Record a shorter clip under 2.5 MB.');

  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Recorded audio is required.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > MAX_MULTIPART_BYTES) { await reader.cancel(); throw new ApiError(413, 'Record a shorter clip under 2.5 MB.'); }
    chunks.push(chunk.value);
  }
  let form: FormData;
  try {
    form = await new Request(request.url, {
      method: 'POST', headers: request.headers, body: Buffer.concat(chunks),
    }).formData();
  } catch { throw new ApiError(400, 'Recorded audio could not be read.'); }
  const audio = form.get('audio');
  if (!(audio instanceof File) || !audio.size || audio.size > MAX_AUDIO_BYTES || !audio.type.startsWith('audio/')) {
    throw new ApiError(400, 'Record a short audio clip under 2.5 MB.');
  }
  try {
    const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
    const result = await transcribe({
      model: gateway.transcriptionModel('openai/gpt-4o-mini-transcribe'),
      audio: new Uint8Array(await audio.arrayBuffer()),
      abortSignal: AbortSignal.timeout(20000),
      maxRetries: 0,
    });
    const text = result.text.trim();
    if (!text) throw new ApiError(422, 'No speech was detected. Try again or type your request.');
    return { text };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'Transcription failed. You can still type your request.');
  }
}
