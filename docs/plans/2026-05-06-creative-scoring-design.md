# Creative Scoring and Guided Regeneration - Design

## Context

ADScale already generates derivations, stores each output in the standard campaign gallery, and supports regeneration through feedback. The next product improvement is to help users choose the best generated ads faster and regenerate weak outputs with focused instructions.

This design covers a hybrid creative score persisted on each derivation. The score should support two workflows:

- rank generated variations so the strongest options surface first
- turn detected creative issues into regeneration feedback

## Goals

- Add a visible quality score to each generated variation.
- Rank variations by likely creative strength.
- Explain the main issues behind weak variations.
- Provide a one-click path to regenerate with improvements.
- Preserve existing generation contracts: requested CTA, target format, generation mode, and campaign context.

## Non-Goals

- Do not auto-reject low-scoring variations.
- Do not hide low-scoring creatives from the gallery.
- Do not make scoring required for approval or export.
- Do not introduce a separate review history table yet.
- Do not replace the existing regeneration endpoint.

## Data Model

Persist the current score directly on `derivations`. This keeps the first version simple because the score belongs to the generated output the user is reviewing.

Proposed fields:

- `qualityScore`: overall score from `0` to `100`
- `scoreStatus`: `pending`, `heuristic`, `analyzed`, or `failed`
- `scoreBreakdown`: JSON object with criterion scores
- `scoreIssues`: JSON array of short issue labels or descriptions
- `regenerationSuggestion`: text feedback ready to send to regeneration
- `scoredAt`: timestamp of the latest score update

Suggested `scoreBreakdown` shape:

```json
{
  "ctaClarity": 86,
  "textLegibility": 78,
  "briefMatch": 91,
  "visualQuality": 84,
  "formatFit": 96
}
```

If future versions need multiple evaluations per derivation, model/version history, or evaluator comparison, scoring can move to a dedicated table. That complexity is not needed for the first shipped version.

## Scoring Flow

Scoring runs in two phases.

### 1. Heuristic Score

When generation completes and the output is stored, the app writes an immediate provisional score. This prevents the UI from waiting on visual analysis.

Inputs can include:

- derivation status
- requested format
- generation mode
- CTA presence
- whether the derivation came from regeneration
- available campaign and plan metadata

The heuristic score is support data only. It should use `scoreStatus = "heuristic"` and be replaced by visual analysis when available.

### 2. Visual Analysis Score

After the generated image is uploaded, the app downloads the final output and sends it to the vision model with campaign context. The response returns:

- overall score
- criterion breakdown
- main issues
- regeneration suggestion

Criteria:

- CTA clarity
- text legibility
- briefing/campaign match
- format fit
- visual quality and composition

Visual analysis failures must not fail the derivation. If analysis fails, keep the generated image available and set `scoreStatus = "failed"` or preserve the heuristic score with a failed analysis marker.

## Regeneration Behavior

The existing regeneration endpoint already accepts `feedback`. The score feature should reuse that path.

When the user clicks `Regenerate with improvements`, the UI sends `regenerationSuggestion` as feedback. The user may edit the suggestion before sending, but the fast path should work with one action.

The regeneration feedback must be corrective, not a new creative brief. It must preserve:

- `generationMode`
- `format`
- `ctaText`
- campaign context
- the original derivation relationship through `parentId`

The feedback must not suggest a new CTA, change the target format, or treat a style reference as new content.

## User Interface

### Gallery Cards

Each derivation card should show:

- compact score, for example `87`
- label such as `Strong`, `Adjust`, or `Weak`
- one or two top issues when available

The gallery sort control should add `Best first`. This is central to the workflow because users want to choose winners quickly.

### Review View

The selected derivation review panel should show:

- overall score
- score by criterion
- detected issues
- `Regenerate with improvements` action

Avoid adding a separate scoring page. The score belongs where users already compare, approve, reject, regenerate, and export.

## Backend Design

Add a dedicated scoring module:

- `src/server/ai/creative-score.ts`
- `scoreDerivationHeuristic(...)`
- `analyzeDerivationCreative(...)`
- `buildRegenerationSuggestion(...)`

Add a repository helper:

- `updateDerivationScore(id, workspaceId, scoreData)`

The generation job should call scoring after `outputKey` is saved. Scoring should run in an isolated block so errors are logged and persisted as score errors without changing a completed derivation to failed.

## Error Handling

Expected score states:

- `pending`: derivation exists but score has not been calculated
- `heuristic`: provisional score is available
- `analyzed`: visual analysis completed
- `failed`: visual analysis failed

Scoring errors should never block:

- image completion
- approval
- rejection
- export
- manual regeneration

## Testing Strategy

Cover the first version with focused tests:

- heuristic scoring with minimal derivation/campaign context
- visual analysis response parsing and validation
- fallback behavior when visual analysis fails
- repository update helper
- regeneration path preserving `generationMode`, `format`, and `ctaText`
- UI sort behavior for `Best first`
- UI fallback for `pending`, `heuristic`, `analyzed`, and `failed`

## Acceptance Criteria

- Completed derivations can show a persisted creative score.
- Gallery cards can rank variations by score.
- Review view exposes a score breakdown and detected issues.
- Regeneration can use the stored suggestion as feedback.
- Existing CTA, format, and generation mode contracts remain unchanged.
- Scoring failure does not break generated image availability.
