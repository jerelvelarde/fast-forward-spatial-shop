import { DEFAULT_QUERY, formatPrice, type Product } from './contracts.js';
import { store, type StoreState } from './store.js';
import { WebcamCapture, type WebcamState } from './webcam.js';
import { HandTracking, type HandTrackingStatus } from './hand-tracking.js';
import './style.css';

interface Recognition extends EventTarget {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } }; length: number } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
const icons = {
  mountain: '<svg viewBox="0 0 32 32" fill="none"><path d="m3 25 9-17 5 9 4-7 8 15H3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m9 14 3 3 3-3" stroke="currentColor" stroke-width="2"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-3 0h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  vr: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16l2 10h-7l-3-3-3 3H2L4 7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 10v3m10-3v3" stroke="currentColor" stroke-width="1.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const el = document.createElement(tag); el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function mountDesktop(root: HTMLElement, actions: { enterVR: () => void; exitVR: () => void }) {
  root.classList.add('trail-desktop');
  root.innerHTML = `
    <header class="trail-header"><a href="#" class="trail-brand" aria-label="Trail home">${icons.mountain}<span>trail<span class="brand-dot">.</span></span></a><span class="header-caption">A NEW WAY TO FIND YOUR OUTSIDE</span><button class="vr-button" id="webcam-mode" disabled>Webcam mode</button><button class="vr-button" id="enter-vr">${icons.vr}<span>Enter VR</span></button></header>
    <main class="trail-workspace"><section class="discovery-panel" aria-label="Find your backpack">
      <div class="eyebrow"><span class="live-dot"></span> SPATIAL SHOPPING / 001</div>
      <h1>Find your pack.<br><em>See it on you.</em></h1>
      <p class="intro">Say where you're headed. Explore camping backpacks in space, then try one on.</p>
      <form class="search-form"><label for="search-query">WHAT ARE WE LOOKING FOR?</label><div class="search-field"><textarea id="search-query" rows="2" maxlength="500" spellcheck="false"></textarea><button type="button" id="voice-button" class="icon-button" aria-label="Search by voice">${icons.mic}</button></div><button type="submit" class="primary-button" id="search-button"><span>Find my backpack</span>${icons.arrow}</button></form>
      <p id="voice-message" class="small-note"></p>
      <div class="filter-row"><span>Camping & hiking</span><span>Under $150 USD</span></div>
      <div class="search-status" id="search-status" role="status" aria-live="polite"></div>
      <section class="selected-detail" hidden><div class="eyebrow">YOUR PICK</div><h2 id="selected-title"></h2><p class="selected-meta"><span id="selected-price"></span><span id="selected-seller"></span></p><p id="selected-description"></p><div class="selected-actions"><button id="open-tryon" class="primary-button">Try it on <span>↗</span></button><a id="shop-link" class="text-link" target="_blank" rel="noopener noreferrer">View at store ↗</a></div></section>
      <div class="flow-steps"><span class="active">01 Discover</span><i></i><span>02 Select</span><i></i><span>03 Try on</span></div>
    </section><div class="scene-caption"><span class="scene-label">YOUR SPATIAL SHOWROOM</span><p>Point to a card. Make it yours.</p><span class="scene-help">Desktop preview · Enter VR for the full view</span></div></main>
    <section class="product-dock" aria-label="Backpack results"><div class="dock-top"><div><span class="eyebrow">CURATED BY YOUR INTENT</span><span id="result-count">Ready when you are</span></div><div class="carousel-controls"><span>Swipe to explore</span><button id="previous-product" class="icon-button" aria-label="Previous backpack">←</button><button id="next-product" class="icon-button" aria-label="Next backpack">→</button></div></div><div class="product-rail" tabindex="0" aria-label="Swipe backpack options"></div></section>
    <footer class="trail-footer"><span>BUILT FOR THE GREAT OUTDOORS.</span><span>Shopify catalog <b>×</b> Meta IWSDK</span></footer>
    <dialog class="tryon-dialog"><div class="dialog-heading"><div><div class="eyebrow">03 / THE FINAL LOOK</div><h2>A little closer to the trail.</h2></div><button class="icon-button" id="close-tryon" aria-label="Close try-on">×</button></div><div class="tryon-body"><div class="tryon-visuals"><div class="person-preview"><video id="webcam-preview" autoplay muted playsinline aria-label="Live webcam preview" hidden></video><div class="photo-placeholder">${icons.mountain}<span>Your adventure.<br>Your perspective.</span><p>Add a rear or three-quarter view photo<br>to see the backpack on you.</p></div><span class="preview-label">LIVE CAMERA · MIRRORED PREVIEW</span></div><section class="photo-comparison" aria-label="Before and after try-on" hidden><figure><figcaption>BEFORE <span>Your original photo</span></figcaption><div class="comparison-image"><img id="before-image" alt="Before: your original captured photo"></div></figure><figure><figcaption>AFTER <span>AI backpack preview</span></figcaption><div class="comparison-image"><img id="after-image" alt="After: the selected backpack on your photo" hidden><p id="after-placeholder">Generate your try-on to compare.</p></div></figure></section><div class="webcam-browser" aria-label="Browse backpacks with gestures"><div class="webcam-product"><button class="icon-button" id="webcam-previous" aria-label="Previous webcam backpack">←</button><img id="webcam-product-image" alt=""><button class="icon-button" id="webcam-next" aria-label="Next webcam backpack">→</button></div><p id="webcam-product-position"></p><p id="gesture-selection" role="status"></p><button class="secondary-button" id="confirm-backpack">Select this backpack</button></div></div><div class="tryon-options"><div class="eyebrow">SELECTED BACKPACK</div><h3 id="tryon-product"></h3><p id="tryon-price"></p><label class="upload-button" for="person-upload">Upload your photo <span>↑</span></label><input id="person-upload" type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden"><button class="secondary-button" id="use-webcam">Use webcam</button><div class="webcam-controls" hidden><button class="primary-button" id="capture-photo" disabled>Capture photo</button><button class="secondary-button" id="stop-webcam">Stop camera</button></div><p id="webcam-message" class="small-note" role="status" aria-live="polite"></p><section class="hand-controls" hidden><p class="gesture-guide"><strong>Browse with your hand</strong><br>Open palm: swipe left / right.<br>Pinch thumb + index for half a second to select.</p><p id="hand-status" class="small-note" role="status" aria-live="polite"></p><button id="toggle-hands" class="secondary-button">Pause hand controls</button><p class="small-note">Hand tracking stays on this device. Selecting pauses gestures so you can frame and capture your photo.</p></section><p class="small-note webcam-guidance">A front view can show shoulder straps. A rear or three-quarter photo gives the best view of the backpack.</p><button class="secondary-button" id="demo-photo">Use the video frame</button><p class="small-note">JPEG, PNG or WebP · up to 2 MB<br>Your photo is sent to the image model only when you generate.</p><div class="setup-note" id="setup-note">Live try-on is ready to connect.<br><span>Add <code>AI_GATEWAY_API_KEY</code> and a private <code>TRY_ON_ACCESS_TOKEN</code> to the server environment to enable generation.</span></div><label class="token-field" hidden>Demo access token<input type="password" id="access-token" autocomplete="off" placeholder="Private demo token"></label><button id="generate-tryon" class="primary-button">Generate my try-on <span>✧</span></button><p id="tryon-message" class="small-note" role="status" aria-live="polite"></p></div></div></dialog>`;
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const query = get<HTMLTextAreaElement>('#search-query'); query.value = DEFAULT_QUERY;
  const rail = get<HTMLDivElement>('.product-rail');
  const dialog = get<HTMLDialogElement>('.tryon-dialog');
  const voice = get<HTMLButtonElement>('#voice-button');
  let recognition: Recognition | null = null;
  let mounted = true;
  let lastProducts: Product[] | null = null;
  let lastSelected: string | null = null;
  let lastBefore: string | null = null;
  let lastAfter: string | null = null;
  let lastProductImage: string | null = null;
  let photoVersion = 0;
  let webcamState: WebcamState = { phase: 'idle', message: '' };
  let webcamPhoto = false;
  const video = get<HTMLVideoElement>('#webcam-preview');
  let handStatus: HandTrackingStatus = { phase: 'stopped', message: '' };
  let gestureSelection: string | null = null;
  const hands = new HandTracking(video, action => {
    const state = store.getState();
    if (!dialog.open || state.status !== 'ready' || webcamState.phase !== 'ready') return;
    if (action === 'select') confirmBackpack();
    else { gestureSelection = null; store.move(action === 'next' ? 1 : -1); }
  }, status => { handStatus = status; if (mounted) renderHands(); });
  const webcam = new WebcamCapture(video, state => {
    webcamState = state;
    if (state.phase !== 'ready' && state.phase !== 'requesting') hands.stop();
    if (mounted) render(store.getState());
  });
  const stopWebcam = () => { photoVersion++; hands.stop(); webcam.stop(); };
  function confirmBackpack() {
    const state = store.getState();
    if (!state.selectedId || state.status !== 'ready') return;
    gestureSelection = state.selectedId;
    hands.stop();
    render(state);
  }
  function renderHands() {
    const running = ['loading', 'ready', 'tracking'].includes(handStatus.phase);
    get('.hand-controls').hidden = webcamState.phase !== 'ready';
    get('#hand-status').textContent = handStatus.message;
    get<HTMLButtonElement>('#toggle-hands').textContent = running ? 'Pause hand controls' : 'Resume hand controls';
    const confirmed = gestureSelection !== null && gestureSelection === store.getState().selectedId;
    get('#gesture-selection').textContent = confirmed ? 'Selected. Frame your photo, then capture.'
      : webcamState.phase === 'ready' && running ? 'Swipe to explore. Pinch to select this backpack.'
      : 'Use arrows to browse. Enable webcam hand controls to swipe and pinch.';
  }
  async function startWebcam() {
    photoVersion++;
    gestureSelection = null;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      webcamState = { phase: 'error', message: !window.isSecureContext ? 'Camera access needs HTTPS or localhost. Open the secure app URL or upload a photo.' : 'Camera capture is unavailable in this browser. Upload a photo instead.' };
      render(store.getState()); return;
    }
    await webcam.start();
    if (mounted && dialog.open && webcamState.phase === 'ready') void hands.start();
  }
  const openPhoto = () => { if (!dialog.open) dialog.showModal(); };
  get<HTMLButtonElement>('#enter-vr').onclick = () => { stopWebcam(); actions.enterVR(); };
  get<HTMLFormElement>('.search-form').onsubmit = event => { event.preventDefault(); void store.search(query.value); };
  query.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void store.search(query.value); } };
  get<HTMLButtonElement>('#previous-product').onclick = () => store.move(-1);
  get<HTMLButtonElement>('#next-product').onclick = () => store.move(1);
  rail.onkeydown = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); store.move(event.key === 'ArrowLeft' ? -1 : 1); } };
  get<HTMLButtonElement>('#open-tryon').onclick = openPhoto;
  get<HTMLButtonElement>('#close-tryon').onclick = () => dialog.close();
  dialog.onclose = stopWebcam;
  dialog.oncancel = stopWebcam;
  dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
  window.addEventListener('trail:photo', openPhoto);
  window.addEventListener('trail:xr-enter', stopWebcam);
  const onVisibilityChange = () => { if (document.hidden) stopWebcam(); };
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', stopWebcam);
  get<HTMLButtonElement>('#use-webcam').onclick = () => { void startWebcam(); };
  get<HTMLButtonElement>('#webcam-mode').onclick = () => { openPhoto(); void startWebcam(); };
  get<HTMLButtonElement>('#webcam-previous').onclick = () => { gestureSelection = null; store.move(-1); };
  get<HTMLButtonElement>('#webcam-next').onclick = () => { gestureSelection = null; store.move(1); };
  get<HTMLButtonElement>('#confirm-backpack').onclick = confirmBackpack;
  get<HTMLButtonElement>('#toggle-hands').onclick = () => {
    if (['loading', 'ready', 'tracking'].includes(handStatus.phase)) hands.stop();
    else if (webcamState.phase === 'ready') { gestureSelection = null; render(store.getState()); void hands.start(); }
  };
  get<HTMLButtonElement>('#stop-webcam').onclick = stopWebcam;
  get<HTMLButtonElement>('#capture-photo').onclick = async () => {
    const photo = await webcam.capture();
    if (photo && mounted && dialog.open) { webcamPhoto = true; store.setPhoto(photo); }
  };
  get<HTMLInputElement>('#access-token').oninput = event => store.setAccessToken((event.target as HTMLInputElement).value);
  get<HTMLButtonElement>('#generate-tryon').onclick = () => { void store.generateTryOn(get<HTMLInputElement>('#access-token').value || undefined); };
  const readPhoto = (file: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Photo could not be read.')); reader.readAsDataURL(file);
  });
  get<HTMLInputElement>('#person-upload').onchange = async event => {
    stopWebcam();
    const version = photoVersion;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { get('#tryon-message').textContent = 'Choose a JPEG, PNG or WebP photo smaller than 2 MB.'; return; }
    try { const photo = await readPhoto(file); if (mounted && version === photoVersion) { webcamPhoto = false; store.setPhoto(photo); } } catch { if (mounted) get('#tryon-message').textContent = 'Photo could not be read. Try another image.'; }
  };
  get<HTMLInputElement>('#person-upload').onclick = stopWebcam;
  get<HTMLButtonElement>('#demo-photo').onclick = async () => {
    stopWebcam();
    const version = photoVersion;
    try { const response = await fetch('/demo/person.png'); if (!response.ok) throw new Error(); const photo = await readPhoto(await response.blob()); if (mounted && version === photoVersion) { webcamPhoto = false; store.setPhoto(photo); } }
    catch { if (mounted && version === photoVersion) get('#tryon-message').textContent = 'The demo photo could not be loaded. Please upload a photo.'; }
  };
  const Speech = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
  if (Speech) {
    recognition = new Speech(); recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = event => { const transcript = event.results[event.results.length - 1][0].transcript; query.value = transcript; get('#voice-message').textContent = `Heard: “${transcript}”`; void store.search(transcript); };
    recognition.onerror = event => { get('#voice-message').textContent = event.error === 'not-allowed' ? 'Microphone access was declined. You can type your search.' : 'Voice could not finish. Try again or type your search.'; };
    recognition.onend = () => { voice.classList.remove('listening'); voice.setAttribute('aria-pressed', 'false'); };
    voice.onclick = () => { if (voice.classList.contains('listening')) { recognition?.stop(); return; } try { recognition?.start(); voice.classList.add('listening'); voice.setAttribute('aria-pressed', 'true'); get('#voice-message').textContent = 'Listening… Tell us about your backpack.'; } catch { get('#voice-message').textContent = 'Voice is busy. Try again in a moment.'; } };
  } else {
    voice.disabled = true; voice.title = 'Voice is unavailable in this browser. Type your request instead.';
    get('#voice-message').textContent = 'Voice is unavailable in this browser. Type your request above.';
  }
  function card(product: Product) {
    const button = node('button', 'product-card'); button.type = 'button'; button.dataset.productId = product.id;
    const imageWrap = node('div', 'product-image');
    const img = node('img', ''); img.src = product.imageUrl; img.alt = product.title; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.onerror = () => { imageWrap.replaceChildren(node('span', 'image-missing', 'Preview unavailable')); };
    imageWrap.append(img);
    const text = node('div', 'product-info'); text.append(node('span', 'product-seller', product.seller), node('h3', '', product.title));
    const bottom = node('div', 'product-bottom'); bottom.append(node('strong', '', formatPrice(product.price)), node('span', 'product-select', 'View pack ↗')); text.append(bottom);
    button.append(imageWrap, text); button.onclick = () => store.select(product.id); return button;
  }
  function render(state: StoreState) {
    const selected = state.products.find(product => product.id === state.selectedId);
    root.classList.toggle('has-products', state.products.length > 0);
    get('#search-status').textContent = state.message;
    get('#search-status').classList.toggle('error', state.status === 'error');
    get<HTMLButtonElement>('#search-button').disabled = state.status === 'searching';
    get('#search-button span').textContent = state.status === 'searching' ? 'Finding your next adventure…' : 'Find my backpack';
    get('.selected-detail').hidden = !selected;
    get('.scene-caption').classList.toggle('has-results', state.products.length > 0);
    get('#result-count').textContent = state.status === 'searching' ? 'Searching Shopify…' : state.status === 'ready' ? `${state.products.length} ${state.products.length === 1 ? 'pack' : 'packs'} to explore` : 'Ready when you are';
    get<HTMLButtonElement>('#previous-product').disabled = state.products.length < 2;
    get<HTMLButtonElement>('#next-product').disabled = state.products.length < 2;
    if (lastProducts !== state.products) {
      get('.discovery-panel').scrollTop = 0;
      rail.replaceChildren(...state.products.map(card));
      if (!state.products.length) {
        const empty = node('div', 'empty-rail');
        empty.append(node('span', 'empty-mark', state.status === 'searching' ? '↗' : '✳'), node('div', '', state.status === 'searching' ? 'Checking prices, availability and camping details…' : state.status === 'ready' ? 'No matching packs this time. Try a different camping request.' : 'Real packs. Real prices. Your search brings them into view.'));
        rail.append(empty);
      }
      lastProducts = state.products;
    }
    rail.querySelectorAll<HTMLButtonElement>('.product-card').forEach(button => {
      const active = button.dataset.productId === state.selectedId; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
      if (active && lastSelected !== state.selectedId) { const target = button.offsetLeft - rail.offsetLeft - (rail.clientWidth - button.offsetWidth) / 2; rail.scrollTo({ left: target, behavior: 'smooth' }); }
    });
    lastSelected = state.selectedId;
    if (selected) {
      get('#selected-title').textContent = selected.title; get('#selected-price').textContent = formatPrice(selected.price); get('#selected-seller').textContent = selected.seller;
      get('#selected-description').textContent = selected.description;
      get<HTMLAnchorElement>('#shop-link').href = selected.url;
      get('#tryon-product').textContent = selected.title; get('#tryon-price').textContent = `${formatPrice(selected.price)} · ${selected.seller}`;
    }
    get<HTMLButtonElement>('#webcam-mode').disabled = !selected;
    get('.webcam-browser').hidden = !selected;
    get<HTMLButtonElement>('#webcam-previous').disabled = state.products.length < 2;
    get<HTMLButtonElement>('#webcam-next').disabled = state.products.length < 2;
    if (selected) {
      const productImage = get<HTMLImageElement>('#webcam-product-image');
      if (lastProductImage !== selected.imageUrl) { productImage.src = selected.imageUrl; lastProductImage = selected.imageUrl; }
      productImage.alt = selected.title;
      get('#webcam-product-position').textContent = `${state.products.findIndex(p => p.id === selected.id) + 1} / ${state.products.length} · ${selected.title} · ${formatPrice(selected.price)}`;
      const confirmed = gestureSelection === selected.id;
      get<HTMLButtonElement>('#confirm-backpack').disabled = confirmed;
      get<HTMLButtonElement>('#confirm-backpack').textContent = confirmed ? 'Backpack selected ✓' : 'Select this backpack';
    }
    get('#setup-note').hidden = state.tryOnEnabled;
    get('.token-field').hidden = !state.accessTokenRequired;
    const cameraActive = webcamState.phase === 'requesting' || webcamState.phase === 'ready';
    const cameraBusy = cameraActive || webcamState.phase === 'capturing';
    video.hidden = !cameraActive;
    get('.webcam-controls').hidden = !cameraActive;
    get<HTMLButtonElement>('#capture-photo').disabled = webcamState.phase !== 'ready';
    const useWebcam = get<HTMLButtonElement>('#use-webcam');
    useWebcam.hidden = cameraActive;
    useWebcam.disabled = webcamState.phase === 'capturing';
    useWebcam.textContent = webcamPhoto ? 'Retake webcam photo' : 'Use webcam';
    get('#webcam-message').textContent = webcamState.message;
    const generate = get<HTMLButtonElement>('#generate-tryon');
    generate.disabled = cameraBusy || !selected || !state.photoDataUrl || !state.tryOnEnabled || state.tryOnStatus === 'generating';
    generate.firstChild!.textContent = state.tryOnStatus === 'generating' ? 'Creating your preview… ' : 'Generate my try-on ';
    get('#tryon-message').textContent = state.tryOnMessage;
    const before = get<HTMLImageElement>('#before-image');
    const after = get<HTMLImageElement>('#after-image');
    if (state.photoDataUrl !== lastBefore) { if (state.photoDataUrl) before.src = state.photoDataUrl; else before.removeAttribute('src'); lastBefore = state.photoDataUrl; }
    if (state.tryOnImage !== lastAfter) { if (state.tryOnImage) after.src = state.tryOnImage; else after.removeAttribute('src'); lastAfter = state.tryOnImage; }
    get('.person-preview').hidden = !cameraActive && !!state.photoDataUrl;
    get('.photo-placeholder').hidden = cameraActive;
    get('.preview-label').hidden = !cameraActive;
    get('.photo-comparison').hidden = cameraActive || !state.photoDataUrl;
    after.hidden = !state.tryOnImage;
    get('#after-placeholder').hidden = !!state.tryOnImage;
    get('#after-placeholder').textContent = state.tryOnStatus === 'generating' ? 'Creating your backpack preview…' : state.tryOnStatus === 'error' ? 'Preview unavailable. Try generating again.' : 'Generate your try-on to compare.';
    after.parentElement!.classList.toggle('generating', state.tryOnStatus === 'generating');
    renderHands();
  }
  const unsubscribe = store.subscribe(render);
  void store.configure();
  return () => { mounted = false; stopWebcam(); unsubscribe(); if (recognition) { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.stop(); } window.removeEventListener('trail:photo', openPhoto); window.removeEventListener('trail:xr-enter', stopWebcam); window.removeEventListener('pagehide', stopWebcam); document.removeEventListener('visibilitychange', onVisibilityChange); root.replaceChildren(); };
}
