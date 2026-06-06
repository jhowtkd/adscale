# Phase 61: Creative Readiness Foundation - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Source:** `$gsd-plan-phase 61` from approved v11.6 milestone

<domain>

## Phase Boundary

Phase 61 builds the foundation for Creative Readiness Score before generation. It should make the existing preflight analysis, campaign brief, brand kit, creative diagnosis, and v11.5 quality taxonomy usable as a user-facing readiness decision.

This phase does not build guided briefing, strategy recipes, preview approval, or client packages. Those are later phases.

</domain>

<decisions>

## Implementation Decisions

### Product Direction

- Readiness should happen before credit-heavy derivation generation.
- Readiness must feel like an actionable checklist, not a vague score.
- Blocking issues must be visually and semantically separate from improvement suggestions.
- The user must be able to rerun readiness after editing the brief or replacing the base creative.

### Architecture

- Reuse existing preflight analysis instead of creating a second AI vision path.
- Reuse v11.5 quality taxonomy language where it maps cleanly to readiness dimensions.
- Reuse brand kit and creative contract concepts as input context.
- Keep the result workspace-scoped and campaign/asset-scoped.
- Avoid a new AI provider or model migration.

### UI

- Surface readiness in the campaign workspace near the upload/briefing-to-generation transition.
- Keep controls compact and work-focused.
- Prefer an inline panel/card in the existing workspace flow over a separate page.
- Make the score actionable: each low dimension should say what to fix next.

### Claude's Discretion

- Exact component names and file splits are implementation choices.
- Persistence can be either campaign/asset metadata or a small dedicated model, but it must avoid drift and support reruns.
- Scoring thresholds can be tuned during implementation as long as blocking vs advisory semantics stay explicit.

</decisions>

<specifics>

## Specific Ideas

- Existing route: `app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts`.
- Existing hook: `app/src/lib/hooks/use-preflight.ts`.
- Existing upload integration: `app/src/components/workspace/PilotUploadPanel.tsx`.
- Existing analysis module: `app/src/server/ai/preflight-analysis.ts`.
- Existing taxonomy: `app/src/server/ai/creative-quality-taxonomy.ts`.
- Existing prompt downstream already consumes `preflightResult` in `prompt-builder.ts`.

</specifics>

<deferred>

## Deferred Ideas

- One-question guided briefing is Phase 62.
- Strategy recipes and preview-first generation are Phase 63.
- Client approval package is Phase 64.
- Full cockpit browser smoke and beta handoff are Phase 65.

</deferred>

---

*Phase: 61-creative-readiness-foundation*
*Context gathered: 2026-06-05*
