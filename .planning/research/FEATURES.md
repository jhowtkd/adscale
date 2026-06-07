# Feature Landscape: v11.10 Fechamento Entrega e Analytics

**Domain:** Beta analytics instrumentation closure + operator UAT
**Researched:** 2026-06-07
**Milestone context:** Closing deferred v11.8 backlog (F-06, F-08, F-09, F-11, F-12, F-14) plus owner dashboard polish and SESS-03 operator UAT.

---

## What Already Exists (do NOT rebuild)

Confirmed in codebase before writing this document:

| Capability | Location | Status |
|------------|----------|--------|
| `cockpit_stage_completed` on GuidedBriefingPanel | `GuidedBriefingPanel.tsx:65` | ✓ Built |
| `cockpit_stage_completed` on CreativeReadinessPanel | `CreativeReadinessPanel.tsx:79` | ✓ Built |
| `cockpit_stage_completed` / entered / abandoned on StrategyRecipePanel | `StrategyRecipePanel.tsx:70-91` | ✓ Built |
| `cockpit_stage_completed` on PreviewGatePanel | `PreviewGatePanel.tsx:71` | ✓ Built |
| `readiness_blocked` / `readiness_completed` events (server) | `preflight/route.ts` | ✓ Built |
| `ReadinessOverrideSignal` aggregate from `readiness_blocked` events | `aggregate.ts:277` | ✓ Built |
| Owner dashboard: session filter select, date range, workspace filter | `OwnerAnalyticsPanel.tsx:161-259` | ✓ Built |
| Session stage timeline table (with `.slice(0, 24)` cap) | `OwnerAnalyticsPanel.tsx:329` | ✓ Built (capped) |
| Credit surprise by operation table | `OwnerAnalyticsPanel.tsx:299` | ✓ Built |
| Readiness override signals display panel | `OwnerAnalyticsPanel.tsx:340` | ✓ Built |
| `stepIndex()` + `guided.currentStep` in GuidedBriefingPanel | `GuidedBriefingPanel.tsx:29-77` | ✓ Built (unused in abandon) |
| `ALLOWED_PROPERTY_KEYS` PII allowlist in types | `beta-analytics/types.ts:3` | ✓ Built |
| `PHASE_76_BETA_EVENT_KEYS` enum | `beta-analytics/types.ts:25` | ✓ Built |

---

## Table Stakes

Features users/operators expect. Missing = product feels incomplete.

### TS-1: F-06 — Preview funnel completeness via manual runbook path

**Why expected:** The cockpit stage funnel in the owner dashboard should accurately show whether operators reached and completed the preview stage. Currently, when an operator marks a beta session as complete via the manual runbook (not through PreviewGatePanel.onApproveBatch), no `cockpit_stage_completed(stage: "preview")` event fires. This produces a false "preview: abandoned=1" reading in the funnel, misrepresenting operator behavior.

**What to build:** Emit `cockpit_stage_completed({stage: "preview", missionKey: "preview"})` from the beta-session runbook completion path (server route `beta-sessions/[id]/summary` or the operator UI that marks session done), so the funnel row reflects actual operator progression rather than just panel interactions.

**Complexity:** Low — one `recordBetaAnalyticsEvent` call at the runbook-complete boundary. Test: verify `cockpit_stage_completed` fires on session summary submission.

**Dependencies:** `cockpit_stage_completed` event key already in PHASE_76_BETA_EVENT_KEYS ✓; `recordBetaAnalyticsEvent` available server-side ✓.

---

### TS-2: F-08 — `recipe_tradeoff_viewed` event

**Why expected:** Without this event, the owner has no signal for whether operators are reading the tradeoff copy before selecting a recipe — which was Q6's open question. The tradeoff copy is already rendered in StrategyRecipePanel for each recipe card (line 135-137). The event is just missing.

**What to build:** Fire `recipe_tradeoff_viewed` once per panel open session from StrategyRecipePanel (similar to `cockpit_stage_entered`) using a `useRef` guard to prevent duplicate fires per open.

**What changes:** 
- Add `"recipe_tradeoff_viewed"` to `PHASE_76_BETA_EVENT_KEYS` (or extend with a v11.10 constant).
- Emit in `StrategyRecipePanel` `useEffect` alongside `cockpit_stage_entered`.
- Test: assert event fires on mount when `open=true`.

**Complexity:** Low — single `useEffect` side-effect, one new event key.

**Dependencies:** `useRecordBetaEvent` already imported in StrategyRecipePanel ✓.

---

### TS-3: F-09 — `recipe_selected` event + funnel row

**Why expected:** Q4 in v11.8 had only operator notes with no event data. Owner needs to know which recipes operators pick most, which correlates to which creative strategies get validated in beta.

**What to build:**
1. Fire `recipe_selected({ stage: "strategy_recipe", recipeId: id })` in `StrategyRecipePanel` inside `recipe.selectRecipe(id)` handler (or wrap the selectRecipe call).
2. Add `"recipe_selected"` to the event key allowlist.
3. Add `"recipeId"` to `ALLOWED_PROPERTY_KEYS` in `types.ts`.
4. In `aggregate.ts`, add a `recipeFunnel` aggregation: group `recipe_selected` events by `properties.recipeId`, count distinct sessions.
5. Surface a "Recipe selection" table in `OwnerAnalyticsPanel` alongside the cockpit stage funnel.

**Complexity:** Medium — touches types, aggregate, StrategyRecipePanel, dashboard table. Four files, but each change is small.

**Dependencies:** `recipeId` must be added to `ALLOWED_PROPERTY_KEYS` (PII allowlist) before the property passes ingest validation.

---

### TS-4: F-14 — `creative-quality-gate-orchestration` test drift fix

**Why expected:** A failing test is a broken build signal. The `creative-quality-gate-orchestration.test.ts` has a drifted assertion on `regenerationSuggestion` format (line 121: `stringMatching(/Hard failures:[\s\S]*cta_drift: CTA was replaced/)`) that no longer matches the actual string produced by `runCompletedDerivationQualityGate`. This must be green before regression can be validated.

**What to build:** Align the assertion to match the current `regenerationSuggestion` output format from `creative-quality-gate.ts`. This is a test fix, not a production code change.

**Complexity:** Low — read the current output format from `creative-quality-gate.ts`, update the regex or use `toContain`. No production risk.

**Dependencies:** None beyond the existing test/implementation pair.

---

### TS-5: SESS-03 — ≥3 real operator sessions + updated learning answers

**Why expected:** `SESS-03` is the defined UAT gate blocking v11.9 scope lock. Learning answers in `LEARNING-ANSWERS.md` are currently fixture-backed (from v11.8). They must reflect evidence from real operator sessions before v11.10 can close.

**What to build (operational, not code):**
1. Operator applies migrations (already documented in v11.7.1 handoff).
2. Operator runs ≥3 sessions using the beta session runbook.
3. Owner reviews the `/feedback` dashboard analytics after sessions.
4. Update `LEARNING-ANSWERS.md` with real session findings.
5. Document session IDs and key observations in a session evidence file.

**Complexity:** Low (code) / Medium (operational) — no new code needed if existing runbook is complete. May surface bugs that require code fixes.

**Dependencies:** All cockpit instrumentation (TS-1 through TS-3) should be in place before sessions so analytics are useful.

---

## Differentiators

Features that go beyond baseline expectations; valued when present.

### D-1: F-11 — Readiness false-positive override workflow

**Why valuable:** The `readiness_blocked` event fires and is displayed in the owner dashboard, but operators have no way to explicitly say "this readiness block was a false positive — I proceeded anyway." Without an override path, operators either get stuck on `needs_attention` readiness or silently bypass it. An explicit override both unblocks the UX and provides a falsifiable signal for tuning the readiness threshold.

**What to build:**
1. **Override action in CreativeReadinessPanel:** When readiness status is `needs_attention`, show a secondary CTA: "Override (false positive)" that lets the operator continue despite blocking issues. This calls `onReadinessOverride()`.
2. **`readiness_override` event:** Emit `recordBetaAnalyticsEvent({eventKey: "readiness_override", properties: {blockingCount, readinessStatus}})` on override click. Add to event key allowlist.
3. **Aggregate signal:** In `aggregate.ts`, modify `aggregateReadinessOverrideSignals` to also include `readiness_override` events (not just `readiness_blocked`). Tag them as `kind: "override"` vs current `kind: "event"`.
4. **Owner dashboard:** Show override events distinctly (e.g., badge "Override" in green) in the readiness override signals panel.

**Complexity:** Medium — touches CreativeReadinessPanel props contract, one new event key, aggregate change, and dashboard display.

**Dependencies:** Requires `onReadinessOverride` prop threaded from parent cockpit orchestrator. The `ReadinessOverrideSignal` type already has a `kind` discriminator that supports extension ✓.

---

### D-2: F-12 — Guided briefing abandon breakdown by step

**Why valuable:** Currently `cockpit_stage_abandoned({stage: "guided_briefing"})` fires but contains no information about which step the operator abandoned at. Knowing the specific step (e.g., `productOffer`, `objections`, `constraints`) surfaces which question causes the most friction — far more actionable than an aggregate abandon count.

**What to build:**
1. In `GuidedBriefingPanel.tsx`, pass `currentStep: guided.currentStep` as a property in the `STAGE_PROPS` used for `cockpit_stage_abandoned`.
2. Add `"stepId"` to `ALLOWED_PROPERTY_KEYS` in `types.ts`.
3. In the aggregate, group abandoned events by `properties.stepId` for the cockpit stage funnel detail.
4. Owner dashboard: show a "Briefing abandon by step" breakdown (e.g., a column inside the cockpit stage funnel table, or a separate small table).

**Complexity:** Low-Medium — the `guided.currentStep` value is already available at abandon time (confirmed in source). The `stepIndex()` function exists. Just need to include it in the fired event and display it.

**Dependencies:** `stepId` property must be added to `ALLOWED_PROPERTY_KEYS` before it passes ingest ✓ (pattern is identical to existing `stage` key).

---

### D-3: Owner dashboard — timeline without cap and revenue funnel

**Why valuable:** The session stage timeline currently hard-caps at 24 rows (`.slice(0, 24)` in OwnerAnalyticsPanel.tsx line 331). With ≥3 real sessions per SESS-03 and multiple stages per session, 24 rows will be exceeded. Beyond the cap, the "revenue funnel" (credit spend → derivation completed → derivation approved → export) gives the owner a conversion view of where value actually flows.

**What to build:**
1. **Timeline cap removal:** Remove `.slice(0, 24)` from the timeline filter/map. If pagination is needed for large datasets, add a "Show more" toggle or paginate on the server via a `limit` query param.
2. **Revenue/delivery funnel:** Add a new aggregate in `aggregate.ts` that counts: `credit_spend` events → `cockpit_stage_completed(stage: "preview")` events → total derivations approved (join with derivation table, or proxy via mission_completed) → export events if instrumented. Surface as a new FunnelTable row in `OwnerAnalyticsPanel`.

**Complexity:** Low (timeline cap) / Medium (revenue funnel) — the aggregate needs a new function; the dashboard needs a new table.

**Dependencies:** Revenue funnel accuracy depends on F-06 (preview stage completion) being correctly instrumented first.

---

## Anti-Features

Features to explicitly NOT build in v11.10.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| New AI models or generation behavior | Confounds analytics learning from real sessions | Defer to post-beta milestone |
| Third-party analytics SDK (Mixpanel, Amplitude, PostHog) | First-party events are sufficient for operator beta; adds complexity and potential PII risk | Continue with existing `beta_analytics_events` table |
| Readiness threshold tuning (changing the readiness score algorithm) | Cannot tune without override data; needs D-1 signals first | Build D-1, collect data, tune in v11.11+ |
| New cockpit stages or workflow surfaces | Adds instrumentation complexity mid-beta; distorts session comparisons | Freeze cockpit shape until after SESS-03 |
| LGPD compliance work | Separate milestone; out of scope since v1.0 | Dedicated compliance milestone post-beta |
| Share link social/public analytics | No user demand signal yet; share link flow fixed in v11.9 | Revisit if Q-share returns as a gap |
| Export pipeline changes (Meta/TikTok integration) | Stubbed intentionally; requires separate product milestone | Future milestone |

---

## Feature Dependencies

```
F-14 (test fix) → SESS-03 (green suite before UAT)
TS-2 (recipe_tradeoff_viewed) → TS-3 (recipe_selected) → D-3 (revenue funnel)
TS-1 (preview funnel) → D-3 (revenue funnel accuracy)
D-1 (readiness override) → after SESS-03 has override data → threshold tuning (future)
D-2 (briefing step abandon) → SESS-03 (richer session data)
```

All table stakes (TS-1 through TS-4) must land before SESS-03 so sessions generate useful analytics. SESS-03 is the gate for closing v11.10.

---

## MVP Recommendation

Prioritize (in order):

1. **F-14 test fix (TS-4)** — unblocks green suite; 30 min effort; no risk
2. **F-08 recipe_tradeoff_viewed (TS-2)** — simplest new event; confirms instrumentation pattern before F-09
3. **F-09 recipe_selected + funnel (TS-3)** — slightly more surface area; dashboard row
4. **F-06 preview funnel completeness (TS-1)** — requires tracing runbook-complete call path
5. **F-12 briefing abandon by step (D-2)** — small change, high analytical value
6. **D-3 timeline cap + revenue funnel (Polish)** — polish; remove cap first, funnel second
7. **F-11 readiness override (D-1)** — most complex; needed for SESS-03 to generate override evidence
8. **SESS-03 operator UAT (TS-5)** — operational; runs after all instrumentation is live

Defer: Real revenue conversion tracking, threshold tuning — need override signal data first.

---

## Sources

- Codebase direct inspection: `app/src/components/workspace/`, `app/src/server/beta-analytics/`, `app/src/components/feedback/`
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-V11.9-BACKLOG.md`
- `.planning/milestones/v11.9-REQUIREMENTS.md`
- `.planning/PROJECT.md`
- Confidence: HIGH (all assertions verified against live source files)
