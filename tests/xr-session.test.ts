import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { PerspectiveCamera, SessionMode, type World } from '@iwsdk/core';
import { enterImmersive, xrFailureMessage } from '../src/xr-session.js';

function fixture(t: TestContext) {
  const originalXR = Object.getOwnPropertyDescriptor(navigator, 'xr');
  const originalRAF = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const frames: FrameRequestCallback[] = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; } });
  const referenceRequests: string[] = [];
  let ended = false;
  const session = new EventTarget() as XRSession;
  session.requestReferenceSpace = async type => {
    referenceRequests.push(type);
    if (type === 'local-floor') throw new DOMException('Floor unavailable', 'NotSupportedError');
    return {} as XRReferenceSpace;
  };
  session.end = async () => { ended = true; session.dispatchEvent(new Event('end')); };
  const requests: { mode: XRSessionMode; init?: XRSessionInit }[] = [];
  const xr = { requestSession: async (mode: XRSessionMode, init?: XRSessionInit) => { requests.push({ mode, init }); return session; } };
  Object.defineProperty(navigator, 'xr', { configurable: true, value: xr });
  let referenceType = '';
  const renderer = { enabled: false, setReferenceSpaceType(type: string) { referenceType = type; }, async setSession(value: XRSession) { assert.equal(value, session); } };
  const world = { xrEnabled: true, xrDefaults: { features: { handTracking: true } }, sessionRequestPending: false, session: undefined, camera: new PerspectiveCamera(), renderer: { xr: renderer } } as unknown as World;
  t.after(() => {
    if (originalXR) Object.defineProperty(navigator, 'xr', originalXR); else Reflect.deleteProperty(navigator, 'xr');
    if (originalRAF) Object.defineProperty(globalThis, 'requestAnimationFrame', originalRAF); else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  });
  return { world, session, xr, renderer, requests, referenceRequests, frames, ended: () => ended, referenceType: () => referenceType };
}

test('native XR request stays in user activation and adopts the session with reference-space fallback', async t => {
  const f = fixture(t);
  const pending = enterImmersive(f.world, SessionMode.ImmersiveVR);
  assert.equal(f.requests.length, 1, 'requestSession happens synchronously before the first await');
  assert.equal(f.requests[0].mode, 'immersive-vr');
  assert.deepEqual(f.requests[0].init?.requiredFeatures, []);
  assert.ok(f.requests[0].init?.optionalFeatures?.includes('hand-tracking'));
  await pending;
  assert.deepEqual(f.referenceRequests, ['local-floor', 'local']);
  assert.equal(f.referenceType(), 'local');
  assert.equal(f.world.session, f.session);
  assert.equal(f.world.sessionRequestPending, false);
  f.world.camera.position.set(2, 3, 4);
  await f.session.end();
  f.frames.forEach(callback => callback(0));
  assert.equal(f.world.session, undefined);
  assert.deepEqual(f.world.camera.position.toArray(), [0, 0, 0]);
});

test('permission rejection reaches the caller and releases the pending guard for retry', async t => {
  const f = fixture(t);
  f.xr.requestSession = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  await assert.rejects(enterImmersive(f.world, SessionMode.ImmersiveAR), { name: 'NotAllowedError' });
  assert.equal(f.world.sessionRequestPending, false);
  assert.equal(f.world.session, undefined);
  assert.match(xrFailureMessage(new DOMException('Denied', 'NotAllowedError')), /permission.*declined/);
});

test('renderer setup failure closes the granted session and permits another attempt', async t => {
  const f = fixture(t);
  f.renderer.setSession = async () => { throw new Error('Fixture setup failure'); };
  await assert.rejects(enterImmersive(f.world, SessionMode.ImmersiveVR), /setup failure/);
  assert.equal(f.ended(), true);
  assert.equal(f.world.session, undefined);
  assert.equal(f.world.sessionRequestPending, false);
});

test('a second XR entry cannot create a duplicate session while permission is pending', async t => {
  const f = fixture(t);
  let resolve!: (session: XRSession) => void;
  f.xr.requestSession = () => new Promise(value => { resolve = value; });
  const first = enterImmersive(f.world, SessionMode.ImmersiveVR);
  await assert.rejects(enterImmersive(f.world, SessionMode.ImmersiveAR), { name: 'InvalidStateError' });
  resolve(f.session); await first;
  await f.session.end();
});
