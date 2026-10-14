import { effect, type World } from '@iwsdk/core';
import { feed } from './feed.js';
import { formatPrice, type Product, type ProductsResponse, type TryOnKind } from './products.js';
import { appState, type TrackingHint } from './state.js';
import { takeOff, wear } from './wardrobe.js';

const ICONS = {
  flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9a8 8 0 0 1 14.3-3.3L20 7.5M20 4v3.5h-3.5M20 15a8 8 0 0 1-14.3 3.3L4 16.5M4 20v-3.5h3.5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

const HINTS: Record<TrackingHint, string> = {
  idle: 'Tap a product to try it on',
  loading: 'Getting the fitting room ready…',
  searching: 'Face the camera',
  'step-back': 'Step back so your shoulders and hips are in view',
  tracking: 'Live fit',
  error: 'Live fitting isn’t supported in this browser',
};

const CATEGORIES = ['All', 'Eyewear', 'Headwear', 'Backpacks'] as const;

const html = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((out, s, i) => out + s + (values[i] ?? ''), '');
const escape = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const kindOf = (product: Product): TryOnKind => product.tryOn.kind;

export function mountUi(root: HTMLElement, world: World) {
  root.innerHTML = html`
    <header class="topbar">
      <div class="brand"><span class="brand-mark"></span><span>Fast Forward <b>Try-on</b></span></div>
      <div class="actions">
        <button class="icon-button" id="flip" type="button" aria-label="Switch camera" hidden>${ICONS.flip}</button>
        <button class="icon-button" id="snap" type="button" aria-label="Take a photo">${ICONS.camera}</button>
        <button class="icon-button" id="bag-button" type="button" aria-label="Bag" aria-expanded="false">${ICONS.bag}<span class="badge" id="bag-count" hidden></span></button>
      </div>
    </header>
    <p class="status" id="status" role="status" aria-live="polite"></p>
    <aside class="bag glass" id="bag" hidden>
      <h2>Your bag</h2>
      <ul id="bag-items"></ul>
      <p class="bag-total" id="bag-total"></p>
    </aside>
    <div class="shelf">
      <section class="sheet glass" id="sheet" aria-label="Product details" hidden></section>
      <nav class="filters" id="filters" aria-label="Categories"></nav>
      <div class="rail" id="rail" role="list" aria-label="Products"></div>
    </div>
    <div class="gate" id="gate" hidden></div>
    <div class="flash" id="flash"></div>
    <dialog class="photo glass" id="photo">
      <img id="photo-image" alt="Your try-on photo">
      <div class="photo-actions">
        <button class="button secondary" id="photo-close" type="button">Close</button>
        <button class="button secondary" id="photo-share" type="button" hidden>Share</button>
        <a class="button primary" id="photo-save" download="try-on.png">Save photo</a>
      </div>
    </dialog>`;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const rail = $('rail'), sheet = $('sheet'), status = $('status'), gate = $('gate');
  let category: (typeof CATEGORIES)[number] = 'All';

  // --- Products -----------------------------------------------------------
  async function loadProducts() {
    appState.productsError.value = null;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/products`);
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as ProductsResponse;
      appState.products.value = body.products;
    } catch {
      appState.productsError.value = 'Products could not load.';
    }
  }
  void loadProducts();

  const findProduct = (id: string | null) => appState.products.value.find(p => p.id === id);
  const wornVariant = (product: Product) => {
    const worn = appState.worn.value[kindOf(product)];
    return worn?.productId === product.id ? worn.variantId : null;
  };

  function toggle(product: Product) {
    if (wornVariant(product)) {
      if (appState.focusedId.value === product.id) {
        takeOff(kindOf(product));
        appState.focusedId.value = null;
      } else {
        appState.focusedId.value = product.id;
      }
      return;
    }
    wear(world, product);
    appState.focusedId.value = product.id;
  }

  $('filters').innerHTML = CATEGORIES.map(c => `<button class="chip" type="button" data-category="${c}">${c}</button>`).join('');
  $('filters').addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-category]');
    if (!button) return;
    category = button.dataset.category as typeof category;
    renderRail();
  });

  function renderRail() {
    for (const chip of root.querySelectorAll<HTMLElement>('[data-category]')) chip.setAttribute('aria-pressed', String(chip.dataset.category === category));
    const error = appState.productsError.value;
    if (error) {
      rail.innerHTML = `<div class="rail-message glass">${error} <button class="link" type="button" id="retry-products">Retry</button></div>`;
      $('retry-products').addEventListener('click', () => void loadProducts());
      return;
    }
    const products = appState.products.value.filter(p => category === 'All' || p.category === category);
    if (!appState.products.value.length) {
      rail.innerHTML = Array.from({ length: 4 }, () => '<div class="card glass skeleton" aria-hidden="true"></div>').join('');
      return;
    }
    rail.innerHTML = products.map(product => {
      const variantId = wornVariant(product);
      const variant = product.variants.find(v => v.id === variantId) ?? product.variants[0];
      return html`
        <button class="card glass${variantId ? ' worn' : ''}" type="button" role="listitem" data-product="${product.id}" aria-pressed="${Boolean(variantId)}">
          <img src="${variant.imageUrl}" alt="" loading="lazy" draggable="false">
          <span class="card-name">${escape(product.name)}</span>
          <span class="card-price">${formatPrice(product.price)}</span>
          ${variantId ? `<span class="worn-pill">${ICONS.check}Wearing</span>` : ''}
        </button>`;
    }).join('');
  }
  rail.addEventListener('click', event => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-product]');
    const product = card && findProduct(card.dataset.product!);
    if (product) toggle(product);
  });

  // --- Detail sheet -------------------------------------------------------
  function renderSheet() {
    const product = findProduct(appState.focusedId.value);
    const variantId = product && wornVariant(product);
    sheet.hidden = !product;
    if (!product) return;
    const variant = product.variants.find(v => v.id === variantId) ?? product.variants[0];
    sheet.innerHTML = html`
      <button class="icon-button small sheet-close" id="sheet-close" type="button" aria-label="Close details">${ICONS.close}</button>
      <img class="sheet-image" src="${variant.imageUrl}" alt="${escape(`${product.name}, ${variant.name}`)}">
      <div class="sheet-body">
        <p class="eyebrow">${escape(product.brand)}</p>
        <h2>${escape(product.name)}</h2>
        <p class="sheet-price">${formatPrice(product.price)} <span>· ${escape(variant.name)}</span></p>
        <p class="sheet-description">${escape(product.description)}</p>
        <div class="swatches" role="radiogroup" aria-label="Colour">
          ${product.variants.map(v => `<button class="swatch" type="button" role="radio" aria-checked="${v.id === variant.id}" aria-label="${escape(v.name)}" data-variant="${v.id}" style="--swatch:${v.swatch}"></button>`).join('')}
        </div>
        <div class="sheet-actions">
          <button class="button secondary" id="wear-toggle" type="button">${variantId ? 'Take off' : 'Try on'}</button>
          <button class="button primary" id="add-to-bag" type="button">Add to bag</button>
        </div>
      </div>`;
    $('sheet-close').addEventListener('click', () => { appState.focusedId.value = null; });
    $('wear-toggle').addEventListener('click', () => {
      if (variantId) takeOff(kindOf(product)); else wear(world, product, variant.id);
    });
    $('add-to-bag').addEventListener('click', () => {
      appState.bag.value = [...appState.bag.value, `${product.id}:${variant.id}`];
      flashStatus(`${product.name} added to your bag`);
    });
    sheet.querySelector('.swatches')!.addEventListener('click', event => {
      const swatch = (event.target as HTMLElement).closest<HTMLElement>('[data-variant]');
      if (swatch) wear(world, product, swatch.dataset.variant);
    });
  }

  // --- Bag ----------------------------------------------------------------
  const bagPanel = $('bag'), bagButton = $('bag-button');
  bagButton.addEventListener('click', () => {
    bagPanel.hidden = !bagPanel.hidden;
    bagButton.setAttribute('aria-expanded', String(!bagPanel.hidden));
  });
  function renderBag() {
    const items = appState.bag.value.map(key => {
      const [productId, variantId] = key.split(':');
      const product = findProduct(productId);
      return product && { product, variant: product.variants.find(v => v.id === variantId) ?? product.variants[0] };
    }).filter(Boolean) as Array<{ product: Product; variant: Product['variants'][number] }>;
    const count = $('bag-count');
    count.hidden = !items.length;
    count.textContent = String(items.length);
    bagButton.setAttribute('aria-label', `Bag, ${items.length} item${items.length === 1 ? '' : 's'}`);
    $('bag-items').innerHTML = items.length
      ? items.map(({ product, variant }) => `<li><img src="${variant.imageUrl}" alt=""><span>${escape(product.name)}<small>${escape(variant.name)}</small></span><b>${formatPrice(product.price)}</b></li>`).join('')
      : '<li class="empty">Nothing here yet. Try something on.</li>';
    const total = items.reduce((sum, { product }) => sum + product.price.amount, 0);
    $('bag-total').textContent = items.length ? `Total ${formatPrice({ amount: total, currency: 'USD' })}` : '';
  }

  // --- Status -------------------------------------------------------------
  let statusOverride: string | null = null;
  let statusTimer = 0;
  function flashStatus(message: string) {
    statusOverride = message;
    renderStatus();
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => { statusOverride = null; renderStatus(); }, 2600);
  }
  let turnTipShown = false;
  function renderStatus() {
    const hint = appState.hint.value;
    if (hint === 'tracking' && appState.worn.value.backpack && !turnTipShown) {
      turnTipShown = true;
      flashStatus('Turn around to see the back of the pack');
      return;
    }
    status.textContent = statusOverride ?? HINTS[hint];
    status.dataset.hint = statusOverride ? 'note' : hint;
  }

  // --- Camera gate --------------------------------------------------------
  function renderGate() {
    const camera = appState.camera.value;
    gate.hidden = camera === 'active';
    if (camera === 'starting') {
      gate.innerHTML = '<div class="gate-card glass"><span class="spinner" aria-hidden="true"></span><h1>Opening your camera</h1><p>Allow camera access to see products on you. Video stays on this device.</p></div>';
    } else if (camera === 'error') {
      gate.innerHTML = `<div class="gate-card glass"><h1>Camera unavailable</h1><p>${escape(appState.cameraMessage.value)}</p><button class="button primary" id="camera-retry" type="button">Try again</button></div>`;
      $('camera-retry').addEventListener('click', () => feed.retry());
    }
  }

  // --- Camera controls & snapshot -----------------------------------------
  $('flip').addEventListener('click', () => feed.flip());
  const photo = $<HTMLDialogElement>('photo');
  let photoUrl = '';
  let photoBlob: Blob | null = null;
  $('photo-close').addEventListener('click', () => photo.close());
  photo.addEventListener('close', () => { URL.revokeObjectURL(photoUrl); photoUrl = ''; photoBlob = null; });
  const share = $('photo-share');
  share.addEventListener('click', () => {
    if (!photoBlob) return;
    const file = new File([photoBlob], 'try-on.png', { type: 'image/png' });
    void navigator.share({ files: [file], title: 'My try-on' }).catch(() => {});
  });
  $('snap').addEventListener('click', () => {
    // Render on demand so the drawing buffer is still intact when read.
    world.renderer.render(world.scene, world.camera);
    world.renderer.domElement.toBlob(blob => {
      if (!blob) return;
      const flash = $('flash');
      flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
      photoBlob = blob;
      photoUrl = URL.createObjectURL(blob);
      $<HTMLImageElement>('photo-image').src = photoUrl;
      $<HTMLAnchorElement>('photo-save').href = photoUrl;
      share.hidden = !(navigator.canShare?.({ files: [new File([blob], 'try-on.png', { type: 'image/png' })] }));
      photo.showModal();
    }, 'image/png');
  });

  effect(() => { renderRail(); });
  effect(() => { renderSheet(); });
  effect(() => { renderBag(); });
  effect(() => { renderStatus(); });
  effect(() => { renderGate(); });
  effect(() => { $('flip').hidden = !appState.canFlipCamera.value; });
  effect(() => { root.classList.toggle('has-sheet', appState.focusedId.value !== null); });
}
