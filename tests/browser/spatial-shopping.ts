// Exercises real UIKitML handlers, IWSDK scene objects and shipped GLBs. API calls are fixtures.
import { World, VisibilityState, UIKitMLAsset, Box3, Vector3, Matrix4, Euler, MathUtils, type Object3D, Quaternion, Hovered } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ShoppingSystem } from '../../src/shopping.js';
import { ModelPlacementSystem } from '../../src/model-placement.js';
import { mountDesktop } from '../../src/desktop.js';
import { enterImmersive } from '../../src/xr-session.js';
import { SessionMode } from '@iwsdk/core';
import { PREPARED_VARIANT_ID, type Product } from '../../src/contracts.js';
import { store } from '../../src/store.js';
const products: Product[] = [PREPARED_VARIANT_ID, 'fixture-two', 'fixture-three'].map((id, i) => ({ id, title: i ? `Camping pack ${i + 1}` : 'Stealth Angel 30L Backpack / saved demo', price: 5995 + i * 1000, currency: 'USD', description: 'Fixture inventory', seller: 'Demo fixture', imageUrl: '/ui/placeholder.svg', url: 'https://example.com/backpack', previewMode: 'backpack' }));
const calls: string[] = [];
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith('/api/')) return originalFetch(input, init);
  calls.push(url);
  if (url === '/api/config') return Response.json({ modelEnabled: true, tryOnEnabled: false, transcriptionEnabled: false });
  if (url === '/api/search') return Response.json({ products, query: JSON.parse(String(init?.body)).query, message: 'Fixture products' });
  if (url === '/api/model') return Response.json({ status: 'ready', productId: PREPARED_VARIANT_ID, modelUrl: '/demo/rich-with-backpack.glb' });
  throw new Error(`Unexpected API: ${url}`);
};
// No microphone access: this fixture drives the same voice result callback as speech recognition.
let spokenRequest = 'Find me a camping backpack under 150 US dollars';
class FixtureSpeech extends EventTarget {
  lang = ''; interimResults = false; continuous = false;
  onresult: ((event: { results: { 0: { transcript: string } }[] }) => void) | null = null;
  onerror = null; onend: (() => void) | null = null;
  start() { queueMicrotask(() => { this.onresult?.({ results: [{ 0: { transcript: spokenRequest } }] }); this.onend?.(); }); }
  stop() { this.onend?.(); }
}
Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FixtureSpeech });
const output = document.querySelector<HTMLElement>('#test-results')!;
const run = document.querySelector<HTMLButtonElement>('#run-spatial')!;
const waitFor = async (condition: () => boolean, message: string) => {
  const limit = performance.now() + 20000;
  while (!condition()) { if (performance.now() > limit) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 50)); }
};
World.create(document.querySelector<HTMLDivElement>('#scene-container')!, projectOptions).then(world => {
  world.registerSystem(ShoppingSystem); world.registerSystem(ModelPlacementSystem);
  mountDesktop(document.querySelector<HTMLElement>('#desktop')!, {
    enterAR: () => enterImmersive(world, SessionMode.ImmersiveAR),
    enterVR: () => enterImmersive(world, SessionMode.ImmersiveVR),
    exitVR: async () => { await world.session?.end(); },
  });
  world.visibilityState.subscribe(value => {
    const active = value !== VisibilityState.NonImmersive;
    document.body.classList.toggle('xr-active', active);
    world.requireSceneObject('landscape').visible = !active || world.session?.environmentBlendMode === 'opaque';
    run.disabled = !active;
  });
  const panel = (id: string) => world.requireSceneObject<UIKitMLAsset>(id);
  const click = (id: string, element: string) => {
    const handler = panel(id).requireElementById(element).handlers.peek().onClick;
    if (!handler) throw new Error(`Missing handler ${id}/${element}`);
    handler({} as Parameters<NonNullable<typeof handler>>[0]);
  };
  const body = () => world.scene.getObjectByName('Rich / saved demo body');
  const model = () => world.scene.getObjectByName('Rich with selected Shopify backpack');
  const height = (object: Object3D) => { const b = new Box3().setFromObject(object); return b.max.y - b.min.y; };
  let nextTarget: [string, string] = ['shopping-controls', 'voice'];
  document.querySelector<HTMLButtonElement>('#inspect-target')!.onclick = () => {
    const target = panel(nextTarget[0]).requireElementById(nextTarget[1]).getWorldPosition(new Vector3());
    const origin = world.player.raySpaces.right.getWorldPosition(new Vector3());
    const e = new Euler().setFromRotationMatrix(new Matrix4().lookAt(origin, target, new Vector3(0, 1, 0)));
    const ray = new Vector3(0, 0, -1).applyQuaternion(world.player.raySpaces.right.getWorldQuaternion(new Quaternion()));
    output.dataset.placement = model()?.uuid ?? '';
    const button = panel('try-on-panel').requireElementById('model');
    const source = Array.from(world.session?.inputSources ?? []).find(source => source.handedness === 'right');
    output.textContent += `\nButton hovered ${button.hoveredList.peek()} / active ${button.activeList.peek()} / gamepad ${source?.gamepad?.buttons[0]?.value} / selecting ${world.input.xr.gamepads.right?.getSelecting()}`;
    output.textContent += `\nActual right origin ${origin.toArray().map(n => n.toFixed(3))}\nActual right forward ${ray.toArray().map(n => n.toFixed(3))}\nPanel hovered ${world.requireSceneEntity(nextTarget[0]).hasComponent(Hovered)}`;
    output.textContent += `\nTarget ${nextTarget.join('/')}\nWorld ${target.toArray().map(n => n.toFixed(3))}\nRight rotation XYZ degrees ${[e.x, e.y, e.z].map(MathUtils.radToDeg).map(n => n.toFixed(2))}\nIWER numeric fields use radians: ${[e.x, e.y, e.z].map(n => n.toFixed(5))}`;
  };
  // Display current stage so actual controller/hand ray actions can be verified independently.
  store.subscribe(state => {
    if (panel('try-on-panel').visible) nextTarget = ['try-on-panel', 'model'];
    else if (state.products.length) nextTarget = ['card-center', 'image'];
    output.dataset.stage = panel('try-on-panel').visible ? 'detail' : state.products.length ? 'browse' : 'prompt';
    output.dataset.selected = state.selectedId ?? '';
    output.dataset.placement = model()?.uuid ?? '';
    output.dataset.modelMessage = state.modelMessage;
  });
  output.textContent = 'Choose Enter your room, then Run spatial regression.';
  run.onclick = async () => {
    run.disabled = true; output.textContent = ''; spokenRequest = 'Find me a camping backpack under 150 US dollars'; let passed = 0;
    const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); passed++; output.textContent += `PASS ${message}\n`; };
    try {
      check(Boolean(world.session && world.renderer.xr.isPresenting), 'native XR session is presenting');
      check(!panel('card-center').visible && !panel('try-on-panel').visible, 'prompt first, no empty shopping panels');
      await waitFor(() => Boolean(body()?.visible), 'saved body missing at entry');
      check(Math.abs(height(body()!) - 1.72) < .01, 'saved Rich body already in space at human scale');
      const initialYaw = body()!.rotation.y;
      click('shopping-controls', 'rotate');
      check(Math.abs(body()!.rotation.y - initialYaw - Math.PI / 4) < .001, 'large rotate action turns the demo body');
      const callsBeforeDemo = calls.length;
      click('shopping-controls', 'demo-model');
      await waitFor(() => Boolean(model()?.visible), 'demo button did not place Rich with the backpack');
      check(store.getState().modelStatus === 'ready' && store.getState().selectedId === PREPARED_VARIANT_ID, 'demo button selects the saved Shopify backpack');
      check(calls.length === callsBeforeDemo, 'demo button uses the saved GLB without a paid API call');
      check(Math.abs(height(model()!) - 1.72) < .01 && !body()!.visible, 'demo backpack is visible at human scale');
      click('shopping-controls', 'back');
      const searchesBeforeVoice = calls.filter(url => url === '/api/search').length;
      click('shopping-controls', 'voice');
      await waitFor(() => calls.filter(url => url === '/api/search').length > searchesBeforeVoice && store.getState().status === 'ready', 'voice search did not finish');
      check(store.getState().query.includes('camping backpack'), 'spatial voice action runs the shared search flow');
      check(panel('card-center').visible, 'live result state reveals spatial cards');
      const modelCalls = calls.filter(url => url === '/api/model').length;
      click('card-center', 'card');
      check(panel('try-on-panel').visible && !panel('card-center').visible, 'selection opens focused actions and hides the carousel');
      check(calls.filter(url => url === '/api/model').length === modelCalls, 'selection alone does not generate or purchase');
      spokenRequest = 'try it on';
      click('shopping-controls', 'voice');
      await waitFor(() => Boolean(model()?.visible), 'prepared preview did not appear in the room');
      check(Math.abs(height(model()!) - 1.72) < .01, 'one preview action loads and places the saved backpack on Rich');
      check(Boolean(world.session), 'voice try-on keeps the saved demo inside XR');
      check(!body()!.visible, 'preview replaces the original body rather than overlapping it');
      check(model()!.position.x > panel('try-on-panel').position.x, 'body and product actions occupy separate space');
      click('try-on-panel', 'model');
      await waitFor(() => store.getState().modelMessage.startsWith('In your room'), 'second placement did not finish');
      check(Math.abs(height(model()!) - 1.72) < .01, 'repeated placement preserves human scale');
      click('shopping-controls', 'back');
      check(panel('card-center').visible && !panel('try-on-panel').visible, 'browse action restores product cards');
      await waitFor(() => !panel('try-on-panel').requireElementById('root').displayed.peek(), 'hidden panel did not leave the layout');
      check(!panel('try-on-panel').requireElementById('root').displayed.peek(), 'hidden detail panel cannot intercept rays');
      click('shopping-controls', 'next');
      check(store.getState().selectedId === 'fixture-two' && !model() && body()!.visible, 'changing product clears old preview and restores the saved body');
      check(!calls.some(url => /checkout|try-on/.test(url)), 'no purchase or paid image generation during the demo');
      store.select(PREPARED_VARIANT_ID); click('card-center', 'card'); click('try-on-panel', 'model');
      await waitFor(() => Boolean(model()?.visible), 'final preview did not load');
      output.textContent += `\n${passed} spatial checks passed. Fixture APIs; real shipped models.\n`;
    } catch (error) { output.textContent += `FAIL ${error instanceof Error ? error.message : error}\n`; }
    finally { run.disabled = false; }
  };
}).catch(error => { output.textContent = `FAIL ${error}`; });
