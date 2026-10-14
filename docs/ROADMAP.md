# Spatial Shop MVP Build Checklist

## 1 Confirm the demo environment

- [ ] Confirm headset model and browser support.
- [ ] Confirm hackathon submission requirements and deadline.
- [ ] Obtain Shopify catalog access and choose a transcription provider.
- [ ] Select one product category for a focused demo.

Exit condition: the team can access the target device and make an authenticated catalog search.

## 2 Build text to catalog search

- [ ] Initialize the application and agent runtime.
- [ ] Add validated intent parsing and conversation state.
- [ ] Implement the catalog adapter and normalize products and offers.
- [ ] Display results in a basic desktop view.
- [ ] Handle no matches, unavailable fields, and provider failures.

Exit condition: a typed request returns live products and one follow-up preserves earlier constraints.

## 3 Add voice

- [ ] Add push-to-talk capture, transcription, and visible transcript.
- [ ] Add correction, cancellation, and microphone-denied handling.
- [ ] Route transcripts through the same tested search flow.

Exit condition: the demo works from a spoken command without typing.

## 4 Build the spatial showroom

- [ ] Render up to six product cards in a 3D scene.
- [ ] Add selection and a product detail view.
- [ ] Add desktop preview and immersive entry when supported.
- [ ] Prevent old search responses from replacing newer results.
- [ ] Test legibility, navigation, microphone capture, and performance on the target headset.

Exit condition: voice input, refinement, and product inspection work in one headset session.

## 5 Prepare the entry

- [ ] Host a demo accessible to judges.
- [ ] Add setup instructions, configuration examples, and an accurate feature status to the README.
- [ ] Record the complete demo story.
- [ ] Label any fixture mode and document integration limitations.
- [ ] Add team credits, screenshots, and submission links.
- [ ] Submit using the hackathon's required format.

Exit condition: the public repository and submission accurately reflect the working experience.
