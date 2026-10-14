# Technical plan

Official meta-quest/iwsdk-v0-template at 5185128c864e053d31741c30fa3dccf06ef77797; @iwsdk/core and CLI 1.0.1. CLI reference cache is ready. Installed declarations are API authority.

| Mechanic | Classification | Implementation |
|---|---|---|
| Quest session, emulation | Configure | World.create with virtual:iwsdk-project, VR offer always, IWER |
| Product cards and ray clicks | Built-in + content | UIKitMLAsset, RayInteractable, canvasPointerEvents |
| Swipe/next/previous | Custom intent | Browser touch, buttons, XR thumbstick entering-left/right |
| Shared selection | Custom | Small subscribed store; UI updates only when state changes |
| Voice | Browser capability | SpeechRecognition when supported, typed fallback |
| Catalog | Custom server adapter | Shop MCP search_catalog, live only, post-filter USD and availability |
| Try-on | Custom server adapter | AI SDK/Gateway image generation with validated product and human photo |

Stationary arc is centered at eye level around z=-2.3m. No physics or locomotion. UI is measured in centimeters. Scene JSON references declared assets. Manifest remains pure; systems clean up subscriptions. Remote product media remains at source URLs. Generated preview is labeled as AI visualization, not fit measurement.
