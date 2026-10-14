# Trail — spatial Shopify shopping

Trail is a voice and text shopping experience for Meta Quest Browser. Search the live Shopify catalog, browse and select products in VR or passthrough AR, preview them with a photo, request a 3D model, and prepare a merchant checkout. The desktop page shares the same selected product and backend.

**Live demo:** [trailxr.vercel.app](https://trailxr.vercel.app/) · [Quest walkthrough](docs/QUEST.md)

## Demo paths

- **Fast headset demo:** Search **“Find me a camping backpack under 150 US dollars.”** Select the black 30L Stealth Angel backpack, choose **Load prepared 3D preview**, enter Quest AR, then choose **Place in room**. A compressed, saved model of Rich with that exact backpack appears without another Meshy call. The Shopify variant ID is `gid://shopify/ProductVariant/36808158601`.
- **Any selected Shopify product:** Search for a backpack, jacket, tent, or another product, select an item, and choose **Generate 3D**. The backend rechecks the selected variant and sends up to four verified Shopify images to Meshy. When ready, choose **Place in room** in Quest AR. Other backpacks are fitted approximately to the saved Rich body; other products appear as standalone room objects. This generation consumes Meshy credits and can take several minutes.
- **Photo preview:** Upload or capture a person photo, enter the private demo token, and choose **Generate my try-on**. Wearables are shown on the person; other products are placed beside them. This is an AI image visualization, not a fit measurement.
- **Checkout:** Choose **Buy selected** or say “buy this item.” The server rechecks the variant, price, availability and merchant, prepares quantity one, and hands off to merchant checkout. Trail never collects payment details or places the order.

The opening example remains a backpack because its saved 3D asset makes the judge demo quick. Search, selection, photo preview, checkout, and live 3D requests also support other product categories.

## Run locally

Node 22.12+ is recommended. Copy `.env.example` to `.env.local`, then add your keys and a private token of at least 16 characters.

```sh
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). The local Vite server handles `/api/*`. `AI_GATEWAY_API_KEY` enables server speech transcription and image previews; `MESHY_API_KEY` enables live 3D generation; `TRY_ON_ACCESS_TOKEN` guards both paid generation endpoints. Enter that token in the browser before a live request. Do not use a `VITE_` prefix for any secret. The saved 3D backpack preview needs no Meshy key or token.

`npm run preview` serves static output only. Use `npm run dev` or Vercel to test APIs. The [voice test page](public/voice-shop-test.html) remains available at `/voice-shop-test.html`.

## 3D asset preparation and limits

The saved Rich model uses [Rich's supplied photo](public/demo/person.png). We isolated the person for reconstruction and prepared the selected backpack from three Shopify product views. The final [combined GLB](public/demo/rich-with-backpack.glb) is approximately 1.6 MB after polygon simplification, Draco geometry compression, and 1024-pixel WebP textures. [The body](public/demo/rich-body.glb) is used for live backpack previews. The full-resolution Meshy outputs are ignored locally and never deployed.

Live generation requests Meshy 6 Lite, standard geometry, a 30,000 polygon remesh target, and its minimum 2K texture option. The output is returned directly from Meshy's signed asset URL. Meshy URLs expire, so the saved demo GLB is bundled with the app. A live model's dimensions and orientation can vary; backpack placement on Rich is an approximate scale and pose, not a simulated fit. Rich's face and obscured clothing are inferred because the supplied photo is a rear view.

The one-time scripts in `scripts/prepare-rich-body.mjs` and `scripts/prepare-demo-backpack.mjs` create raw GLBs. They require Meshy credits and do not overwrite the optimized deployed files. Re-run them only when rebuilding the demo asset.

## Quest use

Open the HTTPS live URL in Quest Browser. Allow microphone and XR access. Search on the browser page, select a product, and choose **Enter Quest AR**. Controller trigger selects cards and places the 3D object on a detected surface; the right thumbstick or Previous/Next buttons browse products. If surface hit testing is unavailable, **Place in room** places the model ahead of the viewer. **Enter VR** opens the showroom without passthrough. Product cards, voice controls, photo preview and checkout controls are available in the spatial UI. Prepare a photo and private token in the browser page before entering immersive mode.

Quest passthrough is a composited environment; this app does not read Quest camera pixels. The live webcam and hand-gesture shopping mode runs on a laptop. The saved model has been inspected in a browser, but placement and performance still require a physical Quest check on the deployed build.

## Architecture and verification

- `server/catalog.ts` searches Shop MCP, enforces the spoken USD budget, and maps each Shopify variant to an exact selectable product. The default cap is $150 if no budget is spoken; explicit caps up to $500 are accepted.
- `server/model.ts` validates that the selected variant still occurs in the same Shopify query, returns the prepared model for the demo variant, or starts and polls a protected Meshy task for another product.
- `src/store.ts` keeps selection and async tasks in sync. Switching products cancels the visible old result. A Meshy task ID is kept in session storage so the same browser tab can resume polling after a refresh.
- `src/model-placement.ts` loads the GLB through IWSDK's asset manager and places it in Quest AR. `src/shopping.ts` binds spatial controls to the same store.
- Voice and typed action commands use a bounded local router and AG-UI tool progress. They do not use a multi-turn LLM planner.

```sh
npm run typecheck
npm test
npm run build
```

The API and state tests use mocked providers. Physical headset acceptance should verify passthrough, trigger placement, model orientation and scale, speech permission, and checkout handoff without completing a purchase. Design history and earlier screenshots remain in [`design/`](design/) and [`docs/images/`](docs/images/).
