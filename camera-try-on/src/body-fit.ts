/**
 * Pure maths turning MediaPipe landmarks into camera-space anchors.
 * No Three.js or DOM here, so it runs (and is tested) in Node too.
 *
 * Camera space: x right, y up, z towards the viewer. Tracked content lives on
 * a plane `depth` units in front of the camera; scale is derived from the
 * landmarks, which is perspective-equivalent to placing true-size objects at
 * their true distance.
 */

export interface Vec3 { x: number; y: number; z: number }
export const vec3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });

export interface ViewFit {
  /** Width / height of the analysed frame. */
  videoAspect: number;
  /** Width / height of the viewport. */
  viewAspect: number;
  /** True for a selfie (mirrored) preview. */
  mirror: boolean;
  /** Half extents of the viewport at `depth`. */
  halfW: number;
  halfH: number;
  depth: number;
}

/** Visible fraction of the frame along u and v under `object-fit: cover`. */
export function coverFraction(fit: Pick<ViewFit, 'videoAspect' | 'viewAspect'>) {
  return fit.videoAspect > fit.viewAspect
    ? { u: fit.viewAspect / fit.videoAspect, v: 1 }
    : { u: 1, v: fit.videoAspect / fit.viewAspect };
}

/**
 * Texture-space transform (uv' = s * uv + t) that shows a frame with cover
 * cropping and optional mirroring. `topRowFirst` is true for ImageBitmap and
 * raw data textures, which are not flipped on upload.
 */
export function coverUvTransform(fit: Pick<ViewFit, 'videoAspect' | 'viewAspect' | 'mirror'>, topRowFirst: boolean) {
  const visible = coverFraction(fit);
  const su = visible.u * (fit.mirror ? -1 : 1);
  const sv = visible.v * (topRowFirst ? -1 : 1);
  return { su, tu: 0.5 - 0.5 * su, sv, tv: 0.5 - 0.5 * sv };
}

/** Map a normalised frame landmark (x right, y down, z away) into camera space. */
export function mapPoint(fit: ViewFit, x: number, y: number, z: number, out: Vec3): Vec3 {
  const visible = coverFraction(fit);
  let u = (x - 0.5) / visible.u + 0.5;
  const v = (y - 0.5) / visible.v + 0.5;
  if (fit.mirror) u = 1 - u;
  // Landmark z uses roughly the same scale as x (frame widths).
  const frameWidth = (2 * fit.halfW) / visible.u;
  out.x = (u * 2 - 1) * fit.halfW;
  out.y = (1 - v * 2) * fit.halfH;
  out.z = -fit.depth - z * frameWidth;
  return out;
}

const sub = (a: Vec3, b: Vec3, out: Vec3) => { out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out; };
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const normalize = (a: Vec3) => { const l = len(a) || 1; a.x /= l; a.y /= l; a.z /= l; return a; };
const cross = (a: Vec3, b: Vec3, out: Vec3) => {
  const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
  out.x = x; out.y = y; out.z = z; return out;
};
/** Remove `axis` from `v` and normalise (Gram–Schmidt step). */
const orthogonalize = (v: Vec3, axis: Vec3) => {
  const d = dot(v, axis);
  v.x -= axis.x * d; v.y -= axis.y * d; v.z -= axis.z * d;
  return normalize(v);
};

/** An oriented, scaled anchor in camera space. */
export interface Anchor {
  position: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  /** Camera-space units per model unit. */
  scale: number;
}
export const anchor = (): Anchor => ({ position: vec3(), right: vec3(), up: vec3(), forward: vec3(), scale: 0 });

// Face mesh indices (MediaPipe canonical face model).
const FACE = { rightEyeOuter: 33, rightEyeInner: 133, leftEyeInner: 362, leftEyeOuter: 263, forehead: 10, chin: 152 } as const;

const scratch = { a: vec3(), b: vec3(), c: vec3(), d: vec3() };

function faceLandmark(points: Float32Array, index: number, fit: ViewFit, out: Vec3) {
  return mapPoint(fit, points[index * 3], points[index * 3 + 1], points[index * 3 + 2], out);
}

/**
 * Head anchor at the centre of the eyes. Model unit = distance between the
 * outer eye corners (≈ 9.5 cm on an adult).
 */
export function fitFace(points: Float32Array, fit: ViewFit, out: Anchor): boolean {
  if (points.length < 478 * 3) return false;
  const { a, b, c, d } = scratch;
  const subjectRight = faceLandmark(points, FACE.rightEyeOuter, fit, a);
  const subjectLeft = faceLandmark(points, FACE.leftEyeOuter, fit, b);
  // In a mirrored preview the subject's right eye is on screen right.
  if (fit.mirror) sub(subjectRight, subjectLeft, out.right);
  else sub(subjectLeft, subjectRight, out.right);
  out.scale = len(out.right);
  if (out.scale <= 1e-6) return false;
  normalize(out.right);

  faceLandmark(points, FACE.rightEyeInner, fit, c);
  faceLandmark(points, FACE.leftEyeInner, fit, d);
  out.position.x = (a.x + b.x + c.x + d.x) / 4;
  out.position.y = (a.y + b.y + c.y + d.y) / 4;
  out.position.z = (a.z + b.z + c.z + d.z) / 4;

  sub(faceLandmark(points, FACE.forehead, fit, a), faceLandmark(points, FACE.chin, fit, b), out.up);
  orthogonalize(out.up, out.right);
  cross(out.right, out.up, out.forward);
  return true;
}

// Pose indices (BlazePose topology).
const POSE = { nose: 0, leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24 } as const;

export interface Torso extends Anchor {
  /** Half the shoulder-joint distance in metres. */
  shoulderHalfWidth: number;
  /** Shoulder-midpoint to hip-midpoint distance in metres. */
  torsoLength: number;
  /** Minimum visibility of the shoulders (0–1). */
  confidence: number;
  /** How much the chest faces the camera: 1 front, -1 back. */
  facing: number;
}
export const torso = (): Torso => ({ ...anchor(), shoulderHalfWidth: 0.19, torsoLength: 0.5, confidence: 0, facing: 1 });

const world = { ls: vec3(), rs: vec3(), lh: vec3(), rh: vec3(), ms: vec3(), mh: vec3(), nose: vec3() };

function worldLandmark(points: Float32Array, index: number, mirror: boolean, out: Vec3) {
  // Frame axes (x right, y down, z away) → camera axes (x right, y up, z towards viewer).
  out.x = mirror ? -points[index * 3] : points[index * 3];
  out.y = -points[index * 3 + 1];
  out.z = -points[index * 3 + 2];
  return out;
}

const visibility = (pose: Float32Array, index: number) => pose[index * 4 + 3];
const imagePoint = (pose: Float32Array, index: number, fit: ViewFit, out: Vec3) =>
  mapPoint(fit, pose[index * 4], pose[index * 4 + 1], 0, out);

/**
 * Torso anchor at the shoulder midpoint, oriented by the metric world
 * landmarks. Model unit = 1 metre; z+ points out of the chest.
 */
export function fitTorso(pose: Float32Array, worldPoints: Float32Array, fit: ViewFit, out: Torso): boolean {
  if (pose.length < 33 * 4 || worldPoints.length < 33 * 3) return false;
  out.confidence = Math.min(visibility(pose, POSE.leftShoulder), visibility(pose, POSE.rightShoulder));

  const { a, b, c, d } = scratch;
  const ls = imagePoint(pose, POSE.leftShoulder, fit, a);
  const rs = imagePoint(pose, POSE.rightShoulder, fit, b);
  const lh = imagePoint(pose, POSE.leftHip, fit, c);
  const rh = imagePoint(pose, POSE.rightHip, fit, d);
  out.position.x = (ls.x + rs.x) / 2;
  out.position.y = (ls.y + rs.y) / 2;
  out.position.z = -fit.depth;
  const screenShoulders = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const screenTorso = Math.hypot(out.position.x - (lh.x + rh.x) / 2, out.position.y - (lh.y + rh.y) / 2);

  const w = world;
  worldLandmark(worldPoints, POSE.leftShoulder, fit.mirror, w.ls);
  worldLandmark(worldPoints, POSE.rightShoulder, fit.mirror, w.rs);
  worldLandmark(worldPoints, POSE.leftHip, fit.mirror, w.lh);
  worldLandmark(worldPoints, POSE.rightHip, fit.mirror, w.rh);
  w.ms.x = (w.ls.x + w.rs.x) / 2; w.ms.y = (w.ls.y + w.rs.y) / 2; w.ms.z = (w.ls.z + w.rs.z) / 2;
  w.mh.x = (w.lh.x + w.rh.x) / 2; w.mh.y = (w.lh.y + w.rh.y) / 2; w.mh.z = (w.lh.z + w.rh.z) / 2;
  const worldShoulders = Math.hypot(w.ls.x - w.rs.x, w.ls.y - w.rs.y);
  const worldTorso = Math.hypot(w.ms.x - w.mh.x, w.ms.y - w.mh.y);
  // Both terms are equally foreshortened, so their ratio is the projection scale
  // whether the person faces the camera or stands side-on.
  const denominator = worldShoulders + worldTorso;
  if (denominator < 0.05) return false;
  out.scale = (screenShoulders + screenTorso) / denominator;
  out.shoulderHalfWidth = Math.hypot(w.ls.x - w.rs.x, w.ls.y - w.rs.y, w.ls.z - w.rs.z) / 2;
  out.torsoLength = Math.hypot(w.ms.x - w.mh.x, w.ms.y - w.mh.y, w.ms.z - w.mh.z);

  // The subject's left shoulder is on screen left in a mirrored preview.
  if (fit.mirror) sub(w.rs, w.ls, out.right);
  else sub(w.ls, w.rs, out.right);
  normalize(out.right);
  sub(w.ms, w.mh, out.up);
  orthogonalize(out.up, out.right);
  cross(out.right, out.up, out.forward);

  // Left/right labels can't be trusted when someone turns around, and face
  // "visibility" stays high even from behind. The nose can: it points the way
  // the chest faces. If it disagrees with the shoulder-derived normal, turn
  // the anchor around.
  const nose = worldLandmark(worldPoints, POSE.nose, fit.mirror, w.nose);
  const noseAhead = out.forward.x * (nose.x - w.ms.x) + out.forward.z * (nose.z - w.ms.z);
  if (noseAhead < -0.02) {
    out.right.x = -out.right.x; out.right.y = -out.right.y; out.right.z = -out.right.z;
    out.forward.x = -out.forward.x; out.forward.y = -out.forward.y; out.forward.z = -out.forward.z;
  }
  out.facing = out.forward.z;
  return true;
}
