# Verification — 14 October 2026

## Passed

| Criterion | Evidence |
| --- | --- |
| Official starter baseline | `npm run typecheck`; managed screenshot `verify/m0-starter.png`; xr.status showed active immersive-vr on emulated Meta Quest 3 |
| Scene parses and renders from the user spawn | `iwsdk scene render-file` returned valid:true, zero diagnostics, all seven authored node IDs visible |
| Spatial UI layout | `iwsdk ui render-preview` for product-card and try-on-panel; `verify/m1-card.png`, `verify/m3-try-on-panel.png` |
| Live catalog through UI | Browser Find my backpack returned 12 live USD products below $150 with source URLs and images; no fixture fallback |
| Desktop selection | Next backpack changed selection from Stealth Angel 30L ($24.95) to MilitaryKart 60L ($64.99); source link changed to that variant |
| Photo preparation | Try it on dialog opened with selected product; Use the video frame loaded the supplied rear-view human photo |
| Missing credentials | Before local configuration, `/api/config` returned tryOnEnabled:false; dialog explained setup and disabled generation |
| VR entry and search | `iwsdk xr enter`, controller look-at, then complete `xr select` on Find backpacks produced `1 of 12` in controls caption |
| Thumbstick navigation | Right controller X axis 1 then 0 changed live caption from `1 of 12` to `2 of 12` |
| Ray card selection | Right-card look-at and complete xr select changed caption from `2 of 12` to `3 of 12` |
| Return to browser | xr exit preserved live results; `verify/final-desktop.png` |
| Responsive reading | Browser checks at 1280×720 and 390×844; bounded desktop left-panel scroll and opaque phone reading surface |
| Type safety | `npm run typecheck` includes frontend, backend, adapters, tests and Vite config |
| Behavioral tests | `npm test`: 42 tests pass — catalog/store/server cancellation cases, twelve tool/router/AG-UI event cases, eight webcam lifecycle/capture cases, and eight gesture cases including mirrored direction, jitter, cooldown, pinch hold/release, tracking loss and stale timestamps |
| Before/after browser regression | `/tests/browser/webcam.html` verifies original/after image separation, product changes clearing old output, capture showing a new Before, and camera tracks ending after capture; synthetic frames and mocked API responses |
| Actual hand model in browser | The same harness loads the real local model/WASM in a worker and processes synthetic video frames, yielding the expected no-hand result; no real camera opened |
| Live AI integration | Local `/api/search` → `/api/try-on` with the supplied video frame and live Scout 55L Hiking Backpacks listing ($99.99 at test time) returned a generated image through AI Gateway |
| Webcam lifecycle | Mocked media tests cover late permissions, superseded requests, playback failure, disconnect, warmup, resizing/size limits, error recovery and successful JPEG capture; real hardware was not opened |
| Production build | `npm run build` succeeds; includes Trail and API request paths in frontend output |

Use `xr select` for complete click simulation. Setting the analog select value alone did not exercise the whole selectstart/select/selectend sequence in this emulator.

## Review and fixes

Reviewed against the starter's ECS, manifest, UI and lifecycle rules. World startup uses the virtual project; scene references pure manifest assets; no direct Three import or custom raycaster; no allocations in the per-frame controller update. Store subscriptions are cleaned up by the shopping system. Removed unused starter room, cube, robot and media. No credentials or runtime cache are included in the repository.

UIKitML image-specific properties must be element attributes, and the SVG placeholder needs intrinsic width/height. Both were fixed after real renderer errors. The current glyph atlas does not contain every dynamic Unicode title character; spatial labels use readable ASCII transliterations while desktop/merchant data retain originals. No new missing-glyph errors were observed after that change. An IWSDK/Three resize warning occurred at the emulated XR transition; rendering and input continued correctly.

## Explicitly pending

- Physical laptop webcam permission/capture/retake, swipe/pinch accuracy in real lighting, and browser-specific camera behavior. Synthetic media and landmark tests do not establish hardware accuracy.
- Physical Quest controller/hand behavior, comfort, performance and microphone support. Desktop emulation is not hardware validation.
- Actual speech recognition using a microphone. The browser path and typed fallback are implemented; no synthesized audio was substituted for a real speech test.
- Vercel deployment and deployed API smoke test. Local middleware and function adapter are implemented.
- Build warns about a large SDK bundle (~7.8 MB before gzip, ~2 MB gzip) and includes the starter's desktop emulator. Network startup and Quest frame performance need profiling before wider release.

Photos are not persisted by this app. The supplied demo frame is intentionally bundled. Product observations here are test-time examples, not cached catalog inventory or current price guarantees.

## Live image review

Two authorized Gateway generations were run after local credentials were configured. The first oversized the backpack and obscured the head. Instructions were revised to preserve framing, retain the person's pose, keep the head visible, and scale the pack to the torso, with a 16:9 output setting. The second image visibly placed the selected pack on the back while retaining the person and scene. It remains an approximate appearance preview, not measured fit. The generated verification image is kept outside the public repository. Secrets remain in ignored `.env.local`.

## Gesture integration review

The first browser smoke test caught a MediaPipe module-worker initialization failure despite passing TypeScript and unit checks. The default resolver chose a classic WASM loader whose factory was not exposed after dynamic import. Selecting the package's ES-module loader fixed startup; the real inference/capture browser harness then passed all ten checks with no console errors. No additional paid AI call was needed to verify comparison state.

Merged the concurrent voice-transcription update from `556ef52`, retaining microphone and webcam cleanup on VR entry, page exit and tab hiding. Re-ran typecheck, all 29 tests, production build and the synthetic webcam browser regression after resolving the shared desktop handler conflict.


## Prompt-first interface and tool flow

The landing view now shows only the composer; result controls appear after search. New screenshots: `verify/prompt-first-home.jpg` and `verify/prompt-first-results.jpg`. Live UI search returned twelve camping/outdoor backpacks below $150. The automatic XR offer is disabled; Enter VR remains available after results. A browser click entered the IWER spatial scene with live product cards, and Exit XR restored the same results.

The synthetic browser harness passed 34 checks, including the full dialog command “take a picture and try it on”: decoded camera frame, three-second countdown, captured JPEG, one mocked generation request with the new photo, three completed AG-UI steps, and separate Before/After images. A second command cancelled during countdown ended all camera tracks and synthetic frame timers, preserved the previous photo, made no generation request and produced no stale completed step. The real MediaPipe model still initializes and processes synthetic frames. No physical camera or paid call was used for these checks.

AG-UI event schemas, call/result ordering, redaction, failures and cancellation pass tests against the installed package. Separate store coverage verifies that explicit cancellation rejects late generation results. This validates local tool orchestration; it does not establish a remote AG-UI streaming backend or autonomous LLM planning.


## Webcam AR stage

The updated harness verifies three floating cards from four products, overlay containment in the camera stage, selection changes through browsing and exact card clicks, and overlay removal after capture. Decoding the captured JPEG confirms raw synthetic camera pixels, without product-card UI. The full 34-check browser regression passed, including the existing real-worker inference and combined tool/cancellation cases.

`verify/webcam-ar.jpg` shows live catalog cards over the supplied demo frame via `/tests/browser/ar-preview.html`, a development-only simulated-camera preview with generation disabled. Visual inspection caught and fixed an inherited absolute-image style that obscured card text. The final cards have readable titles/prices, a highlighted center selection and perspective side cards. This verifies camera-relative UI, not physical room anchoring or actual gesture recognition accuracy.

## Voice checkout and Quest 3 / S3A — October 14, 2026

- Typecheck, 51 Node tests and production build passed. Build excludes the desktop emulator; the core IWSDK chunk still produces Vite's size warning (6.6 MB before gzip).
- Browser checkout regression: 11 checks passed with synthetic speech and mocked catalog/checkout; typed/voice tool routing, two AG-UI tool results, immersive-exit handoff, selected item, no photo/token in checkout, stale-link removal and same-session retry.
- Existing browser webcam regression: all 34 checks passed, including actual MediaPipe worker inference on synthetic frames, AR cards, countdown, before/after and cancellation.
- A live Shop MCP checkout smoke call returned Scout 55L Hiking Backpacks, USD 99.99, quantity one, matching catalog variant, status `requires_escalation`, and a merchant continuation URL. No payment, contact details or order submission. Checkout session identifiers and URLs are intentionally excluded from repository evidence.
- IWSDK isolated controls preview rendered successfully at `design/verify/quest-controls.png`; runtime `ui inspect` confirms the Speak / stop and Buy selected elements are visible and unclipped. Runtime logs contained no parser/font/UI errors.
- Native Quest AR entry, production emulator exclusion and microphone-blur lifecycle are implemented. Physical S3A headset voice, passthrough, hand/controller interaction, frame rate and payment-page handoff still require the checklist in `docs/QUEST.md`. Do not equate synthetic browser tests with hardware validation.

Browser regression page: `/tests/browser/checkout.html` (development only). No real purchases or camera/microphone access are needed by its fixtures.

- Production HTTPS deployment verified at https://fast-forward-spatial-shop-lime.vercel.app: prompt page loaded, live search returned 12 backpacks, and typed “Buy this backpack” prepared the selected Scout 55L at $99.99 with both AG-UI steps completed and a shop.app review link. Screenshot: `design/verify/checkout-review.jpg`. No order was submitted.
- Production `/api/config` reports `tryOnEnabled: false` and `transcriptionEnabled: false`. Configuring existing credentials there awaits explicit user approval after automatic approval review blocked their upload. Browser-native speech remains a capability-dependent fallback; local server credentials remain intact.

## Production AI configuration — October 14, 2026

With explicit user approval, the existing AI Gateway key and demo token were stored as Vercel production Secrets; the image model was stored as Config. Redeployment `dpl_EJZRKcnGRLLb8if5WcmWBVBqoQUR` reached READY. The public `/api/config` reports both `tryOnEnabled: true` and `transcriptionEnabled: true`. Unauthenticated try-on returns 401; the approved token passes authorization and a missing photo returns 400. Transcription rejects missing audio with 400. These configuration checks made no paid model requests. Physical Quest microphone/passthrough testing remains pending.

## Quest entry and selection bug fixes — October 14, 2026

The navigation reproduction failed on missing XR permission guidance, missing AR fallback and missing selection confirmation before the patch. It now passes those checks and the photo-setup handoff. The XR fixture uses the actual IWSDK scene, renderer and native-session adapter with IWER and synthetic inventory: VR reports `session active`, `renderer presenting: true`, `opaque`; exit restores the browser; AR re-entry reports `alpha-blend`. A controller ray aimed at a backpack image selects its exact variant and updates the spatial preview/confirmation. Evidence: `design/verify/xr-card-selection.jpg`; isolated panels: `quest-selection-panel.png` and `quest-product-card.png`.

Typecheck and 56 Node tests pass, covering native request timing, reference-space fallback, rejected permission, renderer failure cleanup, duplicate requests, camera restore and explicit selection confirmation. Tests and build were run against a clean source snapshot because separate Rich-demo work was in progress in the shared directory. Existing dependency and Vite bundle-size warnings remain. Physical Quest testing is still required; the exact original device-side rejection is unknown. See `docs/BUGS.md`.
