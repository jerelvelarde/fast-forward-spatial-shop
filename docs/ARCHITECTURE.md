# Trail implementation architecture

## Runtime

Vite + TypeScript, Meta IWSDK 1.0.1, a Node API and AI SDK 7. The official starter remains the world/bootstrap authority: `iwsdk.config.json` selects the scene, manifests and features; `src/index.ts` passes `virtual:iwsdk-project` to `World.create`.

| Module | Responsibility |
| --- | --- |
| `src/desktop.ts` | Prompt-first voice/typed input, product card grid, photo/token dialog and tool execution handlers |
| `src/assistant-tools.ts` | Bounded command parsing, cancellable sequential tools and typed AG-UI lifecycle events |
| `src/webcam.ts` | Explicit camera session, late-permission cleanup, aspect-preserving JPEG capture capped at 2 MB |
| `src/gestures.ts` | Landmark-to-action state machine: mirrored open-palm swipes and held pinch, with cooldown/rearming |
| `src/hand-tracking.ts` / `.worker.ts` | On-device MediaPipe hand inference over the existing camera stream; worker lifecycle and frame backpressure |
| `src/store.ts` | Shared search, selection, checkout and try-on state; stale request cancellation |
| `src/shopping.ts` | Reactive UIKitML bindings, ray clicks and thumbstick navigation |
| `src/assets.ts` | Pure manifest, reused by runtime and editor |
| `public/scenes/main.iwsdk.scene.json` | Stationary arc, title, controls, try-on panel, landscape |
| `server/catalog.ts` | Validated budget, Shop MCP request, live variant normalization |
| `server/checkout.ts` | Revalidate selection, create/recover one Shop checkout and validate merchant continuation |
| `server/try-on.ts` | Private token guard, photo validation, catalog revalidation, Gateway generation |
| `server/http.ts` | Web Request/Response routes and bounded JSON bodies |
| `vite.config.ts` / `api/index.ts` | Local middleware / Vercel fetch adapter |

## Catalog and constraints

POST `/api/search` accepts `{query}` and calls the event Shop MCP `search_catalog` at `https://mcp.shop.com/`. No catalog credential is required for this endpoint. Currency and destination are fixed to USD/US. The requested budget is capped at $150; strict under-budget filtering uses integer cents. The adapter requires in-stock status, an image, and backpack plus camping/hiking/outdoor evidence. This is a bounded keyword-based workflow, not multi-turn LLM planning.

Each card retains exact variant ID, price, seller, image URL and merchant URL (including upstream query parameters). Catalog responses use no-store, no inventory cache, no image rehosting. Failed searches produce visible errors rather than fixtures. Desktop shows a responsive grid; VR uses three cards as a sliding window over up to twelve results.

## Selection and try-on

Both browser and XR subscribe to one in-memory store per tab. Search requests and generation requests use version counters and abort signals, preventing stale results or an old backpack image from replacing the current selection. Changing a product or person clears the previous preview.

GET `/api/config` reveals only whether generation is configured. POST `/api/try-on` accepts `{productId, query, photoDataUrl, accessToken}`. It requires a server key and private demo token, validates image type and 2 MB size, re-searches to verify current availability/budget, and fetches only that product's verified Shopify CDN image with redirects disabled. AI SDK sends both images to `google/gemini-3.1-flash-image` via AI Gateway. Output is an image data URL. Landscape output and instructions preserve person framing and scale the backpack to the torso. The app does not store photos or generation outputs on the server. No camera stream is sent to the backend and no body tracking is implemented.

Laptop webcam preview begins only after an explicit click or recognized photo command. Capture preserves aspect ratio, resizes to at most 1600 pixels on the long edge, and compresses to JPEG under the upload cap. The session releases tracks on capture, cancellation, source changes, hidden tabs, page exit, teardown, and IWSDK immersive entry. A version counter discards late permission and image encoding results. Webcam photos use the same store and generation endpoint as uploads.

The desktop dialog renders `photoDataUrl` and `tryOnImage` separately as Before and After. The original remains visible while generation is pending or fails; selecting another product clears only its obsolete output. Live preview is mirrored for intuitive hand motion, while saved photos keep their original orientation.

Hand tracking uses pinned MediaPipe Tasks Vision 1.1.0 with a locally served model. `forVisionTasks(path, true)` selects its ES-module WASM loader for the module worker. Frames are capped at 640 pixels on the long edge and 10 per second with one inference in flight. A 500 ms pinch selects once until release; swipes require sufficient horizontal motion and settle before rearming. Pinch confirmation pauses tracking without stopping the camera. Capture and all camera stop paths also terminate the worker. Gestures never trigger paid generation. Asset provenance is recorded in `public/hand-tracking/README.md`.

## Webcam AR presentation

While the webcam is ready, `renderAr` displays a three-card window over the live video in `.person-preview`. CSS perspective, side-card rotation and translucent surfaces give the cards depth while keeping the person visible. The video alone is mirrored; labels and prices remain readable. Cards retain exact catalog IDs and use the same store selection as desktop, gestures and VR. Pinch or the in-camera selection button confirms the centered card. Camera-relative placement is intentional: there is no SLAM, room anchor, depth occlusion or pose-estimated product model.

Capturing reads the video element only. It never screenshots or composites the overlay, so the Before photo and image-model input contain no shopping UI. The overlay hides after capture and returns on retake. The camera stage has its own arrows and selection control; normal browse controls below the camera hide while it is active.

## Tool commands and AG-UI

`dispatchPrompt` routes both text and transcribed speech. Explicit photo/try-on/buy commands map to a bounded plan; other requests go to catalog search. Missing selection/configuration/token is reported before camera activation for a combined generation request. With no photo, try-on prepends capture. Gesture inference pauses while tools run, selection is locked, and capture uses a visible three-second countdown.

The runner uses `@ag-ui/core` 1.0.2 events: RUN_STARTED, TOOL_CALL_START/ARGS/END, TOOL_CALL_RESULT and RUN_FINISHED or RUN_ERROR. TOOL_CALL_END closes argument streaming; RESULT follows successful execution. Correlated call IDs drive the progress pills. Arguments are empty because handlers obtain validated local state; neither photos nor credentials enter events. This is an in-process event stream with a deterministic router, not a remote AG-UI HttpAgent/SSE server or LLM planner. The protocol can later connect an agent backend while preserving the custom DOM and spatial renderer. See the [official AG-UI project](https://github.com/ag-ui-protocol/ag-ui).

Closing the dialog, entering VR, hiding the tab, changing photo source, cancelling or changing selection aborts pending tools. Capture and generated-result version checks suppress late work. Aborting a request cannot guarantee cancellation of a provider job already submitted.

## Input and device scope

The microphone uses MediaRecorder to capture up to ten seconds after user activation, then sends the clip to `/api/transcribe` through AI Gateway. Web Speech API is a fallback where recording or server transcription is unavailable. Typed input is always available. Prepare photo and token in the browser, then enter Quest VR. Ray selection uses IWSDK RayInteractable/UIKitML; the right thumbstick uses built-in edge helpers. Locomotion, grabbing and physics are disabled. Quest uses an HTTPS deployment; localhost supports desktop emulation. Physical Quest and microphone behavior require separate verification.

## Checkout and Quest handoff

`prepare_checkout` sends `{productId, query, expectedPrice, requestId, checkoutId?}` to `/api/checkout`. The server searches again and uses the exact catalog seller domain and opaque variant ID. A new request calls Shop MCP `create_checkout` with quantity one, USD/US context and a UUID idempotency key. A known session calls `get_checkout`. The adapter verifies item ID, quantity, unit price, currency, open status and the HTTPS continuation host before returning the review. Shipping/taxes are confirmed by the merchant; the app does not call `complete_checkout`.

The tab retains each attempt's key and session ID for retries. A selection/search change aborts the local request and removes the old checkout link. An upstream checkout can survive local cancellation, but no order is submitted. `show_checkout` ends the immersive session and opens a DOM review with an explicit merchant link; asynchronous voice never opens a popup automatically.

Quest AR uses `SessionMode.ImmersiveAR`, SDK passthrough background handling and a hidden authored landscape. Production excludes IWER; local development excludes OculusBrowser from injection. Only the transition into immersive mode runs media cleanup, avoiding cancellation on permission-related visibility blur. See [Quest hardware checklist](QUEST.md).

## Deployment

Vercel serves `dist` and rewrites `/api/*` to the Node fetch function. Environment secrets never use a `VITE_` prefix. The optional image-model override stays on the server. Photo try-on requires a private demo token. 3D generation uses the server-side Meshy key without a browser token, checks the selected Shopify variant, and applies best-effort per-client and per-instance start limits. Polling and asset downloads use a signed task ticket. A durable rate limiter or Vercel Firewall rule is needed for a long-lived public service. `npm run preview` is static only.

See [verification evidence](../design/VERIFICATION.md) and the README for setup and known gaps.
