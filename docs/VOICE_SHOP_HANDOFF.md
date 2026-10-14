# Voice and Shop handoff

This branch supplies the first part of the demo: spoken or typed request → transcript → live Shop MCP products. It is designed to merge into the team's Meta IWSDK/Vite starter.

## Files

- `api/search.ts`: `POST /api/search` accepts `{ "text": "Find me a camping backpack under 150 US dollars" }`.
- `api/_shop.ts`: parses the request, calls `search_catalog` live, and returns up to six available USD offers below the spoken budget.
- `api/transcribe.ts`: `POST /api/transcribe` accepts multipart form data with an `audio` file and returns `{ "text": "..." }`.
- `public/voice-shop-test.html`: a temporary browser page for checking the whole flow at `/voice-shop-test.html` after deployment.

The search response is:

```json
{
  "query": "camping backpack",
  "products": [
    {
      "productId": "gid://shopify/p/...",
      "variantId": "gid://shopify/ProductVariant/...",
      "title": "...",
      "imageUrl": "https://...",
      "priceMinor": 12900,
      "currency": "USD",
      "seller": "...",
      "url": "https://...",
      "available": true
    }
  ],
  "warnings": []
}
```

`imageUrl` can be absent. Use the returned product image directly; do not cache or re-host it. Keep `url` exactly as returned by Shop, including query parameters. The demo is explicitly scoped to US shoppers and USD prices.

## Merge and configure

1. Merge this branch into the IWSDK/Vite project. Keep the root `api/` and `public/voice-shop-test.html` paths.
2. In the shared project, install `ai` and `@ai-sdk/gateway`. If strict TypeScript checking reports a missing `json-schema` declaration from the AI SDK, add `@types/json-schema` as a dev dependency.
3. Add `AI_GATEWAY_API_KEY` to the Vercel project's environment variables. Do not put the key in Vite client environment variables or commit it.
4. Deploy the project. Open `/voice-shop-test.html` on the HTTPS Vercel URL; type the demo request first, then test the microphone. Local Vite alone does not run root `api/` functions; use `vercel dev` or a deployed preview for the complete flow.
5. The VR scene should call `/api/search` with the confirmed transcript or typed text and render `products`. It should show `warnings` and a clear empty or error state.

## Verification already completed

- Called Shop MCP live with the camping backpack request.
- Confirmed Shop returned an over-budget product despite the price filter, then checked our own normalizer excludes it.
- Confirmed `POST /api/search` returns six available USD products below $150 from live Shop data.
- Typechecked all three API files and checked the test page script syntax.

Speech still needs a real Gateway key and a deployed browser/headset microphone test. Typed search remains available if microphone permission is denied.
