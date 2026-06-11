# Phase 94 Learning Answers — Real Session Citations

**Phase:** 94 — Learning Closure + Threshold Tune  
**Source questions:** `67-LEARNING-QUESTIONS.md`  
**Data basis:** SESS-03 export `../93-sess-03-operator-uat/beta-analytics-export-sess03.csv` (216 events, 3 sessions, 2026-06-11)  
**Session IDs:** `466ef707-f9ba-430a-b03f-0065b9bee52d`, `89669961-c3e0-44d3-9c76-e3b601707080`, `f32d2ba1-df02-491e-becd-fcc1905723d4`  
**Status:** Complete — LEARN-04 satisfied for Q2, Q3, Q9

---

## Q2. Which guided briefing questions get skipped most?

**Answer:** Session-linked abandons (12 events across sessions 1–3) all report `stepId: unknown`, so per-question skip ranking cannot be computed from linked sessions alone. Workspace-wide abandons without `session_id` show repeated friction at **constraints** and **platforms** (multiple abandons each), followed by **cta**, **objections**, **promise**, **audience**, and **productOffer**.

**Citation:** Sessions `466ef707` (6 linked abandons), `89669961` (1), `f32d2ba1` (5); export rows with `stepId` constraints/platforms/cta (pre-session exploration ~10:17–11:13 UTC).

**Decision:** Fix `stepId` capture on session-linked guided-briefing abandons before reordering templates. Until then, treat constraints/platforms as leading skip signals from historical export.

---

## Q3. Is one readiness analysis enough per asset, or do users rerun often?

**Answer:** One analysis was not enough in practice for sessions 1–2. Session `466ef707` logged seven readiness stage completions; session `89669961` logged eight. Session `f32d2ba1` had no readiness completion (share-only path). Repeated completions correlate with override retries and UI state lag, not operator preference for rerunning analysis.

**Citation:** `session_stage_timeline` readiness rows for `466ef707` and `89669961`; cockpit funnel readiness 51 entered / 18 completed / 2 abandoned.

**Decision:** Do not charge or gate on reruns yet; reduce duplicate readiness emissions and override UI lag instead.

---

## Q9. Is approval package refresh (stale badge) understood or treated as a bug?

**Answer:** Stale refresh was **not exercised** — zero `approval_package_refreshed` events. Session `f32d2ba1` could not find approval-package/share UI on the campaign page and created the share via `POST /api/share`; link opened in incognito ~7s later (`share_link_opened`).

**Citation:** Session `f32d2ba1`; share token `5705e6b7-b474-44c6-ae02-8836b5a21840`; campaign `96a3b481-…`.

**Decision:** Prioritize share/approval-package discoverability over stale-badge UX until operators can self-serve share from the campaign UI.

---

*No fixture UUIDs (`550e8400-…`) in this document.*
