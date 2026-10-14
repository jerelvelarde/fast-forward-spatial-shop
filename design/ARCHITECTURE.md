# Build architecture

- src/contracts.ts: product and API wire types.
- src/store.ts: asynchronous search and try-on state, subscriptions, selection.
- src/desktop.ts + src/style.css: voice/search, swipe cards, selected detail, photo upload, preview.
- src/shopping.ts: IWSDK scene binding and controller navigation.
- public/ui: card and control panels. public/scenes: stationary arc.
- server/: search validation, MCP normalization, Gateway image generation, HTTP adapter.
- api/: Vercel adapters; vite.config.ts: local API middleware.

M0: unchanged starter visible and XR running. M1: spatial panels and desktop shell render. M2: live filtered search and selection synchronize. M3: try-on validation/setup states. M4: tests, production build, browser and emulator verification. Main agent owns server and shared wiring; delegated modules own separate files. User authorizes repository updates; commit/push after verification.
