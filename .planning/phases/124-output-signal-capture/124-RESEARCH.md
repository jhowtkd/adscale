# Phase 124: Output Signal Capture - Research

**Researched:** 2026-06-16  
**Status:** Ready for planning

## Phase Summary

Phase 124 should introduce a canonical append-only evidence layer for output decisions. Existing `beta_analytics_events`, campaign memory, and brand memory are useful projections, but they are not suitable as the source of truth for future output learning because they are either telemetry-oriented or prompt-oriented.

## Existing Surfaces

| Surface | Current behavior | Phase 124 use |
|---|---|---|
| `derivations/[id]/review` | Updates status; blocks invalid approvals; writes beta analytics, campaign memory, brand memory | Emit approval/rejection evidence after status update |
| `derivations/[id]/regenerate` | Creates child derivation with resolved correction brief; writes campaign memory | Emit regeneration evidence linked to parent derivation |
| `derivations/[id]/save-reference` | Validates approved output; creates client reference; writes brand memory | Emit strong positive reference evidence |
| `campaigns/[id]/approval-package` | Builds/refreshes delivery package from approved roots | Emit delivery-selection evidence for chosen derivations |
| `beta_analytics_events` | Validated event table for beta instrumentation | Pattern for ownership checks and insert helper, not source of truth |
| `client_performance_learnings` | Canonical learning table with evidence arrays, status, confidence, algorithm version | Pattern for later Phase 125 learning aggregation |

## Recommended Architecture

Create a dedicated canonical evidence table plus repository/service helpers:

- `output_decision_events` or equivalent table under `adscale_app`
- append-only rows with stable IDs and timestamps
- workspace/user/campaign/derivation/client-profile scope
- action and signal semantics stored as bounded strings
- limited `contextSnapshot` JSON for quality fields and structured reasons
- repository helper that validates ownership through existing workspace-scoped derivation/campaign reads
- service helper that route handlers call best-effort after the primary action succeeds

## Suggested Event Semantics

| Action | Direction | Strength | Notes |
|---|---|---|---|
| `approved` | positive | strong | Only after `assertDerivationApprovable` passes |
| `rejected` | negative | strong | Include hard failures, score issues, regeneration suggestion when available |
| `regenerated` | negative or corrective | strong | Link parent and child if child created; include correction brief primary reason |
| `saved_reference` | positive | strong | Indicates reusable client/brand preference |
| `selected_for_delivery` | positive | medium | Stronger than passive view; weaker than explicit save-reference |

Avoid treating views, modal opens, or retrieval relevance as output evidence in this phase.

## Snapshot Fields

Keep snapshots bounded:

- derivation status before/after when available
- generation mode, format, variant index, CTA text
- quality score, quality verdict, score status
- hard failure codes/messages
- polish suggestions or score issues
- rejection/regeneration reason code/text if already available
- source route/action

Do not store raw prompts, image bytes, signed URLs, full model responses, auth/session material, or unrelated campaign fields.

## Implementation Notes

- Add Drizzle schema and migration before route wiring.
- Create pure normalization helpers so tests can lock action/direction/strength mapping.
- Keep evidence writes best-effort in routes with structured warning logs on failure.
- Do not remove existing campaign memory, brand memory, or beta analytics behavior.
- Use test-first route assertions to prove primary action still succeeds when evidence recording rejects.

## Validation Architecture

### Automated Tests

- Unit tests for output-decision event normalization.
- Repository tests for insert/list behavior and workspace isolation.
- Route tests for review/regenerate/save-reference/approval-package evidence calls.
- Route tests that mock recorder failure and assert primary user action still succeeds.

### Commands

- Focused quick suite:
  `cd app && npm test -- tests/unit/output-learning app/src/server/output-learning app/src/app/api/derivations/[id]/review/route.test.ts app/src/app/api/derivations/[id]/regenerate/route.test.ts app/src/app/api/derivations/[id]/save-reference/route.test.ts app/src/app/api/campaigns/[id]/approval-package/route.test.ts`
- Full phase gate:
  `cd app && npm test && npm run lint && npm run build`

### Manual Verification

No browser-only behavior is required for Phase 124. The phase is complete when route/API tests prove evidence capture and non-blocking failure policy.

## Risks

| Risk | Mitigation |
|---|---|
| Duplicating beta analytics | Keep canonical evidence separate and purpose-specific |
| Capturing too much private context | Limited snapshot + no prompts/raw payloads |
| Blocking review flow on evidence failure | Best-effort recorder with warning logs |
| Phase creep into learning aggregation | Leave confidence/supersession to Phase 125 |

## Planning Recommendation

Use three plans:

1. Schema, types, and pure normalization.
2. Repository/recorder service with non-blocking failure behavior.
3. Route integration and verification across review, regenerate, save-reference, and delivery package.

