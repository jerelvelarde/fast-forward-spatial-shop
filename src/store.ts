import { DEFAULT_QUERY, type Product, type SearchResult } from './contracts.js';

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
  accessTokenRequired: boolean;
}

let state: StoreState = {
  products: [], selectedId: null, query: DEFAULT_QUERY, status: 'idle',
  message: 'Your next adventure starts with a good pack.', photoDataUrl: null,
  tryOnStatus: 'idle', tryOnImage: null, tryOnMessage: '', tryOnEnabled: false,
  accessTokenRequired: false,
};
const listeners = new Set<(state: StoreState) => void>();
let searchController: AbortController | undefined;
let generationController: AbortController | undefined;
let searchVersion = 0;
let generationVersion = 0;
let demoAccessToken = '';

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
      update({ tryOnEnabled: config.tryOnEnabled === true, accessTokenRequired: config.tryOnEnabled === true });
    } catch {
      update({ tryOnEnabled: false });
    }
  },
  async search(query = state.query) {
    const normalized = query.trim();
    if (!normalized) return;
    searchController?.abort();
    searchController = new AbortController();
    const version = ++searchVersion;
    update({ ...clearGeneration(), query: normalized, status: 'searching', products: [], selectedId: null, message: 'Searching the Shopify catalog for your next camping pack…' });
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
    update({ ...clearGeneration(), selectedId: id });
  },
  setPhoto(photoDataUrl: string | null) {
    update({ ...clearGeneration(), photoDataUrl });
  },
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
