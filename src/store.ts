import { DEFAULT_QUERY, type Product, type SearchResult, type CheckoutResult } from './contracts.js';

export interface StoreState {
  products: Product[];
  selectedId: string | null;
  query: string;
  status: 'idle' | 'searching' | 'ready' | 'error';
  message: string;
  photoDataUrl: string | null;
  tryOnStatus: 'idle' | 'generating' | 'ready' | 'error';
  tryOnImage: string | null;
  tryOnMessage: string;
  tryOnEnabled: boolean;
  transcriptionEnabled: boolean;
  accessTokenRequired: boolean;
  checkout: CheckoutResult | null;
  checkoutStatus: 'idle' | 'preparing' | 'ready' | 'error';
  checkoutMessage: string;
  assistantMessage: string;
}

let state: StoreState = {
  products: [], selectedId: null, query: DEFAULT_QUERY, status: 'idle',
  message: 'Your next adventure starts with a good pack.', photoDataUrl: null,
  tryOnStatus: 'idle', tryOnImage: null, tryOnMessage: '', tryOnEnabled: false, transcriptionEnabled: false,
  accessTokenRequired: false, checkout: null, checkoutStatus: 'idle', checkoutMessage: '', assistantMessage: '',
};
const listeners = new Set<(state: StoreState) => void>();
let searchController: AbortController | undefined;
let generationController: AbortController | undefined;
let searchVersion = 0;
let generationVersion = 0;
let demoAccessToken = '';
let checkoutController: AbortController | undefined;
let checkoutVersion = 0;
const checkoutAttempts = new Map<string, { requestId: string; id?: string }>();
function clearCheckout() {
  checkoutVersion++; checkoutController?.abort();
  return { checkout: null, checkoutStatus: 'idle' as const, checkoutMessage: '', assistantMessage: '' };
}

function update(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener(state));
}
function clearGeneration() {
  generationVersion++;
  generationController?.abort();
  return { tryOnStatus: 'idle' as const, tryOnImage: null, tryOnMessage: '' };
}
async function responseBody(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : `Request failed (${response.status}). Please try again.`);
  return body;
}

export const store = {
  getState: () => state,
  subscribe(listener: (state: StoreState) => void) {
    listeners.add(listener);
    listener(state);
    return () => { listeners.delete(listener); };
  },
  async configure() {
    try {
      const config = await responseBody(await fetch('/api/config'));
      update({ transcriptionEnabled: config.transcriptionEnabled === true, tryOnEnabled: config.tryOnEnabled === true, accessTokenRequired: config.tryOnEnabled === true });
    } catch {
      update({ tryOnEnabled: false, transcriptionEnabled: false });
    }
  },
  async search(query = state.query) {
    const normalized = query.trim();
    if (!normalized) return;
    searchController?.abort();
    searchController = new AbortController();
    const version = ++searchVersion;
    update({ ...clearGeneration(), ...clearCheckout(), query: normalized, status: 'searching', products: [], selectedId: null, message: 'Searching the Shopify catalog for your next camping pack…' });
    try {
      const result: SearchResult = await responseBody(await fetch('/api/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: normalized }), signal: searchController.signal,
      }));
      if (version !== searchVersion) return;
      update({ products: result.products, selectedId: result.products[0]?.id ?? null, status: 'ready', message: result.message, query: result.query });
    } catch (error) {
      if (version !== searchVersion || (error instanceof Error && error.name === 'AbortError')) return;
      update({ status: 'error', message: error instanceof Error ? error.message : 'Search could not connect. Please try again.' });
    }
  },
  move(delta: number) {
    if (!state.products.length) return;
    const current = state.products.findIndex(product => product.id === state.selectedId);
    const index = (current + delta % state.products.length + state.products.length) % state.products.length;
    this.select(state.products[index].id);
  },
  select(id: string) {
    if (id === state.selectedId || !state.products.some(product => product.id === id)) return;
    update({ ...clearGeneration(), ...clearCheckout(), selectedId: id });
  },
  confirmSelection(id: string) {
    const product = state.products.find(item => item.id === id);
    if (!product) return;
    this.select(id);
    update({ assistantMessage: `Selected: ${product.title}. Choose Try it on or Buy selected.` });
  },
  setPhoto(photoDataUrl: string | null) {
    update({ ...clearGeneration(), photoDataUrl });
  },
  setAssistantMessage(assistantMessage: string) { update({ assistantMessage }); },
  cancelCheckout() { if (state.checkoutStatus === 'preparing') update(clearCheckout()); },
  async prepareCheckout(signal?: AbortSignal) {
    if (state.checkoutStatus === 'preparing') return;
    const product = state.products.find(p => p.id === state.selectedId);
    if (!product) { update({ checkoutStatus: 'error', checkoutMessage: 'Select a backpack first.' }); return; }
    const query = state.query;
    const key = JSON.stringify([query, product.id, product.price]);
    const attempt = checkoutAttempts.get(key) ?? { requestId: crypto.randomUUID() };
    checkoutAttempts.set(key, attempt);
    const version = ++checkoutVersion;
    const controller = new AbortController(); checkoutController = controller;
    update({ checkout: null, checkoutStatus: 'preparing', checkoutMessage: 'Checking availability and preparing your merchant checkout…' });
    try {
      const result: CheckoutResult = await responseBody(await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        body: JSON.stringify({ productId: product.id, query, expectedPrice: product.price, requestId: attempt.requestId, ...(attempt.id ? { checkoutId: attempt.id } : {}) }),
      }));
      if (version !== checkoutVersion || signal?.aborted) return;
      if (result.product?.id !== product.id || result.quantity !== 1 || typeof result.id !== 'string' || typeof result.continueUrl !== 'string' || !result.continueUrl.startsWith('https://')) throw new Error('Invalid checkout response. Please retry.');
      attempt.id = result.id;
      update({ checkout: result, checkoutStatus: 'ready', checkoutMessage: 'Checkout ready. Review shipping, taxes and payment with the merchant. No order has been placed.' });
    } catch (error) {
      if (version !== checkoutVersion) return;
      if (signal?.aborted || controller.signal.aborted) { update(clearCheckout()); return; }
      update({ checkoutStatus: 'error', checkoutMessage: error instanceof Error ? error.message : 'Checkout could not finish. Retry to recover the same request.' });
    }
  },
  cancelTryOn() { if (state.tryOnStatus === 'generating') update(clearGeneration()); },
  setAccessToken(token: string) { demoAccessToken = token; },
  async generateTryOn(accessToken?: string) {
    if (accessToken !== undefined) demoAccessToken = accessToken;
    if (state.tryOnStatus === 'generating') return;
    if (!state.selectedId || !state.photoDataUrl) {
      update({ tryOnStatus: 'error', tryOnMessage: 'Select a backpack and add a person photo first.' });
      return;
    }
    if (!state.tryOnEnabled) {
      update({ tryOnStatus: 'error', tryOnMessage: 'Live try-on is ready to connect. Configure AI_GATEWAY_API_KEY and a private TRY_ON_ACCESS_TOKEN on the server, then restart the app.' });
      return;
    }
    const version = ++generationVersion;
    generationController = new AbortController();
    update({ tryOnStatus: 'generating', tryOnImage: null, tryOnMessage: 'Placing the selected backpack on your photo. This may take a moment…' });
    try {
      const result = await responseBody(await fetch('/api/try-on', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: generationController.signal,
        body: JSON.stringify({ productId: state.selectedId, query: state.query, photoDataUrl: state.photoDataUrl, accessToken: demoAccessToken }),
      }));
      if (version !== generationVersion) return;
      if (typeof result.imageDataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(result.imageDataUrl)) throw new Error('The model did not return a preview image. Please try again.');
      update({ tryOnStatus: 'ready', tryOnImage: result.imageDataUrl, tryOnMessage: 'AI visualization · appearance and fit may vary.' });
    } catch (error) {
      if (version !== generationVersion || (error instanceof Error && error.name === 'AbortError')) return;
      update({ tryOnStatus: 'error', tryOnMessage: error instanceof Error ? error.message : 'Try-on could not finish. Please try again.' });
    }
  },
};
