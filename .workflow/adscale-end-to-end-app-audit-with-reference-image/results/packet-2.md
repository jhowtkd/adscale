# Packet 2: Reference-image smoke

## Reference image interpretation
- The image is a static transfer/admission promo with a strong visual hierarchy, a numeric price callout, a discount badge, and a single dominant CTA.
- For testing, it maps best to the restyling flow because the app asks for a base creative plus a style reference and a short campaign brief.
- The image also exercises text-heavy creative constraints, which makes it useful for checking CTA, offer, client, and style-intensity fields.

## Smoke scenarios derived from the image
1. Upload the image as the base creative and as the style reference, then submit a restyling request.
2. Use the image content to fill campaign metadata: name, client, offer, CTA text, and style intensity.
3. Confirm the UI explains the file constraints clearly and surfaces validation when the upload is missing or invalid.
4. Confirm the page remains understandable when the creative is complex and busy, not just when it is a simple clean ad.

## Observations
- The restyling screen is structurally aligned with the image-driven workflow.
- The upload affordance is visually clear, but it is implemented as a clickable drop area rather than a full keyboard-operable control.
- The form covers the key inputs required to express what the reference image needs.

## Gaps noticed
- The restyling upload control does not expose an explicit keyboard path or dedicated label for the remove action.
- The main CTA styles in the dashboard and creation flow appear too light in the current theme.
