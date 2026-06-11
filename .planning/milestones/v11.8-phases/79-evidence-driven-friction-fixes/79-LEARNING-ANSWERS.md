# Phase 79 Learning Answers (Final)

**Phase:** 79 — Evidence-Driven Friction Fixes  
**Source questions:** `67-LEARNING-QUESTIONS.md`  
**Data basis:** SESS-03 export + `94-LEARNING-ANSWERS.md` (canonical); original fixture analysis in Phase 79 friction backlog  
**Status:** Superseded for per-question answers — see `94-LEARNING-ANSWERS.md` (all 10 questions, SESS-03). Decision gate below updated with real-session evidence (2026-06-11).

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

## Decision gate (LEARN-03 → v11.9 direction) — updated SESS-03

| Dominant signal (real) | Evidence strength | **v11.9+ recommendation** |
|------------------------|-------------------|---------------------------|
| Q7 share self-serve / discoverability | 1/3 sessions; API-only share creation; client opened in 7s | **Primary: delivery/discoverability UX** — share UI on campaign page (F-13) |
| Q1 readiness false positives (`ctaProminence`) | 1/3 override; preview OK after override | **Mitigated** — READY-10 shipped; monitor override rate |
| Q8 credit surprises at preview | **0** in SESS-03 export (fixture +3 not reproduced) | **Not dominant** — F-01 shipped; do not over-index on fixture |
| Q5 preview funnel | 2/2/0 accurate post-instrumentation | Instrumentation validated; batch satisfaction correlation TBD |

**Locked recommendation (SESS-03):** Prioritize **share/delivery discoverability** (Q7/Q9 cluster) over credit-surprise UX. Readiness accuracy partially addressed via READY-10. Full per-question answers: `94-LEARNING-ANSWERS.md`.

---

*Finalized Phase 79 — replaces draft for learning gate closure.*
