import { DEFAULT_QUERY, formatPrice, type Product } from './contracts.js';
import { store, type StoreState } from './store.js';
import { WebcamCapture, type WebcamState } from './webcam.js';
import { HandTracking, type HandTrackingStatus } from './hand-tracking.js';
import { parseToolCommand, runToolPlan, type ToolEvent } from './assistant-tools.js';
import { EventType } from '@ag-ui/core';
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
    <header class="trail-header"><a href="#" class="trail-brand" aria-label="Trail home">${icons.mountain}<span>trail<span class="brand-dot">.</span></span></a><span class="header-caption">Your picks</span><button class="vr-button" id="webcam-mode" disabled>Webcam mode</button><button class="vr-button" id="enter-vr">${icons.vr}<span>Enter VR</span></button></header>
    <main class="trail-workspace"><section class="discovery-panel" aria-label="Find your backpack">
      <h1>What are you looking for?</h1>
      <form class="search-form"><label for="search-query" class="visually-hidden">Ask Trail</label><div class="search-field"><textarea id="search-query" rows="2" maxlength="500" spellcheck="false" placeholder="Find a camping backpack under $150…"></textarea><button type="button" id="voice-button" class="icon-button" aria-label="Search by voice">${icons.mic}</button></div><button type="submit" class="primary-button" id="search-button"><span>Search</span>${icons.arrow}</button></form>
      <p id="voice-message" class="small-note"></p>
      <div class="search-status" id="search-status" role="status" aria-live="polite"></div>

      <p id="assistant-message" class="small-note" role="status" aria-live="polite"></p><ol class="tool-progress" aria-label="Assistant actions" hidden></ol>
    </section></main>
    <section class="product-dock" aria-label="Backpack results"><div class="dock-top"><div><span class="eyebrow">FOUND FOR YOU</span><span id="result-count">Ready when you are</span></div><div class="carousel-controls"><span>Browse picks</span><button id="previous-product" class="icon-button" aria-label="Previous backpack">←</button><button id="next-product" class="icon-button" aria-label="Next backpack">→</button></div></div><div class="results-layout"><div class="product-rail" tabindex="0" aria-label="Backpack cards"></div><section class="selected-detail" hidden><div class="eyebrow">YOUR PICK</div><h2 id="selected-title"></h2><p class="selected-meta"><span id="selected-price"></span><span id="selected-seller"></span></p><p id="selected-description"></p><div class="selected-actions"><button id="open-tryon" class="primary-button">Try it on <span>↗</span></button><a id="shop-link" class="text-link" target="_blank" rel="noopener noreferrer">View at store ↗</a></div></section></div></section>

    <dialog class="tryon-dialog"><div class="dialog-heading"><div><div class="eyebrow">YOUR TRY-ON</div><h2>See it on you.</h2></div><button class="icon-button" id="close-tryon" aria-label="Close try-on">×</button></div><div class="tryon-body"><div class="tryon-visuals"><div class="person-preview"><video id="webcam-preview" autoplay muted playsinline aria-label="Live webcam preview" hidden></video><div class="photo-placeholder">${icons.mountain}<span>Your adventure.<br>Your perspective.</span><p>Add a rear or three-quarter view photo<br>to see the backpack on you.</p></div><span class="preview-label">LIVE CAMERA · MIRRORED PREVIEW</span><section class="webcam-ar" aria-label="AR shopping space" hidden><div class="ar-heading"><span class="ar-live-dot"></span><span>YOUR SPACE. YOUR PICKS.</span><span id="ar-result-position"></span></div><div class="webcam-ar-products" aria-label="Floating backpack cards"></div><div class="ar-toolbar"><button type="button" id="ar-previous" class="icon-button" aria-label="Previous AR backpack">←</button><div><p id="ar-gesture-hint" role="status">Swipe to browse · Pinch to select</p><button type="button" id="ar-confirm-backpack">Select this backpack</button></div><button type="button" id="ar-next" class="icon-button" aria-label="Next AR backpack">→</button></div></section><span id="capture-countdown" hidden></span></div><section class="photo-comparison" aria-label="Before and after try-on" hidden><figure><figcaption>BEFORE <span>Your original photo</span></figcaption><div class="comparison-image"><img id="before-image" alt="Before: your original captured photo"></div></figure><figure><figcaption>AFTER <span>AI backpack preview</span></figcaption><div class="comparison-image"><img id="after-image" alt="After: the selected backpack on your photo" hidden><p id="after-placeholder">Generate your try-on to compare.</p></div></figure></section><div class="webcam-browser" aria-label="Browse backpacks with gestures"><div class="webcam-product"><button class="icon-button" id="webcam-previous" aria-label="Previous webcam backpack">←</button><img id="webcam-product-image" alt=""><button class="icon-button" id="webcam-next" aria-label="Next webcam backpack">→</button></div><p id="webcam-product-position"></p><p id="gesture-selection" role="status"></p><button class="secondary-button" id="confirm-backpack">Select this backpack</button></div></div><div class="tryon-options"><form id="dialog-command-form" class="action-composer"><label for="dialog-command">Ask for the next step</label><div class="action-input"><input id="dialog-command" maxlength="250" placeholder="Take a picture and try it on"><button type="button" id="dialog-voice" class="icon-button" aria-label="Speak a camera or try-on command">${icons.mic}</button><button type="submit" class="icon-button" aria-label="Run command">${icons.arrow}</button></div></form><p id="dialog-voice-message" class="small-note" role="status"></p><p id="dialog-assistant-message" class="small-note" role="status" aria-live="polite"></p><ol class="tool-progress" aria-label="Assistant actions" hidden></ol><button id="cancel-tools" class="secondary-button" hidden>Cancel action</button><div class="eyebrow">SELECTED BACKPACK</div><h3 id="tryon-product"></h3><p id="tryon-price"></p><label class="upload-button" for="person-upload">Upload your photo <span>↑</span></label><input id="person-upload" type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden"><button class="secondary-button" id="use-webcam">Use webcam</button><div class="webcam-controls" hidden><button class="primary-button" id="capture-photo" disabled>Capture photo</button><button class="secondary-button" id="stop-webcam">Stop camera</button></div><p id="webcam-message" class="small-note" role="status" aria-live="polite"></p><section class="hand-controls" hidden><p class="gesture-guide"><strong>Browse with your hand</strong><br>Open palm: swipe left / right.<br>Pinch thumb + index for half a second to select.</p><p id="hand-status" class="small-note" role="status" aria-live="polite"></p><button id="toggle-hands" class="secondary-button">Pause hand controls</button><p class="small-note">Hand tracking stays on this device. Selecting pauses gestures so you can frame and capture your photo.</p></section><p class="small-note webcam-guidance">A front view can show shoulder straps. A rear or three-quarter photo gives the best view of the backpack.</p><button class="secondary-button" id="demo-photo">Use the video frame</button><p class="small-note">JPEG, PNG or WebP · up to 2 MB<br>Your photo is sent to the image model only when you generate.</p><div class="setup-note" id="setup-note">Live try-on is ready to connect.<br><span>Add <code>AI_GATEWAY_API_KEY</code> and a private <code>TRY_ON_ACCESS_TOKEN</code> to the server environment to enable generation.</span></div><label class="token-field" hidden>Demo access token<input type="password" id="access-token" autocomplete="off" placeholder="Private demo token"></label><button id="generate-tryon" class="primary-button">Generate my try-on <span>✧</span></button><p id="tryon-message" class="small-note" role="status" aria-live="polite"></p></div></div></dialog>`;
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const query = get<HTMLTextAreaElement>('#search-query'); query.value = ''; query.placeholder = DEFAULT_QUERY;
  const rail = get<HTMLDivElement>('.product-rail');
  const dialog = get<HTMLDialogElement>('.tryon-dialog');
  const voice = get<HTMLButtonElement>('#voice-button');
  let recognition: Recognition | null = null;
  let recorder: MediaRecorder | null = null;
  let micStream: MediaStream | null = null;
  let micTimer: ReturnType<typeof setTimeout> | null = null;
  let voiceVersion = 0;
  let speechVersion = 0;
  let mounted = true;
  let lastProducts: Product[] | null = null;
  let lastSelected: string | null = null;
  let lastBefore: string | null = null;
  let lastAfter: string | null = null;
  let lastProductImage: string | null = null;
  let arProducts: Product[] | null = null;
  let arSelected: string | null = null;
  let photoVersion = 0;
  let webcamState: WebcamState = { phase: 'idle', message: '' };
  let webcamPhoto = false;
  const video = get<HTMLVideoElement>('#webcam-preview');
  let handStatus: HandTrackingStatus = { phase: 'stopped', message: '' };
  let gestureSelection: string | null = null;
  let activeTools: AbortController | null = null;
  let toolProductId: string | null = null;
  const toolRows = new Map<string, { label: string; status: string }>();
  function assistantMessage(message: string) {
    get('#assistant-message').textContent = message;
    get('#dialog-assistant-message').textContent = message;
  }
  function renderToolEvent(event: ToolEvent) {
    if (event.type === EventType.RUN_STARTED) toolRows.clear();
    if (event.type === EventType.TOOL_CALL_START) {
      const labels: Record<string, string> = { take_picture: 'Take picture', generate_try_on: 'Generate try-on', show_try_on: 'Show before & after' };
      toolRows.set(event.toolCallId, { label: labels[event.toolCallName] ?? event.toolCallName, status: 'running' });
    }
    if (event.type === EventType.TOOL_CALL_RESULT) {
      const row = toolRows.get(event.toolCallId); if (row) row.status = 'done';
    }
    if (event.type === EventType.RUN_ERROR) for (const row of toolRows.values()) if (row.status === 'running') row.status = 'error';
    root.querySelectorAll<HTMLOListElement>('.tool-progress').forEach(list => {
      list.hidden = !toolRows.size;
      list.replaceChildren(...[...toolRows.values()].map(row => {
        const item = node('li', '', `${row.status === 'done' ? '✓ ' : row.status === 'running' ? '◌ ' : '× '}${row.label}`);
        item.dataset.status = row.status; return item;
      }));
    });
  }
  function cancelTools() {
    if (!activeTools) return;
    const controller = activeTools; activeTools = null;
    controller.abort();
    store.cancelTryOn();
    get('#capture-countdown').hidden = true;
    get('#cancel-tools').hidden = true;
    assistantMessage('Action cancelled.');
  }
  function pause(milliseconds: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  async function dispatchPrompt(text: string) {
    if (!text.trim()) return;
    if (/^(?:please )?(?:stop|cancel)(?: (?:action|camera|that|it))?[.!]?$/i.test(text.trim())) { stopWebcam(); return; }
    const plan = parseToolCommand(text);
    if (!plan) {
      stopWebcam(); assistantMessage('');
      if (dialog.open) dialog.close();
      query.value = text; await store.search(text); return;
    }
    if (activeTools) { assistantMessage('An action is already running. You can cancel it below.'); return; }
    const state = store.getState();
    if (!state.selectedId) { assistantMessage('Search for a backpack and select one first.'); return; }
    openPhoto();
    if (plan.includes('generate_try_on')) {
      if (!state.tryOnEnabled) { assistantMessage('Try-on is not configured yet. You can still take a picture.'); return; }
      if (state.accessTokenRequired && !get<HTMLInputElement>('#access-token').value.trim()) {
        assistantMessage('Enter the private demo access token, then repeat your command.'); get<HTMLInputElement>('#access-token').focus(); return;
      }
      if (!state.photoDataUrl && !plan.includes('take_picture')) plan.unshift('take_picture');
    }
    const controller = new AbortController(); activeTools = controller; toolProductId = state.selectedId;
    const signal = controller.signal;
    hands.stop();
    render(store.getState());
    get('#cancel-tools').hidden = false;
    try {
      await runToolPlan(plan, {
        take_picture: async () => {
          if (webcamState.phase !== 'ready') await startWebcam();
          signal.throwIfAborted();
          if (webcamState.phase !== 'ready') throw new Error('Camera unavailable');
          // Wait for a decoded frame, then visibly count down before capturing.
          for (let n = 0; video.readyState < 2 && n < 50; n++) await pause(100, signal);
          const countdown = get('#capture-countdown'); countdown.hidden = false;
          for (let n = 3; n > 0; n--) { countdown.textContent = String(n); await pause(1000, signal); }
          countdown.hidden = true;
          const photo = await webcam.capture(); signal.throwIfAborted();
          if (!photo) throw new Error('No photo captured');
          webcamPhoto = true; store.setPhoto(photo);
        },
        generate_try_on: async () => {
          hands.stop(); webcam.stop();
          await store.generateTryOn(get<HTMLInputElement>('#access-token').value);
          signal.throwIfAborted();
          if (store.getState().tryOnStatus !== 'ready') throw new Error('Generation failed');
        },
        show_try_on: async () => {
          signal.throwIfAborted();
          if (!store.getState().tryOnImage) throw new Error('No preview');
          openPhoto(); get('.photo-comparison').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        },
      }, step => { if (activeTools === controller) assistantMessage(step.message); }, signal,
      event => { if (activeTools === controller || (signal.aborted && !activeTools)) renderToolEvent(event); });
    } catch {
      if (activeTools === controller) assistantMessage(signal.aborted ? 'Action cancelled.' : 'The action could not finish. Check the camera or try-on message and try again.');
    } finally {
      if (activeTools === controller) {
        activeTools = null; hands.stop(); webcam.stop();
        get('#capture-countdown').hidden = true; get('#cancel-tools').hidden = true;
        render(store.getState());
      }
    }
  }
  const hands = new HandTracking(video, action => {
    const state = store.getState();
    if (activeTools || !dialog.open || state.status !== 'ready' || webcamState.phase !== 'ready') return;
    if (action === 'select') confirmBackpack();
    else { gestureSelection = null; store.move(action === 'next' ? 1 : -1); }
  }, status => { handStatus = status; if (mounted) renderHands(); });
  const webcam = new WebcamCapture(video, state => {
    webcamState = state;
    if (state.phase !== 'ready' && state.phase !== 'requesting') hands.stop();
    if (mounted) render(store.getState());
  });
  const stopWebcam = () => { cancelTools(); photoVersion++; hands.stop(); webcam.stop(); };
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
    if (mounted && !activeTools && dialog.open && webcamState.phase === 'ready') void hands.start();
  }
  const openPhoto = () => { if (!dialog.open) dialog.showModal(); };
  get<HTMLButtonElement>('#enter-vr').onclick = () => { stopWebcam(); cancelVoice(); actions.enterVR(); };
  get<HTMLFormElement>('.search-form').onsubmit = event => { event.preventDefault(); void dispatchPrompt(query.value); };
  query.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void dispatchPrompt(query.value); } };
  get<HTMLButtonElement>('#previous-product').onclick = () => store.move(-1);
  get<HTMLButtonElement>('#next-product').onclick = () => store.move(1);
  rail.onkeydown = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); store.move(event.key === 'ArrowLeft' ? -1 : 1); } };
  get<HTMLButtonElement>('#open-tryon').onclick = openPhoto;
  get<HTMLButtonElement>('#close-tryon').onclick = () => dialog.close();
  dialog.onclose = () => { stopWebcam(); cancelVoice(); };
  dialog.oncancel = () => { stopWebcam(); cancelVoice(); };
  dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
  window.addEventListener('trail:photo', openPhoto);
  const onXrEnter = () => { stopWebcam(); cancelVoice(); };
  window.addEventListener('trail:xr-enter', onXrEnter);
  const onVisibilityChange = () => { if (document.hidden) { stopWebcam(); cancelVoice(); } };
  const onPageHide = () => { stopWebcam(); cancelVoice(); };
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  get<HTMLButtonElement>('#use-webcam').onclick = () => { void startWebcam(); };
  get<HTMLButtonElement>('#webcam-mode').onclick = () => { openPhoto(); void startWebcam(); };
  get<HTMLButtonElement>('#webcam-previous').onclick = () => { gestureSelection = null; store.move(-1); };
  get<HTMLButtonElement>('#webcam-next').onclick = () => { gestureSelection = null; store.move(1); };
  get<HTMLButtonElement>('#confirm-backpack').onclick = confirmBackpack;
  get<HTMLButtonElement>('#ar-confirm-backpack').onclick = confirmBackpack;
  get<HTMLButtonElement>('#ar-previous').onclick = () => { gestureSelection = null; store.move(-1); };
  get<HTMLButtonElement>('#ar-next').onclick = () => { gestureSelection = null; store.move(1); };
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
  get<HTMLButtonElement>('#generate-tryon').onclick = () => { void dispatchPrompt('try it on'); };
  get<HTMLButtonElement>('#cancel-tools').onclick = stopWebcam;
  get<HTMLFormElement>('#dialog-command-form').onsubmit = event => { event.preventDefault(); void dispatchPrompt(get<HTMLInputElement>('#dialog-command').value); };
  get<HTMLButtonElement>('#dialog-voice').onclick = () => voice.click();
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
  const voiceMessage = { set textContent(message: string) { get('#voice-message').textContent = message; get('#dialog-voice-message').textContent = message; } };
  const setListening = (listening: boolean) => { get('#dialog-voice').classList.toggle('listening', listening); voice.classList.toggle('listening', listening); voice.setAttribute('aria-pressed', String(listening)); voice.setAttribute('aria-label', listening ? 'Stop recording' : 'Search by voice'); };
  const stopMicTracks = () => { micStream?.getTracks().forEach(track => track.stop()); micStream = null; if (micTimer) clearTimeout(micTimer); micTimer = null; };
  function cancelVoice() {
    voiceVersion++;
    if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); }
    recorder = null;
    recognition?.stop();
    stopMicTracks();
    setListening(false);
    if (mounted) voice.disabled = false;
  }
  async function startRecording() {
    const version = ++voiceVersion;
    voice.disabled = true;
    voiceMessage.textContent = 'Requesting microphone access…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted || version !== voiceVersion) { stream.getTracks().forEach(track => track.stop()); return; }
      micStream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const recording = recorder;
      const chunks: Blob[] = [];
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recording.onstop = async () => {
        stopMicTracks();
        setListening(false);
        if (!mounted || version !== voiceVersion) return;
        voice.disabled = true;
        voiceMessage.textContent = 'Transcribing your request…';
        try {
          const type = recording.mimeType || mimeType || 'audio/webm';
          const form = new FormData();
          form.append('audio', new File(chunks, type.includes('mp4') ? 'request.m4a' : 'request.webm', { type }));
          const response = await fetch('/api/transcribe', { method: 'POST', body: form });
          const result = await response.json();
          if (!response.ok || typeof result.text !== 'string') throw new Error(result.error || 'Transcription failed.');
          if (!mounted || version !== voiceVersion) return;
          query.value = result.text;
          voiceMessage.textContent = `Heard: “${result.text}”`;
          void dispatchPrompt(result.text);
        } catch (error) {
          if (mounted && version === voiceVersion) voiceMessage.textContent = error instanceof Error ? error.message : 'Transcription failed. Type your request instead.';
        } finally {
          if (mounted && version === voiceVersion) voice.disabled = false;
        }
      };
      recording.start();
      voice.disabled = false;
      setListening(true);
      voiceMessage.textContent = 'Recording… press the mic again when you finish.';
      micTimer = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 10000);
    } catch {
      stopMicTracks();
      setListening(false);
      if (mounted && version === voiceVersion) { voice.disabled = false; voiceMessage.textContent = 'Microphone access was declined or recording failed. Type your request instead.'; }
    }
  }
  const Speech = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
  if (Speech) {
    recognition = new Speech(); recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = event => { if (!mounted || speechVersion !== voiceVersion || document.hidden) return; const transcript = event.results[event.results.length - 1][0].transcript; query.value = transcript; voiceMessage.textContent = `Heard: “${transcript}”`; void dispatchPrompt(transcript); };
    recognition.onerror = event => { voiceMessage.textContent = event.error === 'not-allowed' ? 'Microphone access was declined. You can type your search.' : 'Voice could not finish. Try again or type your search.'; };
    recognition.onend = () => setListening(false);
  }
  voice.onclick = () => {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    if (typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof window.MediaRecorder === 'function') { void startRecording(); return; }
    if (recognition) {
      if (voice.classList.contains('listening')) { recognition.stop(); return; }
      try { speechVersion = ++voiceVersion; recognition.start(); setListening(true); voiceMessage.textContent = 'Listening… Tell us about your backpack.'; }
      catch { voiceMessage.textContent = 'Voice is busy. Try again in a moment.'; }
      return;
    }
    voiceMessage.textContent = 'Voice is unavailable in this browser. Type your request above.';
  };
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
  function renderAr(state: StoreState) {
    const live = webcamState.phase === 'ready' && !!state.products.length;
    get('.webcam-ar').hidden = !live;
    get('.webcam-ar-products').hidden = !live;
    dialog.classList.toggle('camera-live', webcamState.phase === 'ready' || webcamState.phase === 'requesting');
    if (!live) return;
    const selectedIndex = state.products.findIndex(product => product.id === state.selectedId);
    get('#ar-result-position').textContent = `${selectedIndex + 1} / ${state.products.length}`;
    const confirmed = gestureSelection === state.selectedId;
    get('#ar-gesture-hint').textContent = activeTools ? 'Frame your shoulders and torso for the photo.'
      : confirmed ? 'Selected. Say “take a picture and try it on.”' : 'Swipe to browse · Pinch to select';
    const confirm = get<HTMLButtonElement>('#ar-confirm-backpack');
    confirm.textContent = confirmed ? 'Selected ✓' : 'Select this backpack';
    confirm.disabled = !!activeTools || confirmed;
    for (const selector of ['#ar-previous', '#ar-next']) get<HTMLButtonElement>(selector).disabled = !!activeTools || state.products.length < 2;
    if (arProducts !== state.products || arSelected !== state.selectedId) {
      const offsets = state.products.length === 1 ? [0] : state.products.length === 2 ? [0, 1] : [-1, 0, 1];
      const cards = offsets.map(offset => {
        const product = state.products[(selectedIndex + offset + state.products.length) % state.products.length];
        const button = node('button', 'ar-product-card'); button.type = 'button';
        button.dataset.productId = product.id; button.dataset.position = String(offset);
        button.classList.toggle('selected', offset === 0); button.setAttribute('aria-pressed', String(offset === 0));
        const seller = node('span', 'ar-seller', product.seller);
        const image = node('img', ''); image.src = product.imageUrl; image.alt = product.title; image.referrerPolicy = 'no-referrer';
        const title = node('span', 'ar-product-title', product.title);
        const price = node('strong', '', formatPrice(product.price));
        const selected = node('span', 'ar-card-action', offset === 0 ? 'In focus' : 'View backpack ↗');
        const footer = node('span', 'ar-card-footer'); footer.append(price, selected);
        button.append(seller, image, title, footer);
        button.onclick = () => { if (activeTools) return; gestureSelection = null; store.select(product.id); if (offset === 0) confirmBackpack(); };
        return button;
      });
      get('.webcam-ar-products').replaceChildren(...cards); arProducts = state.products; arSelected = state.selectedId;
    }
    get('.webcam-ar-products').querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = !!activeTools; });
  }
  function render(state: StoreState) {
    if (activeTools && state.selectedId !== toolProductId) { stopWebcam(); return; }
    const selected = state.products.find(product => product.id === state.selectedId);
    root.classList.toggle('has-products', state.products.length > 0);
    const hasProducts = state.products.length > 0;
    get('.trail-header').hidden = !hasProducts;
    get('.product-dock').hidden = !hasProducts;
    get('#search-status').textContent = state.status === 'idle' ? '' : state.message;
    get('#search-status').classList.toggle('error', state.status === 'error');
    get<HTMLButtonElement>('#search-button').disabled = state.status === 'searching';
    get('#search-button span').textContent = state.status === 'searching' ? 'Searching…' : 'Search';
    get('.selected-detail').hidden = !selected;
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
      button.disabled = !!activeTools;
      const active = button.dataset.productId === state.selectedId; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
      if (active && lastSelected !== state.selectedId && state.products === lastProducts) button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
    lastSelected = state.selectedId;
    if (selected) {
      get('#selected-title').textContent = selected.title; get('#selected-price').textContent = formatPrice(selected.price); get('#selected-seller').textContent = selected.seller;
      get('#selected-description').textContent = selected.description;
      get<HTMLAnchorElement>('#shop-link').href = selected.url;
      get('#tryon-product').textContent = selected.title; get('#tryon-price').textContent = `${formatPrice(selected.price)} · ${selected.seller}`;
    }
    get<HTMLButtonElement>('#webcam-mode').disabled = !selected;
    get('.webcam-browser').hidden = !selected || webcamState.phase === 'ready' || webcamState.phase === 'requesting';
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
    useWebcam.disabled = !!activeTools || webcamState.phase === 'capturing';
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
    renderAr(state);
    if (activeTools) {
      root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.product-card, #previous-product, #next-product, #webcam-previous, #webcam-next, #confirm-backpack, #capture-photo, #generate-tryon, #toggle-hands').forEach(button => { button.disabled = true; });
    }
    for (const selector of ['#person-upload', '#demo-photo']) get<HTMLInputElement>(selector).disabled = !!activeTools;
    get<HTMLButtonElement>('#toggle-hands').disabled = !!activeTools;
  }
  const unsubscribe = store.subscribe(render);
  void store.configure();
  return () => { mounted = false; stopWebcam(); cancelVoice(); unsubscribe(); if (recognition) { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; } window.removeEventListener('trail:photo', openPhoto); window.removeEventListener('trail:xr-enter', onXrEnter); window.removeEventListener('pagehide', onPageHide); document.removeEventListener('visibilitychange', onVisibilityChange); root.replaceChildren(); };
}
