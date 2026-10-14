# Fast Forward Virtual Hackathon Entry

## Working title

Fast Forward Spatial Shop

## Pitch

Describe what you want to buy and see matching products appear around you. Spatial Shop connects a voice-driven agent to Shopify's product catalog and turns search results into an interactive VR showroom.

## Problem

Shopping from a headset should not require typing into conventional search pages and moving between tabs. Buyers need a way to express what they want naturally, refine it in conversation, and compare products within their current 3D environment.

## Proposed solution

The shopper speaks a request. The agent extracts the product category, preferences, and constraints, retrieves relevant catalog results through Shopify's UCP-compatible Catalog MCP tools, and displays a small collection of product cards in a 3D space. Follow-up voice commands update the collection while preserving relevant preferences.

The first experience uses product images, names, prices, and merchant information. A selected card opens more detail. True 3D product assets can enhance the showroom later, but are not required for the initial interaction.

## Demo story

1. A shopper enters the showroom and activates the microphone.
2. They say, “Show me black running shoes under 100 US dollars.”
3. The app shows the transcript and interpreted request, then displays up to six matching products.
4. They say, “Only waterproof options.” The agent preserves the earlier budget and color constraints while refining the search.
5. They select a product and inspect its current price, merchant, and available details.
6. They can open the merchant's product page to continue shopping.

If no products meet every constraint, the agent explains that and asks which constraint to relax. It does not silently substitute unrelated products.

## MVP scope

- Push-to-talk voice capture and visible transcript, with typed input as a fallback.
- Structured shopping intent and one follow-up refinement.
- Live Shopify catalog search behind a backend adapter.
- Up to six selectable product cards arranged in a 3D scene.
- Product detail view and merchant link when supplied by the catalog.
- Desktop preview and a tested immersive session on the chosen Meta device.
- Clear loading, empty-result, microphone-denied, and network-error states.

Checkout, payment, generated product meshes, persistent buyer profiles, and multi-user shopping are outside the proposed first demo.

## Success criteria

A judge can speak a shopping request, see relevant products with source-backed details in the scene, refine the request, and inspect a result without typing. A recorded demo should show the complete flow and identify whether results are live or fixtures.

## Decisions to confirm

- Exact Meta hardware and whether VR or mixed reality is preferred.
- Hackathon deadline, required submission fields, and judging criteria.
- Shopify catalog access and available credentials.
- Speech transcription provider and available budget.
- Final project name and team members.

This brief is ready for project planning; it has not been submitted to the hackathon.
