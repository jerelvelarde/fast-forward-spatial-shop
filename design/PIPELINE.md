# Pipeline

Capabilities: interactive clarification available; 4 agent slots; main owns the managed browser/server; image generation available; existing approved mockups reused; IWSDK CLI/reference 1.0.1 ready.

Spec, visual direction, grounding and architecture recorded. First implementation complete; credential/hardware-dependent validation remains explicit in VERIFICATION.md.

- M0: typecheck passed; managed starter screenshot in verify/m0-starter.png shows active emulator and Exit to Browser. Explicit xr enter reports no offered session because the emulator is already presenting; status will confirm.
- AI Gateway credential intentionally deferred by user. Build integration and explicit setup state.
- M1: spatial shopping arc, UIKitML cards, desktop companion and stationary landscape render.
- M2: live Shopify search, desktop selection, ray selection and right-thumbstick carousel verified.
- M3: supplied video frame loads; missing-key state verified; server token/photo/selection guard tested.
- M4: 12 tests, strict typecheck and production build pass. Evidence in VERIFICATION.md and verify/final-*.png.

Existing mockups in docs/images serve as the approved concept deck; no replacement design presentation was necessary. Delivery is a local running app plus public repository source, with Vercel configuration ready. No deployment or paid-generation result is claimed.

Retrospective: verify individual UIKitML assets before full scene integration, and freeze source edits during emulator input tests to avoid hot reload discarding the session. Next priority is one credentialed image-generation run, then the complete flow on a physical Quest.
