# Trail on Meta Quest

Open [https://trailxr.vercel.app/](https://trailxr.vercel.app/) in Quest Browser. Use the HTTPS deployment; `localhost` on Quest refers to the headset itself.

## Prepared 3D demo

1. On the browser page, search **“Find me a camping backpack under 150 US dollars.”** The black 30L Stealth Angel backpack should appear first. Select it.
2. Choose **Load prepared 3D preview**. The browser should report that Rich and the backpack are ready. This uses the bundled GLB and spends no Meshy credits.
3. Choose **Enter Quest AR** and allow the XR request. Passthrough should show the room with shopping cards.
4. Choose **Place in room** in the spatial controls. Point the right controller at a clear floor area and press the trigger when the placement ring appears. Walk around Rich to inspect the backpack. If surface hit testing is unavailable, the model is placed ahead of you.
5. Use the right thumbstick or Previous/Next to browse; point and trigger to select another card. Switching products clears the old placement.

## Generate a new selected item

Search for a jacket, tent, another backpack, or other item and select its Shopify card. Choose **Generate 3D product**; no demo token is needed. The server uses its private Meshy key and sends the exact selected variant's available Shopify image URLs to Meshy 6 Lite. Generation may take several minutes. When it is ready, enter or return to Quest AR and choose **Place in room**. A new backpack is placed approximately on Rich's saved body; other products appear as standalone 3D objects. One product image can be enough for the API, but quality improves with more angles. Each new item costs Meshy API credits.

## Other controls

- **Speak / stop** records a shopping request or command. Press again to finish. You can always type a search on the browser page.
- **Photo preview** loads Rich's demo photo automatically when opened. You can replace it with a photo uploaded or captured on the browser page; generation still needs the private demo token. Quest passthrough does not expose camera pixels to this app; the webcam and gesture mode runs on a laptop.
- **Buy selected** rechecks the exact Shopify variant, prepares quantity one, exits immersive mode, and opens a review with a merchant checkout link. Payment is handled by the merchant. Do not complete payment during a demo unless you intend to purchase.
- **Enter VR** uses the virtual showroom; **Enter Quest AR** uses room passthrough. The AR button only appears if Quest Browser reports `immersive-ar` support.

## Headset acceptance check

On a physical Quest, confirm microphone permission, readable cards, controller selection, thumbstick navigation, AR passthrough, floor placement and walk-around model scale. Test one non-backpack product and confirm its model is a standalone object. Verify checkout review and link without submitting payment. Desktop emulation and automated tests do not prove headset performance.
