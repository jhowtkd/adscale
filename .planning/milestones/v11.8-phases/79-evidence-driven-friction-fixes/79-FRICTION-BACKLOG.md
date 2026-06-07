# Phase 79 Friction Backlog

**Ranked:** 2026-06-07  
**Evidence sources:** `78-LEARNING-ANSWERS-DRAFT.md`, `aggregate.fixture.ts`, `mission-credit-signals`

| Rank | ID | Friction | Evidence | Freq | Impact | Fix (Phase 79) |
|------|-----|----------|----------|------|--------|----------------|
| 1 | F-01 | Credit surprise at preview gate — estimate vs actual unclear | `evt-credit-spend` preview estimate 5 / actual 8 (+3); Q8 | 1/session (fixture) | High — blocks batch approval trust | **Ship** — preview gate shows spent credits from derivation + estimate disclaimer |
| 2 | F-02 | Readiness blockers invisible before Derivar | `readiness_blocked` blockingCount:2; operator tag "blocking false positive"; Q1 | 1/session | High — wasted generation attempts | **Ship** — blocking count banner above action cards |
| 3 | F-03 | Mission path resume CTA generic when step blocked | readiness `blockedReason` in fixture; mission list shows reason but weak resume affordance | 1/session | Medium — operators lose place in path | **Ship** — mission-specific blocked resume CTA copy + link |
| 4 | F-04 | Operator session ID hard to capture in artifacts | Phase 77 runbook need; beta session panel exists | — | Medium — slows UAT notes | **Ship** — copy session ID with visible confirmation |
| 5 | F-05 | Frustration moments lack feedback route context | `credit_friction` / negative mission insights; mission-credit-signals frustrationCount | 1+ signals | Medium — loses diagnostic route | **Ship** — feedback modal pre-fills route/category from cockpit frustration |
| 6 | F-06 | Preview stage abandoned in events vs operator note "approved" | cockpit preview abandoned=1; Q5 | 1/session | Medium — funnel mismatch | Defer v11.9 — needs stage-completion instrumentation |
| 7 | F-07 | Post-preview stall (~38 min fixture gap) | Q10 session `550e8400-…0001` | 1/session | Medium — process | Defer v11.9 — session timing dashboard |
| 8 | F-08 | Tradeoff copy readership unknown | Q6 — no events | — | Low | Defer v11.9 — new event key |
| 9 | F-09 | Recipe selection not instrumented | Q4 — note only | — | Low | Defer v11.9 — recipe_selected event |
| 10 | F-10 | Stale approval package badge confusion | Q9 — no fixture events | — | Low | Defer v11.9 — UX copy audit |

**Scoring:** Freq from fixture session `550e8400-e29b-41d4-a716-446655440001` (1 = observed once; scale with UAT). Impact = operator workflow / credit trust / data quality.

**Ship cap:** Top 5 (F-01..F-05) per FIX-02.
