import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchor, coverUvTransform, fitFace, fitTorso, mapPoint, torso, vec3, type ViewFit } from '../src/body-fit.js';

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);

const view = (overrides: Partial<ViewFit> = {}): ViewFit => ({
  videoAspect: 16 / 9, viewAspect: 16 / 9, mirror: true, halfW: 16 / 9, halfH: 1, depth: 1, ...overrides,
});

test('mapPoint puts the frame centre on the tracking plane and mirrors selfies', () => {
  const out = vec3();
  mapPoint(view(), 0.5, 0.5, 0, out);
  close(out.x, 0); close(out.y, 0); close(out.z, -1);
  mapPoint(view({ mirror: true }), 0, 0, 0, out);
  close(out.x, 16 / 9); close(out.y, 1);
  mapPoint(view({ mirror: false }), 0, 0, 0, out);
  close(out.x, -16 / 9);
});

test('cover fit crops the longer side of the frame', () => {
  // 16:9 video on a 9:16 phone screen: only the middle 31.6% of the width shows.
  const fit = view({ viewAspect: 9 / 16, halfW: 9 / 16 });
  const out = vec3();
  const visibleWidth = (9 / 16) / (16 / 9);
  mapPoint(fit, 0.5 + visibleWidth / 2, 0.5, 0, out);
  close(out.x, -9 / 16); // mirrored: frame right edge appears at screen left
  const t = coverUvTransform(fit, false);
  close(Math.abs(t.su), visibleWidth);
  close(t.su * 0 + t.tu, 0.5 + visibleWidth / 2); // mirrored: screen left samples the frame's right
  close(t.sv, 1);
  assert.equal(coverUvTransform(fit, true).sv, -1);
});

function faceLandmarks(yaw = 0): Float32Array {
  const points = new Float32Array(478 * 3);
  const set = (i: number, x: number, y: number, z: number) => { points[i * 3] = x; points[i * 3 + 1] = y; points[i * 3 + 2] = z; };
  // Subject's right eye is on image left; turning to their left pushes the left eye away.
  set(33, 0.45, 0.4, -yaw); set(133, 0.48, 0.4, -yaw / 2);
  set(362, 0.52, 0.4, yaw / 2); set(263, 0.55, 0.4, yaw);
  set(10, 0.5, 0.3, 0); set(152, 0.5, 0.6, 0);
  return points;
}

test('fitFace builds a right-handed head frame facing the camera', () => {
  for (const mirror of [true, false]) {
    const face = anchor();
    assert.ok(fitFace(faceLandmarks(), view({ mirror }), face));
    close(face.right.x, 1); close(face.up.y, 1); close(face.forward.z, 1);
    close(face.position.x, 0); close(face.scale, 0.1 * (2 * 16 / 9));
  }
});

test('fitFace yaw follows the mirrored preview', () => {
  const face = anchor();
  fitFace(faceLandmarks(0.03), view({ mirror: true }), face);
  // Subject turned to their left, which is screen left in a mirror.
  assert.ok(face.forward.x < -0.1, `forward.x ${face.forward.x}`);
  fitFace(faceLandmarks(0.03), view({ mirror: false }), face);
  assert.ok(face.forward.x > 0.1, `forward.x ${face.forward.x}`);
});

/** `noseDepth` is the frame-space z of the nose: negative = towards the camera. */
function poseLandmarks(noseDepth: number, labelsSwapped = false) {
  const pose = new Float32Array(33 * 4).fill(0);
  const world = new Float32Array(33 * 3).fill(0);
  const set = (i: number, x: number, y: number, visibility: number, wx: number, wy: number, wz = 0) => {
    pose.set([x, y, 0, visibility], i * 4);
    world.set([wx, wy, wz], i * 3);
  };
  set(0, 0.5, 0.2, 1, 0, -0.65, noseDepth);
  // Subject's left shoulder/hip on image right when facing the camera.
  const s = labelsSwapped ? -1 : 1;
  set(11, 0.5 + 0.1 * s, 0.4, 0.99, 0.19 * s, -0.5); set(12, 0.5 - 0.1 * s, 0.4, 0.99, -0.19 * s, -0.5);
  set(23, 0.5 + 0.06 * s, 0.8, 0.9, 0.1 * s, 0); set(24, 0.5 - 0.06 * s, 0.8, 0.9, -0.1 * s, 0);
  return { pose, world };
}

test('fitTorso scales metric models to the body on screen', () => {
  const { pose, world } = poseLandmarks(-0.1);
  const body = torso();
  assert.ok(fitTorso(pose, world, view({ mirror: true }), body));
  close(body.facing, 1);
  close(body.right.x, 1);
  close(body.shoulderHalfWidth, 0.19);
  close(body.torsoLength, 0.5);
  // 0.2 frame widths of shoulders (= 0.711 units) + 0.4 frame heights of torso (= 0.8 units) over 0.88 m.
  close(body.scale, (0.2 * 2 * 16 / 9 + 0.4 * 2) / 0.88, 1e-4);
  close(body.position.y, (0.5 - 0.4) * 2);
});

test('fitTorso faces away when the nose is behind the shoulders', () => {
  for (const labelsSwapped of [false, true]) {
    const { pose, world } = poseLandmarks(0.15, labelsSwapped);
    const body = torso();
    fitTorso(pose, world, view(), body);
    close(body.facing, -1);
    close(body.up.y, 1);
  }
  // Facing the camera with swapped labels is corrected too.
  const { pose, world } = poseLandmarks(-0.1, true);
  const body = torso();
  fitTorso(pose, world, view(), body);
  close(body.facing, 1);
});
