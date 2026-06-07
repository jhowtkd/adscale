# Phase 72: Build and Data Integrity Hardening - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 72 restores a clean production build and hardens the v11.7 progression/mission insight data boundaries found during review. It should close the concrete build and integrity findings before beta UAT: feedback category exhaustiveness, mission insight runtime validation, progression snapshot concurrent first-access safety, and focused verification evidence.

This phase does not change the progression product model, add new missions, alter mission resume UX, apply production migration, or run full beta UAT. Mission resume UX belongs to Phase 73. Migration and UAT handoff belong to Phase 74.

</domain>

<decisions>
## Implementation Decisions

### Release Gates
- `npm run build` is mandatory for Phase 72 completion. Do not disable or bypass Next.js TypeScript checks.
- `npm run lint` remains part of the verification bundle; warnings can be documented if pre-existing and unrelated.
- The focused progression/missions/insights/feedback test suite is mandatory after fixes.
- A full `npm test` run is not required for this phase unless the focused suite reveals broader risk.

### Existing Fixes
- If fixes already exist in the current branch, the planner should verify and document them rather than reimplementing from scratch.
- Existing fixes should still be treated as part of Phase 72 acceptance if they address STAB/DATA requirements.
- The phase should leave clear evidence that the build blocker and data integrity findings are actually closed, not just assumed closed from code inspection.

### Data Integrity Scope
- Mission insight validation should reject invalid `missionKey` values at the runtime boundary before writing feedback.
- Progression snapshot persistence should use atomic upsert semantics or an equivalent conflict-safe path for concurrent first access.
- Tests should cover the invalid mission key path and the progression upsert conflict/atomic behavior at the repository/service boundary.

### Evidence Artifact
- Create `72-VERIFICATION.md` in the phase directory.
- Evidence should include commands run, pass/fail result, relevant caveats, and the exact remaining blocker if anything fails.
- Do not update the Phase 71 UAT evidence from Phase 72; Phase 74 owns UAT and migration evidence.

### Claude's Discretion
- Exact test names and grouping are planner discretion as long as they cover the required regressions and the focused suite remains easy to rerun.
- Exact wording of `72-VERIFICATION.md` is flexible, but it must be useful as a beta-readiness handoff.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/server/ai/regeneration-correction-brief.ts`: contains exhaustive feedback category labeling that caused the `npm run build` typecheck failure when `"mission"` was added.
- `app/src/lib/feedback/types.ts` and `app/src/server/repositories/feedback.ts`: define/consume `FeedbackCategory` and must stay aligned.
- `app/src/server/mission-insights/sanitize.ts`: runtime boundary for mission insight payloads; should validate `missionKey` against known mission keys.
- `app/src/server/progression/missions/definitions.ts`: source of known mission keys/order for validation.
- `app/src/server/repositories/progression.ts`: persistence layer for `workspace_progression`; should use conflict-safe upsert.
- `app/src/server/repositories/progression.test.ts` and `app/src/server/mission-insights/sanitize.test.ts`: natural homes for regression tests.

### Established Patterns
- Workspace-scoped business state should be enforced server-side and tested at service/repository boundaries.
- Existing repositories already use Drizzle `.onConflictDoUpdate()` in other areas, so using it for progression snapshots matches local style.
- Next.js build/typecheck is a production release gate in this repo; fixing types is preferred over build config escape hatches.
- Phase evidence files are used for handoff and beta readiness decisions.

### Current Branch Observation
- Scout during discussion found code that appears to already include: `mission` feedback category labeling, `VALID_MISSION_KEYS` mission insight validation, progression `.onConflictDoUpdate()`, and related tests. Phase 72 should verify these and document results rather than duplicate work.

</code_context>

<specifics>
## Specific Ideas

- User chose `v11.7.1 Stabilization` as the milestone after review found beta blockers.
- Phase 72 should be narrow and technical: close concrete review findings before the UX resume and UAT phases.
- Required verification bundle: build, lint, focused progression/missions/insights/feedback tests, and `72-VERIFICATION.md`.

</specifics>

<deferred>
## Deferred Ideas

- Mission/progression CTA resume behavior is deferred to Phase 73.
- Applying `0032_workspace_progression.sql` in the target environment and completing `71-UAT-EVIDENCE.md` are deferred to Phase 74.
- Full E2E coverage for the Ads Scientist path is a future requirement unless Phase 74 pulls in a minimal smoke path for UAT.

</deferred>

---

*Phase: 72-build-and-data-integrity-hardening*
*Context gathered: 2026-06-06*
