# TryitonAR — spatial Shopify shopping

Trail is a voice and text shopping experience for Meta Quest Browser. Search the live Shopify catalog, browse and select products in VR or passthrough AR, preview them with a photo, request a 3D model, and prepare a merchant checkout. The desktop page shares the same selected product and backend.

**Live demo:** [trailxr.vercel.app](https://trailxr.vercel.app/) · [Quest walkthrough](docs/QUEST.md)

## Experience preview

The original AI-generated concept mockups use frames from the supplied demo video. Products and prices in these concepts are illustrative; live search enforces the requested budget.

### Browse and swipe shopping cards

![AI-generated concept of spatial backpack shopping cards](docs/images/01-shopping-cards.png)

### Select a backpack

![AI-generated concept of a selected backpack card in VR](docs/images/02-selected-card.png)

### See the backpack on Rich

![AI-generated concept of Rich wearing the selected backpack](docs/images/03-backpack-try-on.png)

### Webcam AR shopping prototype

![Webcam AR shopping interface with floating product cards and a selected backpack](docs/images/webcam-ar-shopping.png)

## Demo paths

- **Fast headset demo:** Open the app in Quest Browser and choose **Enter your room**. Rich's saved 3D body appears in AR. Choose **Use demo model** in the spatial shopping controls to select the black 30L Stealth Angel backpack and show Rich wearing it immediately. The saved model uses no Meshy credits. The Shopify variant ID is `gid://shopify/ProductVariant/36808158601`.
- **Any selected Shopify product:** Search for a backpack, jacket, tent, or another product, open a product card, and choose **Generate 3D preview**. The backend rechecks the selected variant and sends up to four verified Shopify images to Meshy. When ready, the model appears beside the panel. Other backpacks are fitted approximately to the saved Rich body; other products appear as standalone room objects. This generation consumes Meshy credits and can take several minutes.
- **Photo preview:** Rich's demo photo loads automatically when you open try-on. You can replace it with an upload or camera capture. Enter the private demo token and choose **Generate my try-on**. Wearables are shown on the person; other products are placed beside them. This is an AI image visualization, not a fit measurement.
- **Checkout:** Choose **Buy selected** or say “buy this item.” The server rechecks the variant, price, availability and merchant, prepares quantity one, and hands off to merchant checkout. Trail never collects payment details or places the order.

The opening example remains a backpack because its saved 3D asset makes the judge demo quick. Search, selection, photo preview, checkout, and live 3D requests also support other product categories.

## Run locally

Node 22.12+ is recommended. Copy `.env.example` to `.env.local`, then add your keys and a private token of at least 16 characters.

```sh
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). The local Vite server handles `/api/*`. `AI_GATEWAY_API_KEY` enables server speech transcription and image previews; `MESHY_API_KEY` enables live 3D generation; `TRY_ON_ACCESS_TOKEN` is only for the photo try-on. The 3D button uses the server-side Meshy key automatically and never exposes it to the browser. Do not use a `VITE_` prefix for any secret. The saved 3D backpack preview needs no Meshy key.

`npm run preview` serves static output only. Use `npm run dev` or Vercel to test APIs. The [voice test page](public/voice-shop-test.html) remains available at `/voice-shop-test.html`.

## 3D asset preparation and limits

The saved Rich model uses [Rich's supplied photo](public/demo/person.png). We isolated the person for reconstruction and prepared the selected backpack from three Shopify product views. The final [combined GLB](public/demo/rich-with-backpack.glb) is approximately 1.6 MB after polygon simplification, Draco geometry compression, and 1024-pixel WebP textures. [The body](public/demo/rich-body.glb) is used for live backpack previews. The full-resolution Meshy outputs are ignored locally and never deployed.

Live generation requests Meshy 6 Lite, standard geometry, a 30,000 polygon remesh target, and its minimum 2K texture option. The public demo verifies each selected Shopify variant, reuses in-process tasks, and limits new paid starts per visitor and per server instance. These limits are best effort on Vercel's serverless functions; add a durable rate limiter or Vercel Firewall rule before leaving open generation online long term. Polling and asset downloads require a short-lived signed task ticket, not the Meshy key. Meshy's signed asset host omits browser CORS headers, so the finished GLB is streamed through `/api/model` and loaded from a local browser Blob URL. Meshy URLs expire, so the saved demo GLB is bundled with the app. A live model's dimensions and orientation can vary; backpack placement on Rich is an approximate scale and pose, not a simulated fit. Rich's face and obscured clothing are inferred because the supplied photo is a rear view.

The one-time scripts in `scripts/prepare-rich-body.mjs` and `scripts/prepare-demo-backpack.mjs` create raw GLBs under ignored `work/raw/`, outside Vite's public assets. They require Meshy credits and do not overwrite the optimized deployed files. Re-run them only when rebuilding the demo asset.

## Quest use

Open the HTTPS live URL in Quest Browser and choose **Enter your room**. This starts passthrough AR when available; **Enter VR** remains a fallback. Quest requires this initial user click. Inside the scene, Rich's saved body appears beside a voice prompt before any search. **Speak your request** starts/stops the microphone; **Try backpack search** is a no-microphone shortcut. Point and pinch, or use a controller trigger, to open a card. The right thumbstick or Previous/Next browse results. Say **“try it on”** or choose **See it in my room** to load the saved backpack preview and place it beside the panel automatically. **Rotate preview** turns the body; **Bring UI here** repositions the panels in front of the current viewer without attaching them to head movement. Models are placed relative to the current viewer at an estimated floor height; this is not room-mesh anchoring. **Browser setup and photo tools** exposes photo/token setup when needed. No token is needed for 3D generation; photo try-on still needs the private token.

Quest passthrough is a composited environment; this app does not read Quest camera pixels. The live webcam and hand-gesture shopping mode runs on a laptop. The saved model has been inspected in a browser, but placement and performance still require a physical Quest check on the deployed build.

## Architecture and verification

- `server/catalog.ts` searches Shop MCP, enforces the spoken USD budget, and maps each Shopify variant to an exact selectable product. The default cap is $150 if no budget is spoken; explicit caps up to $500 are accepted.
- `server/model.ts` validates that the selected variant still occurs in the same Shopify query, returns the prepared model for the demo variant, or starts and polls a protected Meshy task for another product.
- `src/store.ts` keeps selection and async tasks in sync. Switching products cancels the visible old result. A Meshy task ID is kept in session storage so the same browser tab can resume polling after a refresh.
- `src/model-placement.ts` loads the GLB through a same-origin Draco decoder and shows Rich at entry, then places selected models beside the spatial controls. `src/shopping.ts` binds spatial controls to the same store.
- Voice and typed action commands use a bounded local router and AG-UI tool progress. They do not use a multi-turn LLM planner.

```sh
npm run typecheck
npm test
npm run build
```

The API and state tests use mocked providers. Physical headset acceptance should verify passthrough, selection and automatic placement, model orientation and scale, speech permission, and checkout handoff without completing a purchase. The [AR verification notes](docs/AR-VERIFICATION.md) distinguish live catalog evidence, fixture flow tests, and pending hardware checks. Design history and earlier screenshots remain in [`design/`](design/) and [`docs/images/`](docs/images/).
