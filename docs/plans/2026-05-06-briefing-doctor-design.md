# Briefing Doctor - Design

## Context

ADScale already has a campaign briefing step before upload and generation. The current form captures campaign name, client, generation mode, target format, creativity level, CTA variants, constraints, and notes. Validation is intentionally minimal: required campaign/client fields, at least one CTA for art variation, and a single target format for format adaptation.

Briefing Doctor adds an assistive quality layer before generation. It helps users catch weak or incomplete briefing inputs that can degrade generated creative output.

## Goal

Add an assistive briefing review tool that:

- points out missing or weak briefing fields
- explains why those gaps matter
- suggests concrete improvements
- lets users apply improvements field by field
- keeps generation available even when the briefing has warnings

## Non-Goals

- Do not create a new required wizard step.
- Do not block generation for subjective quality issues.
- Do not automatically overwrite user fields.
- Do not replace the existing campaign validation.
- Do not persist analysis history in the first version.
- Do not invent factual offers, discounts, deadlines, or claims.

## Product Behavior

Briefing Doctor lives inside `BriefingStep`. It acts as a reviewer, not a gatekeeper.

States:

- `idle`: user has not requested AI analysis yet
- `local`: deterministic local checks are available
- `analyzing`: AI analysis is running
- `analyzed`: AI analysis returned suggestions
- `failed`: AI analysis failed, local checks remain available

The user can continue as today. If the briefing has warnings, the app can show a lightweight reminder before continuing, but it should still allow the user to proceed.

## Architecture

Use a hybrid design.

### Local Rules

Create a pure local analyzer, likely under `src/lib/briefing-doctor.ts`. <!-- VERIFY: src/lib/briefing-doctor.ts — file not found at src/lib/briefing-doctor.ts; see verification in .planning/tmp/ -->

It receives the current `BriefingFormData` and returns deterministic issues. These checks run instantly while the user edits the form.

Local checks should catch:

- missing objective
- missing audience
- audience that is too generic, such as `everyone`, `todos`, or `geral`
- missing offer
- weak offer with no number, deadline, benefit, or condition
- missing CTA in `art_variation`
- generic CTA, such as `clique aqui` or `saiba mais`
- overly long CTA
- missing target format in `format_adaptation`
- platform/format mismatch when obvious
- contradictory or unclear constraints

### AI Analysis

Add a new endpoint:

```txt
POST /api/briefing-doctor/analyze <!-- VERIFY: POST /api/briefing-doctor/analyze — no route definition found; see verification in .planning/tmp/ -->
```

It receives the current briefing and locale. It returns structured JSON:

```json
{
  "overallScore": 82,
  "readiness": "needs_attention",
  "issues": [
    {
      "field": "audience",
      "severity": "medium",
      "message": "Audience is broad.",
      "impact": "Generated copy may become generic."
    }
  ],
  "suggestions": [
    {
      "field": "audience",
      "title": "Make the audience more specific",
      "suggestedValue": "Women 25-34 who buy fitness apparel online",
      "rationale": "This gives the model a sharper visual and copy direction."
    }
  ],
  "improvedBrief": {
    "objective": "Drive purchases for the summer collection",
    "audience": "Women 25-34 who buy fitness apparel online",
    "offer": "20% off summer collection until Sunday",
    "ctaVariants": ["Shop summer deals", "Get 20% off", "Buy before Sunday"],
    "constraints": "Keep brand colors and avoid medical claims.",
    "notes": "Focus on lightweight summer outfits."
  },
  "fieldPatches": [
    {
      "field": "audience",
      "value": "Women 25-34 who buy fitness apparel online"
    }
  ]
}
```

The endpoint should use strict JSON parsing and schema validation. If the AI response is malformed, return a controlled error and keep the frontend usable with local checks.

## UI Design

Add a compact Briefing Doctor panel in `BriefingStep`.

It should show:

- readiness indicator: `Ready`, `Needs attention`, or `Weak`
- top local issues
- `Analyze briefing` button
- AI suggestions grouped by field
- `Apply` action per suggestion
- optional `Continue anyway` wording when warnings exist

Suggestions must be applied one field at a time. There should be no first-version `Apply all` button.

CTA suggestions should be inserted only into empty CTA slots or shown as explicit alternatives. Existing CTA text must not be overwritten automatically.

Target format suggestions must stay within:

- `1:1`
- `4:5`
- `9:16`

## Rules and Safety

The Doctor may suggest better phrasing, stronger specificity, or missing fields. It must not invent factual campaign claims.

Hard constraints:

- preserve existing user CTA values unless the user explicitly applies a CTA suggestion
- never auto-replace CTA text
- never suggest target formats outside `1:1`, `4:5`, `9:16`
- never silently change `generationMode`
- do not block generation for subjective quality warnings
- respond in the user's locale

Existing backend validation remains the source of truth for required fields and target format constraints.

## Error Handling

Local checks should always work.

If AI analysis fails:

- show a small non-blocking error
- keep local issues visible
- keep the form editable
- keep continue/generation available

If field patch application fails due to an invalid field/value:

- ignore that patch
- keep other valid suggestions usable
- avoid mutating unrelated fields

## Testing Strategy

Unit tests:

- local rules detect missing objective
- local rules detect missing audience
- local rules flag generic audiences
- local rules detect weak offer
- local rules detect generic CTA
- local rules detect missing format for `format_adaptation`
- field patch application mutates only the intended field
- existing CTA values are not overwritten automatically

API tests:

- endpoint validates request payload
- endpoint returns structured result from mocked AI response
- malformed AI JSON becomes a controlled error
- locale is passed into the analysis prompt
- invalid target format suggestions are rejected

UI tests:

- local issues render without calling AI
- `Analyze briefing` shows loading and results
- `Apply` updates only the selected field
- continue remains available when warnings exist

## Acceptance Criteria

- User can fill the briefing exactly as today.
- Briefing Doctor shows useful local warnings before generation.
- User can request AI analysis on demand.
- AI suggestions can be applied field by field.
- Existing CTAs are not overwritten automatically.
- Generation remains available even with warnings.
- Existing CTA, format, and generation mode contracts remain intact.
