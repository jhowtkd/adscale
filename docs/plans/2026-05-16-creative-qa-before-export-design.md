# Creative QA Before Export - Design

## Context

ADScale's demo-ready path now supports creative diagnosis, variation-level scoring, approval, regeneration, and multi-format delivery packages. The user can choose a winning derivation and generate final delivery formats, but there is still no final pre-export confidence check.

This feature adds an assistive QA pass for approved pieces. It should help the user catch weak delivery details before downloading or handing off the asset, without turning export into a blocked compliance workflow.

## Goal

Add a lightweight QA review for approved derivations before export.

The first version should:

- expose a QA action on approved derivations with an image
- analyze the final image against campaign context, CTA, offer, format, and briefing
- persist the QA result on the derivation
- show a compact result in the existing card or preview surface
- keep export available even when QA returns warnings
- let the user rerun QA after regeneration or a new result

## Non-Goals

- Do not block export.
- Do not create a separate QA workspace.
- Do not create package-level QA in the first version.
- Do not add policy/legal review beyond simple creative risk language.
- Do not replace creative scoring. Scoring judges quality; QA judges delivery readiness.
- Do not run QA automatically for every generated image in the first version.

## Product Contract

The mental model is:

> This creative is approved. Check whether it is ready to export and point out anything worth reviewing.

QA should be a copilot, not a gate. A warning should help the user decide whether to export, regenerate, or ignore the concern.

## User Flow

1. User approves a derivation.
2. The approved card shows a QA action such as `QA da arte` / `Review QA`.
3. User clicks the action.
4. The app analyzes the image and saves the result.
5. The card or a compact panel shows overall status, checklist, issues, and suggestions.
6. User can export anyway, regenerate with the suggestion, or rerun QA.

## UX Design

### Entry Point

Add the QA action to approved derivations that have an image URL.

The action should be visible when:

- `derivation.status === "approved"`
- the derivation has an image/output
- the user is in the existing gallery/review flow

The action should use an operational label, not a large educational block.

Recommended labels:

- Portuguese: `QA da arte`
- English: `Review QA`

### Result Display

The result should stay compact:

- overall status: `ready`, `warning`, or `review`
- checklist rows for each criterion
- one or two issues
- one or two suggestions
- rerun action when QA is already saved

Statuses should map to product language:

- `ready`: good to export
- `warning`: export is still allowed, but review the note
- `review`: stronger concern, export still allowed

The card should avoid becoming crowded. If the full checklist does not fit, the card can show the overall status plus first issue, with a small expandable/modal panel for details.

## QA Criteria

Use five criteria in the first version:

1. `legibility`: text, CTA, and offer are readable in the final format
2. `ctaOffer`: exact CTA and offer are preserved and not contradicted
3. `briefMatch`: the creative still matches product, audience, objective, and tone
4. `formatFit`: the layout fits the target format without awkward cropping or hierarchy
5. `creativeRisk`: simple creative risks such as generic visuals, excessive text, confusing hierarchy, or unsupported claims

Each criterion should return:

- status: `passed`, `warning`, or `failed`
- concise note

Example:

```json
{
  "status": "warning",
  "checklist": {
    "legibility": { "status": "passed", "note": "CTA remains readable." },
    "ctaOffer": { "status": "passed", "note": "Offer and CTA are preserved." },
    "briefMatch": { "status": "warning", "note": "Audience fit could be clearer." },
    "formatFit": { "status": "passed", "note": "Composition fits 4:5." },
    "creativeRisk": { "status": "warning", "note": "Visual concept is somewhat generic." }
  },
  "issues": ["Audience fit could be clearer."],
  "suggestions": ["Regenerate with stronger audience-specific visual cues."]
}
```

## Backend Design

Add a route:

```text
POST /api/derivations/[id]/qa
```

Validation:

- derivation exists in the current workspace
- derivation has an output image
- derivation is preferably approved
- completed derivations may be allowed later, but first version should stay focused on approved pieces

The route should:

1. require workspace access
2. load derivation and campaign context
3. download the generated image
4. call `server/ai/creative-qa.ts`
5. normalize the model result
6. persist QA fields on the derivation
7. return the updated QA result

## Data Model

Persist QA fields on `derivations`:

- `qaStatus`: `pending`, `ready`, `warning`, `review`, or `failed`
- `qaChecklist`: JSON checklist keyed by criterion
- `qaIssues`: JSON array of concise issues
- `qaSuggestions`: JSON array of concise suggestions
- `qaAnalyzedAt`: timestamp

No separate QA table is needed for the first version.

## Prompt Behavior

The QA prompt should evaluate the final image, not propose a new concept.

It should include:

- campaign objective
- client/product
- audience
- offer
- required CTA
- target format
- generation mode
- creative diagnosis when available

It must instruct the model to:

- preserve the exact CTA and offer
- avoid inventing new facts
- return only JSON
- keep issues and suggestions short and actionable
- treat export as allowed unless a strong delivery concern exists

## Error Handling

- Missing derivation: `404`
- Derivation without output image: `400`
- Derivation not approved: `409`
- Model error: persist or return `failed` without blocking export
- Malformed JSON: normalize to `warning` with a generic issue and suggestion
- Rerun QA: overwrite the previous QA result with a new timestamp

## Testing Strategy

Add tests for:

- QA normalizer with complete, partial, malformed, and out-of-range model data
- QA route success
- QA route missing derivation
- QA route derivation without output
- QA route not approved
- model failure path
- hook success/error behavior
- card UI action visibility, loading state, saved result, and rerun affordance

## Acceptance Criteria

- Approved derivations with images can run QA.
- QA result is persisted and visible in the gallery flow.
- Export remains available regardless of QA status.
- Warnings include short practical suggestions.
- The QA prompt evaluates CTA, offer, briefing fit, format fit, legibility, and creative risk.
- Tests cover the new route, AI normalization, hook, and UI behavior.
