import {
  CameraFacing, CameraSource, CameraState, CameraUtils, CanvasTexture, createSystem, DataTexture, LinearFilter, MathUtils, Mesh,
  MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Texture, VideoTexture, type Entity, type PerspectiveCamera,
} from '@iwsdk/core';
import { coverUvTransform } from './body-fit.js';
import { feed, TRACK_DEPTH } from './feed.js';
import { appState } from './state.js';

/** The camera image is drawn on a plane this far away, behind all content. */
const BACKDROP_DEPTH = 20;
/** Fall back to the live video if analysed frames stop arriving. */
const SYNC_TIMEOUT_MS = 400;

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);

/**
 * Owns the camera: starts it through IWSDK's CameraSource component, draws it
 * full screen (cover-fit, mirrored for selfies) as the scene backdrop, and
 * publishes the frame source and viewport mapping in `feed`.
 *
 * `?demo=<image or video url>` replaces the camera with a file, for testing
 * without a webcam (`&mirror=1` to treat it as a selfie).
 */
export class CameraFeedSystem extends createSystem({ cameras: { required: [CameraSource] } }) {
  private backdrop!: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private placeholder!: Texture;
  private sourceTexture: Texture | null = null;
  private frameTexture: Texture | null = null;
  private frameBitmap: ImageBitmap | null = null;
  private frameSize = { width: 0, height: 0 };
  private presentedAt = 0;
  private cameraEntity: Entity | null = null;
  private triedAnyCamera = false;
  private trackedVideo: HTMLVideoElement | null = null;
  private stillFrame = 0;

  init() {
    this.placeholder = new DataTexture(new Uint8Array([8, 10, 12, 255]), 1, 1);
    this.placeholder.needsUpdate = true;
    this.backdrop = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: this.placeholder, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.backdrop.renderOrder = -100;
    this.backdrop.frustumCulled = false;
    const entity = this.world.createTransformEntity(this.backdrop, { parent: this.world.cameraEntity });
    entity.object3D!.position.set(0, 0, -BACKDROP_DEPTH);

    feed.present = bitmap => this.present(bitmap);
    feed.flip = () => this.flip();
    feed.retry = () => this.retry();

    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demo');
    if (demo) {
      this.startDemo(demo, params.get('mirror') === '1');
    } else {
      this.cameraEntity = this.world.createEntity();
      this.cameraEntity.addComponent(CameraSource, { facing: CameraFacing.Front, width: 1280, height: 720, frameRate: 30 });
    }
    this.cleanupFuncs.push(() => { this.frameBitmap?.close(); this.frameBitmap = null; });
  }

  private startDemo(url: string, mirror: boolean) {
    feed.mirror = mirror;
    if (isVideoUrl(url)) {
      const video = document.createElement('video');
      Object.assign(video, { src: url, loop: true, muted: true, playsInline: true, crossOrigin: 'anonymous' });
      void video.play().catch(() => { appState.camera.value = 'error'; appState.cameraMessage.value = 'The demo video could not play.'; });
      video.addEventListener('loadeddata', () => this.useSource(video, new VideoTexture(video)), { once: true });
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d')!.drawImage(image, 0, 0);
      this.useSource(canvas, new CanvasTexture(canvas));
    };
    image.onerror = () => { appState.camera.value = 'error'; appState.cameraMessage.value = 'The demo image could not load.'; };
    image.src = url;
  }

  private useSource(source: HTMLVideoElement | HTMLCanvasElement, texture: Texture) {
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    this.sourceTexture = texture;
    feed.source = source;
    appState.camera.value = 'active';
    if (source instanceof HTMLVideoElement) this.countVideoFrames(source);
  }

  /** Bump `feed.frameTime` on every decoded video frame. */
  private countVideoFrames(video: HTMLVideoElement) {
    this.trackedVideo = video;
    if (typeof video.requestVideoFrameCallback !== 'function') return;
    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (this.trackedVideo !== video) return;
      feed.frameTime = metadata.mediaTime + metadata.presentedFrames * 1e-6;
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  }

  private flip() {
    const entity = this.cameraEntity;
    if (!entity) return;
    const facing = entity.getValue(CameraSource, 'facing');
    entity.setValue(CameraSource, 'facing', facing === CameraFacing.Back ? CameraFacing.Front : CameraFacing.Back);
    entity.setValue(CameraSource, 'deviceId', '');
    this.triedAnyCamera = false;
    this.sourceTexture = null;
    appState.camera.value = 'starting';
    CameraUtils.restart(entity);
  }

  private present(bitmap: ImageBitmap | null) {
    if (!bitmap) {
      this.frameBitmap?.close();
      this.frameBitmap = null;
      return;
    }
    // Compare against the stored size: a closed bitmap reports 0 × 0.
    if (!this.frameTexture || this.frameSize.width !== bitmap.width || this.frameSize.height !== bitmap.height) {
      this.frameSize = { width: bitmap.width, height: bitmap.height };
      // Texture storage is immutable once allocated; a new size needs a new texture.
      this.frameTexture?.dispose();
      this.frameTexture = new Texture(bitmap);
      this.frameTexture.flipY = false;
      this.frameTexture.colorSpace = SRGBColorSpace;
      this.frameTexture.minFilter = LinearFilter;
      this.frameTexture.generateMipmaps = false;
    } else {
      this.frameTexture.image = bitmap;
    }
    this.frameTexture.needsUpdate = true;
    // The previous bitmap was uploaded during the last render.
    this.frameBitmap?.close();
    this.frameBitmap = bitmap;
    this.presentedAt = performance.now();
  }

  private updateCamera() {
    const entity = this.cameraEntity;
    if (!entity) {
      const source = feed.source;
      if (source instanceof HTMLCanvasElement) {
        // Demo still images never change; keep the tracker fed.
        feed.width = source.width; feed.height = source.height;
        feed.frameTime = ++this.stillFrame;
      } else if (source) {
        feed.width = source.videoWidth; feed.height = source.videoHeight;
      }
      return;
    }
    const state = entity.getValue(CameraSource, 'state');
    if (state === CameraState.Active) {
      const video = entity.getValue(CameraSource, 'videoElement') as HTMLVideoElement | null;
      const texture = entity.getValue(CameraSource, 'texture') as VideoTexture | null;
      if (!video || !texture) return;
      if (texture !== this.sourceTexture) {
        feed.mirror = entity.getValue(CameraSource, 'facing') !== CameraFacing.Back;
        this.useSource(video, texture);
        void CameraUtils.getDevices().then(devices => { appState.canFlipCamera.value = devices.length > 1; }).catch(() => {});
      }
      feed.width = video.videoWidth;
      feed.height = video.videoHeight;
      if (typeof video.requestVideoFrameCallback !== 'function') feed.frameTime = video.currentTime;
    } else if (state === CameraState.Error) {
      if (!this.triedAnyCamera && entity.getValue(CameraSource, 'facing') !== CameraFacing.Unknown) {
        // Laptops often label webcams without "front"; accept any camera.
        this.triedAnyCamera = true;
        entity.setValue(CameraSource, 'facing', CameraFacing.Unknown);
        entity.setValue(CameraSource, 'deviceId', '');
        CameraUtils.restart(entity);
      } else if (appState.camera.peek() !== 'error') {
        appState.camera.value = 'error';
        appState.cameraMessage.value = window.isSecureContext
          ? 'Camera access was blocked or no camera is available. Allow camera access in your browser settings, then retry.'
          : 'Camera access needs a secure page. Open this app over HTTPS or on localhost.';
      }
    }
  }

  /** Retry after the user fixes permissions. */
  private retry() {
    if (!this.cameraEntity) return;
    this.triedAnyCamera = false;
    this.cameraEntity.setValue(CameraSource, 'facing', CameraFacing.Front);
    this.cameraEntity.setValue(CameraSource, 'deviceId', '');
    appState.camera.value = 'starting';
    CameraUtils.restart(this.cameraEntity);
  }

  update() {
    this.updateCamera();

    const camera = this.camera as PerspectiveCamera;
    const tan = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    const fit = feed.fit;
    fit.viewAspect = camera.aspect;
    fit.videoAspect = feed.width && feed.height ? feed.width / feed.height : camera.aspect;
    fit.mirror = feed.mirror;
    fit.depth = TRACK_DEPTH;
    fit.halfH = tan * TRACK_DEPTH;
    fit.halfW = fit.halfH * camera.aspect;

    const synced = this.frameBitmap && performance.now() - this.presentedAt < SYNC_TIMEOUT_MS;
    const map = synced ? this.frameTexture! : this.sourceTexture ?? this.placeholder;
    const material = this.backdrop.material;
    if (material.map !== map) material.map = map;
    if (map !== this.placeholder) {
      const t = coverUvTransform(fit, map === this.frameTexture);
      map.matrixAutoUpdate = false;
      map.matrix.set(t.su, 0, t.tu, 0, t.sv, t.tv, 0, 0, 1);
    }
    const halfH = tan * BACKDROP_DEPTH;
    this.backdrop.scale.set(halfH * camera.aspect * 2, halfH * 2, 1);
  }
}
