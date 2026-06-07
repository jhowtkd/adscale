# Phase 79 Learning Answers (Final)

**Phase:** 79 — Evidence-Driven Friction Fixes  
**Source questions:** `67-LEARNING-QUESTIONS.md`  
**Data basis:** `78-LEARNING-ANSWERS-DRAFT.md`, `ANALYTICS_FIXTURE_EVENTS`, Phase 79 friction backlog  
**Status:** Final — fixture-backed with UAT TBD where noted

---

## Readiness & briefing

### Q1. Do readiness blocking rules match operator judgment?

**Answer:** Fixture shows one `readiness_blocked` (blockingCount: 2) with operator tag **"blocking false positive"** — rules can over-block relative to operator judgment at least once per happy-path session.

**Citation:** `evt-readiness-block`; `EXAMPLE_BETA_SESSION_FIXTURE` readiness note  
**v11.9:** Tune blocking thresholds / false-positive review workflow before new surfaces.

### Q2. Which guided briefing questions get skipped most?

**Answer:** No skip signal in fixture (guided_briefing entered=1, completed=1, abandoned=0).

**TBD:** Live `cockpit_stage_abandoned` on guided_briefing across 3–5 sessions.

### Q3. Is one readiness analysis enough per asset?

**Answer:** Single enter/complete in fixture; no rerun events.

**TBD:** Repeated readiness API calls per campaign in production.

---

## Recipes & preview

### Q4. Which recipe wins by default vs which operators choose?

**Answer:** Operator note: **"Selected Performance Push"** at strategy_recipe stage.

**TBD:** Aggregate `recipe_selected` events (not instrumented in Phase 76).

### Q5. Does preview quality predict batch satisfaction?

**Answer:** Preview stage abandoned=1, completed=0 in events while operator note says "Preview approved" — event funnel and operator narrative diverge.

**v11.9:** Align preview completion instrumentation with runbook notes.

### Q6. Are tradeoff copy blocks read?

**Answer:** No tradeoff-read events.

**TBD:** Session notes or future instrumentation.

---

## Delivery & credits

### Q7. Do clients use share links without hand-holding?

**Answer:** Share mission completed; operator note "Share link opened in incognito"; feedbackReportId linked.

**TBD:** Share missions without `hands_on` assistance.

### Q8. Where do credit surprises happen?

**Answer:** Preview operation — estimate 5, actual 8 (+3); batch `credit_blocked` at estimate 50.

**Phase 79 action:** Preview gate credit copy + estimate disclaimer (F-01).  
**v11.9:** Rank surprises by operation across all sessions.

### Q9. Is approval package refresh understood?

**Answer:** No stale-badge events in fixture.

**TBD:** Operator notes tagged billing/UI.

---

## Process

### Q10. Median time draft → share link, and where does it stall?

**Answer:** Example session 90 min; ~38 min gap post-preview abandon (14:42) before export (15:20).

**v11.9:** Median across real sessions via `buildBetaSessionSummary`.

---

## Decision gate (LEARN-03 → v11.9 direction)

| Dominant signal | Evidence strength | **v11.9 recommendation** |
|-----------------|-------------------|--------------------------|
| Q8 credit surprises at preview | Fixture + mission-credit-signals | **Primary: delivery/billing UX** — credit estimate accuracy, surprise surfacing, batch gate copy |
| Q1 readiness false positives | Fixture operator tag | **Secondary: readiness/briefing accuracy** — blocking threshold review, pre-derive visibility (shipped F-02) |
| Q5 preview funnel mismatch | Fixture events vs notes | **Tertiary: recipe/preview iteration** — completion instrumentation, post-preview stall tooling |

**Locked recommendation:** Prioritize **delivery/credits UX** (Q7–Q9 cluster) for v11.9 milestone scope. Invest in readiness accuracy in parallel only if UAT confirms Q1 dominance over Q8.

---

*Finalized Phase 79 — replaces draft for learning gate closure.*
