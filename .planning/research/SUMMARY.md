# Research Synthesis: v11.10 Fechamento Entrega e Analytics

**Synthesized:** 2026-06-07  
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md  
**Milestone:** v11.10 — Fechamento Entrega e Analytics

---

## Executive Summary

v11.10 is a focused instrumentation-closure milestone — not a feature build. The existing beta analytics architecture (first-party event ingest, `PHASE_76_BETA_EVENT_KEYS` allowlist, `aggregate.ts` pure-function aggregators, `OwnerAnalyticsPanel` dashboard) is solid and complete. The entire milestone scope fits within that existing layer: four new event types, three new aggregators, one bug fix in PreviewGatePanel, one false-positive override workflow, and owner dashboard polish to remove artificial caps and populate previously-wired-but-empty session filter options.

Zero new npm dependencies are needed. No schema migrations are required — `beta_analytics_events.properties` is JSONB and already accepts any keys; the allowlist is enforced in application code only. The two constant arrays in `types.ts` (`PHASE_76_BETA_EVENT_KEYS` and `ALLOWED_PROPERTY_KEYS`) are the single gate controlling everything downstream. Extending them is the first action of every phase; skipping this step causes silent event drops that are invisible until a live SESS-03 operator session generates no data.

The milestone closes with SESS-03 (≥3 real operator sessions), which is both a UAT gate and a data-collection moment. All cockpit instrumentation phases must be deployed and smoke-tested before the operator begins sessions. The learning answers for Q4 (recipe selection), Q5 (preview funnel), Q6 (tradeoff readership), and the readiness override signal (F-11) are the specific questions v11.10 was designed to answer. If any instrumentation phase ships after SESS-03 runs, those questions remain fixture-backed for the entire milestone.

---

## Key Findings

### Stack (from STACK.md)

| Technology | Status | Role |
|------------|--------|------|
| Next.js 16.2.6 App Router | Unchanged | Framework |
| React 19.2.4 | Unchanged | UI runtime |
| TypeScript ^5 | Unchanged | Type system |
| Drizzle ORM + Neon PostgreSQL | Unchanged | Persistence (JSONB already correct) |
| TanStack Query ^5.100.1 | Unchanged | Dashboard queries |
| Zod ^3 | Unchanged | Ingest boundary validation |
| shadcn/ui + Tailwind | Unchanged | Dashboard component shell |

**In-repo changes required** (not library changes):
- `types.ts`: Add 4 event keys + 2 property keys to the closed allowlists
- `aggregate.ts`: Add `aggregateRecipeFunnel`, `aggregateCreditRevenueFunnel`; extend `AnalyticsFunnelSummary`
- 4 cockpit panels: targeted one-liner event instrumentation calls
- `OwnerAnalyticsPanel.tsx`: Remove caps, add 2 new `FunnelTable` sections, fix session filter wiring
- `feedback/page.tsx`: Populate `sessionOptions` prop via existing `/api/feedback/sessions`

**What NOT to add:** No third-party analytics SDK, no new API routes, no chart libraries, no cursor pagination (beta cohort too small), no Zod event-shape schemas (JSONB allowlist is sufficient).

---

### Features (from FEATURES.md)

#### Table Stakes (must-have before SESS-03)

| ID | Feature | Complexity | Status |
|----|---------|------------|--------|
| TS-4 / F-14 | Drifted test fix (`creative-quality-gate-orchestration`) | Low (30 min) | Blocking green suite |
| TS-2 / F-08 | `recipe_tradeoff_viewed` event | Low | Missing event key + call site |
| TS-3 / F-09 | `recipe_selected` event + recipe funnel row | Medium | 4 files, each small |
| TS-1 / F-06 | Preview funnel fix (false abandoned on revise) | Low-Medium | Client-side half + optional server-side |
| TS-5 / SESS-03 | ≥3 real operator sessions + updated learning answers | Operational | Gate — runs last |

#### Differentiators (valued additions)

| ID | Feature | Complexity |
|----|---------|------------|
| D-2 / F-12 | Briefing abandon broken down by step | Low-Medium |
| D-3 / Polish | Timeline cap removal + credit consumption funnel | Low (cap) / Medium (funnel) |
| D-1 / F-11 | Readiness false-positive override workflow | Medium |

#### Anti-Features (explicitly deferred)

- New AI models or generation behavior
- Third-party analytics SDK
- Readiness threshold tuning (needs D-1 data first)
- New cockpit stages
- LGPD compliance
- Export pipeline changes (Meta/TikTok)

#### Feature Dependency Chain

```
F-14 (test fix)
  → SESS-03 (green suite required)

F-08 (recipe_tradeoff_viewed) + F-09 (recipe_selected)
  → D-3 (recipe funnel accuracy)

F-06 (preview funnel fix)
  → D-3 (revenue/credit funnel accuracy)

D-1 (readiness override)
  → SESS-03 (generates override evidence)
  → Readiness threshold tuning (v11.11+)

D-2 (briefing step abandon)
  → SESS-03 (richer step-level drop-off data)
```

---

### Architecture (from ARCHITECTURE.md)

#### Existing Pipeline (unchanged)

```
Cockpit Panel → useRecordBetaEvent → POST /api/analytics/events
  → PHASE_76_BETA_EVENT_KEYS gate → sanitize (ALLOWED_PROPERTY_KEYS)
  → insertBetaAnalyticsEvent → beta_analytics_events (JSONB)

OwnerAnalyticsPanel → GET /api/feedback/analytics/funnel
  → buildAnalyticsFunnelSummary (aggregate.ts pure functions)
  → FunnelTable renders
```

#### v11.10 Delta (what actually changes)

| File | Change | Feature |
|------|--------|---------|
| `types.ts` | +4 event keys, +2 property keys | F-08, F-09, F-11 |
| `StrategyRecipePanel.tsx` | +`recipe_tradeoff_viewed` on open, +`recipe_selected` on pick | F-08, F-09 |
| `GuidedBriefingPanel.tsx` | Enrich abandoned event with `stage: currentStep` | F-12 |
| `PreviewGatePanel.tsx` | Remove false `cockpit_stage_abandoned` on revise | F-06 |
| `CreativeReadinessPanel.tsx` | Add override button + `onOverride` prop | F-11 |
| `aggregate.ts` | +`aggregateRecipeFunnel`, +`aggregateCreditRevenueFunnel` | Dashboard polish |
| `OwnerAnalyticsPanel.tsx` | Add recipe + credit funnel tables, remove `.slice(0,24)` cap | Dashboard polish |
| `feedback/page.tsx` | Populate `sessionOptions` from `/api/feedback/sessions` | Dashboard polish |

**No new files created. Zero new API routes.**

#### Suggested Build Order (Waves)

1. **Wave 1 — Schema Foundation:** `types.ts` allowlist extensions + `aggregate.ts` new functions (no UI deps; unblocks everything)
2. **Wave 2 — Cockpit Instrumentation:** `StrategyRecipePanel`, `GuidedBriefingPanel`, `PreviewGatePanel` (depends on Wave 1 types)
3. **Wave 3 — Readiness Override:** `CreativeReadinessPanel` + cockpit orchestrator `onOverride` handler (independent of Wave 2)
4. **Wave 4 — Owner Dashboard:** `OwnerAnalyticsPanel` + `feedback/page.tsx` (depends on Wave 1 aggregate; independent of Waves 2/3)
5. **Wave 5 — Regression + F-14:** Fix drifted test; `npm test`, `npm run lint`, `npm run build` green gate; SESS-03 deployment smoke check

---

### Pitfalls — Top Findings (from PITFALLS.md)

#### Critical (block milestone if ignored)

| # | Pitfall | Prevention |
|---|---------|------------|
| 1 | New event keys added to call sites without extending `PHASE_76_BETA_EVENT_KEYS` → silent drop, no data | Extend enum **before** call site, in same commit |
| 2 | New property keys (`recipeId`, `stepId`) not in `ALLOWED_PROPERTY_KEYS` → properties stored as `{}` | Extend allowlist atomically with enum; add `sanitize.test.ts` case per key |
| 3 | `readiness_override` event + operator note tag → duplicate signals in dashboard (2× override count) | Decide authoritative source; dedup in `aggregateReadinessOverrides` by `sessionId + stage + time window` |
| 4 | F-06 preview funnel fix not deployed before SESS-03 → Q5 permanently unanswerable | F-06 is a hard pre-requisite for SESS-03; not parallelizable |
| 5 | Session filter DB query without index → 3–5s latency during live sessions | Add `CREATE INDEX CONCURRENTLY idx_beta_analytics_events_session_id` in migration |
| 7 | SESS-03 runs on pre-instrumentation build → no real data generated | Runbook step: verify deployed SHA + smoke-fire a test event before session |
| 8 | F-14 drifted test masked as green → real regressions ship undetected | Fix assertion or `test.todo`; run `--reporter=verbose` to surface skips |

#### Moderate

| # | Pitfall | Prevention |
|---|---------|------------|
| 6 | Timeline cap removal without date window → unbounded fetch pattern | Add default `last 30 days` window; uncapped is opt-in toggle |
| 9 | `"guided_briefing"` stage not in `BETA_RUNBOOK_STAGES` → orphan row in funnel | Verify key membership before emitting; add `aggregate.test.ts` assertion |
| 10 | "Revenue funnel" implies billing; no billing events exist | Scope to **credit consumption funnel** (`credit_spend` events); rename widget "Créditos por Etapa" |
| 11 | Override bypass at component-only level → bypassable client-side | Server-side `readiness_overridden` event from `preflight` route is the audit record |
| 12 | SESS-03 learning answers use fixture session IDs (`550e8400-…`) | Real `session_id` citation required; reviewer rejects fixture UUIDs |
| 13 | `cockpit_stage_abandoned` fires on unmount during navigation → ghost events | Completion-flag ref pattern + 100ms debounce on abandon emit |

#### Minor

| # | Pitfall | Prevention |
|---|---------|------------|
| 15 | `recipe_tradeoff_viewed` fires on panel mount, not on actual tradeoff interaction → Q6 answer wrong | Fire on IntersectionObserver / expand callback, not on `useEffect([open])` |
| 16 | `recipe_selected` fires on re-render instead of explicit click | Fire on click handler, not `useEffect` state dependency |
| 17 | New dashboard widgets in English only | Add PT-BR i18n keys; run `npm run lint` (i18n check) before merge |

---

## Implications for Roadmap

### Recommended Phase Order

Based on the dependency graph and pitfall analysis, the recommended phase structure is:

**Phase 1 — Schema Foundation** _(~0.5 days)_  
Extend `PHASE_76_BETA_EVENT_KEYS` and `ALLOWED_PROPERTY_KEYS` in `types.ts`. Add `aggregateRecipeFunnel` and `aggregateCreditRevenueFunnel` to `aggregate.ts`. Add unit tests for new aggregators.  
**Rationale:** Every downstream change depends on the allowlists being correct. Doing this first makes every other phase safe to land in any order.  
**Research flag:** Not needed — pure allowlist extension, well-documented pattern.

**Phase 2 — Cockpit Instrumentation: Recipe + Briefing** _(~1 day)_  
F-08 (`recipe_tradeoff_viewed`), F-09 (`recipe_selected`), F-12 (briefing abandon with step). Touches `StrategyRecipePanel`, `GuidedBriefingPanel`.  
**Rationale:** Depends on Phase 1 types. Groups the two recipe events with the briefing step event since they share the same call-site pattern.  
**Pitfalls to avoid:** #1 (event key gate), #2 (property key gate), #13 (ghost abandon on unmount), #15 (tradeoff_viewed fires too eagerly), #16 (recipe_selected on re-render).  
**Research flag:** Not needed — existing pattern is `useRecordBetaEvent` + `useEffect`/click handler.

**Phase 3 — F-06 Preview Funnel Fix** _(~0.5 days)_  
Remove false `cockpit_stage_abandoned` from `PreviewGatePanel.handleReviseRecipe`. Optionally add server-side `cockpit_stage_completed` to the runbook-complete route.  
**Rationale:** Hard pre-requisite for SESS-03. Must be deployed before live sessions. Client-side half is independent of all other phases.  
**Pitfalls to avoid:** #4 (preview funnel fix missing before SESS-03).  
**Research flag:** Server-side route touch (optional scope) — assess if `PATCH /api/feedback/sessions/:id/stages` emit is in or out of scope before planning.

**Phase 4 — Readiness Override (F-11)** _(~1 day)_  
Add override button to `CreativeReadinessPanel`. Emit `readiness_blocked { action: "overridden" }` from `preflight` route. Update `aggregateReadinessOverrides` dedup. Wire `onOverride` prop through cockpit orchestrator.  
**Rationale:** Independent of Phase 2/3. Most complex phase; needs careful attention to dedup pitfall.  
**Pitfalls to avoid:** #3 (duplicate override signals), #11 (component-only bypass).  
**Research flag:** Recommended — `onOverride` prop threading through cockpit orchestrator requires understanding the parent composition.

**Phase 5 — Owner Dashboard Polish** _(~1 day)_  
Remove `.slice(0, 24)` timeline cap (add date window default). Add `recipeFunnel` and `creditRevenueFunnel` `FunnelTable` sections to `OwnerAnalyticsPanel`. Populate `sessionOptions` in `feedback/page.tsx`. Add DB migration for `session_id` index.  
**Rationale:** Depends on Phase 1 aggregators. Can run in parallel with Phases 2/3/4 but not before Phase 1.  
**Pitfalls to avoid:** #5 (missing DB index), #6 (unbounded timeline fetch), #10 (revenue vs credit funnel naming), #14 (invalid sessionId UX), #17 (PT-BR string drift).  
**Research flag:** Not needed — `FunnelTable` pattern and TanStack Query fetching are established.

**Phase 6 — Regression + F-14 Test Fix** _(~0.5 days)_  
Fix `creative-quality-gate-orchestration.test.ts` assertion drift (F-14). Run `npm test --reporter=verbose`, `npm run lint`, `npm run build`. Surface and resolve any skipped tests.  
**Rationale:** Green suite is the gate before SESS-03. Must be last code phase.  
**Pitfalls to avoid:** #8 (drifted test masking regressions).  
**Research flag:** Not needed.

**Phase 7 — SESS-03 Operator UAT** _(operational, 1–3 days)_  
Deployment smoke check (SHA verify + test event via owner CSV). Run ≥3 real operator sessions. Update `LEARNING-ANSWERS.md` with real session IDs and event counts. Produce session evidence file.  
**Rationale:** Terminal gate for milestone. Purely operational after all code phases are deployed.  
**Pitfalls to avoid:** #7 (running on pre-instrumentation build), #12 (fixture UUIDs in learning answers).  
**Research flag:** Not needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All sources are direct codebase inspection; zero new deps confirmed |
| Features | HIGH | All assertions verified against live source files; F-06–F-12 are real backlog items with file+line citations |
| Architecture | HIGH | Build order derived from actual component boundaries and `z.strictObject` constraint |
| Pitfalls | HIGH | Grounded in v11.8 shipped code + deferred backlog evidence; not speculative |
| SESS-03 operational path | MEDIUM | Depends on operator availability and real session execution; no code uncertainty |

### Gaps to Address in Planning

1. **F-06 server-side emit scope:** Whether to add `cockpit_stage_completed` to the runbook-complete API route needs a scoping decision before Phase 3 planning. The client-side half (remove false abandoned) is independent and delivers value alone.
2. **`recipe_tradeoff_viewed` trigger mechanism:** IntersectionObserver vs explicit expand callback — the PITFALLS.md flags this as critical for Q6 answer validity. The UI implementation of the tradeoff section needs inspection to pick the right trigger.
3. **Override dedup strategy:** PITFALLS.md recommends event as authoritative source over operator notes. This means `extractOperatorFalsePositiveNotes` behavior changes for the readiness stage. Planning should confirm before coding.
4. **DB index migration number:** The next available Drizzle migration number needs to be confirmed before writing the `session_id` index migration (current: `0033_beta_analytics.sql`).
5. **`onOverride` prop threading:** The cockpit orchestrator component wrapping `CreativeReadinessPanel` needs to be identified before Phase 4 planning — it is not directly named in the research files.

---

## Sources

- `app/src/server/beta-analytics/types.ts` — allowlists (inspected)
- `app/src/server/beta-analytics/aggregate.ts` — aggregation contract (inspected)
- `app/src/server/beta-analytics/sanitize.ts` — `z.strictObject` gate (inspected)
- `app/src/server/beta-analytics/record.ts` — event key gate (inspected)
- `app/src/components/workspace/{Strategy,GuidedBriefing,PreviewGate,CreativeReadiness}Panel.tsx` (inspected)
- `app/src/components/feedback/OwnerAnalyticsPanel.tsx` (inspected)
- `app/src/app/(dashboard)/feedback/page.tsx` (inspected)
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-V11.9-BACKLOG.md`
- `.planning/PROJECT.md`
- `app/drizzle/0033_beta_analytics.sql`

---

*Synthesis produced by gsd-research-synthesizer — 2026-06-07*
