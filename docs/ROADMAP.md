# Trail build checklist

## Implemented

- [x] Official Meta IWSDK starter pinned to 1.0.1.
- [x] Camping-backpack flow and original storyboard documented.
- [x] Live Shopify Shop MCP search, USD availability and strict price filtering.
- [x] Desktop cards, selection, keyboard navigation and swipeable rail.
- [x] Browser voice capture with visible transcript and typed fallback.
- [x] Three spatial cards, ray selection, previous/next and right-thumbstick browsing.
- [x] Shared state with stale search and generation protection.
- [x] Photo upload and supplied video-frame option.
- [x] Laptop webcam preview, capture/retake, compression, and camera lifecycle cleanup.
- [x] Server-side AI Gateway image integration and explicit missing-configuration state.
- [x] Private paid-generation token guard and image/request size checks.
- [x] Local run, test, build and Vercel configuration.

## Demo completion

- [x] Configure AI_GATEWAY_API_KEY and TRY_ON_ACCESS_TOKEN locally (deployment needs separate setup).
- [x] Generate and visually assess a real selected-pack try-on.
- [ ] Test camera permissions, capture and retake using a physical laptop webcam.
- [ ] Deploy to Vercel and test the deployed API routes.
- [ ] Verify on a physical Quest: readability, comfort, input, image loading, voice support.
- [ ] Confirm event device access, casting and submission requirements with Meta/event team.
- [ ] Record and submit the final hackathon demo.

## Later improvements

- Multi-turn intent refinement and richer preference extraction.
- Voice capture and photo preparation inside immersive mode where supported.
- Exact product 3D assets, if supplied by merchants; real-time fit is outside this image-preview MVP.
- Production account access, quotas and observability for paid generation.
