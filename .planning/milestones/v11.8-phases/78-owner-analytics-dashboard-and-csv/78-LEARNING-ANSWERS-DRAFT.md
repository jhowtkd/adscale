# Phase 78 Learning Answers (Draft)

**Phase:** 78 — Owner Analytics Dashboard and CSV  
**Source questions:** `67-LEARNING-QUESTIONS.md`  
**Data basis:** `ANALYTICS_FIXTURE_EVENTS`, `EXAMPLE_BETA_SESSION_FIXTURE`, aggregate unit tests  
**Status:** Draft — sections marked TBD need real operator UAT session data

---

## Readiness & briefing

### Q1. Do readiness blocking rules match operator judgment, or do users override/ignore them?

**Answer (fixture):** One `readiness_blocked` event (blockingCount: 2) in session `550e8400-e29b-41d4-a716-446655440001`. Operator tagged readiness stage note with **"blocking false positive"** — suggests at least one false-positive block in the happy-path fixture.

**Citation:** `aggregate.fixture.ts` evt-readiness-block; `beta-sessions.fixture.ts` readiness.tags  
**TBD:** Real session count of blocks vs overrides across 3–5 operator sessions.

### Q2. Which guided briefing questions get skipped most?

**Answer (SESS-03):** Linked-session abandons (sessions `466ef707`, `89669961`, `f32d2ba1`) all use `stepId: unknown`. Historical workspace abandons point to **constraints** and **platforms** as highest-friction steps.

**Citation:** `beta-analytics-export-sess03.csv`; Phase 94 `94-LEARNING-ANSWERS.md`  
**Follow-up:** Fix session-linked `stepId` capture before template reorder.

### Q3. Is one readiness analysis enough per asset, or do users rerun often?

**Answer (SESS-03):** Sessions `466ef707` and `89669961` each logged multiple readiness completions (7 and 8); session `f32d2ba1` had none. Reruns driven by override/UI lag, not deliberate re-analysis.

**Citation:** `session_stage_timeline` in `beta-analytics-export-sess03.csv`; Phase 94 `94-LEARNING-ANSWERS.md`

---

## Recipes & preview

### Q4. Which recipe wins by default vs which operators actually choose?

**Answer (fixture):** Operator note records **"Selected Performance Push"** at strategy_recipe stage.

**Citation:** `EXAMPLE_BETA_SESSION_FIXTURE.operatorNotes.strategy_recipe.notes`  
**TBD:** Aggregate recipe selection events when instrumented (not in Phase 76 event keys).

### Q5. Does preview quality predict batch satisfaction?

**Answer (fixture):** Preview stage entered=1, abandoned=1, completed=0 — operator did not complete preview gate in event stream despite runbook note "Preview approved".

**Citation:** cockpit stage funnel preview row; operator note at preview stage  
**TBD:** Correlate preview abandonment with batch feedback reports (feedbackReportIds).

### Q6. Are tradeoff copy blocks read, or do users jump straight to overrides?

**Answer:** No tradeoff-read events instrumented in Phase 76.

**TBD:** Requires future event or session notes tagging override-without-read.

---

## Delivery & credits

### Q7. Do clients use share links without operator hand-holding?

**Answer (fixture):** `mission_completed` with missionKey `share`; operator note "Share link opened in incognito"; feedbackReportId linked.

**Citation:** evt-mission-share; fixture share stage note  
**TBD:** Count share missions without hands_on assistance_level.

### Q8. Where do credit surprises happen?

**Answer (fixture):** One credit surprise at **preview** operation — estimate 5, actual 8 (delta +3). One `credit_blocked` at batch (estimate 50).

**Citation:** `aggregateCreditSurprises` test; evt-credit-spend, evt-credit-block  
**TBD:** Rank surprise frequency by operation across all sessions.

### Q9. Is approval package refresh understood or treated as a bug?

**Answer (SESS-03):** Not tested — no `approval_package_refreshed` events. Session `f32d2ba1` could not find share UI; share created via API; link opened in incognito in ~7s.

**Citation:** Session `f32d2ba1`; Phase 94 `94-LEARNING-ANSWERS.md`  
**Follow-up:** Expose approval-package/share entry point on campaign page before stale-badge UX.

---

## Process

### Q10. What is median time draft → share link, and where does it stall?

**Answer (fixture):** Example session duration **90 minutes** (14:00 → 15:30 UTC). Longest gap implied between preview abandon (14:42) and export mission (15:20) — **~38 min stall post-preview**.

**Citation:** `EXAMPLE_BETA_SESSION_FIXTURE.startedAt/endedAt`; event timestamps in fixture  
**TBD:** Median across 3–5 real sessions via `buildBetaSessionSummary`.

---

## Decision gate preview (draft)

| Signal | Fixture hint | Gate |
|--------|--------------|------|
| Q1–Q3 | False-positive readiness tag | Investigate readiness accuracy if dominant in UAT |
| Q4–Q6 | Preview abandoned in events | Recipe/preview iteration if UAT confirms |
| Q7–Q9 | Credit surprise at preview | Delivery/billing UX if UAT confirms |
| Q10 | Post-preview stall | Process/tooling before new surfaces |

---

*Generated Phase 78 — cite fixture IDs until operator UAT replaces TBD sections.*
