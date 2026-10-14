import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Bundle the decoder with the app so a Quest never waits on a third-party CDN.
const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
const loader = new GLTFLoader().setDRACOLoader(draco);
const cache = new Map<string, Promise<GLTF>>();
const loaded = new Map<string, GLTF>();

export function loadProductModel(url: string): Promise<GLTF> {
  let pending = cache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url).then(gltf => {
      loaded.set(url, gltf);
      return gltf;
    }).catch(error => {
      cache.delete(url);
      throw error;
    });
    cache.set(url, pending);
  }
  return pending;
}

export function getLoadedProductModel(url: string): GLTF | undefined {
  return loaded.get(url);
}

export function warmDemoModel(): void {
  for (const name of ['rich-body.glb', 'rich-with-backpack.glb']) {
    void loadProductModel(`${import.meta.env.BASE_URL}demo/${name}`).catch(error => {
      console.warn(`${name} preload failed; the app will retry when selected.`, error);
    });
  }
}
