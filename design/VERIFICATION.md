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
| Missing credentials | `/api/config` returned tryOnEnabled:false; dialog explained setup and disabled generation; no paid AI call made |
| VR entry and search | `iwsdk xr enter`, controller look-at, then complete `xr select` on Find backpacks produced `1 of 12` in controls caption |
| Thumbstick navigation | Right controller X axis 1 then 0 changed live caption from `1 of 12` to `2 of 12` |
| Ray card selection | Right-card look-at and complete xr select changed caption from `2 of 12` to `3 of 12` |
| Return to browser | xr exit preserved live results; `verify/final-desktop.png` |
| Responsive reading | Browser checks at 1280×720 and 390×844; bounded desktop left-panel scroll and opaque phone reading surface |
| Type safety | `npm run typecheck` includes frontend, backend, adapters, tests and Vite config |
| Behavioral tests | `npm test`: 12 tests pass — budgets (including spoken numbers), currency/availability/category rejection, MCP failures, private-token guard, MIME/size limits, latest-search wins, old try-on discarded, no photo sent when unconfigured |
| Production build | `npm run build` succeeds; includes Trail and API request paths in frontend output |

Use `xr select` for complete click simulation. Setting the analog select value alone did not exercise the whole selectstart/select/selectend sequence in this emulator.

## Review and fixes

Reviewed against the starter's ECS, manifest, UI and lifecycle rules. World startup uses the virtual project; scene references pure manifest assets; no direct Three import or custom raycaster; no allocations in the per-frame controller update. Store subscriptions are cleaned up by the shopping system. Removed unused starter room, cube, robot and media. No credentials or runtime cache are included in the repository.

UIKitML image-specific properties must be element attributes, and the SVG placeholder needs intrinsic width/height. Both were fixed after real renderer errors. The current glyph atlas does not contain every dynamic Unicode title character; spatial labels use readable ASCII transliterations while desktop/merchant data retain originals. No new missing-glyph errors were observed after that change. An IWSDK/Three resize warning occurred at the emulated XR transition; rendering and input continued correctly.

## Explicitly pending

- Live Gateway generation: user chose to configure credentials later. Integration and validation are implemented; visual fidelity and provider output are unverified.
- Physical Quest controller/hand behavior, comfort, performance and microphone support. Desktop emulation is not hardware validation.
- Actual speech recognition using a microphone. The browser path and typed fallback are implemented; no synthesized audio was substituted for a real speech test.
- Vercel deployment and deployed API smoke test. Local middleware and function adapter are implemented.
- Build warns about a large SDK bundle (~7.8 MB before gzip, ~2 MB gzip) and includes the starter's desktop emulator. Network startup and Quest frame performance need profiling before wider release.

Photos are not persisted by this app. The supplied demo frame is intentionally bundled. Product observations here are test-time examples, not cached catalog inventory or current price guarantees.
