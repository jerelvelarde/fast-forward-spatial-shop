import { AssetManager, Box3, DoubleSide, EnvironmentRaycastTarget, Group, InputComponent, Mesh, MeshBasicMaterial, RaycastSpace, RingGeometry, Vector3, createSystem } from '@iwsdk/core';
import { store } from './store.js';

/** Places a selected product model at a Quest AR surface hit. */
export class ModelPlacementSystem extends createSystem({}) {
  private reticle!: ReturnType<typeof this.world.createTransformEntity>;
  private placed?: ReturnType<typeof this.world.createTransformEntity>;
  private awaitingPlacement = false;
  private request = 0;
  private activeAssetKey: string | null = null;
  private readonly assetUrls = new Map<string, string>();
  private readonly position = new Vector3();
  private readonly head = new Vector3();
  private readonly direction = new Vector3();
  private bodyAvailable = false;

  init(): void {
    const ring = new Mesh(new RingGeometry(0.075, 0.09, 32), new MeshBasicMaterial({ color: '#c8f36b', side: DoubleSide, depthTest: false }));
    ring.rotation.x = -Math.PI / 2;
    this.reticle = this.world.createTransformEntity(ring);
    this.reticle.addComponent(EnvironmentRaycastTarget, { space: RaycastSpace.Right, maxDistance: 5 });
    ring.visible = false;
    const requestPlacement = () => { void this.preparePlacement(); };
    window.addEventListener('trail:place-model', requestPlacement);
    this.cleanupFuncs.push(() => window.removeEventListener('trail:place-model', requestPlacement));
    this.cleanupFuncs.push(store.subscribe(state => {
      if (this.placed && this.placed.object3D?.userData.productId !== state.selectedId) {
        this.placed.dispose({ disposeResources: false });
        this.placed = undefined;
      }
      if (state.modelStatus !== 'ready' || state.modelProductId !== state.selectedId) {
        this.awaitingPlacement = false;
        this.activeAssetKey = null;
        this.request++;
      }
    }));
    this.cleanupFuncs.push(() => {
      this.placed?.dispose({ disposeResources: false });
      this.reticle.dispose({ disposeResources: false });
      ring.geometry.dispose();
      (ring.material as MeshBasicMaterial).dispose();
      for (const url of this.assetUrls.values()) URL.revokeObjectURL(url);
    });
  }

  private async preparePlacement(): Promise<void> {
    const state = store.getState();
    if (state.modelStatus !== 'ready' || !state.modelUrl || state.modelProductId !== state.selectedId) return;
    if (!this.world.session || this.world.session.environmentBlendMode === 'opaque') {
      store.setModelMessage('Enter Quest AR, then choose Place in room.');
      return;
    }
    const request = ++this.request;
    const prepared = state.modelUrl.startsWith('/demo/rich-with-backpack.glb');
    const backpack = state.products.find(product => product.id === state.selectedId)?.previewMode === 'backpack';
    store.setModelMessage('Loading the selected 3D product for Quest AR…');
    try {
      let assetKey = state.modelUrl;
      if (!prepared) {
        const cached = this.assetUrls.get(state.modelUrl);
        if (cached) assetKey = cached;
        else {
          const blob = await store.downloadModelAsset(state.modelProductId!);
          assetKey = URL.createObjectURL(blob);
          this.assetUrls.set(state.modelUrl, assetKey);
        }
      }
      await AssetManager.loadGLTF(assetKey, assetKey);
      if (!prepared && backpack && !this.bodyAvailable) {
        const bodyUrl = `${import.meta.env.BASE_URL}demo/rich-body.glb`;
        const response = await fetch(bodyUrl, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
        if (response?.ok && !response.headers.get('content-type')?.includes('text/html')) {
          try { await AssetManager.loadGLTFById('rich-body'); this.bodyAvailable = true; }
          catch { this.bodyAvailable = false; }
        }
      }
      if (request !== this.request || store.getState().selectedId !== state.modelProductId) return;
      this.activeAssetKey = assetKey;
      this.awaitingPlacement = true;
      const hitTest = this.world.session.enabledFeatures?.includes('hit-test');
      if (hitTest) store.setModelMessage(`Point your right controller at the floor and press trigger to place ${prepared || (backpack && this.bodyAvailable) ? 'Rich with the backpack' : 'the selected product'}.`);
      else this.placeAhead(assetKey, state.modelProductId!);
    } catch {
      store.setModelMessage('The 3D file could not load in Quest. Retry, or generate a new model.');
    }
  }

  private placeAhead(url: string, productId: string): void {
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldDirection(this.direction);
    this.direction.y = 0;
    this.direction.normalize();
    this.position.copy(this.head).addScaledVector(this.direction, 1.6);
    this.position.y = Math.max(0, this.head.y - 1.6);
    this.place(url, productId);
    store.setModelMessage('Placed the 3D preview ahead of you. Walk around to inspect it.');
  }

  private place(url: string, productId: string): void {
    const gltf = AssetManager.getGLTF(url);
    if (!gltf) { store.setModelMessage('The prepared 3D model is unavailable.'); return; }
    this.placed?.dispose({ disposeResources: false });
    const group = new Group();
    const prepared = url.startsWith('/demo/rich-with-backpack.glb');
    const backpack = store.getState().products.find(product => product.id === productId)?.previewMode === 'backpack';
    const withBody = !prepared && backpack && this.bodyAvailable;
    group.name = prepared || withBody ? 'Rich with selected Shopify backpack' : 'Selected Shopify product';
    // AssetManager caches GLTF scenes. Clone before sizing and positioning so
    // placing the same product again does not keep scaling the cached original.
    const model = gltf.scene.clone(true);
    group.add(model);
    const bounds = new Box3().setFromObject(model);
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height <= 0) { store.setModelMessage('The 3D model has invalid dimensions.'); return; }
    const extent = prepared || withBody ? height : Math.max(height, bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
    model.scale.multiplyScalar((prepared ? 1.72 : withBody ? 0.5 : 0.65) / extent);
    const sizedBounds = new Box3().setFromObject(model);
    model.position.y -= sizedBounds.min.y;
    if (withBody) {
      const body = AssetManager.getGLTF('rich-body')?.scene.clone(true);
      if (body) {
        const bodyBounds = new Box3().setFromObject(body);
        const bodyHeight = bodyBounds.max.y - bodyBounds.min.y;
        if (Number.isFinite(bodyHeight) && bodyHeight > 0) {
          body.scale.multiplyScalar(1.72 / bodyHeight);
          body.position.y -= new Box3().setFromObject(body).min.y;
          group.add(body);
          model.scale.z *= 0.7;
          model.position.set(0, 1.01 - sizedBounds.min.y, -0.22);
          model.rotation.y = Math.PI;
        }
      }
    }
    group.position.copy(this.position);
    this.camera.getWorldPosition(this.head);
    group.rotation.y = Math.atan2(group.position.x - this.head.x, group.position.z - this.head.z);
    group.userData.productId = productId;
    this.placed = this.world.createTransformEntity(group);
    this.awaitingPlacement = false;
    this.reticle.object3D!.visible = false;
  }

  update(): void {
    if (!this.awaitingPlacement) { this.reticle.object3D!.visible = false; return; }
    const hit = this.reticle.getValue(EnvironmentRaycastTarget, 'xrHitTestResult');
    this.reticle.object3D!.visible = Boolean(hit);
    if (!hit || !this.input.xr.gamepads.right?.getButtonDown(InputComponent.Trigger)) return;
    this.reticle.object3D!.getWorldPosition(this.position);
    const state = store.getState();
    if (this.activeAssetKey && state.modelProductId === state.selectedId) {
      this.place(this.activeAssetKey, state.modelProductId!);
      store.setModelMessage('Placed the 3D preview in your room. Walk around to inspect it.');
    }
  }
}
