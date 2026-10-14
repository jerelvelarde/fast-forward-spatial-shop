# Trail implementation architecture

## Runtime

Vite + TypeScript, Meta IWSDK 1.0.1, a Node API and AI SDK 7. The official starter remains the world/bootstrap authority: `iwsdk.config.json` selects the scene, manifests and features; `src/index.ts` passes `virtual:iwsdk-project` to `World.create`.

| Module | Responsibility |
| --- | --- |
| `src/desktop.ts` | Voice/typed search, accessible carousel, selected detail, photo/token dialog |
| `src/webcam.ts` | Explicit camera session, late-permission cleanup, aspect-preserving JPEG capture capped at 2 MB |
| `src/gestures.ts` | Landmark-to-action state machine: mirrored open-palm swipes and held pinch, with cooldown/rearming |
| `src/hand-tracking.ts` / `.worker.ts` | On-device MediaPipe hand inference over the existing camera stream; worker lifecycle and frame backpressure |
| `src/store.ts` | Shared search, selection and try-on state; stale request cancellation |
| `src/shopping.ts` | Reactive UIKitML bindings, ray clicks and thumbstick navigation |
| `src/assets.ts` | Pure manifest, reused by runtime and editor |
| `public/scenes/main.iwsdk.scene.json` | Stationary arc, title, controls, try-on panel, landscape |
| `server/catalog.ts` | Validated budget, Shop MCP request, live variant normalization |
| `server/try-on.ts` | Private token guard, photo validation, catalog revalidation, Gateway generation |
| `server/http.ts` | Web Request/Response routes and bounded JSON bodies |
| `vite.config.ts` / `api/index.ts` | Local middleware / Vercel fetch adapter |

## Catalog and constraints

POST `/api/search` accepts `{query}` and calls the event Shop MCP `search_catalog` at `https://mcp.shop.com/`. No catalog credential is required for this endpoint. Currency and destination are fixed to USD/US. The requested budget is capped at $150; strict under-budget filtering uses integer cents. The adapter requires in-stock status, an image, and backpack plus camping/hiking/outdoor evidence. This is a bounded keyword-based workflow, not multi-turn LLM planning.

Each card retains exact variant ID, price, seller, image URL and merchant URL (including upstream query parameters). Catalog responses use no-store, no inventory cache, no image rehosting. Failed searches produce visible errors rather than fixtures. Three cards show a sliding window over up to twelve results.

## Selection and try-on

Both browser and XR subscribe to one in-memory store per tab. Search requests and generation requests use version counters and abort signals, preventing stale results or an old backpack image from replacing the current selection. Changing a product or person clears the previous preview.

GET `/api/config` reveals only whether generation is configured. POST `/api/try-on` accepts `{productId, query, photoDataUrl, accessToken}`. It requires a server key and private demo token, validates image type and 2 MB size, re-searches to verify current availability/budget, and fetches only that product's verified Shopify CDN image with redirects disabled. AI SDK sends both images to `google/gemini-3.1-flash-image` via AI Gateway. Output is an image data URL. Landscape output and instructions preserve person framing and scale the backpack to the torso. The app does not store photos or generation outputs on the server. No camera stream is sent to the backend and no body tracking is implemented.

Laptop webcam preview begins only after an explicit click. Capture preserves aspect ratio, resizes to at most 1600 pixels on the long edge, and compresses to JPEG under the upload cap. The session releases tracks on capture, cancellation, source changes, hidden tabs, page exit, teardown, and IWSDK immersive entry. A version counter discards late permission and image encoding results. Webcam photos use the same store and generation endpoint as uploads.

The desktop dialog renders `photoDataUrl` and `tryOnImage` separately as Before and After. The original remains visible while generation is pending or fails; selecting another product clears only its obsolete output. Live preview is mirrored for intuitive hand motion, while saved photos keep their original orientation.

Hand tracking uses pinned MediaPipe Tasks Vision 1.1.0 with a locally served model. `forVisionTasks(path, true)` selects its ES-module WASM loader for the module worker. Frames are capped at 640 pixels on the long edge and 10 per second with one inference in flight. A 500 ms pinch selects once until release; swipes require sufficient horizontal motion and settle before rearming. Pinch confirmation pauses tracking without stopping the camera. Capture and all camera stop paths also terminate the worker. Gestures never trigger paid generation. Asset provenance is recorded in `public/hand-tracking/README.md`.

## Input and device scope

Web Speech API captures voice after user activation where supported. Typed input is always available. Prepare photo and token in the browser, then enter Quest VR. Ray selection uses IWSDK RayInteractable/UIKitML; the right thumbstick uses built-in edge helpers. Locomotion, grabbing and physics are disabled. Quest uses an HTTPS deployment; localhost supports desktop emulation. Physical Quest and microphone behavior require separate verification.

## Deployment

Vercel serves `dist` and rewrites `/api/*` to the Node fetch function. Environment secrets never use a `VITE_` prefix. The optional image-model override stays on the server. A private token protects paid generation; it is a hackathon demo guard, not a production multi-user identity system. `npm run preview` is static only.

See [verification evidence](../design/VERIFICATION.md) and the README for setup and known gaps.
