# Domain Pitfalls

**Domain:** Adding cockpit instrumentation (F-06/F-08/F-09/F-12), readiness operator override (F-11), owner dashboard polish, and UAT closure to an existing instrumented beta app (ADScale v11.10)  
**Researched:** 2026-06-07  
**Milestone context:** v11.10 Fechamento Entrega e Analytics — subsequent milestone, v11.8 foundation already shipped  
**Overall confidence:** HIGH (grounded in shipped v11.8 code, deferred backlog evidence, and instrumentation structure)

---

## Critical Pitfalls

Mistakes that cause invalid learning conclusions, broken aggregation, or failed UAT gate.

### Pitfall 1: Adding New Event Keys Without Extending the Closed Enum

**What goes wrong:** New events for recipe/tradeoff/briefing abandon (`recipe_selected`, `recipe_tradeoff_viewed`, `cockpit_stage_abandoned` on briefing) are fired at call sites but rejected server-side with `BetaEventPropertiesValidationError: unknown event_key` because `PHASE_76_BETA_EVENT_KEYS` in `types.ts` only lists Phase 76 keys. Events are silently dropped at the client fire-and-forget layer; instrumentation appears to work (no thrown errors in UI) but produces zero data.

**Why it happens:** `record.ts` validates `eventKey` against `PHASE_76_BETA_EVENT_KEYS` before insert. Adding a call site without adding the key to the enum is a valid TypeScript build — no compile-time failure.

**Consequences:** Q4 (recipe selection) and Q6 (tradeoff readership) remain unanswerable after v11.10; owner dashboard shows empty recipe funnel rows; SESS-03 real sessions generate no recipe evidence.

**Prevention:**
- Extend the enum in `types.ts` first, before adding any call site. Enum PR must be atomic with the first emit call.
- Add a unit test for each new key asserting `recordBetaAnalyticsEvent` resolves (mirror `instrumentation.integration.test.ts` pattern).
- PR checklist: "new event key listed in `PHASE_76_BETA_EVENT_KEYS`?" before merge.

**Detection:** `npm test` passes (no enum test), but owner dashboard recipe funnel row shows `entered: 0` after a live operator session that clearly triggered the recipe panel.

**Phase:** Cockpit instrumentation — add to enum before adding call sites.

---

### Pitfall 2: New Property Keys Rejected by Allowlist

**What goes wrong:** `recipe_selected` needs a `recipeKey` property; `recipe_tradeoff_viewed` needs a `tradeoffKey`; override event needs `overrideReason`. These are not in `ALLOWED_PROPERTY_KEYS` in `types.ts`. `sanitizeBetaEventProperties` uses `z.strictObject` — any unrecognised key causes `BetaEventPropertiesValidationError: properties failed validation`. Again, fire-and-forget client hook swallows the error; server-side calls surface it only in logs.

**Why it happens:** Allowlist is intentionally strict (privacy/PII boundary). Adding new semantics requires deliberate allowlist extension.

**Consequences:** Properties arrive as empty object `{}`; recipe funnel has no `recipeKey` dimension; override analytics has no `overrideReason` dimension.

**Prevention:**
- For every new event, enumerate its properties and add each key to `ALLOWED_PROPERTY_KEYS` before the emit call site.
- Add a `sanitize.test.ts` case per new key to confirm it survives `sanitizeBetaEventProperties`.
- Review `DENIED_KEY_NAMES` for conflicts (e.g. `reasonCode` already allowed — use that for override reason if semantically appropriate to avoid adding a near-duplicate).

**Detection:** Integration test `sanitize.test.ts` fails for new properties, or event stored in DB has `properties: {}` while call site passed `{ recipeKey: "performance_push" }`.

**Phase:** Cockpit instrumentation / readiness override — extend allowlist atomically with enum extension.

---

### Pitfall 3: Readiness Override Event Creates Ambiguity in `aggregateReadinessOverrides`

**What goes wrong:** `aggregateReadinessOverrides` already combines `readiness_blocked` events and operator notes tagged `"blocking false positive"`. Adding a new `readiness_overridden` event (F-11) without updating the aggregation produces **duplicate signals**: the same override appears as both an operator note row (kind: `operator_note`) and an event row (kind: `event`), inflating the override count on the owner dashboard.

**Why it happens:** `aggregate.ts` joins the two sources by `sessionId` but does not deduplicate by time window. If the operator notes the override **and** the system fires `readiness_overridden`, both appear.

**Consequences:** Override count is 2× reality; owner concludes readiness false positives are rampant when they may be single incidents.

**Prevention:**
- Decide the authoritative source before shipping: either the event is the record OR the operator note tag is — not both.
- Recommended: event is authoritative; remove `isFalsePositiveTag` from `extractOperatorFalsePositiveNotes` for stages where override event now fires, or mark event-backed rows with `supersededByEvent: true`.
- If keeping both, dedup in `aggregateReadinessOverrides` by `sessionId + stage + createdAt window (±5 min)`.
- Add an `aggregate.test.ts` case with both sources for the same session to assert dedup.

**Detection:** Owner dashboard override count ≥ 2× number of live beta sessions; `aggregate.test.ts` passes only one source at a time.

**Phase:** Readiness override — aggregation dedup must be added in the same phase as the new event.

---

### Pitfall 4: Preview Funnel Mismatch Not Fixed Before SESS-03

**What goes wrong:** F-06 (preview stage abandoned=1 in events while operator note says "Preview approved") was deferred from v11.8 with the note "needs stage-completion instrumentation." If SESS-03 runs before `cockpit_stage_completed` is emitted on manual runbook complete for the preview stage, the funnel mismatch carries into the final learning answers: Q5 still unanswerable. v11.10 closes the learning loop — shipping SESS-03 with broken preview instrumentation means Q5 is permanently marked TBD.

**Why it happens:** Preview completion in the cockpit is partially operator-driven (manual step confirm in runbook). Client hook fires `cockpit_stage_abandoned` on unmount without a gate that distinguishes "user closed panel after approving" from "user closed panel from frustration."

**Consequences:** Q5 answer stays fixture-backed; final LEARN-03 decision gate cannot distinguish preview funnel drop-off from operational pattern.

**Prevention:**
- Wire `cockpit_stage_completed` to explicit user action in preview panel (approve button, confirm CTA) **before** SESS-03 begins.
- Add `durationMs` to the completed event so post-preview stall (Q10 38-min gap) can be confirmed with real data.
- Runbook step for operator: "confirm preview_completed event appears in export before proceeding."

**Detection:** After SESS-03, `cockpit_stage_completed` on `stage: preview` count = 0; operator notes say "preview approved" for same session.

**Phase:** Cockpit instrumentation (F-06 fix) — must ship before SESS-03 gate.

---

### Pitfall 5: Session Filter on Dashboard Breaks Without `sessionId` Index

**What goes wrong:** Adding a session filter dropdown to the owner dashboard calls `parseOwnerAnalyticsQuery` with `sessionId` set, which filters `beta_analytics_events WHERE session_id = $1`. With 3+ real sessions generating hundreds of events, a full table scan per filter interaction degrades the `/feedback` page noticeably on Neon serverless (cold connection + no index).

**Why it happens:** `query.ts` parses `sessionId` as a filter but the DB repository passes it as a `WHERE` clause. No index on `session_id` was required at v11.8 with fixture-only data volume.

**Consequences:** Owner dashboard becomes slow during real beta sessions exactly when it is most needed; operator waits 3–5 s per filter change.

**Prevention:**
- Add `CREATE INDEX CONCURRENTLY idx_beta_analytics_events_session_id ON beta_analytics_events (session_id) WHERE session_id IS NOT NULL;` in the migration for this milestone.
- Keep existing `workspace_id` + `created_at` compound index; query should filter workspace first.
- Test with 500 synthetic events before SESS-03.

**Detection:** `EXPLAIN ANALYZE` on `SELECT * FROM beta_analytics_events WHERE session_id = $1` shows `Seq Scan`.

**Phase:** Owner dashboard polish — migration must include index.

---

### Pitfall 6: Timeline "Without Cap" Causes N+1 or Unbounded Query

**What goes wrong:** Removing the timeline cap (F-07 / owner dashboard polish) without batching or pagination causes `aggregateSessionStageTimeline` to load **all events** for all sessions into memory on each page load, then sort and gap-compute in JS. At v11.10 scale this is still manageable, but the pattern will regress in v12.x when cohort grows.

**Why it happens:** `buildAnalyticsFunnelSummary` passes all events to every aggregator in one pass. Removing the cap without limiting the query scope means the full event table is fetched per dashboard render.

**Consequences:** Dashboard payload bloat; Neon serverless connection timeout on cold start with large event sets; pattern debt before v12 beta expansion.

**Prevention:**
- Add a `from` / `to` date filter (already in `parseOwnerAnalyticsQuery`) with a sensible default (last 30 days or active session window).
- `aggregateSessionStageTimeline` should receive only events for explicitly requested sessions, not the full workspace history.
- Keep the uncapped timeline as opt-in via "show all sessions" toggle — not the default.

**Detection:** `/api/feedback/analytics/funnel` response time > 1 s with 3 real sessions × 50 events each; memory profile shows full event array allocated per request.

**Phase:** Owner dashboard polish — add default date window when removing cap.

---

### Pitfall 7: SESS-03 Runs on Old App Version (New Instrumentation Not Deployed)

**What goes wrong:** v11.10 cockpit instrumentation phases complete in code but the operator runs SESS-03 before the Vercel deployment is live. New events (`recipe_selected`, `recipe_tradeoff_viewed`, `readiness_overridden`) are never emitted during the final learning session. Learning answers for Q4, Q6, F-11 remain fixture-backed for the entire milestone.

**Why it happens:** SESS-03 is both a UAT gate **and** a data collection moment. If treated primarily as UAT, the operator may run it on any available build.

**Consequences:** Milestone closes without real evidence on the three questions v11.10 was specifically designed to answer.

**Prevention:**
- Runbook step before SESS-03: "Verify deployed commit SHA matches merge SHA of cockpit instrumentation phase."
- Add a `/api/analytics/events` smoke check to the operator pre-session checklist: fire a test `recipe_tradeoff_viewed` event and confirm it appears in owner CSV export.
- SESS-03 is a gate on **both** deployment and instrumentation smoke passing.

**Detection:** SESS-03 session artifacts exported; recipe funnel row count = 0 despite operator note "recipe selected."

**Phase:** UAT closure — pre-session deployment checklist.

---

### Pitfall 8: F-14 Test Drift Silently Invalidates Regression Gate

**What goes wrong:** The pre-existing `creative-quality-gate-orchestration` test failure (F-14 in backlog) causes `npm test` to include a skipped or expected-to-fail assertion. Developers treat "test suite green" as "no regressions" — but the test was already failing before v11.10 changes. Friction-fix PRs may introduce real regressions in quality gate behavior that go undetected because the signal is masked.

**Why it happens:** `vitest` by default shows a passing run even if tests are `test.skip`-ed. F-14 was deferred from v11.8 with a note about "regeneration suggestion assertion drift" but no `todo` or explicit failure tracking.

**Consequences:** Quality gate regression ships to production; preview or batch derivation behavior changes without test coverage detecting it.

**Prevention:**
- F-14 must be addressed in v11.10 regression phase: either fix the assertion or add a `test.todo("F-14: awaiting orchestration alignment")` that explicitly tracks the gap rather than a silent skip.
- Run `npm test -- --reporter=verbose` in regression phase; scan for `skipped` tests in the summary.
- Pre-merge check: compare test count between base branch and PR branch; unexplained drops flag a review.

**Detection:** `npm test` shows `X passed, Y skipped` where Y > 0; git blame on skipped test shows it was skipped in a previous milestone.

**Phase:** Regression phase — F-14 must be resolved before declaring suite green.

---

## Moderate Pitfalls

### Pitfall 9: `briefing_abandon` Stage Key Not in Runbook Vocabulary

**What goes wrong:** F-12 emits `cockpit_stage_abandoned` with `stage: "guided_briefing"` on panel close. The owner dashboard's `aggregateCockpitStageFunnel` sorts stages using `BETA_RUNBOOK_STAGES` order. If `"guided_briefing"` is not in that array, it sorts to the bottom (`bi === -1` branch) and appears as an orphan row — operators miss it.

**Prevention:**
- Confirm `"guided_briefing"` is in `BETA_RUNBOOK_STAGES` before emitting. If not, add it or map to the canonical key used by the runbook.
- Add a `aggregate.test.ts` case: fixture with `guided_briefing` abandon event → appears in `cockpitStageFunnel` in correct order position.

**Phase:** Cockpit instrumentation (F-12) — check stage key mapping before emit.

---

### Pitfall 10: Revenue Funnel Added Without Revenue Events in Schema

**What goes wrong:** Owner dashboard polish scope mentions "funil de receita." No `revenue_event` or `credit_purchase` schema exists in v11.8; the app uses beta entitlements without real billing. Adding a revenue funnel widget that reads `usage_events` or `beta_analytics_events` produces a meaningless row count dressed as revenue data.

**Prevention:**
- Revenue funnel in v11.10 context should be **credit consumption funnel** (preview credits → batch credits → delivery) using existing `credit_spend` events — not billing revenue.
- Rename the widget "Créditos por Etapa" or "Funil de Créditos" to avoid semantic confusion.
- Do not add billing/Stripe event schema in v11.10; that is out-of-scope per PROJECT.md.

**Phase:** Owner dashboard polish — scope to credit funnel, not revenue funnel.

---

### Pitfall 11: Readiness Override Bypasses Existing Quality Gate

**What goes wrong:** Operator override for readiness false positives (F-11) is implemented as a UI flag that skips the blocking check. If the skip logic is added at the component level but not enforced at the `preflight` API route level, a future client-side change re-exposes the gate. If it is added at the API level without an audit trail event, the override is invisible to the owner dashboard.

**Prevention:**
- Override must be recorded server-side: `readiness_overridden` event fired from `preflight` route when override flag is set, **not** from the component.
- `readiness_overridden` event must include `blockingCount` and `overrideReason` in properties (add to allowlist per Pitfall 2).
- The creative quality gate should remain intact; override only allows proceeding despite a readiness block, not disabling the gate.
- Add integration test: preflight with `override: true` + blockingCount > 0 → records `readiness_overridden`, not `readiness_completed`.

**Phase:** Readiness override — server-side event is the audit trail.

---

### Pitfall 12: SESS-03 Learning Answers Copied From Fixture Without Session Citation

**What goes wrong:** Phase author fills in `79-LEARNING-ANSWERS.md` update using the existing fixture data + SESS-03 runbook artifacts but doesn't update Q1/Q4/Q6 with real event counts and session IDs from the live session. The learning document looks complete but remains fixture-backed.

**Prevention:**
- For each learning question answered with real data: cite `session_id`, event count, and date range in the answer body.
- Questions still TBD after SESS-03 must be explicitly marked "STILL TBD — requires ≥N additional sessions" rather than removed.
- Learning gate (LEARN-03): reviewer must verify at least Q1, Q4, Q5, and Q6 cite real session IDs, not fixture UUIDs (`550e8400-…`).

**Detection:** Learning answers cite session `550e8400-e29b-41d4-a716-446655440001` (the fixture ID) rather than real session IDs from live beta.

**Phase:** SESS-03 / UAT closure.

---

### Pitfall 13: Client `useRecordBetaEvent` Hook Fires on Unmount During Navigation

**What goes wrong:** `cockpit_stage_abandoned` is emitted on panel unmount. React 18 strict mode + Next.js App Router can trigger double-mount/unmount in development, producing ghost abandon events. In production, fast navigation away from a panel before the stage completes correctly fires `abandoned` — but if the route change happens because the user naturally navigated forward (completed the step by leaving), the abandon fires incorrectly.

**Prevention:**
- Use a completion-flag pattern: set a `ref` on explicit success actions (approve, select, confirm); on unmount, emit `abandoned` only if the flag is not set.
- Test in production build (`next build && next start`); do not rely on dev-mode behavior for fire-and-forget hooks.
- Add a brief debounce (100ms) before firing the abandon event to let navigation transitions settle.

**Detection:** Q5 shows `abandoned: 2` for a session where operator notes confirm "preview approved once"; session timeline shows back-to-back `entered` and `abandoned` on the same stage.

**Phase:** Cockpit instrumentation — abandon detection logic.

---

### Pitfall 14: `parseOwnerAnalyticsQuery` Accepts Invalid `sessionId` Silently

**What goes wrong:** `parseOwnerAnalyticsQuery` accepts any non-empty `sessionId` string. If the owner dashboard URL is shared with a typo or expired session ID, the filter silently returns 0 events — no error, no empty-state message. Owner thinks sessions have no data.

**Prevention:**
- Validate `sessionId` as UUID format before querying; return 400 if invalid.
- Dashboard: show "session not found" empty state when filter returns 0 events for a non-null `sessionId`.
- Alternatively, validate against `beta_sessions` table and 404 if session does not belong to an active workspace.

**Phase:** Owner dashboard polish — filter UX.

---

## Minor Pitfalls

### Pitfall 15: `recipe_tradeoff_viewed` Fires Too Eagerly

**What goes wrong:** Tradeoff copy is rendered inside the recipe panel. If the event fires on panel **enter** (same as `cockpit_stage_entered`) rather than on scroll-to or explicit expand of the tradeoff section, Q6 ("are tradeoff blocks read?") is answered incorrectly as "yes" for every recipe panel open.

**Prevention:** Fire `recipe_tradeoff_viewed` on user interaction with the tradeoff section (expand/scroll-reveal), not on panel mount. Use IntersectionObserver or explicit expand callback.

**Phase:** Cockpit instrumentation (F-08).

---

### Pitfall 16: Duplicate `recipe_selected` Events on Re-Render

**What goes wrong:** If recipe selection fires on component render triggered by the selected recipe state, a TanStack Query refetch or React re-render doubles the event count for the same selection.

**Prevention:** Fire `recipe_selected` on explicit user action (click/confirm), not on state change. Use `useEffect` only if the dependency is a user-initiated transition, not an auto-refresh.

**Phase:** Cockpit instrumentation (F-09).

---

### Pitfall 17: Owner Dashboard PT-BR String Drift

**What goes wrong:** New owner dashboard widgets (session filter, revenue/credit funnel, timeline) are added in English only. The `/feedback` page is owner-internal (not user-facing), but PT-BR/EN parity is a project-wide convention validated by lint.

**Prevention:** Add translation keys for new dashboard widget labels; run `npm run lint` (which includes i18n key checks if configured) before shipping.

**Phase:** Owner dashboard polish.

---

## Phase-Specific Warnings

| Phase topic | Likely pitfall | Mitigation |
|-------------|----------------|------------|
| **Cockpit instrumentation (F-06/F-08/F-09/F-12)** | New event keys silently rejected | Add to `PHASE_76_BETA_EVENT_KEYS` and `ALLOWED_PROPERTY_KEYS` atomically |
| **Cockpit instrumentation (F-06/F-08/F-09/F-12)** | Abandon fires on unmount from navigation | Completion-flag ref pattern; debounce |
| **Cockpit instrumentation (F-06)** | Preview funnel mismatch persists into SESS-03 | Fix `cockpit_stage_completed` before live session |
| **Readiness override (F-11)** | Override bypasses gate at component, not server | Server-side `readiness_overridden` event is the audit record |
| **Readiness override (F-11)** | Duplicate signals in `aggregateReadinessOverrides` | Dedup by `sessionId + stage + time window` |
| **Owner dashboard polish** | Session filter without index = slow query | Add `idx_beta_analytics_events_session_id` in migration |
| **Owner dashboard polish** | Timeline cap removal causes unbounded fetch | Default date window; cap opt-in toggle |
| **Owner dashboard polish** | Revenue funnel misleading without billing events | Scope to credit consumption funnel only |
| **SESS-03 / UAT closure** | Real sessions run on pre-instrumentation build | Deployment smoke check in runbook before session |
| **SESS-03 / UAT closure** | Learning answers fixture-backed after real session | Citation format requires real `session_id` and event count |
| **Regression (F-14)** | Drifted test masked as green | `test.todo` or fix; verbose reporter to surface skips |

## Integration Pitfalls (ADScale-Specific)

| Integration point | Risk | Prevention |
|-------------------|------|------------|
| `PHASE_76_BETA_EVENT_KEYS` closed enum | New keys silently rejected at `recordBetaAnalyticsEvent` | Extend enum before emit call sites; add integration test per key |
| `ALLOWED_PROPERTY_KEYS` allowlist | New property keys silently stripped; events stored with `{}` | Extend allowlist atomically; test with `sanitizeBetaEventProperties` |
| `aggregateReadinessOverrides` dual-source join | Duplicate signals when override event + operator note coexist | Dedup logic in aggregation function |
| `aggregateCockpitStageFunnel` stage sort order | `guided_briefing` / new stages sort to orphan row | Verify key is in `BETA_RUNBOOK_STAGES` |
| `parseOwnerAnalyticsQuery` session filter | No validation → silent empty results on typo | UUID format check + session existence check |
| `buildAnalyticsFunnelSummary` uncapped timeline | Full event table loaded per render when cap removed | Default date window filter; DB index on `session_id` |
| `preflight` route readiness check | Override flag in component only → bypassable on client | Move override gate to server route; emit event there |
| SESS-03 learning document | Fixture session IDs cited as real evidence | Reviewer gate: reject fixture UUID `550e8400-…` citations |
| `creative-quality-gate-orchestration` test drift | F-14 skipped test masks real regressions | Fix or explicit `test.todo` before declaring suite green |
| Vercel deployment timing | New instrumentation not live when SESS-03 runs | Deployment SHA check in operator pre-session checklist |

## Prevention Strategy (v11.10-Specific)

1. **Enum + allowlist first** — No new event key reaches a call site without being added to `PHASE_76_BETA_EVENT_KEYS` and `ALLOWED_PROPERTY_KEYS` in the same commit.
2. **Preview funnel fix before SESS-03** — F-06 cockpit stage completion instrumentation is a hard pre-requisite for the UAT session, not a parallel task.
3. **Server-side override is the record** — Readiness override analytics fires from `preflight` route, never from the component.
4. **Fix duplicate aggregation before dashboard ships** — If both operator notes and events can represent the same override, the dedup lives in `aggregateReadinessOverrides` before the new override event is emitted.
5. **Migration includes DB index** — Session filter index added in the same migration that enables the filter UI.
6. **F-14 resolved before regression gate** — No milestone sign-off with skipped tests; either fix the assertion or add explicit `test.todo` with a tracking note.
7. **SESS-03 deployment checkpoint** — Operator pre-session checklist includes: (a) deployed SHA check, (b) smoke event in owner CSV, (c) `npm test` green on production build.
8. **Learning answers citation format** — Real session IDs only; fixture UUID `550e8400-e29b-41d4-a716-446655440001` in a learning answer = reviewer rejection.

## Sources

- ADScale shipped code: `app/src/server/beta-analytics/types.ts`, `sanitize.ts`, `record.ts`, `aggregate.ts`, `query.ts`, `instrumentation.integration.test.ts`
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-FRICTION-BACKLOG.md` — ranked deferred items F-06–F-15
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-V11.9-BACKLOG.md` — items carried into v11.10
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-LEARNING-ANSWERS.md` — Q4/Q5/Q6 TBD evidence gaps
- `.planning/milestones/v11.8-phases/76-cockpit-and-mission-instrumentation/76-CONTEXT.md` — Phase 76 decision log
- `.planning/milestones/v11.8-phases/78-owner-analytics-dashboard-and-csv/78-CONTEXT.md` — Phase 78 decision log
- `.planning/PROJECT.md` — v11.10 milestone scope and context

---
*Pitfalls research for: v11.10 Fechamento Entrega e Analytics*  
*Researched: 2026-06-07*
