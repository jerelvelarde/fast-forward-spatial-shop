# Spatial Shop Technical Plan

## Proposed architecture

Use a TypeScript application with a WebXR frontend, a server-side voice and agent layer, and a small Shopify catalog adapter. Keep product retrieval separate from rendering so the same results can drive a desktop preview and the headset scene. The proposed agent runtime is eve; choose the transcription provider during the first implementation milestone.

Meta documents WebXR as an immersive path on Quest and recommends its Immersive Web SDK for that workflow. Treat Quest as the initial target until the actual hardware is confirmed; “Meta glasses” alone does not establish device compatibility. [Meta WebXR overview](https://developers.meta.com/vr/documentation/web/webxr-overview/)

## Components

| Component | Responsibility |
| --- | --- |
| Voice input | Capture audio after user activation, show recording state, and support cancel and retry. |
| Transcription service | Convert audio to text and return the transcript for correction. |
| Shopping agent | Extract intent, merge follow-up constraints, and request clarification when needed. |
| Catalog adapter | Negotiate UCP capabilities, call Shopify tools, and validate results. |
| Product normalizer | Preserve product and offer identity, price currency, availability, and source URLs. |
| Spatial client | Arrange results, handle selection, and display details and loading states. |

## Request flow

1. Capture a short voice command and transcribe it on the server. Keep a text path available for testing.
2. Parse a shopping intent with query, optional category, color, size, budget, currency, shipping country, and other preferences. Do not assume a currency or destination when neither user input nor explicit app settings supply it.
3. Merge refinements into the current intent. Assign a request ID so late responses cannot replace newer results.
4. Search the configured Shopify catalog. Apply supported filters and check returned product evidence against remaining constraints.
5. Normalize and rank a bounded result set. Preserve unknown fields as unknown; do not generate prices, availability, or merchant claims.
6. Send a scene payload to the client. Display up to six cards with image, title, price or price range, currency, and merchant where available.
7. On selection, retrieve product details and variants as needed. Maintain the selected variant and seller together when presenting an offer.

## Shopify integration

Shopify's Global Catalog MCP supports discovery across merchants. Its tools include `search_catalog`, `lookup_catalog`, and `get_product`. Requests require an agent profile URL; declare the base catalog capabilities and the Shopify extensions needed for enriched fields. A single-store experience can use Storefront Catalog MCP. [Global Catalog MCP reference](https://shopify.dev/docs/agents/catalog/global-catalog)

Provision catalog access using Shopify's authentication and profile setup, then configure the actual catalog MCP URL from the Dev Dashboard. Keep tokens on the backend. Verify a real search before connecting voice or XR. [Shopify integration tutorial](https://shopify.dev/docs/agents/get-started/search-catalog)

The adapter should handle authentication errors, timeouts, throttling, empty results, pagination, and missing media. Use bounded retries where appropriate. Show fixtures only in an explicitly labeled demo mode; never silently replace a failed live request with sample products.

## Application data contracts

These are proposed internal contracts, not Shopify API request shapes.

| Contract | Fields |
| --- | --- |
| ShoppingIntent | requestId, query, optional category, attributes, optional budgetMinor and currency, optional shippingCountry |
| ProductCard | productId, title, optional imageUrl, optional price or priceRange, currency when priced, offers, optional productUrl |
| Offer | variantId, optional seller identity, optional price and currency, availability or unknown, optional merchant URL |
| ScenePayload | requestId, mode: live or fixture, interpretedIntent, products, notices |

Store monetary values as integer minor units with an explicit currency and format using that currency's exponent. Display ranges as ranges. A product's minimum price is not necessarily the price of the selected variant or merchant offer.

## Spatial presentation

Start with image cards placed in a comfortable arc in front of the viewer. Support controller selection on the target headset and mouse selection on desktop. Keep labels readable and provide clear focus and selection states. Feature-detect immersive support and serve the headset experience over HTTPS.

Use image cards whenever product meshes are absent. Add a 3D model only when a valid asset and its usage rights are available; do not present an invented mesh as an exact representation of a real product.

## Data handling

Keep credentials out of the client and repository. Avoid retaining raw audio by default. Treat catalog content as untrusted data and render text safely. Restrict server-side requests to configured catalog services and validate external URLs. Record timing and failure categories without logging access tokens or unnecessary transcripts.

## Verification

Verify constraint preservation, currency handling, seller and variant association, unknown availability, stale-response handling, and visible error states. Test the full microphone-to-scene flow on the actual target headset; desktop emulation alone does not verify microphone behavior or immersive interaction.
