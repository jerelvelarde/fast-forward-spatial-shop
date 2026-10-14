# Trail on Meta Quest

Open [https://trailxr.vercel.app/](https://trailxr.vercel.app/) in Quest Browser. Use the HTTPS deployment; `localhost` on Quest refers to the headset itself.

## Prepared 3D demo

1. Choose **Enter your room** in Quest Browser and allow immersive access. The default is passthrough AR, with **Enter VR** as a fallback. One browser click is required to start WebXR.
2. Rich's saved 3D body is already in the scene. Choose **Use demo model** in the spatial shopping controls. This selects the black 30L Stealth Angel backpack and shows Rich wearing it without a search, another placement click, or Meshy credits.
3. **Rotate preview** turns Rich by 45 degrees. **Browse products** returns to the cards. Changing products removes the previous backpack preview and restores the original body.
4. For live shopping, choose **Speak your request** and say **“Find me a camping backpack under 150 US dollars.”** Press again to finish recording. **Try backpack search** runs that query without a microphone. Previous/Next or the right thumbstick browse the Shopify cards.
5. **Bring UI here** moves the panels in front of your current position and eye height. Panels then remain still while you look around. Models appear about two meters ahead and to the right at an estimated floor height; they are not anchored to a detected room mesh.

## Generate a new selected item

Search for a jacket, tent, another backpack, or other item and select its Shopify card. Open the product card and choose **Create 3D preview**; no demo token is needed. The server uses its private Meshy key. The request sends the exact selected variant's available Shopify image URLs to Meshy 6 Lite. Generation may take several minutes. When it is ready, the selected model appears beside the spatial panel. **Show in room again** repositions it relative to your current view. A new backpack is placed approximately on Rich's saved body; other products appear as standalone 3D objects. One product image can be enough for the API, but quality improves with more angles. Each new item costs Meshy API credits.

## Other controls

- **Speak your request** records a shopping request or command. Press again to finish. You can always type a search on the browser page.
- **Photo preview** loads Rich's demo photo automatically when opened. You can replace it with a photo uploaded or captured on the browser page; generation still needs the private demo token. Quest passthrough does not expose camera pixels to this app; the webcam and gesture mode runs on a laptop.
- **Buy selected** rechecks the exact Shopify variant, prepares quantity one, exits immersive mode, and opens a review with a merchant checkout link. Payment is handled by the merchant. Do not complete payment during a demo unless you intend to purchase.
- **Enter VR** uses the virtual showroom; **Enter Quest AR** uses room passthrough. If a capability probe is blocked on Quest, the entry button still permits an explicit immersive request and displays any permission error.

## Headset acceptance check

On a physical Quest, confirm microphone permission, readable cards, controller selection, thumbstick navigation, AR passthrough, initial Rich body visibility, recentering from seated and standing positions, rotate actions, and walk-around model scale. Test one non-backpack product and confirm its model is a standalone object. Verify checkout review and link without submitting payment. Desktop emulation and automated tests do not prove headset performance.
