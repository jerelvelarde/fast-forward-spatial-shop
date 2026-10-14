import { DEFAULT_QUERY, DEMO_PRODUCT, PREPARED_MODEL_URL, type Product, type SearchResult, type CheckoutResult } from './contracts.js';

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
  modelEnabled: boolean;
  modelStatus: 'idle' | 'generating' | 'ready' | 'error';
  modelProductId: string | null;
  modelUrl: string | null;
  modelMessage: string;
}

let state: StoreState = {
  products: [], selectedId: null, query: DEFAULT_QUERY, status: 'idle',
  message: 'Tell Trail what you want to shop for.', photoDataUrl: null,
  tryOnStatus: 'idle', tryOnImage: null, tryOnMessage: '', tryOnEnabled: false, transcriptionEnabled: false,
  accessTokenRequired: false, checkout: null, checkoutStatus: 'idle', checkoutMessage: '', assistantMessage: '',
  modelEnabled: false, modelStatus: 'idle', modelProductId: null, modelUrl: null, modelMessage: '',
};
const listeners = new Set<(state: StoreState) => void>();
let searchController: AbortController | undefined;
let generationController: AbortController | undefined;
let searchVersion = 0;
let generationVersion = 0;
let demoAccessToken = '';
let checkoutController: AbortController | undefined;
let modelController: AbortController | undefined;
let modelVersion = 0;
interface ModelTask { taskId: string; ticket: string }
const modelTasks = new Map<string, ModelTask>();
function cachedModelTask(productId: string): ModelTask | undefined {
  const inMemory = modelTasks.get(productId);
  if (inMemory) return inMemory;
  try {
    const cached = JSON.parse(sessionStorage.getItem(`trail:model:${productId}`) ?? 'null');
    if (typeof cached?.taskId === 'string' && typeof cached?.ticket === 'string' && Number.isFinite(cached?.createdAt) && Date.now() - cached.createdAt < 2 * 24 * 60 * 60 * 1000) return { taskId: cached.taskId, ticket: cached.ticket };
  } catch { /* Session storage is optional. */ }
  return undefined;
}
function rememberModelTask(productId: string, task: ModelTask): void {
  modelTasks.set(productId, task);
  try { sessionStorage.setItem(`trail:model:${productId}`, JSON.stringify({ ...task, createdAt: Date.now() })); } catch { /* In-memory cache still works. */ }
}
function forgetModelTask(productId: string): void {
  modelTasks.delete(productId);
  try { sessionStorage.removeItem(`trail:model:${productId}`); } catch { /* Nothing to remove. */ }
}
let checkoutVersion = 0;
const checkoutAttempts = new Map<string, { requestId: string; id?: string }>();
function clearCheckout() {
  checkoutVersion++; checkoutController?.abort();
  return { checkout: null, checkoutStatus: 'idle' as const, checkoutMessage: '', assistantMessage: '' };
}
function clearModel() {
  modelVersion++; modelController?.abort();
  return { modelStatus: 'idle' as const, modelProductId: null, modelUrl: null, modelMessage: '' };
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
      update({ transcriptionEnabled: config.transcriptionEnabled === true, tryOnEnabled: config.tryOnEnabled === true, modelEnabled: config.modelEnabled === true, accessTokenRequired: config.tryOnEnabled === true });
    } catch {
      update({ tryOnEnabled: false, modelEnabled: false, transcriptionEnabled: false });
    }
  },
  async search(query = state.query) {
    const normalized = query.trim();
    if (!normalized) return;
    searchController?.abort();
    searchController = new AbortController();
    const version = ++searchVersion;
    update({ ...clearGeneration(), ...clearCheckout(), ...clearModel(), query: normalized, status: 'searching', products: [], selectedId: null, message: 'Searching live Shopify products…' });
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
    update({ ...clearGeneration(), ...clearCheckout(), ...clearModel(), selectedId: id });
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
  setModelMessage(modelMessage: string) { update({ modelMessage }); },
  useDemoModel() {
    searchVersion++; searchController?.abort();
    update({
      ...clearGeneration(), ...clearCheckout(), ...clearModel(),
      products: [DEMO_PRODUCT], selectedId: DEMO_PRODUCT.id, query: DEFAULT_QUERY,
      status: 'ready', message: 'Demo backpack selected.',
      modelStatus: 'ready', modelProductId: DEMO_PRODUCT.id, modelUrl: PREPARED_MODEL_URL,
      modelMessage: 'Rich with the backpack is ready to view in Quest AR.',
      assistantMessage: 'Demo backpack selected. Enter Quest AR to view Rich with the backpack.',
    });
  },
  async downloadModelAsset(productId: string): Promise<Blob> {
    const task = cachedModelTask(productId);
    if (!task || state.modelProductId !== productId || state.modelStatus !== 'ready') throw new Error('Generate this product before placing it in Quest AR.');
    const response = await fetch('/api/model', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'asset', ...task }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === 'string' ? body.error : 'The 3D file could not be downloaded.');
    }
    const bytes = Number(response.headers.get('content-length'));
    if (Number.isFinite(bytes) && bytes > 64 * 1024 * 1024) throw new Error('This 3D file is too large for Quest.');
    const blob = await response.blob();
    if (blob.size < 20 || blob.size > 64 * 1024 * 1024) throw new Error('The 3D file is invalid or too large for Quest.');
    return blob;
  },
  async generateModel() {
    if (state.modelStatus === 'generating') return;
    const productId = state.selectedId;
    if (!productId) { update({ modelStatus: 'error', modelMessage: 'Select a product first.' }); return; }
    if (!state.modelEnabled) { update({ modelStatus: 'error', modelMessage: '3D generation needs a Meshy API key on the server.' }); return; }
    const version = ++modelVersion;
    const controller = new AbortController(); modelController = controller;
    update({ modelStatus: 'generating', modelProductId: productId, modelUrl: null, modelMessage: 'Preparing the selected product in 3D…' });
    try {
      let task = cachedModelTask(productId);
      if (!task) {
        const started = await responseBody(await fetch('/api/model', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ action: 'start', productId, query: state.query }),
        }));
        if (started.productId !== productId) throw new Error('Model task did not match the selected product.');
        if (started.status === 'ready' && typeof started.modelUrl === 'string' && started.modelUrl.startsWith('/demo/')) {
          if (version === modelVersion) update({ modelStatus: 'ready', modelProductId: productId, modelUrl: started.modelUrl, modelMessage: 'Rich with the backpack is ready to view in Quest AR.' });
          return;
        }
        if (typeof started.taskId !== 'string' || typeof started.ticket !== 'string') throw new Error('Model task did not return an ID.');
        task = { taskId: started.taskId, ticket: started.ticket };
        rememberModelTask(productId, task);
      }
      for (let attempt = 0; attempt < 90; attempt++) {
        if (controller.signal.aborted || version !== modelVersion) return;
        const result = await responseBody(await fetch('/api/model', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ action: 'status', ...task }),
        }));
        if (version !== modelVersion) return;
        if (result.status === 'ready' && typeof result.modelUrl === 'string' && result.modelUrl.startsWith('https://assets.meshy.ai/')) {
          update({ modelStatus: 'ready', modelProductId: productId, modelUrl: result.modelUrl, modelMessage: 'Your 3D preview is ready to view in Quest AR.' });
          return;
        }
        if (result.status === 'failed') { forgetModelTask(productId); throw new Error(typeof result.message === 'string' ? result.message : 'Meshy could not generate this model.'); }
        update({ modelMessage: `Creating your 3D preview… ${Math.round(Number(result.progress) || 0)}%` });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, 5000);
          const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
          controller.signal.addEventListener('abort', abort, { once: true });
        });
      }
      throw new Error('3D generation is taking longer than expected. Try again to resume the same task.');
    } catch (error) {
      if (version !== modelVersion || (error instanceof Error && error.name === 'AbortError')) return;
      update({ modelStatus: 'error', modelMessage: error instanceof Error ? error.message : '3D generation failed.' });
    }
  },
  cancelCheckout() { if (state.checkoutStatus === 'preparing') update(clearCheckout()); },
  async prepareCheckout(signal?: AbortSignal) {
    if (state.checkoutStatus === 'preparing') return;
    const product = state.products.find(p => p.id === state.selectedId);
    if (!product) { update({ checkoutStatus: 'error', checkoutMessage: 'Select a product first.' }); return; }
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
      update({ tryOnStatus: 'error', tryOnMessage: 'Select a product and add a person photo first.' });
      return;
    }
    if (!state.tryOnEnabled) {
      update({ tryOnStatus: 'error', tryOnMessage: 'Live try-on is ready to connect. Configure AI_GATEWAY_API_KEY and a private TRY_ON_ACCESS_TOKEN on the server, then restart the app.' });
      return;
    }
    const version = ++generationVersion;
    generationController = new AbortController();
    update({ tryOnStatus: 'generating', tryOnImage: null, tryOnMessage: 'Creating a photo preview of the selected product. This may take a moment…' });
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
