import type { Entity, Mesh, Object3D, World } from '@iwsdk/core';
import { BackpackModel } from './models/backpack.js';
import { buildCap } from './models/cap.js';
import { buildGlasses } from './models/glasses.js';
import { OCCLUDER_ORDER } from './models/materials.js';
import { styleFor, type Product, type TryOnKind } from './products.js';
import { appState } from './state.js';
import { WornProduct } from './try-on-components.js';

/**
 * Draw order. Head occluders first, then head-worn products, then the body
 * silhouette occluder, then the backpack — so the silhouette hides the pack
 * behind the wearer without clipping a cap that sits behind the body plane.
 */
export const RENDER_ORDER = { headOccluder: OCCLUDER_ORDER - 20, headwear: OCCLUDER_ORDER - 10, bodyOccluder: OCCLUDER_ORDER, bodywear: 0 };

/** Backpack models keyed by their root, for per-frame harness fitting. */
export const backpackModels = new WeakMap<Object3D, BackpackModel>();

const wornEntities = new Map<TryOnKind, Entity>();

function setRenderOrder(root: Object3D, order: number) {
  root.traverse(object => {
    if (!(object as Mesh).isMesh) return;
    object.renderOrder = object.name === 'head-occluder' ? RENDER_ORDER.headOccluder : order + object.renderOrder;
  });
}

function remove(kind: TryOnKind) {
  wornEntities.get(kind)?.dispose();
  wornEntities.delete(kind);
}

/** Put a product on (replacing anything worn in the same slot). */
export function wear(world: World, product: Product, variantId?: string) {
  const variant = product.variants.find(v => v.id === variantId) ?? product.variants[0];
  const style = styleFor(product, variant);
  remove(style.kind);

  let root: Object3D;
  if (style.kind === 'glasses') {
    root = buildGlasses(style);
    setRenderOrder(root, RENDER_ORDER.headwear);
  } else if (style.kind === 'cap') {
    root = buildCap(style);
    setRenderOrder(root, RENDER_ORDER.headwear);
  } else {
    const model = new BackpackModel(style);
    root = model.root;
    backpackModels.set(root, model);
    setRenderOrder(root, RENDER_ORDER.bodywear);
  }
  root.visible = false; // until tracking places it

  const entity = world.createTransformEntity(root, { parent: world.cameraEntity });
  entity.addComponent(WornProduct, { kind: style.kind, productId: product.id, variantId: variant.id });
  wornEntities.set(style.kind, entity);
  appState.worn.value = { ...appState.worn.peek(), [style.kind]: { productId: product.id, variantId: variant.id } };
}

export function takeOff(kind: TryOnKind) {
  remove(kind);
  const next = { ...appState.worn.peek() };
  delete next[kind];
  appState.worn.value = next;
}
