import { Box3, DirectionalLight, Group, HemisphereLight, Vector3, VisibilityState, createSystem } from '@iwsdk/core';
import { store } from './store.js';
import { PREPARED_MODEL_URL } from './contracts.js';
import { getLoadedProductModel, loadProductModel } from './model-loader.js';

function lightModel(group: Group): void {
  // Passthrough does not light Meshy materials by itself.
  group.add(new HemisphereLight(0xffffff, 0x6f745f, 2.2));
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(1.5, 3, 2.5);
  group.add(key);
}

/** A saved demo body is present at entry; selected models appear beside the UI. */
export class ModelPlacementSystem extends createSystem({}) {
  private demoBody?: ReturnType<typeof this.world.createTransformEntity>;
  private bodyLoading = false;
  private alive = true;
  private loadingPreview = false;
  private enterPending = false;
  private active = false;
  private placed?: ReturnType<typeof this.world.createTransformEntity>;
  private request = 0;
  private readonly assetUrls = new Map<string, string>();
  private readyKey = '';
  private readonly position = new Vector3();
  private readonly head = new Vector3();
  private readonly direction = new Vector3();
  private bodyAvailable = false;

  init(): void {
    this.cleanupFuncs.push(this.world.visibilityState.subscribe(value => {
      const active = value !== VisibilityState.NonImmersive;
      if (active && !this.active) this.enterPending = true;
      this.active = active;
      if (this.placed?.object3D) this.placed.object3D.visible = active;
      if (this.demoBody?.object3D) this.demoBody.object3D.visible = active && !this.placed;
    }));
    const rotate = () => {
      const model = this.placed?.object3D ?? this.demoBody?.object3D;
      if (model) model.rotation.y += Math.PI / 4;
    };
    window.addEventListener('trail:rotate-model', rotate);
    this.cleanupFuncs.push(() => window.removeEventListener('trail:rotate-model', rotate));
    const requestPlacement = () => { void this.preparePlacement(); };
    window.addEventListener('trail:place-model', requestPlacement);
    this.cleanupFuncs.push(() => window.removeEventListener('trail:place-model', requestPlacement));
    window.addEventListener('trail:xr-enter', requestPlacement);
    this.cleanupFuncs.push(() => window.removeEventListener('trail:xr-enter', requestPlacement));
    this.cleanupFuncs.push(store.subscribe(state => {
      if (this.placed && this.placed.object3D?.userData.productId !== state.selectedId) {
        this.placed.dispose({ disposeResources: false });
        this.placed = undefined;
        if (this.demoBody?.object3D) this.demoBody.object3D.visible = this.active;
      }
      if (state.modelStatus !== 'ready' || state.modelProductId !== state.selectedId) {
        this.request++;
      }
      const readyKey = state.modelStatus === 'ready' && state.modelProductId === state.selectedId ? `${state.modelProductId}:${state.modelUrl}` : '';
      const newlyReady = Boolean(readyKey && readyKey !== this.readyKey);
      this.readyKey = readyKey;
      if (newlyReady && this.world.session) void this.preparePlacement();
    }));
    this.cleanupFuncs.push(() => {
      this.alive = false; this.request++;
      this.placed?.dispose({ disposeResources: false });
      this.demoBody?.dispose({ disposeResources: false });
      for (const url of this.assetUrls.values()) URL.revokeObjectURL(url);
    });
  }

  private async preparePlacement(): Promise<void> {
    const state = store.getState();
    if (this.loadingPreview) return;
    if (state.modelStatus !== 'ready' || !state.modelUrl || state.modelProductId !== state.selectedId) return;
    if (!this.world.session) {
      store.setModelMessage('Enter your room to view the selected model.');
      return;
    }
    this.loadingPreview = true;
    const request = ++this.request;
    const prepared = state.modelUrl.startsWith(PREPARED_MODEL_URL);
    const backpack = state.products.find(product => product.id === state.selectedId)?.previewMode === 'backpack';
    store.setModelMessage('Opening your 3D preview…');
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
      await loadProductModel(assetKey);
      if (!prepared && backpack && !this.bodyAvailable) {
        const bodyUrl = `${import.meta.env.BASE_URL}demo/rich-body.glb`;
        const response = await fetch(bodyUrl, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
        if (response?.ok && !response.headers.get('content-type')?.includes('text/html')) {
          try { await loadProductModel(bodyUrl); this.bodyAvailable = true; }
          catch { this.bodyAvailable = false; }
        }
      }
      if (!this.alive || !this.active || request !== this.request || store.getState().selectedId !== state.modelProductId) return;
      this.placeAhead(assetKey, state.modelProductId!);
    } catch (error) {
      console.error('Quest 3D preview could not load', error);
      if (this.alive && request === this.request) store.setModelMessage('The 3D preview could not open. Choose See it in my room to retry.');
    } finally { this.loadingPreview = false; }
  }

  private placeAhead(url: string, productId: string): void {
    this.positionAhead();
    if (this.place(url, productId)) store.setModelMessage('In your room. Walk around to inspect, or choose Rotate preview.');
  }

  private place(url: string, productId: string): boolean {
    const gltf = getLoadedProductModel(url);
    if (!gltf) { store.setModelMessage('The prepared 3D model is unavailable.'); return false; }
    const group = new Group();
    const prepared = url.startsWith(PREPARED_MODEL_URL);
    const backpack = store.getState().products.find(product => product.id === productId)?.previewMode === 'backpack';
    const withBody = !prepared && backpack && this.bodyAvailable;
    group.name = prepared || withBody ? 'Rich with selected Shopify backpack' : 'Selected Shopify product';
    // Keep decoded geometry cached, but clone before sizing and positioning.
    const model = gltf.scene.clone(true);
    group.add(model);
    lightModel(group);
    const bounds = new Box3().setFromObject(model);
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height <= 0) { store.setModelMessage('The 3D model has invalid dimensions.'); return false; }
    const extent = prepared || withBody ? height : Math.max(height, bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
    model.scale.multiplyScalar((prepared ? 1.72 : withBody ? 0.5 : 0.65) / extent);
    const sizedBounds = new Box3().setFromObject(model);
    model.position.y -= sizedBounds.min.y;
    if (withBody) {
      const body = getLoadedProductModel(`${import.meta.env.BASE_URL}demo/rich-body.glb`)?.scene.clone(true);
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
    this.placed?.dispose({ disposeResources: false });
    this.placed = this.world.createTransformEntity(group);
    if (this.demoBody?.object3D) this.demoBody.object3D.visible = false;
    return true;
  }

  private async showDemoBody(): Promise<void> {
    if (this.demoBody || this.bodyLoading) return;
    this.bodyLoading = true;
    try {
      const bodyUrl = `${import.meta.env.BASE_URL}demo/rich-body.glb`;
      await loadProductModel(bodyUrl);
      if (!this.alive) return;
      this.bodyAvailable = true;
      const body = getLoadedProductModel(bodyUrl)?.scene.clone(true);
      if (!body) return;
      const bounds = new Box3().setFromObject(body);
      const height = bounds.max.y - bounds.min.y;
      if (!Number.isFinite(height) || height <= 0) return;
      body.scale.multiplyScalar(1.72 / height);
      body.position.y -= new Box3().setFromObject(body).min.y;
      const group = new Group();
      group.name = 'Rich / saved demo body';
      group.add(body);
      lightModel(group);
      this.positionAhead();
      group.position.copy(this.position);
      group.rotation.y = Math.atan2(group.position.x - this.head.x, group.position.z - this.head.z);
      group.visible = this.active && !this.placed;
      this.demoBody = this.world.createTransformEntity(group);
    } catch {
      store.setModelMessage('Rich could not load. Your shopping cards still work; reload to retry the saved body.');
    } finally { this.bodyLoading = false; }
  }

  private positionAhead(): void {
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.direction);
    this.direction.negate(); this.direction.y = 0; this.direction.normalize();
    this.position.copy(this.head).addScaledVector(this.direction, 2.1);
    this.position.x -= this.direction.z * 0.75;
    this.position.z += this.direction.x * 0.75;
    this.position.y = Math.max(0, this.head.y - 1.6);
  }

  update(): void {
    if (!this.enterPending) return;
    this.enterPending = false;
    const displayed = this.placed ?? this.demoBody;
    if (displayed?.object3D) {
      this.positionAhead();
      displayed.object3D.position.copy(this.position);
      displayed.object3D.rotation.y = Math.atan2(this.position.x - this.head.x, this.position.z - this.head.z);
    } else void this.showDemoBody();
  }
}
