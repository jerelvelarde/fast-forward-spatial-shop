# Fast Forward Spatial Shop

A voice-driven shopping agent that lets people discover backpacks, swipe through products in VR, and preview a selected backpack on a human. An entry concept for the Fast Forward Virtual Hackathon.

**Status:** Planning and visual concept repository. A standalone Shopify Shop MCP search and generated storyboard have been completed. The integrated application, swipe interaction, and headset experience are not implemented yet.

## The experience

**“Find me a camping backpack under 150 US dollars.”**

1. **Speak the request.** The user asks for a camping backpack under $150 USD.
2. **Search Shopify.** The agent searches through Shopify's Shop MCP and checks that the returned options meet the camping use case and have a listed product price below $150 USD. Shipping and taxes are separate unless explicitly quoted.
3. **Swipe through options.** The user swipes through shopping cards in the VR scene to compare backpack images, prices, and relevant details.
4. **Select in VR.** The user clicks a backpack card using the VR interface.
5. **See it on the human.** The agent generates a preview of the selected backpack worn by the person in a captured image or video frame, then displays that try-on in the scene.

The end goal is a continuous **search → swipe → select → try-on** experience. If no camping backpacks meet the budget, the agent explains that instead of silently showing unsuitable or more expensive products.

The proposed first device target is Meta Quest using WebXR, with a desktop preview for development and demos. The exact Meta device remains to be confirmed.

```mermaid
flowchart LR
    A[Camping backpack under 150 USD] --> B[Agent searches Shopify Shop MCP]
    B --> C[Validate camping suitability and price]
    C --> D[Swipe product cards in VR]
    D --> E[Click a backpack card in VR]
    E --> F[Generate backpack try-on on the human]
    F --> G[Display the try-on preview in VR]
```

## End goal storyboard

These generated images illustrate the intended interaction using frames from the demo video. They are concept mockups, not screenshots of a working app. The initial artwork uses everyday Aer backpacks, including a $199 alternative; it predates the camping request and does not represent a validated result set for the under-$150 budget. The implemented search must enforce the use case above.

### Browse and swipe

The agent presents product cards in a spatial carousel. The user swipes to compare options.

![Concept of spatial backpack shopping cards](docs/images/01-shopping-cards.png)

### Select a backpack in VR

Clicking a card selects the backpack and reveals its details and a try-on action.

![Concept of a selected backpack card in VR](docs/images/02-selected-card.png)

### Preview the backpack on the human

The agent applies the selected backpack to the person's captured image and shows the generated result. This is an approximate appearance preview; it does not establish physical fit, real-time body tracking, or a fitted 3D model.

![AI concept of the man from the demo video wearing the selected backpack](docs/images/03-backpack-try-on.png)

## Project documents

The documents below capture the initial planning baseline. The camping backpack flow in this README is the current use case.

- [Hackathon entry brief](docs/ENTRY.md): problem, concept, demo story, and scope.
- [Technical plan](docs/ARCHITECTURE.md): components, data flow, and integration decisions.
- [MVP build checklist](docs/ROADMAP.md): milestones and acceptance criteria.

## First build target

Complete one path: spoken camping request → live matching backpacks below $150 USD → swipeable spatial cards → VR selection → generated backpack try-on on the human. Use image-based product cards and a captured-person preview for the first build.

There are no installation or run commands yet because this repository currently contains project documentation and visual concepts only.

## References

- [Shop MCP quickstart](https://shop.dev/docs/quickstart)
- [Fast Forward builder resources](https://vercel.notion.site/Builder-Resources-Fast-Forward-3f3e06b059c4818eba9ada18e6f32dc0)
- [Shopify Global Catalog MCP](https://shopify.dev/docs/agents/catalog/global-catalog)
- [Shopify catalog integration tutorial](https://shopify.dev/docs/agents/get-started/search-catalog)
- [Meta WebXR overview](https://developers.meta.com/vr/documentation/web/webxr-overview/)
