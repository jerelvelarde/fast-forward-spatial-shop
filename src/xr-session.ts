import { buildSessionInit, normalizeReferenceSpec, resolveReferenceSpaceType, type World, type SessionMode } from '@iwsdk/core';

/** Await native session startup so permission/setup failures reach the interface. */
export async function enterImmersive(world: World, mode: SessionMode): Promise<void> {
  if (!world.xrEnabled || !navigator.xr) throw new DOMException('WebXR is unavailable.', 'NotSupportedError');
  if (world.session || world.sessionRequestPending) throw new DOMException('An XR session is already active or pending.', 'InvalidStateError');
  const options = { ...world.xrDefaults, sessionMode: mode };
  world.sessionRequestPending = true;
  let session: XRSession | undefined;
  let ended = false;
  const camera = world.camera.clone(false);
  const onEnd = () => {
    ended = true;
    if (world.session === session) world.session = undefined;
    // Three finishes XR camera teardown on the end tick before this restore.
    requestAnimationFrame(() => {
      if (!world.session) { world.camera.copy(camera, false); world.camera.updateMatrixWorld(true); }
    });
  };
  try {
    // Keep this call in the button's user activation; do not await a support probe first.
    session = await navigator.xr.requestSession(mode, buildSessionInit(options));
    session.addEventListener('end', onEnd, { once: true });
    const reference = normalizeReferenceSpec(options.referenceSpace);
    const type = await resolveReferenceSpaceType(session, reference.type, reference.required ? [] : reference.fallbackOrder);
    if (ended) throw new DOMException('The session ended during startup.', 'AbortError');
    world.renderer.xr.enabled = true;
    world.renderer.xr.setReferenceSpaceType(type);
    world.session = session;
    await world.renderer.xr.setSession(session);
    if (ended) throw new DOMException('The session ended during startup.', 'AbortError');
  } catch (error) {
    if (session && !ended) {
      try { await session.end(); } catch { /* An interrupted session may already be closed. */ }
      if (!ended) onEnd();
    }
    throw error;
  } finally {
    world.sessionRequestPending = false;
  }
}

export function xrFailureMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'XR permission was declined or blocked. Allow immersive experiences for this HTTPS site in Quest Browser, then try again.';
  if (name === 'NotSupportedError') return 'This XR mode is unavailable. Try Enter VR, or open this HTTPS URL directly in Meta Quest Browser.';
  if (name === 'InvalidStateError') return 'Another immersive session is active or starting. Exit it, then try again.';
  if (name === 'AbortError') return 'XR startup was interrupted. Put on the headset and try again.';
  return 'XR could not start. Reload this page in Quest Browser and try again. If it continues, check the browser permissions.';
}
