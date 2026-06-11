# Phase 94 Learning Answers — Real Session Citations

**Phase:** 94 — Learning Closure + Threshold Tune  
**Source questions:** `67-LEARNING-QUESTIONS.md`  
**Data basis:** SESS-03 export `../93-sess-03-operator-uat/beta-analytics-export-sess03.csv` (216 events, 3 sessions, 2026-06-11)  
**Session IDs:** `466ef707-f9ba-430a-b03f-0065b9bee52d`, `89669961-c3e0-44d3-9c76-e3b601707080`, `f32d2ba1-df02-491e-becd-fcc1905723d4`  
**Status:** Complete — LEARN-04 satisfied for all 10 questions

---

## Readiness & briefing

### Q1. Do readiness blocking rules match operator judgment, or do users override/ignore them?

**Answer:** Blocking rules did not match operator judgment in session `466ef707`. Operator hit `readiness_blocked` with dominant dimension `ctaProminence` (score 20, blockingCount 4 in earliest events) and exercised override; derivations and preview (score 73) succeeded afterward. Seven server override events all cite `blockingDimensions: ctaProminence`. Sessions `89669961` and `f32d2ba1` had no override (readiness clean or share-only path). Override rate: 1/3 sessions (33%).

**Citation:** `readiness_blocked` rows in export (2026-06-11T12:10–12:22 UTC); `94-THRESHOLD-EVIDENCE.md`; session `466ef707` in `89-SESS-03-EVIDENCE.md`.

**Decision:** False-positive on `ctaProminence` mitigated by READY-10 (warning-only dimension). Monitor override rate in future UAT rounds.

---

### Q2. Which guided briefing questions get skipped most?

**Answer:** Session-linked abandons (12 events across sessions 1–3) all report `stepId: unknown`, so per-question skip ranking cannot be computed from linked sessions alone. Workspace-wide abandons without `session_id` show repeated friction at **constraints** and **platforms** (multiple abandons each), followed by **cta**, **objections**, **promise**, **audience**, and **productOffer**.

**Citation:** Sessions `466ef707` (6 linked abandons), `89669961` (1), `f32d2ba1` (5); export rows with `stepId` constraints/platforms/cta (pre-session exploration ~10:17–11:13 UTC).

**Decision:** Fix `stepId` capture on session-linked guided-briefing abandons before reordering templates. Until then, treat constraints/platforms as leading skip signals from historical export.

---

### Q3. Is one readiness analysis enough per asset, or do users rerun often?

**Answer:** One analysis was not enough in practice for sessions 1–2. Session `466ef707` logged seven readiness stage completions; session `89669961` logged eight. Session `f32d2ba1` had no readiness completion (share-only path). Repeated completions correlate with override retries and UI state lag, not operator preference for rerunning analysis.

**Citation:** `session_stage_timeline` readiness rows for `466ef707` and `89669961`; cockpit funnel readiness 51 entered / 18 completed / 2 abandoned.

**Decision:** Do not charge or gate on reruns yet; reduce duplicate readiness emissions and override UI lag instead.

---

## Recipes & preview

### Q4. Which recipe wins by default vs which operators actually choose?

**Answer:** When readiness was clean, operators accepted the RECOMENDADA default: session `89669961` selected `safe_iteration` once. When iterating a blocked creative, session `466ef707` toggled `safe_iteration` → `performance_push` (final pick). Five session-linked `recipe_selected` events plus pre-session exploration events confirm both recipes used.

**Citation:** `recipe_selected` rows for `466ef707` (×4) and `89669961` (×1); `89-SESS-03-EVIDENCE.md` Q4 section.

**Decision:** Default recommendation works when readiness is clean; performance_push is chosen when operators override blocking and want iteration.

---

### Q5. Does preview quality predict batch satisfaction?

**Answer:** Post-instrumentation preview funnel is accurate: entered 2 / completed 2 / abandoned 0 (no false abandons). Session `466ef707` preview score 73 → batch fired (30 credits) in the same session without operator friction. **Cannot correlate preview quality to batch satisfaction** — zero `feedbackReportId` linked across the three sessions.

**Citation:** `# cockpit_stage_funnel` preview row `2,2,0`; session `466ef707` in `89-SESS-03-EVIDENCE.md` and `93-SESS-03-EVIDENCE.md`.

**Decision:** Preview instrumentation validated; batch-satisfaction correlation remains TBD until feedback reports are linked to preview scores in UAT.

---

### Q6. Are tradeoff copy blocks read, or do users jump straight to overrides?

**Answer:** Tradeoffs are read before first selection. Export shows 3 session-linked `recipe_tradeoff_viewed` vs 5 `recipe_selected` — both sessions with recipe flow opened tradeoffs before their first pick; repeat selections (recipe toggling) skip re-reading.

**Citation:** `recipe_tradeoff_viewed` and `recipe_selected` rows for `466ef707` and `89669961`; `89-SESS-03-EVIDENCE.md` Q6 section.

**Decision:** Tradeoff copy is effective for initial selection; no change needed for first-read flow. Repeat toggles do not re-surface tradeoffs (acceptable).

---

## Delivery & credits

### Q7. Do clients use share links without operator hand-holding?

**Answer:** Client engagement after share is fast — session `f32d2ba1` share link opened in incognito ~7s after creation (`share_link_opened`). However, share creation was **not** self-serve: operator used `POST /api/share` because campaign UI had no share entry point. Client opened the link without further operator action, but operator hand-holding was required to create it.

**Citation:** Session `f32d2ba1`; `share_link_opened` at 2026-06-11T12:51:53 UTC; `mission_completed` share at 12:51:46 UTC; `93-SESS-03-EVIDENCE.md`.

**Decision:** Prioritize share UI discoverability on campaign page (STATE follow-up) before measuring true hands-off share rate.

---

### Q8. Where do credit surprises happen?

**Answer:** **No credit surprises** in SESS-03 production data. `# credit_surprises_by_operation` section is empty in export; all six `credit_spend` events have `estimateCredits === actualCredits` (preview 5/5, batch 15/15). Fixture hypothesis (preview estimate 5, actual 8, delta +3) did not reproduce in real sessions.

**Citation:** `# credit_surprises_by_operation` (empty body); `credit_spend` rows in `beta-analytics-export-sess03.csv`.

**Decision:** Credit surprise at preview is **not** a dominant real-session signal. Continue monitoring via owner dashboard surprise ranking; fixture outlier should not drive v11.9+ scope alone.

---

### Q9. Is approval package refresh (stale badge) understood or treated as a bug?

**Answer:** Stale refresh was **not exercised** — zero `approval_package_refreshed` events. Session `f32d2ba1` could not find approval-package/share UI on the campaign page and created the share via `POST /api/share`; link opened in incognito ~7s later (`share_link_opened`).

**Citation:** Session `f32d2ba1`; share token `5705e6b7-b474-44c6-ae02-8836b5a21840`; campaign `96a3b481-…`.

**Decision:** Prioritize share/approval-package discoverability over stale-badge UX until operators can self-serve share from the campaign UI.

---

## Process

### Q10. What is median time draft → share link, and where does it stall?

**Answer:** Post-preview stall pattern differs by path. Sessions `466ef707` and `89669961`: preview → batch continuous (no meaningful stall when operator is hands-on). Session `89669961` showed *perceived* stall (UI progress stuck at 52%) while backend completed — frontend polling bug, not user hesitation. Session `f32d2ba1`: ~28 min from approved derivations (~12:23) to share creation (12:51), dominated by operator searching for missing share UI — not creative hesitation. **Median draft→share: n=1** — insufficient for robust median across 3–5 sessions.

**Citation:** `session_stage_timeline` for `466ef707` and `89669961`; `93-SESS-03-EVIDENCE.md` Q10 and stall notes; single share path in `f32d2ba1`.

**Decision:** Stall tooling should distinguish UI bugs (preview progress) from discoverability gaps (share UI). Re-measure median after share UI ships.

---

## Decision gate (SESS-03 — real data)

| Dominant signal (real) | Evidence | Recommendation |
|------------------------|----------|----------------|
| Q1 false-positive `ctaProminence` | 1/3 override, preview OK after override | **Mitigado** (READY-10 shipped) — monitor override rate |
| Q8 credit surprises | 0 in SESS-03 export | **Não dominante** — fixture was outlier |
| Q7 share self-serve | API-only creation; client opened in 7s | **Prioridade UX** — share UI discoverability |
| Q5 preview funnel | 2/2/0 accurate post-instrumentation | Instrumentação validada; satisfação batch = TBD |
| Q10 post-preview stall | Continuous preview→batch in sessions 1–2; share UI gap in session 3 | Fix discoverability + preview polling before new surfaces |

**Locked recommendation:** Prioritize **share/delivery discoverability** (Q7/Q9 cluster) over credit-surprise UX (Q8 did not dominate in real data). Readiness accuracy investment **partially addressed** via READY-10; monitor Q1 override rate.

---

*No fixture UUIDs (`550e8400-…`) in this document.*
