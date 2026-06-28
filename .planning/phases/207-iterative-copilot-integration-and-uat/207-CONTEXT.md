# Phase 207: Iterative Copilot Integration and UAT - Context

**Gathered:** 2026-06-28 (autonomous auto-discuss)
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the plan→creative iteration loop (Phases 203–206) as one coherent, accessible, observable assistant workflow. This phase adds safe operator telemetry and closes automated test gaps (repository/API/component/contract + authenticated Playwright). It does not introduce new product capabilities beyond observability, integration glue, and verification.

Out of scope: new revision semantics, new comparison/promotion rules, billing changes, or cross-thread memory.

</domain>

<decisions>
## Implementation Decisions

### Telemetry (QA-01)
- **D-01:** Extend the existing `assistant_guided_flow_events` pattern with a dedicated artifact-iteration event stream (table + emitter) rather than overloading guided-flow events.
- **D-02:** Event keys cover: `proposal_created`, `proposal_confirmed`, `generation_enqueued`, `generation_succeeded`, `generation_failed`, `comparison_opened`, `comparison_acknowledged`, `promotion_requested`, `promotion_succeeded`, `promotion_conflict`, `retry_requested`, `proposal_staled`.
- **D-03:** Payloads are positive allowlists only: scope dimensions, artifact type, lineage id, version numbers, proposal/action ids, operation id, stale/conflict reason codes. No prompts, signed URLs, snapshots, or provider payloads.
- **D-04:** Emit from existing service boundaries (plan/creative proposal confirm, derivation callbacks, comparison/promote routes) — no UI-only telemetry.
- **D-05:** Provide a read-only operator query route or script using workspace scope filters consistent with guided-flow funnel tooling.

### Automated tests (QA-02)
- **D-06:** Close Nyquist gaps called out in 203–206 VALIDATION docs: cross-thread isolation, reload projection, idempotent replay mismatch, first-approval null head, compound promotion rollback — prefer extending existing test files over new harnesses.
- **D-07:** Add component/integration tests only where Phase 206 left human-needed items (reload after promotion, stale card after head change).
- **D-08:** Playwright uses the established `guided-auth` API sign-in pattern with route mocks for LLM/credits/Inngest; no live provider spend.
- **D-09:** One desktop and one mobile viewport spec file for the iteration loop: plan revision → confirm → creative revision → compare → approve/promote → reload verifies state → stale card after concurrent head change (mocked).
- **D-10:** Playwright asserts accessibility landmarks on comparison dialog and version history (existing a11y gate patterns).

### Milestone closure
- **D-11:** Reuse v13.8/v13.9 release-gate scripts; milestone audit must cite explicit claim boundaries (what is proven in CI vs staging vs human).
- **D-12:** Production build + full unit suite remain hard gates before `complete-milestone`.

### Inherited constraints
- **D-13:** Portuguese user-facing copy in UI tests; English identifiers in code/tests.
- **D-14:** Do not weaken SAFE-* invariants from Phases 203/205 for test convenience.

</decisions>

<references>
## Upstream Artifacts

- Phases 203–206 summaries and VERIFICATION reports
- `app/tests/e2e/guided-assistant-journeys.spec.ts` — auth + route mock patterns
- `app/src/server/assistant/guided-flow-telemetry.ts` — telemetry emitter reference
- Requirements: QA-01, QA-02

</references>
