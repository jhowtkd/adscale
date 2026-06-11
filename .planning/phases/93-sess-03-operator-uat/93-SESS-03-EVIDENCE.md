# SESS-03 Operator Session Evidence (v11.11)

**Status:** COMPLETE — ≥3 real sessions; v11.11 instrumentation verified with real data  
**Milestone:** v11.11 Aprendizado → Ação  
**Export:** `beta-analytics-export-sess03.csv` (this directory; 2026-06-11, 216 events / 3 sessions)  
**Environment:** Production (`adscale-app` on Render), workspace `95cd1bfc-0933-45e1-8688-3110a266cb4d`

## Prerequisites

- [x] Phases 90–92 implemented (instrumentation ready for real sessions)
- [x] Deployed to target beta environment
- [x] Owner dashboard accessible at `/feedback`

## Sessions (minimum 3)

| # | Session ID | Operator | Date | Share opens | Stall | Override dims | Notes |
|---|------------|----------|------|-------------|-------|---------------|-------|
| 1 | `466ef707-f9ba-430a-b03f-0065b9bee52d` | operator (sess-03-1) | 2026-06-11 | — | preview→batch ~continuous (batch fired same session) | `ctaProminence` (score 20, blockingCount 4) — override exercised | performance_push; preview score 73; 56 linked events |
| 2 | `89669961-c3e0-44d3-9c76-e3b601707080` | operator (sess-03-2) | 2026-06-11 | — | preview UI stalled at 52% (frontend only); backend completed | none (readiness clean, 75) | safe_iteration; 24 linked events |
| 3 | `f32d2ba1-df02-491e-becd-fcc1905723d4` | operator (sess-03-3) | 2026-06-11 | 1 (`share_link_opened`, token `5705e6b7…`, campaign `96a3b481…`) | — | — | share created via `POST /api/share`; opened in incognito at 12:51 UTC; 16 linked events |

## Per-session smoke checklist

- [x] `share_link_opened` visible in owner dashboard — "Share link opens by campaign: 96a3b481… 1"
- [x] Post-preview stall panel reflects session timing — `session_stage_timeline` populated for sessions 1–2 with `gap_from_previous_ms`
- [x] Readiness override — exercised in session 1 (blocked on `ctaProminence`, operator continued); note: export does not show `blockingDimensions` breakdown per dimension in override event payload
- [ ] `approval_package_refreshed` — not exercised (package was fresh; no stale state encountered)

## Learning answers for Phase 94 (real citations)

- **Q2 — post-preview stall friction:** Session `466ef707`: preview approved → batch fired within the same session window (12:1x–12:2x UTC) — no meaningful stall when operator is hands-on. Session `89669961`: UI progress stuck at 52% creates *perceived* stall even though backend completed — frontend polling bug is a stall *cause*, not user hesitation.
- **Q3 — share-link engagement:** Session `f32d2ba1`: share link opened within ~7s of creation (12:51:46 created → 12:51:53 `share_link_opened`). Server event carries `tokenId` and campaign context; `session_id` is empty on share events by design (public route, no auth). **Friction:** "Criar link público" has no UI entry point on the campaign page — share required a direct API call. Self-serve share is currently NOT possible for a real client-facing operator.
- **Q9 — draft→share timing:** Single share data point: campaign "Teste 3" had approved derivations from session 1 (~12:23) and share created at 12:51 → ~28 min draft-approved→share, dominated by operator searching for the missing share UI.
- **READY-10 threshold tune:** `ctaProminence` (score 20) drove the only block (blockingCount 4); operator overrode and the resulting preview scored 73 with derivations succeeding. Evidence supports treating low `ctaProminence` as **warning, not blocking** — or raising the blocking threshold for that dimension.

## Verdict

SESS-03 gate **satisfied** for v11.11: 3 distinct `beta_sessions.id`, session-linked events (96/216), `share_link_opened` flowing server-side, stall timeline data available. Outstanding follow-ups for Phase 94+: expose share/approval-package UI entry point, fix preview progress polling, fix "End session" button, evaluate `mission_completed` emission for review stage.
