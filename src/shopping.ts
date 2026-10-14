import { createSystem, InputComponent, UIKitMLAsset, Vector3, VisibilityState, type UIKit } from '@iwsdk/core';
import { store, type StoreState } from './store.js';
import { DEFAULT_QUERY, PREPARED_VARIANT_ID, formatPrice } from './contracts.js';

const CARD_IDS = ['card-left', 'card-center', 'card-right'] as const;
const PANEL_IDS = [...CARD_IDS, 'shopping-controls', 'shopping-title', 'try-on-panel'] as const;
const placeholder = `${import.meta.env.BASE_URL}ui/placeholder.svg`;
// The starter's XR glyph atlas is ASCII-only.
const spatialText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/·/g, '/').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\n]/g, '');

export class ShoppingSystem extends createSystem({}) {
  private panels!: Map<string, UIKitMLAsset>;
  private selectedDetail: string | null = null;
  private inRoom = false;
  private immersive = false;
  private recenterPending = false;
  private listening = false;
  private voiceStatus = '';
  private readonly anchor = new Vector3(0, 1.6, 0);
  private readonly forward = new Vector3();
  private yaw = 0;

  init(): void {
    this.panels = new Map(PANEL_IDS.map(id => [id, this.world.requireSceneObject<UIKitMLAsset>(id)]));
    const controls = this.panels.get('shopping-controls')!;
    const preview = this.panels.get('try-on-panel')!;
    const bind = (panel: UIKitMLAsset, id: string, action: () => void) => {
      const element = panel.requireElementById(id);
      element.setProperties({ onClick: action, pointerEvents: 'auto' });
      this.cleanupFuncs.push(() => element.setProperties({ onClick: undefined }));
    };
    bind(controls, 'voice', () => window.dispatchEvent(new Event('trail:voice')));
    bind(controls, 'search', () => { this.selectedDetail = null; this.inRoom = false; if (store.getState().status !== 'searching') void store.search(DEFAULT_QUERY); });
    bind(controls, 'prev', () => store.move(-1));
    bind(controls, 'next', () => store.move(1));
    bind(controls, 'back', () => { this.selectedDetail = null; this.inRoom = false; this.sync(store.getState()); });
    bind(controls, 'rotate', () => window.dispatchEvent(new Event('trail:rotate-model')));
    bind(controls, 'recenter', () => { this.recenterPending = true; });
    bind(controls, 'exit', () => { void this.world.exitXR(); });
    bind(preview, 'try-selected', () => window.dispatchEvent(new Event('trail:try-on')));
    bind(preview, 'buy-selected', () => window.dispatchEvent(new Event('trail:checkout')));
    bind(preview, 'model', () => { void this.previewInRoom(); });
    CARD_IDS.forEach((id, slot) => bind(this.panels.get(id)!, 'card', () => {
      const state = store.getState();
      const index = Math.max(0, state.products.findIndex(product => product.id === state.selectedId));
      const product = state.products[this.cardIndex(slot, index, state.products.length)];
      if (!product) return;
      this.selectedDetail = product.id;
      this.inRoom = false;
      store.confirmSelection(product.id);
    }));
    const onPreview = () => {
      const id = store.getState().selectedId;
      if (!id) return;
      this.selectedDetail = id; this.sync(store.getState());
      void this.previewInRoom();
    };
    window.addEventListener('trail:preview-model', onPreview);
    this.cleanupFuncs.push(() => window.removeEventListener('trail:preview-model', onPreview));
    const onListening = (event: Event) => {
      this.listening = (event as CustomEvent<boolean>).detail;
      this.sync(store.getState());
    };
    const onVoiceStatus = (event: Event) => { this.voiceStatus = (event as CustomEvent<string>).detail; this.sync(store.getState()); };
    window.addEventListener('trail:voice-status', onVoiceStatus);
    this.cleanupFuncs.push(() => window.removeEventListener('trail:voice-status', onVoiceStatus));
    window.addEventListener('trail:listening', onListening);
    this.cleanupFuncs.push(() => window.removeEventListener('trail:listening', onListening));
    this.cleanupFuncs.push(this.world.visibilityState.subscribe(value => {
      const active = value !== VisibilityState.NonImmersive;
      if (active && !this.immersive) this.recenterPending = true;
      this.immersive = active;
      if (!active) { this.anchor.set(0, 1.6, 0); this.yaw = 0; this.layout(); }
    }));
    this.cleanupFuncs.push(store.subscribe(state => this.sync(state)));
  }

  private text(panel: UIKitMLAsset, id: string, value: string): void {
    panel.requireElementById<UIKit.Text>(id).setProperties({ text: spatialText(value) });
  }

  private sync(state: StoreState): void {
    if (this.selectedDetail !== state.selectedId) { this.selectedDetail = null; this.inRoom = false; }
    const detail = Boolean(this.selectedDetail);
    const index = Math.max(0, state.products.findIndex(product => product.id === state.selectedId));
    const selected = state.products[index];
    CARD_IDS.forEach((id, slot) => {
      const card = this.panels.get(id)!;
      const product = state.products[this.cardIndex(slot, index, state.products.length)];
      card.visible = Boolean(product) && !detail;
      card.requireElementById('card').setProperties({ display: card.visible ? 'flex' : 'none' });
      if (!product) return;
      const focused = product.id === state.selectedId;
      this.text(card, 'title', product.title.slice(0, 66));
      this.text(card, 'seller', product.seller.slice(0, 32).toUpperCase());
      this.text(card, 'price', formatPrice(product.price));
      this.text(card, 'select-label', focused ? 'Open this product' : 'Select product');
      card.requireElementById<UIKit.Image>('image').setProperties({ src: product.imageUrl });
      card.requireElementById('card').setProperties({ borderColor: focused ? '#c8f36b' : '#46554a', borderWidth: focused ? 0.4 : 0.15 });
    });
    const title = this.panels.get('shopping-title')!;
    title.visible = !detail;
    title.requireElementById('root').setProperties({ display: title.visible ? 'flex' : 'none' });
    this.text(title, 'heading', this.listening ? 'Listening. What would you like?' : state.status === 'searching' ? 'Finding your next adventure...' : state.products.length ? 'Choose your next adventure.' : 'What are you looking for?');
    this.text(title, 'status', state.status === 'error' ? state.message.slice(0, 140) : this.voiceStatus && state.status !== 'searching' ? this.voiceStatus.slice(0, 125) : state.status === 'searching' ? 'Searching live Shopify products...' : state.products.length ? `${state.products.length} options / ${state.query.slice(0, 75)}` : 'Say: find a camping backpack under 150 dollars.');
    const controls = this.panels.get('shopping-controls')!;
    this.text(controls, 'voice-label', this.listening ? 'Stop recording' : state.products.length ? 'Ask for something else' : 'Speak your request');
    for (const id of ['prev', 'next']) controls.requireElementById(id).setProperties({ display: state.products.length && !detail ? 'flex' : 'none' });
    controls.requireElementById('voice').setProperties({ width: state.products.length && !detail ? 91 : 180 });
    controls.requireElementById('search').setProperties({ display: !state.products.length ? 'flex' : 'none', width: 180 });
    // Welcome uses a stacked pair of large targets; browsing is a compact navigation dock.
    controls.requireElementById('primary-row').setProperties({ flexDirection: state.products.length ? 'row' : 'column' });
    controls.requireElementById('root').setProperties({ height: !state.products.length ? 67 : 52 });
    controls.requireElementById('back').setProperties({ display: detail ? 'flex' : 'none' });
    this.text(controls, 'caption', state.status === 'error' ? state.message.slice(0, 140) : this.voiceStatus && (this.listening || !state.products.length) ? this.voiceStatus.slice(0, 125) : state.status === 'searching' ? 'Searching Shopify. Your cards will appear here.' : detail ? 'Your pick is ready. Point + pinch or press trigger.' : state.products.length ? `${index + 1} of ${state.products.length} / Pinch a card to open / Thumbstick to browse` : 'Point + pinch with your hand, or press controller trigger.');
    const preview = this.panels.get('try-on-panel')!;
    preview.visible = detail;
    preview.requireElementById('root').setProperties({ display: detail ? 'flex' : 'none' });
    if (detail && selected) {
      const prepared = selected.id === PREPARED_VARIANT_ID;
      this.text(preview, 'selection-label', `${this.inRoom ? 'IN YOUR SPACE' : 'YOUR PICK'} / ${formatPrice(selected.price)}`);
      this.text(preview, 'preview-title', selected.title.slice(0, 60));
      preview.requireElementById<UIKit.Image>('preview').setProperties({ src: state.tryOnImage ?? selected.imageUrl ?? placeholder });
      this.text(preview, 'status', (state.modelMessage || (prepared ? 'See Rich wearing this exact backpack. Saved 3D preview, ready now.' : 'Create a 3D preview, or try it on with a photo. Live 3D uses credits.')).slice(0, 140));
      this.text(preview, 'model-label', state.modelStatus === 'generating' ? 'Preparing 3D...' : this.inRoom ? 'Place again' : prepared || state.modelStatus === 'ready' ? 'See it in my room' : 'Generate 3D preview');
      preview.requireElementById('model').setProperties({ backgroundColor: state.modelStatus === 'generating' ? '#46554a' : '#c8f36b' });
    }
    this.layout();
  }

  private async previewInRoom(): Promise<void> {
    const selectedId = this.selectedDetail;
    if (!selectedId || store.getState().modelStatus === 'generating') return;
    if (store.getState().modelStatus !== 'ready') await store.generateModel();
    const state = store.getState();
    if (state.selectedId !== selectedId || state.modelStatus !== 'ready') return;
    this.inRoom = true;
    this.sync(state);
    window.dispatchEvent(new Event('trail:place-model'));
  }

  /** Anchor the UI once at entry/recenter, never to every head movement. */
  private layout(): void {
    if (!this.panels) return;
    const detail = Boolean(this.selectedDetail);
    const set = (id: string, x: number, y: number, z: number, rotation = 0) => {
      const panel = this.panels.get(id)!;
      panel.position.set(x * Math.cos(this.yaw) + z * Math.sin(this.yaw) + this.anchor.x, y + this.anchor.y, z * Math.cos(this.yaw) - x * Math.sin(this.yaw) + this.anchor.z);
      panel.rotation.set(0, this.yaw + rotation, 0);
    };
    set('card-left', -1.06, 0, -1.85, 0.2);
    set('card-center', -0.45, 0, -1.7);
    set('card-right', 0.16, 0, -1.85, -0.2);
    set('shopping-title', -0.45, stateHasProducts() ? 0.63 : 0.32, -1.8);
    set('shopping-controls', detail ? -0.8 : -0.45, detail ? -0.84 : stateHasProducts() ? -0.66 : -0.24, -1.8);
    set('try-on-panel', -0.8, 0, -1.65, 0.12);
  }

  private cardIndex(slot: number, selected: number, count: number): number {
    if (!count) return -1;
    if (count === 1) return slot === 1 ? 0 : -1;
    if (count === 2) return slot === 1 ? selected : slot === 2 ? (selected + 1) % 2 : -1;
    return (selected + slot - 1 + count) % count;
  }

  update(): void {
    if (this.recenterPending) {
      this.recenterPending = false;
      this.player.head.getWorldPosition(this.anchor);
      this.player.head.getWorldDirection(this.forward);
      // A Three camera looks down -Z; the tracked head Object3D looks down +Z.
      this.yaw = Math.atan2(this.forward.x, this.forward.z);
      this.layout();
    }
    const pad = this.input.xr.gamepads.right;
    if (pad?.getAxesEnteringLeft(InputComponent.Thumbstick)) { this.selectedDetail = null; this.inRoom = false; store.move(-1); }
    if (pad?.getAxesEnteringRight(InputComponent.Thumbstick)) { this.selectedDetail = null; this.inRoom = false; store.move(1); }
  }
}
const stateHasProducts = () => store.getState().products.length > 0;
