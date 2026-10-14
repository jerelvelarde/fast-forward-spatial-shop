# Trail — Fast Forward Spatial Shop

A voice-driven shopping agent that lets people discover backpacks, swipe through products in VR, and preview a selected backpack on a human. An entry concept for the Fast Forward Virtual Hackathon.

**Status:** Prompt-first interface with voice/typed camera tools and AG-UI progress. Working build from Meta's IWSDK starter. Live Shopify search, desktop browsing, spatial cards, controller selection, laptop webcam capture, AI try-on, and voice-invoked merchant checkout are integrated. Live generation has been tested with a selected camping backpack. Quest 3 / S3A has native AR/VR entry and spatial voice/buy controls. Physical headset testing remains.

![Prompt-first shopping interface](design/verify/prompt-first-home.jpg)

![Shopping cards revealed after a live Shopify search](design/verify/prompt-first-results.jpg)

[Verification notes](design/VERIFICATION.md) distinguish tested behavior from the remaining headset and AI checks.

**Live demo:** https://fast-forward-spatial-shop-lime.vercel.app — open this HTTPS URL in Quest Browser. Search and checkout are deployed. Server voice transcription and AI try-on await server-secret configuration; browser-native speech is used where available.

## Run locally

Requires Node 22.12+ (or another version supported in `package.json`).

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Search, select a pack, choose **Try it on**, then **Use webcam**, upload a photo, or select **Use the video frame**. Product results are live; the app never substitutes fixture inventory. Set `AI_GATEWAY_API_KEY` in `.env.local` to use the microphone button with server transcription; typing follows the same search path. The separate [voice test page](public/voice-shop-test.html) remains available at `/voice-shop-test.html`.

On a laptop, choose **Use webcam**, allow camera access, frame your shoulders and torso, then **Capture photo**. You can retake it before generating. A front view shows straps; a rear or three-quarter view shows more of the bag. The preview stays local, and only the captured still is sent when you choose **Generate my try-on**. Capture, Stop camera, closing the dialog, hiding the tab, or entering VR turns the camera off. Webcam capture requires HTTPS or localhost; plain HTTP over a LAN will not work.

### Voice and typed tool commands

The opening screen contains only a voice/typing prompt. Ask **“Find a camping backpack under 150 USD”** to reveal live product cards, selection details, Webcam mode and Enter VR.

After selecting a pack, type or say **“Take a picture and try it on.”** Enter your demo access token first in **Try it on** if generation is enabled. The app opens the camera, shows a three-second countdown, captures a still, generates the selected backpack preview and displays Before/After. **“Take a picture”** only captures; **“Try it on”** uses the current photo or captures one if missing. Use **Cancel action** or say/type **“Cancel”** to stop the sequence. Cancelling an already submitted generation discards its result; it may not stop provider billing.

Progress is driven by typed [AG-UI](https://github.com/ag-ui-protocol/ag-ui) run/tool events (`take_picture`, `generate_try_on`, `show_try_on`, `prepare_checkout`, `show_checkout`). The current router recognizes these explicit commands locally. There is no LLM planner, SSE agent endpoint or CopilotKit UI dependency. We retain custom shopping cards and IWSDK rendering; AG-UI provides the event contract for later agent-backend integration. Event payloads exclude photos and credentials.

### Voice checkout and buy

After selecting a backpack, say/type **“Buy this backpack”**, **“Buy it”** or **“Checkout.”** The agent rechecks the exact Shopify variant, merchant, availability and price, then calls Shop MCP `create_checkout` for **quantity one**. The review shows the item and estimated totals with a **Review and pay at merchant** link. In AR/VR, the app exits immersive mode to show this review in Quest Browser. Payment and order confirmation happen on the merchant's checkout page; the app never calls `complete_checkout` or collects card details.

Retries retain an idempotency key, then use `get_checkout` once the session is known. Changing the selected backpack clears the old review; errors hide the payment link. The $150 limit applies to product price, with shipping/tax confirmed at checkout. No photo or AI demo credential is sent to checkout.

### Webcam AR shopping and before/after

In **Webcam mode**, the camera fills an AR shopping stage. Three translucent product cards float over the live image with perspective; the selected backpack is in the center. Swipe gestures, pinch selection, card clicks and the on-camera arrows all control that same selection. These are camera-relative overlays, not room-mapped anchors or body-occluded 3D objects.

![Webcam AR shopping with a selected camping backpack](docs/images/webcam-ar-shopping.png)

The screenshot uses the supplied demo frame as a simulated camera background. To preview this without granting camera access, open `/tests/browser/ar-preview.html` on the dev server and choose **Preview AR with demo frame**. That development-only preview uses live catalog results and disables paid generation.


After searching, choose **Webcam mode** in the header (or **Use webcam** in the try-on dialog). Hand controls load on your device:

1. Show one open hand and swipe left to see the next backpack, or right for the previous one. Directions follow the mirrored live preview. Pause briefly between swipes.
2. Hold your thumb and index finger together for half a second to select the displayed backpack. This pauses gestures while keeping the camera on for framing. **Resume hand controls** lets you browse again.
3. Capture your photo, then generate. Capture saves raw camera pixels, without the floating shopping cards. **Before** preserves the original still; **After** shows the AI result beside it. Changing the backpack clears the old After image. Captured photos are unmirrored even though the live preview acts like a mirror.

Arrow buttons and **Select this backpack** are available while browsing; an active tool sequence temporarily locks selection. Gesture recognition runs in a local Web Worker; camera frames are never sent to a gesture service. It requires a browser with Worker, ImageBitmap and OffscreenCanvas support. This is live gesture input plus still-image try-on, not continuous AI video. Gesture timing is covered by automated tests; physical webcam accuracy still needs testing in your lighting and browser.

For the managed Meta desktop emulator:

```sh
# Stop the plain dev server first if it is running.
npm run dev:managed
```

In VR, use **Find backpacks**, point and trigger to select a card, and use the right thumbstick or Previous/Next buttons to browse. Prepare your photo and access token in the browser before entering VR. **Try on selected** displays the generated preview in the panel to your right. Desktop and VR share selection within the same tab.

For model **S3A (Quest 3)**, follow the [headset guide](docs/QUEST.md). **Enter Quest AR** uses passthrough when supported; **Speak / stop** and **Buy selected** are available on the spatial controls.

## Enable AI try-on

Copy `.env.example` to `.env.local`, set `AI_GATEWAY_API_KEY` and a private `TRY_ON_ACCESS_TOKEN` of at least 16 characters, then restart the server. `AI_GATEWAY_API_KEY` also enables voice transcription. Enter the private demo token in the try-on dialog. Never use `VITE_` prefixes for credentials or commit real values. The token guards the paid generation endpoint; it stays only in browser memory.

The endpoint uses AI SDK and `google/gemini-3.1-flash-image` through Vercel AI Gateway. Override `AI_GATEWAY_IMAGE_MODEL` if needed. It revalidates the selected Shopify variant and sends its verified product image plus the selected human photo to the model. Photos are limited to 2 MB and are not persisted by the application. Generation is an approximate image visualization, not body tracking or a 3D fit simulation.

## Deploy and test

Import this repository into Vercel using its Vite preset. `vercel.json` routes `/api/*` to the Node function and serves the built frontend. Configure the server environment variables to enable generation. Open the deployed HTTPS URL in Quest Browser and enter VR. `npm run preview` serves static output only; use the dev server or Vercel for API-backed testing.

```sh
npm run typecheck
npm test
npm run build
```

Local development retains IWER emulation. Production excludes it so Quest uses native WebXR. See the [Quest 3 / S3A setup and hardware checklist](docs/QUEST.md). Real webcam capture, headset readability, hand/controller comfort, and microphone behavior still need hardware testing. The integrated agent currently uses a bounded tool workflow with explicit budget parsing, not multi-turn LLM conversation. It uses Shop MCP for discovery and checkout preparation, with a merchant-hosted payment handoff.

For the development-only browser regression harness, open `/tests/browser/webcam.html` on the dev server and choose **Run webcam regression**. It tests prompt-first UI, before/after state, the combined command, countdown cancellation, camera capture/cleanup and actual MediaPipe worker inference with a synthetic stream and mocked API responses. It does not open your camera or make paid generation calls, and is excluded from the production build.

## The experience

**“Find me a camping backpack under 150 US dollars.”**

1. **Speak the request.** The user asks for a camping backpack under $150 USD.
2. **Search Shopify.** The agent searches through Shopify's Shop MCP and checks that the returned options meet the camping use case and have a listed product price below $150 USD. Shipping and taxes are separate unless explicitly quoted.
3. **Swipe through options.** The user swipes through shopping cards in the VR scene to compare backpack images, prices, and relevant details.
4. **Select in VR.** The user clicks a backpack card using the VR interface.
5. **See it on the human.** The agent generates a preview of the selected backpack worn by the person in a captured image or video frame, then displays that try-on in the scene.

6. **Buy by voice.** Say “Buy this backpack,” review the checkout and finish payment with the merchant.

The end goal is a continuous **search → swipe → select → try-on → checkout** experience. If no camping backpacks meet the budget, the agent explains that instead of silently showing unsuitable or more expensive products.

The first device target is Meta Quest using WebXR, with a desktop preview for development and demos. Desktop emulation uses the Quest 3 profile.

```mermaid
flowchart LR
    A[Camping backpack under 150 USD] --> B[Agent searches Shopify Shop MCP]
    B --> C[Validate camping suitability and price]
    C --> D[Swipe product cards in VR]
    D --> E[Click a backpack card in VR]
    E --> F[Generate backpack try-on on the human]
    F --> G[Display the try-on preview in VR]
    G --> H[Say buy this backpack]
    H --> I[Prepare and review merchant checkout]
    I --> J[User completes payment at merchant]
```

## End goal storyboard

These generated images illustrate the intended interaction using frames from the demo video. They are concept mockups, not screenshots of a working app. The initial artwork uses everyday Aer backpacks, including a $199 alternative; it predates the camping request and does not represent a validated result set for the under-$150 budget. The implemented search must enforce the use case above.

### Browse and swipe

The agent presents product cards in a spatial carousel. The user swipes to compare options.

![Concept of spatial backpack shopping cards](docs/images/01-shopping-cards.png)

### Select a backpack in VR

Clicking a card selects the backpack and reveals its details and a try-on action.

![Concept of a selected backpack card in VR](docs/images/02-selected-card.png)

### Preview the backpack on the human

The agent applies the selected backpack to the person's captured image and shows the generated result. This is an approximate appearance preview; it does not establish physical fit, real-time body tracking, or a fitted 3D model.

![AI concept of the man from the demo video wearing the selected backpack](docs/images/03-backpack-try-on.png)

## Project documents

The camping backpack flow in this README is the current use case.

- [Hackathon entry brief](docs/ENTRY.md): problem, concept, demo story, and scope.
- [Implementation architecture](docs/ARCHITECTURE.md): components, data flow, and integration decisions.
- [MVP build checklist](docs/ROADMAP.md): milestones and acceptance criteria.

## First build target

Complete one path: spoken camping request → live matching backpacks below $150 USD → swipeable spatial cards → VR selection → generated backpack try-on on the human. Use image-based product cards and a captured-person preview for the first build.

The implementation uses three visible spatial image cards backed by up to twelve live results. Browse changes which products are visible; selection and try-on remain tied to the exact variant. Shipping and tax are excluded from the product-price budget. Generated UI is composed from real product data; no product price or inventory is invented.

## Starter attribution

Based on [Meta's IWSDK v0 starter](https://github.com/meta-quest/iwsdk-v0-template) at commit `5185128c864e053d31741c30fa3dccf06ef77797`, with IWSDK 1.0.1. The Apache-2.0 license and upstream copyright notices are retained. The original demo room, robot and cube are replaced with the camping showroom. The storyboard and demo frame are supplied project assets; third-party catalog imagery remains served from its original URLs.

## References

- [Shop MCP quickstart](https://shop.dev/docs/quickstart)
- [Fast Forward builder resources](https://vercel.notion.site/Builder-Resources-Fast-Forward-3f3e06b059c4818eba9ada18e6f32dc0)
- [Shopify Global Catalog MCP](https://shopify.dev/docs/agents/catalog/global-catalog)
- [Shopify catalog integration tutorial](https://shopify.dev/docs/agents/get-started/search-catalog)
- [Meta WebXR overview](https://developers.meta.com/vr/documentation/web/webxr-overview/)
