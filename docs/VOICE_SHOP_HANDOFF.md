# Voice → Shop integration

The speech and search flow now uses the same API as the Meta IWSDK app:

1. The microphone button in the desktop companion records up to 10 seconds with `MediaRecorder` and sends a short audio clip to `POST /api/transcribe`.
2. The server uses Vercel AI Gateway's `openai/gpt-4o-mini-transcribe` model and returns `{ "text": "..." }`.
3. The confirmed transcript is shown in the search field and passed to `POST /api/search` as `{ "query": "..." }`.
4. The existing catalog adapter calls Shop MCP, enforces the camping backpack and USD budget rules, and returns the product format used by both the desktop rail and VR cards.

The microphone requires HTTPS or localhost, browser recording support, and a server-side `AI_GATEWAY_API_KEY`. Browsers without `MediaRecorder` can use the browser speech recognizer if available. Typing is always available.

## Local verification

From the repo root:

```sh
npm ci
cp .env.example .env.local
# Set AI_GATEWAY_API_KEY in .env.local, then:
npm run dev
```

Open `http://localhost:5173` for the full app. The standalone test frontend remains at `http://localhost:5173/voice-shop-test.html`; it uses the same `/api/search` and `/api/transcribe` endpoints. Vite's local API middleware and the Vercel API function both call `server/http.ts`, so the test page does not require a separate server. `npm run preview` serves static files only.

Run `npm run typecheck`, `npm test`, and `npm run build` before deployment. Add `AI_GATEWAY_API_KEY` to the Vercel project environment, redeploy, then verify microphone search on the HTTPS URL and on Quest. The key must never use a `VITE_` prefix or appear in client code.

## Voice → UCP checkout

`POST /api/voice-checkout` closes the loop from speech to a Shopify checkout. Send `multipart/form-data` with:

| Field | Value |
| --- | --- |
| `product` | JSON product info. An `id` from `GET /api/sample-products` uses the server's copy; other products need `id`, `title`, `price` (USD cents), `currency: "USD"`, HTTPS `url` and `sellerDomain`. |
| `audio` | Recorded clip (≤ 2.5 MB). Transcribed with `openai/gpt-4o-mini-transcribe` through AI Gateway. |
| `transcript` | Optional text fallback when no audio is sent (browser speech recognition, demos without `AI_GATEWAY_API_KEY`). |
| `requestId` | Optional UUID used as the UCP idempotency key. |

The server parses the transcript (“buy it”, “I'll take two”; cancellations, ambiguous or > 5 quantities are refused before any upstream call), builds the UCP `create_checkout` command, sends it to Shop MCP, verifies item, quantity, unit price, currency, status and continuation host, and returns `{ transcript, quantity, command, checkout, redirectUrl }`. With `?redirect=1` it answers `303` to the merchant checkout instead. Payment is completed by the shopper on the merchant page; the app never calls `complete_checkout`.

Demo page: `http://localhost:5173/voice-checkout.html`.

```sh
curl -X POST http://localhost:5173/api/voice-checkout \
  -F 'product={"id":"gid://shopify/ProductVariant/36808158601"}' \
  -F 'audio=@buy.m4a;type=audio/mp4'
```
