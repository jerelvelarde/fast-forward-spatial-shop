import {
  createSystem, DataTexture, DirectionalLight, HemisphereLight, LinearFilter, Matrix3, Matrix4, Mesh, PlaneGeometry, Quaternion,
  RedFormat, ShaderMaterial, UnsignedByteType, Vector3, type Object3D,
} from '@iwsdk/core';
import { anchor, coverUvTransform, fitFace, fitTorso, torso, type Anchor } from './body-fit.js';
import { feed, TRACK_DEPTH } from './feed.js';
import { LightProbe } from './light-probe.js';
import { initProductEnvironment } from './models/environment.js';
import { OneEuro, OneEuro3 } from './one-euro.js';
import { appState, type TrackingHint } from './state.js';
import { Tracker } from './tracker.js';
import type { TrackTask } from './tracker-protocol.js';
import { TryOnKinds, WornProduct } from './try-on-components.js';
import { backpackModels, RENDER_ORDER } from './wardrobe.js';

/** Hide a product if its anchor has not been seen for this long. */
const LOST_AFTER_MS = 350;
/** Ignore torso fits with less shoulder visibility than this. */
const MIN_TORSO_CONFIDENCE = 0.5;

/**
 * Smoothed anchor: One Euro on position and log-scale, adaptive slerp on
 * rotation. Updated once per analysed frame, so it stays in lockstep with
 * the frame on screen.
 */
class SmoothedAnchor {
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  scale = 1;
  seenAt = -Infinity;
  private readonly positionFilter = new OneEuro3(1.2, 18);
  private readonly scaleFilter = new OneEuro(1, 8);
  private readonly basis = new Matrix4();
  private readonly target = new Quaternion();
  private readonly axes = { x: new Vector3(), y: new Vector3(), z: new Vector3() };

  update(raw: Anchor, dt: number, now: number) {
    const reacquired = now - this.seenAt > LOST_AFTER_MS;
    if (reacquired) { this.positionFilter.reset(); this.scaleFilter.reset(); }
    this.seenAt = now;
    this.positionFilter.filter(raw.position, dt);
    this.position.set(raw.position.x, raw.position.y, raw.position.z);
    this.scale = Math.exp(this.scaleFilter.filter(Math.log(raw.scale), dt));
    const { x, y, z } = this.axes;
    this.basis.makeBasis(x.copy(raw.right), y.copy(raw.up), z.copy(raw.forward));
    this.target.setFromRotationMatrix(this.basis);
    if (reacquired) {
      this.quaternion.copy(this.target);
    } else {
      // Faster when turning quickly, steadier when still.
      const angle = this.quaternion.angleTo(this.target);
      this.quaternion.slerp(this.target, 1 - Math.exp(-dt * (20 + 220 * angle)));
    }
  }

  visible(now: number) { return now - this.seenAt < LOST_AFTER_MS; }

  apply(object: Object3D, scale = this.scale) {
    object.position.copy(this.position);
    object.quaternion.copy(this.quaternion);
    object.scale.setScalar(scale);
  }
}

const MASK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const MASK_FRAGMENT = /* glsl */ `
  uniform sampler2D uMask;
  uniform mat3 uUvTransform;
  varying vec2 vUv;
  void main() {
    vec2 uv = (uUvTransform * vec3(vUv, 1.0)).xy;
    if (texture2D(uMask, uv).r < 0.5) discard;
    gl_FragColor = vec4(0.0);
  }`;

/**
 * Fits every WornProduct to the tracked face or body: drives the tracking
 * worker, smooths anchors, occludes with the person's silhouette and matches
 * product lighting to the room.
 */
export class TryOnSystem extends createSystem({ worn: { required: [WornProduct] } }) {
  private tracker!: Tracker;
  private tasks!: TrackTask[];
  private rawFace!: Anchor;
  private rawTorso!: ReturnType<typeof torso>;
  private face!: SmoothedAnchor;
  private body!: SmoothedAnchor;
  private shoulderFilter!: OneEuro;
  private torsoFilter!: OneEuro;
  private shoulderHalfWidth = 0.19;
  private torsoLength = 0.5;
  private lastResultTime = 0;
  private presenting = false;
  private mask!: Mesh<PlaneGeometry, ShaderMaterial>;
  private maskTexture: DataTexture | null = null;
  private maskSeenAt = -Infinity;
  private hemi!: HemisphereLight;
  private sun!: DirectionalLight;
  private probe!: LightProbe;

  init() {
    initProductEnvironment(this.renderer);
    this.tracker = new Tracker();
    this.tasks = [];
    this.rawFace = anchor();
    this.rawTorso = torso();
    this.face = new SmoothedAnchor();
    this.body = new SmoothedAnchor();
    this.shoulderFilter = new OneEuro(0.3, 0.5);
    this.torsoFilter = new OneEuro(0.3, 0.5);
    this.cleanupFuncs.push(() => this.tracker.stop());

    // Person silhouette as a depth-only plane at the torso: hides whatever
    // part of a backpack is behind the wearer.
    this.mask = new Mesh(new PlaneGeometry(1, 1), new ShaderMaterial({
      vertexShader: MASK_VERTEX, fragmentShader: MASK_FRAGMENT,
      uniforms: { uMask: { value: null }, uUvTransform: { value: new Matrix3() } },
      colorWrite: false, depthWrite: true,
    }));
    this.mask.renderOrder = RENDER_ORDER.bodyOccluder;
    this.mask.frustumCulled = false;
    this.mask.visible = false;
    this.world.createTransformEntity(this.mask, { parent: this.world.cameraEntity });

    // Lights travel with the camera so products are lit from the viewer's side.
    this.probe = new LightProbe();
    this.hemi = new HemisphereLight(0xffffff, 0x777777, 1.4);
    this.sun = new DirectionalLight(0xffffff, 1.6);
    this.world.createTransformEntity(this.hemi, { parent: this.world.cameraEntity });
    const sun = this.world.createTransformEntity(this.sun, { parent: this.world.cameraEntity });
    sun.object3D!.position.set(-0.6, 1.2, 0.4);
    this.sun.target.position.set(0, 0, -TRACK_DEPTH);
    this.world.cameraEntity.object3D!.add(this.sun.target);

    this.tracker.onPhase = () => this.updateHint(performance.now());

    // Warm the detectors while the shopper browses: face first (small), body next.
    const warm = appState.camera.subscribe(status => {
      if (status !== 'active') return;
      window.setTimeout(() => this.tracker.warm(['face', 'pose']), 1200);
      warm();
    });
    this.cleanupFuncs.push(warm);
  }

  update(delta: number) {
    const now = performance.now();
    let needFace = false, needPose = false, hasBackpack = false;
    for (const entity of this.queries.worn.entities) {
      const kind = entity.getValue(WornProduct, 'kind');
      if (kind === TryOnKinds.Backpack) { needPose = true; hasBackpack = true; } else needFace = true;
    }
    this.tasks.length = 0;
    if (needFace) this.tasks.push('face');
    if (needPose) this.tasks.push('pose');

    if (this.tasks.length && feed.source) {
      this.tracker.pump(feed.source, feed.width, feed.height, feed.frameTime, this.tasks);
      this.consume(now);
    } else if (this.presenting) {
      this.presenting = false;
      feed.present(null);
      this.tracker.take()?.bitmap.close();
    }

    for (const entity of this.queries.worn.entities) {
      const object = entity.object3D!;
      const kind = entity.getValue(WornProduct, 'kind');
      if (kind === TryOnKinds.Backpack) {
        object.visible = this.body.visible(now);
        if (!object.visible) continue;
        this.body.apply(object);
        backpackModels.get(object)?.fit(this.shoulderHalfWidth, this.torsoLength);
      } else {
        object.visible = this.face.visible(now);
        if (object.visible) this.face.apply(object);
      }
    }
    this.mask.visible = hasBackpack && this.body.visible(now) && now - this.maskSeenAt < LOST_AFTER_MS;
    if (this.mask.visible) this.placeMask();

    this.updateLights(delta);
    this.updateHint(now);
  }

  /** Apply the newest tracking result, if any. */
  private consume(now: number) {
    const result = this.tracker.take();
    if (!result) return;
    this.presenting = true;
    feed.present(result.bitmap);
    const dt = Math.min(0.25, Math.max(1 / 120, (result.time - this.lastResultTime) / 1000));
    this.lastResultTime = result.time;
    const fit = feed.fit;
    fit.videoAspect = result.width / result.height;

    if (result.face && fitFace(result.face, fit, this.rawFace)) this.face.update(this.rawFace, dt, now);
    if (result.pose && result.poseWorld && fitTorso(result.pose, result.poseWorld, fit, this.rawTorso)
        && this.rawTorso.confidence >= MIN_TORSO_CONFIDENCE) {
      this.body.update(this.rawTorso, dt, now);
      this.shoulderHalfWidth = this.shoulderFilter.filter(this.rawTorso.shoulderHalfWidth, dt);
      this.torsoLength = this.torsoFilter.filter(this.rawTorso.torsoLength, dt);
    }
    if (import.meta.env.DEV) Object.assign(window, { __tracking: { pose: result.pose, world: result.poseWorld, face: result.face, torso: this.rawTorso } });
    if (result.mask) this.uploadMask(result.mask, result.maskWidth, result.maskHeight, now);
  }

  private uploadMask(data: Uint8Array, width: number, height: number, now: number) {
    let texture = this.maskTexture;
    if (!texture || texture.image.width !== width || texture.image.height !== height) {
      texture?.dispose();
      texture = this.maskTexture = new DataTexture(new Uint8Array(width * height), width, height, RedFormat, UnsignedByteType);
      texture.minFilter = texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      this.mask.material.uniforms.uMask.value = texture;
    }
    (texture.image.data as Uint8Array).set(data);
    texture.needsUpdate = true;
    this.maskSeenAt = now;
  }

  private placeMask() {
    const fit = feed.fit;
    // Slightly behind the shoulder line so straps over the chest stay visible.
    const depth = TRACK_DEPTH + 0.02 * this.body.scale;
    const ratio = depth / TRACK_DEPTH;
    this.mask.position.set(0, 0, -depth);
    this.mask.scale.set(fit.halfW * 2 * ratio, fit.halfH * 2 * ratio, 1);
    const t = coverUvTransform(fit, true);
    (this.mask.material.uniforms.uUvTransform.value as Matrix3).set(t.su, 0, t.tu, 0, t.sv, t.tv, 0, 0, 1);
  }

  private updateLights(delta: number) {
    this.probe.update(feed.source, delta);
    const level = 0.45 + this.probe.brightness * 0.9;
    this.hemi.color.copy(this.probe.sky);
    this.hemi.groundColor.copy(this.probe.ground);
    this.hemi.intensity = 0.8 * level;
    this.sun.intensity = 2.2 * level;
  }

  private updateHint(now: number) {
    let hint: TrackingHint = 'idle';
    const needFace = this.tasks.includes('face'), needPose = this.tasks.includes('pose');
    const phases = this.tracker.phases;
    if (needFace || needPose) {
      if ((needFace && phases.face === 'error') || (needPose && phases.pose === 'error')) hint = 'error';
      else if ((needFace && phases.face !== 'ready') || (needPose && phases.pose !== 'ready')) hint = 'loading';
      else if (needPose && !this.body.visible(now)) hint = 'step-back';
      else if (needFace && !this.face.visible(now)) hint = 'searching';
      else hint = 'tracking';
    }
    if (appState.hint.peek() !== hint) appState.hint.value = hint;
  }
}
