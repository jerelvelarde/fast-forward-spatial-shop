# Quest Browser bugs — October 14, 2026

| Report | Finding and patch | Verification |
| --- | --- | --- |
| Enter XR does nothing | IWSDK's fire-and-forget launcher only logged errors. Entry now awaits the native session request and renderer setup, keeps the request in the click's user activation, shows pending/error guidance, and releases the guard for retry. The canvas is visible during startup. Quest can explicitly retry if a capability probe is blocked. | Permission rejection, startup cleanup, reference fallback and duplicate requests tested. Actual IWSDK VR and AR sessions present successfully in IWER. Physical Quest retest pending. |
| Nothing happens after selecting a bag | Only the small Select button was wired in the spatial card. The entire card now uses a UIKit click handler. Selection confirms the exact item, updates the selected-backpack panel and exposes Try on / Buy selected. Browser selection brings the next actions into view. | Controller ray aimed at the left card's image selects the matching fixture variant. Browser confirmation regression passes, including clicking an already focused item. |
| Headset Try on has no clear next step without a photo | The spatial action now uses the shared tool route. If a photo or demo token is missing, it exits XR and opens photo setup with instructions. | Browser handoff regression tests the visible setup and preserves the selected item. |

Native Quest failure details were not available in this debugging session. The patch fixes the reproduced silent/error/selection paths and adds visible diagnostics for device-specific failures; it does not certify physical hardware operation.

Regression pages (development only): `/tests/browser/navigation.html`, `/tests/browser/xr-runtime.html`, `/tests/browser/webcam.html`, `/tests/browser/checkout.html`. The XR fixture contains an aim-target probe for controller testing. IWER's rotation fields take radians; press/release must finish within its 800 ms click window.
