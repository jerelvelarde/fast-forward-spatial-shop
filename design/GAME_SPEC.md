# Trail / voice-to-spatial shopping

Build the user's camping backpack flow from the official Meta IWSDK starter. The approved storyboard is in ../docs/images: dark glass, lime focus, an arc of products, a selected card, then a human wearing the chosen pack. Existing Aer imagery is visual direction only, not live camping inventory.

Voice or typed intent → live Shopify results below $150 USD → swipe/previous/next → select with pointer or Quest ray → provide a human photo → generate the selected pack on that person.

Assumptions: stationary seated/standing VR, desktop companion with accessible controls, no locomotion, no purchase, no authentication requirement for public catalog search. AI generation requires a server-side key and a private demo access token when deployed. User explicitly chose to configure credentials later.

Observable success: live results preserve source/variant URLs; no USD product at or above $150 is shown; carousel updates selection consistently in browser and VR; cards show product images; selected product and person are sent to the try-on endpoint; absent key is an explicit setup state; scene builds and enters emulated XR. Real Quest comfort, speech hardware, and live generated fit must be verified on hardware/with credentials.
