# Research Synthesis: v11.11 Aprendizado → Ação

**Synthesized:** 2026-06-08  
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md  
**Milestone:** v11.11 — Aprendizado → Ação

---

## Executive Summary

v11.11 converts beta learning data (from SESS-03) into three actionable improvement clusters: **readiness threshold tuning** (using F-11 override signals), **post-preview stall reduction** (F-07), and **share-link self-serve analytics** (F-13/Q7). Zero new npm dependencies. All work extends the existing first-party analytics layer (`types.ts` allowlist → `aggregate.ts` → `OwnerAnalyticsPanel`).

**Hard prerequisite:** v11.10 Phase 89 (SESS-03) must complete with real session IDs before evidence-gated phases (D-1 threshold tuning, D-2 nudge, learning answer closure).

Instrumentation phases (TS-1, TS-2, TS-3) can ship **before** SESS-03 so sessions generate useful data on first run.

---

## Key Findings

### Stack additions
- No new libraries
- 2–4 new event keys: `share_link_opened`, optional `approval_package_refreshed`
- 2 new property keys: `tokenId`, `blockingDimensions`
- 3 new aggregate functions in `aggregate.ts`

### Feature table stakes
| ID | Feature | Complexity |
|----|---------|------------|
| TS-1 | `share_link_opened` + dashboard panel | Low-Med |
| TS-2 | Post-preview stall analysis panel | Medium |
| TS-3 | Override breakdown by readiness dimension | Medium |
| TS-4 | Close Q2/Q3/Q9 learning answers | Low/Ops |

### Differentiators
| ID | Feature | Gate |
|----|---------|------|
| D-1 | Threshold constant tuning | TS-3 + ≥3 sessions |
| D-2 | Campaign card "Continue batch" nudge | TS-2 stall confirmed |
| D-3 | Share open rate by assistance level | TS-1 |
| D-4 | Median draft→share stat card | SESS-03 |

### Watch Out For
1. Do not tune readiness without override dimension data
2. Extend event allowlist before any new `recordBetaAnalyticsEvent` call
3. Do not build D-2 nudge until stall is validated across real sessions
4. Freeze cockpit shape — no new stages or AI behavior changes
5. Complete SESS-03 before claiming learning questions closed

---

## Recommended Phase Structure

1. **Analytics Foundation** — allowlist + aggregate functions
2. **Share + Readiness Instrumentation** — TS-1, TS-3 server events
3. **Owner Dashboard: Stall + Timing** — TS-2, D-4 panels
4. **SESS-03 Completion** — human gate (v11.10 carryover)
5. **Learning Closure + Threshold Tune** — TS-4, D-1
6. **Stall UX + Share Correlation** — D-2, D-3

---

*Synthesis produced: 2026-06-08*
