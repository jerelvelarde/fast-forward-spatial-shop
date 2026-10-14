// Real IWSDK renderer and session setup, with fixture inventory and no model/purchase calls.
import { World, SessionMode, VisibilityState, UIKitMLAsset, Vector3, Matrix4, Euler, MathUtils, Quaternion, Hovered } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { mountDesktop } from '../../src/desktop.js';
import { ShoppingSystem } from '../../src/shopping.js';
import { enterImmersive } from '../../src/xr-session.js';
import { store } from '../../src/store.js';
const products = ['one', 'two', 'three'].map(id => ({ id, title: `Fixture camping pack ${id}`, price: 9900, currency: 'USD', description: 'XR regression inventory', seller: 'Test fixture', imageUrl: '/ui/placeholder.svg', url: 'https://example.com/pack' }));
const originalFetch = window.fetch;
window.fetch = async (input, init) => String(input).startsWith('/api/') ? Response.json({ products, query: 'camping XR fixture', message: 'Synthetic inventory · XR runtime test', tryOnEnabled: false }) : originalFetch(input, init);
const output = document.querySelector('#xr-results')!;
World.create(document.querySelector<HTMLDivElement>('#scene-container')!, projectOptions).then(async world => {
  world.registerSystem(ShoppingSystem);
  await store.search('camping XR fixture');
  const report = () => { output.textContent = `Session: ${world.session ? 'active' : 'inactive'}\nRenderer presenting: ${world.renderer.xr.isPresenting}\nBlend mode: ${world.session?.environmentBlendMode ?? 'none'}\nSelected: ${store.getState().selectedId}\n${store.getState().assistantMessage}`; };
  mountDesktop(document.querySelector<HTMLElement>('#desktop')!, {
    enterVR: async () => { await enterImmersive(world, SessionMode.ImmersiveVR); report(); },
    enterAR: async () => { await enterImmersive(world, SessionMode.ImmersiveAR); report(); },
    exitVR: async () => { if (world.session) await world.session.end(); },
  });
  let immersive = false;
  world.visibilityState.subscribe(value => {
    const active = value !== VisibilityState.NonImmersive;
    document.body.classList.toggle('xr-active', active);
    world.requireSceneObject('landscape').visible = !active || world.session?.environmentBlendMode === 'opaque';
    if (active && !immersive) window.dispatchEvent(new Event('trail:xr-enter'));
    immersive = active; report();
  });
  store.subscribe(report);
  document.querySelector<HTMLButtonElement>('#exit-test-xr')!.onclick = async () => { if (world.session) await world.session.end(); report(); };
  document.querySelector<HTMLButtonElement>('#aim-test-controller')!.onclick = () => {
    const target = world.requireSceneObject<UIKitMLAsset>('card-left').requireElementById('image').getWorldPosition(new Vector3());
    const origin = world.player.raySpaces.right.getWorldPosition(new Vector3());
    const rotation = new Euler().setFromRotationMatrix(new Matrix4().lookAt(origin, target, new Vector3(0, 1, 0)));
    const forward = new Vector3(0, 0, -1).applyQuaternion(world.player.raySpaces.right.getWorldQuaternion(new Quaternion()));
    const source = Array.from(world.session?.inputSources ?? []).find(source => source.handedness === 'right');
    output.textContent += `\nRight trigger: ${source?.gamepad?.buttons[0]?.value}\nLeft card hovered: ${world.requireSceneEntity('card-left').hasComponent(Hovered)}\nRay origin: ${origin.toArray().map(n => n.toFixed(3)).join(', ')}\nRay direction: ${forward.toArray().map(n => n.toFixed(3)).join(', ')}\nLeft image target: ${target.toArray().map(n => n.toFixed(3)).join(', ')}\nRight controller rotation XYZ degrees: ${[rotation.x, rotation.y, rotation.z].map(MathUtils.radToDeg).map(n => n.toFixed(2)).join(', ')}`;
  };
  report();
}).catch(() => { output.textContent = 'FAIL IWSDK fixture scene could not initialize'; });
