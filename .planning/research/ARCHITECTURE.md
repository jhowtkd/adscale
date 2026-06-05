# Architecture Research: v11.6 Creative Strategy Cockpit

## Shape

Build v11.6 as a campaign-workspace orchestration layer, not as a new standalone product area.

The user path should be:

1. Campaign draft or existing campaign.
2. Base creative present.
3. Creative Readiness Score.
4. Guided briefing only when context is weak or the user requests it.
5. Strategy recipe selection.
6. One preview derivation.
7. Full batch generation.
8. Client approval package.

## Data Model Bias

Prefer small JSONB metadata on existing campaign/derivation/package concepts before adding broad new relational surfaces.

Likely persisted data:

- Last readiness result.
- Guided briefing answer state.
- Selected recipe and recipe overrides.
- Preview derivation relationship and promoted batch settings.
- Client package metadata.

## Build Order

1. Readiness service and UI card.
2. Guided briefing state and campaign draft persistence.
3. Recipe mapping and preview gate.
4. Delivery package improvements.
5. End-to-end verification and handoff.
