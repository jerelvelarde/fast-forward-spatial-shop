import { randomUUID } from 'node:crypto';
import { ApiError, httpsUrl } from './catalog.js';
import { buildCheckoutCommand, MAX_QUANTITY, runCheckoutCommand, uuid } from './checkout.js';
import { SAMPLE_PRODUCTS } from './sample-products.js';
import { readAudioForm, transcribeFile } from './transcribe.js';
import type { Product, VoiceCheckoutResult } from '../src/contracts.js';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const domain = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

/** Uses the server copy of a sample product, or strictly validates caller-supplied product info. */
export function parseProduct(value: unknown): Product {
  let input: Record<string, unknown>;
  try { input = record(typeof value === 'string' ? JSON.parse(value) : value); } catch { throw new ApiError(400, 'Product info must be JSON.'); }
  const sample = SAMPLE_PRODUCTS.find(product => product.id === input.id);
  if (sample) return sample;
  const id = typeof input.id === 'string' ? input.id : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const url = httpsUrl(input.url);
  const sellerDomain = typeof input.sellerDomain === 'string' ? input.sellerDomain : '';
  if (!id || id.length > 1000 || !title || title.length > 300 || !url) throw new ApiError(400, 'Product info needs an id, title and HTTPS product URL.');
  if (!Number.isSafeInteger(input.price) || Number(input.price) <= 0 || input.currency !== 'USD') throw new ApiError(400, 'Product price must be a positive amount in US cents.');
  if (!domain.test(sellerDomain)) throw new ApiError(422, 'This listing has no verified checkout merchant. Open its store page to buy.');
  return {
    id, title, url, sellerDomain, price: Number(input.price), currency: 'USD',
    description: typeof input.description === 'string' ? input.description.slice(0, 1000) : '',
    imageUrl: httpsUrl(input.imageUrl), previewMode: 'object',
    seller: typeof input.seller === 'string' && input.seller.trim() ? input.seller.trim().slice(0, 200) : 'Shopify merchant',
  };
}

const quantityWords: Record<string, number> = { one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const cancel = /\b(?:don'?t|do not|cancel|stop|never ?mind|not now|no thanks|hold on|wait)\b/;
const purchase = /\b(?:buy|purchase|order|check ?out|i'?ll take|i will take|take (?:it|this|that|them|these|those)|get (?:me )?(?:it|this|that|them|these|those)|add (?:it|this|that|them) to (?:my )?cart|yes|confirm|proceed)\b/;
const quantity = new RegExp(`(\\$\\s*)?\\b(\\d{1,3}|${Object.keys(quantityWords).join('|')})\\b(?!\\s*(?:dollars?|bucks|usd|cents?|percent|%))`, 'g');

/** Turns a spoken confirmation such as “buy two of these” into a checkout quantity. */
export function parseVoiceCommand(transcript: string): { quantity: number } {
  const text = transcript.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9$%'\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cancel.test(text)) throw new ApiError(422, `Heard “${transcript}”. Nothing was added to checkout.`);
  if (!purchase.test(text)) throw new ApiError(422, `Heard “${transcript}”. Say “buy it” or “buy two of these” to check out.`);
  const amounts = new Set<number>();
  if (/\b(?:couple|pair) of\b/.test(text)) amounts.add(2);
  for (const match of text.matchAll(quantity)) {
    const before = text.slice(0, match.index);
    if (match[1] || /\b(?:this|that|the|which|other|same|another|each|any|size|number|model|for|at|under|below|over|than)\s$/.test(before)) continue;
    amounts.add(quantityWords[match[2]] ?? Number(match[2]));
  }
  if (amounts.size > 1) throw new ApiError(422, `Heard “${transcript}”. Say one quantity, such as “buy two”.`);
  const count = amounts.values().next().value ?? 1;
  if (count < 1 || count > MAX_QUANTITY) throw new ApiError(422, `Voice checkout supports 1 to ${MAX_QUANTITY} items at a time.`);
  return { quantity: count };
}

export interface VoiceCheckoutDeps { fetcher?: typeof fetch; transcribe?: typeof transcribeFile }

/**
 * Voice → UCP checkout. Accepts multipart `product` (JSON), `audio` (recorded clip)
 * or `transcript` (browser speech fallback), and optional `requestId` (UUID).
 * Creates a reviewable merchant checkout; payment is completed on the merchant page.
 */
export async function voiceCheckout(request: Request, deps: VoiceCheckoutDeps = {}): Promise<VoiceCheckoutResult> {
  const form = await readAudioForm(request);
  const product = parseProduct(form.get('product'));
  const audio = form.get('audio');
  const typed = form.get('transcript');
  let transcript: string;
  if (audio instanceof File && audio.size) transcript = await (deps.transcribe ?? transcribeFile)(audio);
  else if (typeof typed === 'string' && typed.trim() && typed.length <= 300) transcript = typed.trim();
  else throw new ApiError(400, 'Record a voice command, such as “buy this”.');
  const requestId = form.get('requestId');
  if (requestId !== null && (typeof requestId !== 'string' || !uuid.test(requestId))) throw new ApiError(400, 'Invalid request ID.');
  const { quantity } = parseVoiceCommand(transcript);
  const command = buildCheckoutCommand(product, quantity, requestId ?? randomUUID());
  const checkout = await runCheckoutCommand(command, product, quantity, deps.fetcher);
  return { transcript, quantity, command, checkout, redirectUrl: checkout.continueUrl };
}
