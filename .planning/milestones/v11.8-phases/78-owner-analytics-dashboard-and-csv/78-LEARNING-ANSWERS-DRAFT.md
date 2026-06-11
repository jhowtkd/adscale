# Phase 78 Learning Answers (Draft)

**Phase:** 78 — Owner Analytics Dashboard and CSV  
**Source questions:** `67-LEARNING-QUESTIONS.md`  
**Data basis:** SESS-03 export `beta-analytics-export-sess03.csv` (216 events, 3 sessions, 2026-06-11)  
**Status:** Complete — all 10 answered (SESS-03); canonical answers in Phase 94 `94-LEARNING-ANSWERS.md`

---

## Readiness & briefing

### Q1. Do readiness blocking rules match operator judgment, or do users override/ignore them?

**Answer (SESS-03):** Session `466ef707` hit `readiness_blocked` on `ctaProminence` (score 20) and overrode; preview score 73 and batch succeeded — blocking did not match operator judgment. Override rate 1/3 sessions. Mitigated by READY-10 (warning-only `ctaProminence`).

**Citation:** `readiness_blocked` rows in `beta-analytics-export-sess03.csv`; `94-THRESHOLD-EVIDENCE.md`  
**Follow-up:** Monitor override rate in future UAT.

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

**Answer (SESS-03):** Session `89669961` accepted default `safe_iteration` when readiness clean. Session `466ef707` toggled `safe_iteration` → `performance_push` (final pick) when iterating a blocked creative.

**Citation:** `recipe_selected` rows in `beta-analytics-export-sess03.csv`; `89-SESS-03-EVIDENCE.md`

### Q5. Does preview quality predict batch satisfaction?

**Answer (SESS-03):** Preview funnel accurate post-instrumentation: entered 2 / completed 2 / abandoned 0. Session `466ef707` preview 73 → batch 30 cr without friction. Batch-satisfaction correlation not measurable — zero `feedbackReportId` linked.

**Citation:** `# cockpit_stage_funnel` preview row; Phase 94 `94-LEARNING-ANSWERS.md`  
**Follow-up:** Link feedback reports to preview scores in future UAT.

### Q6. Are tradeoff copy blocks read, or do users jump straight to overrides?

**Answer (SESS-03):** 3 `recipe_tradeoff_viewed` vs 5 `recipe_selected` — tradeoffs opened before first selection in both recipe sessions; repeat toggles skip re-reading.

**Citation:** `recipe_tradeoff_viewed` / `recipe_selected` in `beta-analytics-export-sess03.csv`; `89-SESS-03-EVIDENCE.md`

---

## Delivery & credits

### Q7. Do clients use share links without operator hand-holding?

**Answer (SESS-03):** Session `f32d2ba1`: share link opened in incognito ~7s after creation. Share created via `POST /api/share` — operator hand-holding required for creation; client opened without further operator action.

**Citation:** `share_link_opened` row; session `f32d2ba1` in `93-SESS-03-EVIDENCE.md`  
**Follow-up:** Expose share UI on campaign page for true self-serve measurement.

### Q8. Where do credit surprises happen?

**Answer (SESS-03):** **Zero credit surprises** in production export. All six `credit_spend` events match estimates (preview 5/5, batch 15/15). Fixture preview delta +3 not reproduced.

**Citation:** `# credit_surprises_by_operation` (empty); `credit_spend` rows in `beta-analytics-export-sess03.csv`

### Q9. Is approval package refresh understood or treated as a bug?

**Answer (SESS-03):** Not tested — no `approval_package_refreshed` events. Session `f32d2ba1` could not find share UI; share created via API; link opened in incognito in ~7s.

**Citation:** Session `f32d2ba1`; Phase 94 `94-LEARNING-ANSWERS.md`  
**Follow-up:** Expose approval-package/share entry point on campaign page before stale-badge UX.

---

## Process

### Q10. What is median time draft → share link, and where does it stall?

**Answer (SESS-03):** Sessions `466ef707` and `89669961`: preview → batch continuous (no meaningful stall). Session `f32d2ba1`: ~28 min approved→share, dominated by missing share UI (not hesitation). Median draft→share: **n=1** — insufficient for robust median.

**Citation:** `session_stage_timeline`; `93-SESS-03-EVIDENCE.md`  
**Follow-up:** Re-measure after share UI ships.

---

## Decision gate (SESS-03 — real data)

| Signal | SESS-03 evidence | Gate |
|--------|------------------|------|
| Q1 readiness false positive | 1/3 override on `ctaProminence`; preview OK | Mitigated (READY-10) — monitor |
| Q4–Q6 recipe/preview | Funnel 2/2/0; tradeoffs read before first pick | Instrumentation validated |
| Q7–Q9 delivery/share | Share UI missing; 0 stale-badge events | Prioritize share discoverability |
| Q8 credit surprises | 0 in real export | Not dominant — fixture was outlier |
| Q10 post-preview stall | Continuous preview→batch; share UI gap | Fix discoverability + preview polling |

**Locked recommendation:** See `94-LEARNING-ANSWERS.md` decision gate — share/delivery discoverability over credit-surprise UX.

---

*All sections cite SESS-03 session IDs — see Phase 94 `94-LEARNING-ANSWERS.md` for canonical answers.*
