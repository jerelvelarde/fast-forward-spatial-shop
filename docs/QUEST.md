# Meta Quest 3 / model S3A

Model S3A is identified as Meta Quest 3 in [Meta's quick-start guide](https://fccid.io/2AGOZ-S3A/User-Manual/2AGOZ-S3A-QSG-6639320.pdf). This app targets Quest Browser using WebXR; no APK, desktop webcam, or PWA installation is required for headset shopping.

## Demo on the headset

1. Open **https://fast-forward-spatial-shop-lime.vercel.app** in Quest Browser (or your own Vercel deployment). `localhost` on Quest refers to the headset, not your laptop. Configure `AI_GATEWAY_API_KEY` on the server for recorded voice transcription; try-on also needs `TRY_ON_ACCESS_TOKEN`.
2. Allow microphone access when asked. Say or type **“Find a camping backpack under 150 USD.”** For recorded voice, press the microphone again to finish speaking.
3. Choose **Enter Quest AR** for floating shopping cards in passthrough, or **Enter VR** for the camping showroom. The AR button appears only when the browser supports `immersive-ar`.
4. Point a Touch Plus controller ray at a card and press its trigger. Browse with Previous/Next or the right thumbstick. Native hand rays/pinch can select buttons when Quest hand tracking is active.
5. Select **Speak / stop**, say **“Buy this backpack”**, then press it again to finish recording. **Buy selected** runs the same tools without speech.
6. The app checks the variant, availability and displayed price, prepares one checkout, exits immersive mode and displays the product, estimated totals and **Review and pay at merchant**. Open that link to review delivery, taxes and payment. The app never submits the order itself.
7. Return to Trail to continue browsing or re-enter AR/VR.

Prepare a person photo and private demo token in the browser before entering immersive mode if demonstrating try-on. Quest passthrough is a composited environment: this app does **not** read headset camera pixels. The live webcam capture/gesture mode is a separate laptop workflow. See [Meta's WebXR mixed-reality documentation](https://developers.meta.com/vr/documentation/web/webxr-mixed-reality/).

## Build settings

- IWSDK uses the Quest 3 profile for local IWER development.
- Production builds do not inject IWER; Quest uses native WebXR. Local emulator injection explicitly excludes OculusBrowser.
- Native hand tracking is requested. Locomotion and physics are disabled for the stationary shopping scene.
- AR hides the authored landscape; IWSDK's AR environment handling removes the opaque backdrop for passthrough.
- Microphone permission blur does not repeat the XR-entry cleanup; leaving the page still releases media.
- Checkout retries reuse their idempotency key and refresh an existing session when known. Sessions are kept only in tab memory. Cancellation stops the local action; a merchant checkout already created can remain open, but no payment is submitted.

## Headset acceptance test (physical device pending)

- Confirm secure connection and allow XR/microphone permissions in Quest Browser.
- Enter AR and confirm room passthrough, readable cards and unobstructed controls. Enter VR separately and check the showroom returns.
- Verify trigger/pinch selection, thumbstick browse, voice recording/stop and transcript.
- Say “buy this backpack”; verify selected merchant, exact item, quantity one, price and browser handoff. Do not submit payment unless making a deliberate purchase.
- Deny microphone permission once and verify Buy selected still works.
- Exit/re-enter, switch tabs and return; confirm no lingering microphone/camera and no stale checkout for a new selection.
- Check comfort/frame rate and arrange casting with the onsite Meta team.

The current verification covers code, API contracts, simulated speech/browser behavior, isolated spatial UI and desktop emulation. It is not a physical Quest certification.
