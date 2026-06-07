# Phase 72: Build and Data Integrity Hardening - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore a clean `npm run build` for the v11.7 progression stack and harden the data boundaries found in the v11.7 review (mission insight sanitization, progression snapshot persistence, mission/progression deep-link consumption). This phase does NOT redesign mission UX, add new capabilities, or run the v11.7 migration in target environments — those belong to phases 73 and 74.

**Scope anchor:** Make the existing v11.7 progression code (Phases 68-71) build cleanly and survive concurrent + malformed input, with focused test evidence, so that phase 74 can run the beta UAT path.

</domain>

<decisions>
## Implementation Decisions

### Build / typecheck (STAB-01)
- Fix the missing `mission` category label **at every exhaustive category map** in the feedback / regeneration-correction-brief pipeline.
- Treat `Record<FeedbackCategory, ...>` and any switch over `FeedbackCategory` as exhaustive and verify the `mission` branch exists with sensible copy.
- Do not weaken the type (no `string` cast, no `as` widening) — keep `FeedbackCategory` strict and add the missing entry.
- The build must pass with TypeScript's `--noFallthroughCasesInSwitch` and `noImplicitAny` intact — no ts-ignore escapes.

### Mission insight sanitization (DATA-01, DATA-02)
- Continue to validate `missionKey` against `MISSION_DEFINITIONS` keys (the allowlist is already in `app/src/server/mission-insights/sanitize.ts`).
- Reject the entire insight when the `missionKey` is not in the allowlist — return `null` from `sanitizeMissionInsightInput` so callers can short-circuit before inserting a `feedback_reports` row.
- Sanitize the full input shape (moment, action, sentiment, reason, optionalText, missionKey) at the API boundary, before it reaches the feedback pipeline. Do not rely on schema-level enum alone — the schema is a guard, sanitize is the contract.
- Test coverage: at minimum a focused unit test asserting that an unknown `missionKey` returns `null` from the sanitizer; existing `sanitize.test.ts` should be extended rather than duplicated.

### Progression snapshot persistence (DATA-03)
- Use the existing `upsertWorkspaceProgressionSnapshot` with `onConflictDoUpdate` as the atomic primitive — no advisory lock, no retry wrapper, no retry loop. The conflict clause on `workspaceProgression.workspaceId` is sufficient.
- Treat the snapshot as the durable source of truth for the workspace, and the upsert as the only mutation surface. Do not add a second write path (no "create or update" branch that races with itself).
- Concurrent first-load: rely on the database's upsert atomicity. If the schema or driver is observed to surface transient errors under load, capture them in a follow-up — do not preemptively wrap with retry logic in this phase.
- Test coverage: a focused test that calls `upsertWorkspaceProgressionSnapshot` twice with the same `workspaceId` and asserts the second call updates the row (idempotent, single row remains).

### Mission / progression `?tab=` deep-link (UX-01, owned by Phase 73 but consumed here)
- Phase 72 only ensures the deep-link **infrastructure** is in place — parser, validator, applier — and the `?tab=` query param is consumed on the campaign workspace page. Final UX surface decisions (which tab each mission CTA maps to) are owned by Phase 73.
- Reuse the existing module `app/src/lib/campaign/deep-link-tab.ts` (parser, applier, deep-link ids). Do not introduce a parallel parser.
- The parser must reject unknown tab values (return `null`) — the page consumes the parser output, not raw query params.
- **Invalid `?tab=` value handling:** show a one-shot toast warning ("Destino de missão desconhecido — abrindo a campanha normalmente") and continue with the default campaign workspace behavior. Do not block navigation, do not throw, do not silent-ignore (operator must see the toast).
- Strip the invalid `?tab=` param from the URL after consuming it so a refresh does not re-trigger the toast.

### Mapeamento `?tab=` (carry-forward from existing code, locked)
- `assets` → `goToPilot()` (scroller to `mission-assets`)
- `readiness` → `goToActions()` se `hasDerivations`, senão `goToPilot()` (scroller to `mission-readiness`)
- `briefing` → `goToPilot()` + `setBriefingView("guided")` (scroller to `mission-briefing`)
- `recipe` → `goToActions()` + `openStrategyRecipe()` (scroller to `mission-recipe`)
- `generate` → `goToActions()` + `openDerivationChooser()`, a menos que `mode === "preview"` então `openStrategyRecipe()` (scroller to `mission-generate`)
- `review` / `export` / `share` → `goToActions()` (scroller to corresponding anchor)

Decisão explícita do usuário: revisar e manter o mapeamento atual. As sub-questões específicas (briefing default, generate mode, readiness gate) ficaram em aberto nesta sessão — Phase 73 reabre se houver motivo.

### Test depth (STAB-02, DATA coverage)
- Unit-focused: extend existing tests in `app/src/server/mission-insights/sanitize.test.ts` and `app/src/server/repositories/progression.test.ts`.
- Required new assertions:
  - Sanitizer returns `null` for unknown `missionKey`, empty string, and whitespace-only.
  - Sanitizer returns `null` for invalid `moment`, `action`, `sentiment`, `reason` (each in its own test case).
  - `upsertWorkspaceProgressionSnapshot` called twice with the same `workspaceId` ends with one row whose fields match the second call.
- Do not add new integration / e2e tests in this phase. Migration and browser smoke are phase 74.

### Claude's Discretion
- Exact placement of the `mission` label in any `Record<FeedbackCategory, ...>` map — copy should match the existing tone ("user reported …").
- Toast component / hook choice for the invalid `?tab=` warning — reuse the project's existing toast surface if one exists; if not, a minimal inline alert at the top of the campaign page is acceptable.
- Whether to add a "deep-link applied" log line in the campaign workspace (observability, not behavior).

</decisions>

<specifics>
## Specific Ideas

- Carry-forward from the v11.7 review (see STATE.md): the `mission` feedback category is missing from exhaustive maps, mission insight `missionKey` lacks runtime validation, progression snapshot upsert was non-atomic, and mission/progression `?tab=` CTAs are not consumed by the campaign workspace page.
- The new `app/src/lib/campaign/deep-link-tab.ts` module was added during v11.7 review prep — keep it as the single source of truth for parsing and applying the tab param.
- Pre-existing test drift to leave alone unless this phase touches it: `creative-quality-gate-orchestration.test.ts` (795/797 pass).
- The Drizzle migration `app/drizzle/0032_workspace_progression.sql` is **not** applied or verified in this phase — that is phase 74 work.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/server/mission-insights/sanitize.ts`: already validates `missionKey` against `MISSION_DEFINITIONS` keys via `VALID_MISSION_KEYS`. The sanitizer returns `null` on invalid input; callers in the API route already short-circuit on `null`.
- `app/src/server/repositories/progression.ts`: `upsertWorkspaceProgressionSnapshot` already uses `insert(...).onConflictDoUpdate({ target: workspaceProgression.workspaceId, ... }).returning()`. The atomic upsert is the right primitive — do not rewrite it.
- `app/src/lib/campaign/deep-link-tab.ts`: new module from v11.7 review prep. Exports `CAMPAIGN_DEEP_LINK_IDS`, `parseCampaignTabParam`, `applyCampaignDeepLink`, and `scrollToCampaignDeepLink`. The campaign workspace page should consume `parseCampaignTabParam` from the `?tab=` (and optional `mode`) query param.
- `app/src/lib/hooks/use-campaign-workspace.ts`: 653-line hook that orchestrates campaign state, derivations, briefing, strategy recipe, regeneration, export/share. This is where the deep-link parser output should be applied via the existing `goToPilot` / `goToActions` / `setBriefingView` / `openStrategyRecipe` / `openDerivationChooser` actions.
- `app/src/server/ai/regeneration-correction-brief.ts`: already includes the `mission` label in `feedbackCategoryLine`. The build blocker is in OTHER exhaustive maps, not here.

### Established Patterns
- Feedback / mission insight pipeline (Phase 70): reuse `feedback_reports` with `category: "mission"`, `type: "other"`, `source: "mission_insight"` in `diagnosticContext`. No new migration.
- Progression (Phase 68): workspace-scoped, snapshot + inferred evidence. Schema: `workspaceProgression` with `workspaceId` as the unique key.
- Deep-link ids are stable strings (`mission-assets`, `mission-readiness`, …). The page is expected to have DOM anchors with these ids; `scrollIntoView` is the scroll mechanism.
- `record-once` insight prompts: localStorage gate per `(workspaceId, moment)`, also respected by `mission_skipped` and `credit_friction`.

### Integration Points
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` — reads `searchParams.tab` and `searchParams.mode`, calls `parseCampaignTabParam`, then on mount calls `applyCampaignDeepLink` with the actions exposed by `useCampaignWorkspace`.
- `app/src/app/api/workspace/mission-insights/route.ts` — the API that feeds into the sanitizer; the sanitizer's `null` return must map to a 400 (or 422) at the route boundary.
- `app/src/server/repositories/progression.test.ts` — the test file to extend with the concurrency assertion.
- `app/src/server/mission-insights/sanitize.test.ts` — the test file to extend with the unknown-missionKey assertion.

</code_context>

<deferred>
## Deferred Ideas

- Full mapping review of `?tab=briefing&mode=full`, `?tab=generate` defaults, and `?tab=readiness` gate — explicitly deferred to Phase 73 (Mission Resume UX). Phase 72 keeps the current mapping; Phase 73 can revisit if user research shows the gate is wrong.
- Migration application in target environment + UAT evidence path — Phase 74.
- Replacing the `mission` category with a separate `mission_insights` table — explicitly rejected during Phase 70 (reuse `feedback_reports`).
- Per-user progression inside a shared workspace — future milestone, not v11.7.1.
- Leaderboards, certificates, seasonal challenges — future milestones.

</deferred>

---

*Phase: 72-build-and-data-integrity-hardening*
*Context gathered: 2026-06-06*
