# Creative Diagnosis and Variation-Level Contract - Design

## Context

ADScale's demo-ready path is the standard `art_variation` campaign flow: create campaign, complete briefing, upload a base creative, generate variations, review the gallery, pick the best creative, and export.

The current generation flow can produce usable images, but the outputs sometimes feel generic or concept-light. They also do not always reflect the selected variation level clearly enough. For a demo, the product needs to show that it understands the original creative, turns that understanding into controlled variation, and helps the user choose a strong winner.

This design adds a lightweight creative diagnosis before generation and turns the variation level into an explicit contract used by generation and scoring.

## Goal

Improve `art_variation` generation quality for the demo-ready golden path by:

- analyzing the original creative and briefing before generation
- saving a compact creative diagnosis for the campaign
- letting the user review and edit that diagnosis before generation
- making each variation level promise a distinct visual behavior
- generating multiple interpretations within the selected variation level
- scoring whether generated outputs respected the selected variation level

## Non-Goals

- Do not expand this feature to `format_adaptation` in the first version.
- Do not expand this feature to quick restyling in the first version.
- Do not add new required briefing fields.
- Do not create a separate strategy workspace or large planning screen.
- Do not block generation because the diagnosis is imperfect.
- Do not replace existing scoring, review, approval, regeneration, or export flows.
- Do not mix multiple variation levels in one gallery run.

## Product Contract

The selected variation level must produce a visible difference in creative behavior.

| Level | Promise |
| --- | --- |
| Low | Preserve the original structure and composition. Make controlled changes that keep the creative immediately recognizable. |
| Medium | Change composition or concept safely while preserving the product, offer, CTA, and brand cues. |
| High | Create a new creative reading while preserving the product, offer, CTA, and required brand constraints. |

This contract should appear compactly in the briefing UI so the user knows what each level means before generation.

## Creative Diagnosis

The app should generate a lightweight diagnosis from the briefing plus the uploaded original image. It should become the creative source used by `art_variation` generation.

The diagnosis has three editable blocks:

- `detectedConcept`: what the current creative appears to communicate
- `elementsToPreserve`: visual or textual elements that should remain intact
- `variationOpportunities`: directions the model can explore for stronger variations

Example shape:

```json
{
  "detectedConcept": "A direct-response promotion for a skincare product focused on discount urgency and clean premium visuals.",
  "elementsToPreserve": [
    "product packshot",
    "20% off offer",
    "primary CTA",
    "soft neutral palette",
    "brand logo"
  ],
  "variationOpportunities": [
    "make the offer hierarchy more prominent",
    "create a stronger contrast between product and background",
    "explore a more editorial layout for high variation"
  ]
}
```

The automatic diagnosis can be wrong or weak. The UI must support both:

- manual editing of the three blocks
- regenerating the diagnosis from the same briefing and image

When the user edits the diagnosis, the edited version becomes the official creative source for the campaign or generation. Generated outputs should be explainable as coming from the diagnosis the user approved, not from hidden model interpretation.

## User Flow

1. User creates or opens an `art_variation` campaign.
2. User completes the existing briefing and uploads the original creative.
3. App analyzes the briefing plus image and creates a creative diagnosis.
4. Briefing step shows a compact reviewable diagnosis card.
5. User can edit the diagnosis or regenerate it.
6. User selects a variation level with compact copy describing its promise.
7. User starts generation.
8. Generation creates multiple interpretations within the selected level.
9. Gallery shows generated variations with existing review/score UX.
10. Score includes whether each output respected the selected variation level.

## UI Design

### Briefing Step

Add a compact diagnosis card near the generation controls for `art_variation` campaigns after an image is available.

The card should show:

- diagnosis status: not analyzed, analyzing, ready, failed
- editable `Conceito detectado` / `Detected concept`
- editable `Elementos para preservar` / `Elements to preserve`
- editable `Oportunidades de variação` / `Variation opportunities`
- action to regenerate diagnosis
- non-blocking error state if analysis fails

The variation level control should show concise helper copy for each option. Avoid a large explanation panel.

### Gallery and Review

The gallery remains the main decision surface.

Each generated variation should keep the existing score/review UI and add one criterion in the score breakdown:

- `variationLevelFit`: how well the output respected the selected variation level

The review view can show this criterion with the rest of the score breakdown. It should not create a separate review screen.

## Data Model

Persist the current approved diagnosis on the campaign. A first version can use JSON fields to avoid over-modeling.

Recommended campaign fields:

- `creativeDiagnosisStatus`: `pending`, `analyzing`, `ready`, or `failed`
- `creativeDiagnosis`: JSON object with the three editable blocks
- `creativeDiagnosisSource`: `ai`, `edited`, or `regenerated`
- `creativeDiagnosisUpdatedAt`: timestamp

If the project already has a campaign plan or briefing metadata JSON area, the implementation can store the diagnosis there instead, as long as it remains retrievable for generation and review.

Generated derivations should store enough context to evaluate the promise that was used:

- selected `creativeLevel`
- snapshot of the approved diagnosis or a reference to the campaign diagnosis version
- score breakdown with `variationLevelFit`

For the demo-ready version, a full diagnosis version history is not required.

## Backend Design

Add a dedicated creative diagnosis module:

- `src/server/ai/creative-diagnosis.ts`
- `analyzeCreativeDiagnosis(...)`
- `buildCreativeDiagnosisPrompt(...)`
- `normalizeCreativeDiagnosis(...)`

Add campaign repository helpers:

- `updateCreativeDiagnosis(campaignId, workspaceId, diagnosisData)`
- `getCreativeDiagnosis(campaignId, workspaceId)`

Add or extend API routes for:

- generating the diagnosis
- updating the edited diagnosis
- regenerating the diagnosis

Generation should load the approved diagnosis for `art_variation` and include it in the prompt builder. If no diagnosis is available because analysis failed, generation can fall back to the current briefing/image prompt path and record that diagnosis was unavailable.

## Prompt Behavior

The `art_variation` prompt should be built from:

- briefing fields
- original image analysis or approved diagnosis
- selected variation level contract
- CTA and offer constraints
- brand and preservation constraints

The prompt should explicitly distinguish between:

- what must remain true: product, offer, CTA, factual claims, required brand cues
- what should guide creative direction: detected concept and variation opportunities
- how far the model may move: low, medium, or high variation contract

For high variation, the model may create a new creative reading, but it must not change the product, offer, CTA, or factual claims.

## Scoring Behavior

Extend the existing creative scoring model with `variationLevelFit`.

Suggested scoring shape:

```json
{
  "ctaClarity": 86,
  "textLegibility": 78,
  "briefMatch": 91,
  "visualQuality": 84,
  "formatFit": 96,
  "variationLevelFit": 88
}
```

The score prompt should evaluate whether the output matched the selected level:

- Low: did it preserve layout and recognizable structure?
- Medium: did it change composition or concept without losing campaign intent?
- High: did it create a fresh reading while preserving product, offer, CTA, and required constraints?

Scoring failures must not block gallery, approval, regeneration, or export.

## Error Handling

Creative diagnosis errors are non-blocking.

If automatic diagnosis fails:

- show a compact error state
- allow retry
- allow manual entry/editing if enough campaign context exists
- keep generation available through the current fallback path

If diagnosis JSON is malformed:

- reject or normalize invalid fields
- preserve the last known good diagnosis
- avoid clearing user edits

If scoring cannot evaluate `variationLevelFit`:

- keep the generated image available
- mark score status as failed or partial according to existing scoring conventions

## Testing Strategy

Unit tests:

- diagnosis response parser accepts valid structured JSON
- diagnosis response parser rejects or normalizes malformed output
- edited diagnosis update preserves only allowed fields
- variation level copy maps low, medium, and high to the expected contract
- prompt builder includes diagnosis and variation-level contract for `art_variation`
- prompt builder does not apply diagnosis behavior to `format_adaptation`
- score parser accepts `variationLevelFit`

API tests:

- generate diagnosis validates campaign ownership
- update diagnosis validates editable fields
- regenerate diagnosis preserves campaign scope
- diagnosis failure returns controlled non-blocking error

UI tests:

- diagnosis card renders ready, failed, and analyzing states
- user can edit the three diagnosis blocks
- user can trigger diagnosis regeneration
- variation level helper copy appears in briefing
- generation remains available if diagnosis fails

End-to-end demo smoke:

- create `art_variation` campaign
- upload known creative
- generate diagnosis
- edit one diagnosis field
- generate variations at one selected level
- confirm gallery outputs appear
- confirm review score includes `variationLevelFit`
- approve and export one variation

## Acceptance Criteria

- `art_variation` campaigns can create a creative diagnosis from briefing plus original image.
- The diagnosis is shown before generation as a compact editable card.
- The user can edit or regenerate the diagnosis.
- Edited diagnosis is saved as the official creative source.
- Low, medium, and high variation levels have visible user-facing promises.
- Generation uses the approved diagnosis and selected variation level.
- A generation run creates multiple interpretations within the selected level.
- Review/score includes whether the output respected the selected variation level.
- Diagnosis or scoring failures do not block generation, review, approval, or export.
- No first-version behavior changes are introduced for `format_adaptation`, quick restyling, or templates.
