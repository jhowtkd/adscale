# Phase 62: Guided Briefing Cockpit - Context

**Gathered:** 2026-06-05
**Status:** Locked for execution
**Source:** v11.6 milestone, Phase 61 complete, `--auto` discuss defaults

<domain>

## Phase Boundary

Phase 62 replaces empty-form briefing anxiety with a one-question-at-a-time flow that turns weak briefs into generation-ready campaign context. It orchestrates existing campaign draft fields, pilot save, auto-briefing patterns, and creative analysis hints — without a new AI provider or credit-heavy path.

This phase does not build strategy recipes, preview gates, or client packages (Phases 63–64).

</domain>

<decisions>

## Implementation Decisions

### Product Direction

- Default pilot workspace shows **guided briefing** when the campaign brief is weak (fewer than two core fields filled: product, offer, audience, objective).
- User sees **one question at a time** with accept, edit, or skip on each suggestion.
- Question order: product/offer → audience → promise → objections → CTA → platforms → constraints.
- User can switch to the existing full `PilotBriefingForm` via "Edit all fields".

### Field Mapping (persist to normal draft)

| Guided step | Campaign field |
|-------------|----------------|
| product / offer | `product`, `offer` |
| audience | `audience` |
| promise | `objective` |
| objections | prefixed into `constraints` (`Objections to address: …`) |
| CTA | `ctaVariants[0]` |
| platforms | `platforms[]` |
| constraints | `constraints` (merged, objections prefix preserved) |

### Architecture

- Shared pure module `guided-briefing.ts` for step order, weak-brief detection, rule-based suggestions, and draft mapping.
- Suggestions are **deterministic** from prior answers + creative analysis hints (no extra credit spend).
- Incremental persist via existing `PATCH /api/campaigns/[id]`; final pilot transition via existing `POST /api/campaigns/[id]/pilot`.
- Reuse `AutoBriefingModal` accept/edit/skip interaction pattern and `PilotBriefingForm` field names.

### UI

- `GuidedBriefingPanel` in pilot column (replaces full form when brief is weak).
- Compact progress indicator; suggestion card with accept / edit / skip.
- `CreativeReadinessPanel` remains upstream context; guided flow can launch from readiness "fix brief" affordance later — not required in 62.

### i18n (GUIDE-05)

- All guided copy in `guidedBriefing` namespace for `en` and `pt-BR`.
- Suggestion templates respect UI locale; generation language rules unchanged (workspace/user locale for AI output stays as today).

### Claude's Discretion

- Exact component styling follows existing pilot workspace tokens.
- `productOffer` step may use one or two inputs; must capture both product and offer before advancing.

</decisions>

<specifics>

## Specific Ideas

- Existing: `PilotBriefingForm.tsx`, `AutoBriefingModal.tsx`, `use-auto-briefing.ts`, `pilot/route.ts`.
- Existing: `useUpdateCampaign`, `useCampaign`, campaign repository fields (`product`, `offer`, `objective`, …).
- Integration point: `app/src/app/(dashboard)/campaigns/[id]/page.tsx` piloto grid.

</specifics>

<deferred>

## Deferred Ideas

- AI-powered suggestion refresh per step (use suggest-ctas pattern in a future iteration).
- Readiness panel deep-link into guided step based on lowest dimension.
- Strategy recipes (Phase 63).

</deferred>

---

*Phase: 62-guided-briefing-cockpit*
*Context locked: 2026-06-05*
