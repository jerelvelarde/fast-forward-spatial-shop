# Spatial shopping verification — 14 October 2026

Story: enter Quest AR → see Rich's saved body and a voice prompt → search Shopify → browse spatial cards → open a product → see the selected backpack on Rich inside the room.

## Evidence

- `npm run typecheck` passed; all 62 Node tests passed on the integrated release, including the latest signed-task-ticket backend. Provider tests use mocked responses.
- `npm run build` passed. The existing large IWSDK bundle warning remains.
- IWSDK isolated renders passed for all four UIKitML assets. The scene hero and standing spawn renders returned `valid: true`, no diagnostics, and all expected panel node IDs. The editor reported a clean, conflict-free scene with a matching runtime hash.
- `/tests/browser/spatial-shopping.html` passed 17 checks in an actual IWER immersive-AR session. It uses fixture inventory and speech transcripts, with real IWSDK handlers, scene objects, and the shipped GLBs. No microphone, paid image generation, Meshy job, or checkout is used.
- The spatial regression covers initial body presence and 1.72 m height; rotate; voice search; progressive result cards; explicit selection; voice try-on remaining in XR; one-action model load and placement; separate model/UI positions; repeat-placement scale; return to browsing; hidden panel removal from ray targets; and clearing the old model on product changes.
- A separate emulated controller test aimed the right ray at the preview button, confirmed hover, and sent a short trigger press/release. The placed model UUID changed from `741f064b-a8d3-415e-9933-fcd8cc22ab2d` to `fdbd8439-7b95-4817-966d-71de52609808`, confirming the real ray activated placement. The emulator's raw numeric orientation fields take radians. Long held triggers are not a normal UIKit click.
- A real POST to the local `/api/search` for the default camping query returned 12 Shopify products below $150 and included the prepared variant `gid://shopify/ProductVariant/36808158601`.
- The original body and backpack preview were visually inspected with image-based lighting enabled. There were no app errors. Resizing the desktop window while presenting can produce Three's expected renderer-size warning.

## Screenshots

- [Spatial regression and selected backpack](../design/verify/ar-spatial-regression.jpg)
- [Voice/navigation dock](../design/verify/ar-controls.png)
- [Focused product actions](../design/verify/ar-selection.png)
- [Product card](../design/verify/ar-product.png)
- [Prompt header](../design/verify/ar-title.png)
- [Editor spawn view](../design/verify/ar-scene-spawn.png)
- [Editor hero view](../design/verify/ar-scene-hero.png)

## Physical Quest acceptance remains

Use the deployed HTTPS app on Quest 3 / S3A. Check passthrough, microphone permission and recognition, hand pinch and controller comfort, seated/standing recentering, initial body visibility, legibility, and real headset performance. Desktop emulation does not prove those hardware behaviors. Model placement uses a viewer-relative estimated floor; it is not a room-mesh anchor or fit measurement.
