import { createSystem, InputComponent, UIKitMLAsset, type UIKit } from '@iwsdk/core';
import { store, type StoreState } from './store.js';
import { formatPrice } from './contracts.js';

const CARD_IDS = ['card-left', 'card-center', 'card-right'] as const;
const placeholder = `${import.meta.env.BASE_URL}ui/placeholder.svg`;
// The starter's prebuilt XR glyph atlas is ASCII-only. Preserve original titles
// in the desktop detail and merchant link; use legible transliterations in XR.
const spatialText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/·/g, '/').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\n]/g, '');

export class ShoppingSystem extends createSystem({}) {
  init(): void {
    const cards = CARD_IDS.map(id => this.world.requireSceneObject<UIKitMLAsset>(id));
    const controls = this.world.requireSceneObject<UIKitMLAsset>('shopping-controls');
    const title = this.world.requireSceneObject<UIKitMLAsset>('shopping-title');
    const preview = this.world.requireSceneObject<UIKitMLAsset>('try-on-panel');
    const bind = (panel: UIKitMLAsset, id: string, action: () => void) => {
      const element = panel.requireElementById(id);
      element.addEventListener('click', action);
      this.cleanupFuncs.push(() => element.removeEventListener('click', action));
    };
    bind(controls, 'search', () => { void store.search(); });
    bind(controls, 'prev', () => store.move(-1));
    bind(controls, 'next', () => store.move(1));
    bind(controls, 'exit', () => { void this.world.exitXR(); });
    bind(controls, 'try-on', () => { void store.generateTryOn(); });
    cards.forEach((card, slot) => bind(card, 'select', () => {
      const state = store.getState();
      const index = state.products.findIndex(product => product.id === state.selectedId);
      const product = state.products[this.cardIndex(slot, Math.max(index, 0), state.products.length)];
      if (product) store.select(product.id);
      else if (state.status !== 'searching') void store.search();
    }));
    const sync = (state: StoreState) => {
      const index = Math.max(0, state.products.findIndex(product => product.id === state.selectedId));
      const text = (panel: UIKitMLAsset, id: string, value: string) => panel.requireElementById<UIKit.Text>(id).setProperties({ text: spatialText(value) });
      cards.forEach((card, slot) => {
        const product = state.products[this.cardIndex(slot, index, state.products.length)];
        const selected = product?.id === state.selectedId;
        text(card, 'title', product ? product.title.slice(0, 75) : state.status === 'searching' ? 'Searching Shopify…' : 'Find your next adventure.');
        text(card, 'seller', product?.seller.slice(0, 42).toUpperCase() ?? 'LIVE SHOPIFY CATALOG');
        text(card, 'price', product ? formatPrice(product.price) : 'Under $150');
        text(card, 'select-label', product ? selected ? 'Selected · try it on below' : 'Select backpack' : 'Search to discover');
        card.requireElementById<UIKit.Image>('image').setProperties({ src: product?.imageUrl ?? placeholder });
        card.requireElementById('card').setProperties({ borderColor: selected ? '#c8f36b' : '#46554a', borderWidth: selected ? 0.5 : 0.2 });
      });
      text(title, 'status', state.status === 'searching' ? 'Searching Shopify for your next adventure…' : state.products.length ? `${state.products.length} live options / USD / under $150` : state.message.slice(0, 120));
      text(controls, 'caption', state.products.length ? `${index + 1} of ${state.products.length} / Point + trigger to select / Thumbstick to browse` : 'Find backpacks to begin / Photo and demo access are prepared in the browser');
      preview.requireElementById<UIKit.Image>('preview').setProperties({ src: state.tryOnImage ?? state.photoDataUrl ?? placeholder });
      text(preview, 'status', (state.tryOnMessage || (state.photoDataUrl ? 'Photo ready. Choose a pack and select Try on.' : 'Add your photo in the browser before entering VR.')).slice(0, 180));
    };
    sync(store.getState());
    this.cleanupFuncs.push(store.subscribe(sync));
  }

  private cardIndex(slot: number, selected: number, count: number): number {
    if (count < 3) return slot < count ? slot : -1;
    return (selected + slot - 1 + count) % count;
  }

  update(): void {
    const pad = this.input.xr.gamepads.right;
    if (pad?.getAxesEnteringLeft(InputComponent.Thumbstick)) store.move(-1);
    if (pad?.getAxesEnteringRight(InputComponent.Thumbstick)) store.move(1);
  }
}
