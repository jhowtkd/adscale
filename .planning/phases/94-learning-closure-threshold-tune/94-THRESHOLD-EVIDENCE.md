# Phase 94 Threshold Evidence — READY-10

**Decision:** `ctaProminence` is **warning-only** — low scores surface as suggestions but do not add dimension-level blocking issues or block derivation.

**Code change:** `READINESS_WARNING_ONLY_DIMENSIONS` in `app/src/server/ai/creative-readiness.ts` (Phase 94, 2026-06-11).

## Session evidence (SESS-03)

| Session ID | Blocked? | Override? | Dominant dimension | Outcome after override |
|------------|----------|-----------|-------------------|------------------------|
| `466ef707-f9ba-430a-b03f-0065b9bee52d` | Yes | Yes (7 server events) | `ctaProminence` (score 20) | Preview score 73; batch succeeded |
| `89669961-c3e0-44d3-9c76-e3b601707080` | No | No | — | Readiness clean (75) |
| `f32d2ba1-df02-491e-becd-fcc1905723d4` | No | No | — | Share-only path |

## Override rate (3 sessions)

- **Sessions with readiness override:** 1 / 3 (33%)
- **Overrides where `blockingDimensions` = `ctaProminence`:** 7 / 7 server override events (100%)
- **False-positive signal:** Session `466ef707` blocked on `ctaProminence` score 20; operator overrode; derivations and preview (73) succeeded — blocking did not match operator judgment.

## Rationale

Global blocking threshold (50) treated `ctaProminence` like legibility/hierarchy dimensions. Operator UAT showed CTA prominence scoring is noisy relative to downstream quality. Critical CTA absence still blocks via `preflight.criticalIssues`; dimension score alone no longer hard-blocks.

## Export source

`../93-sess-03-operator-uat/beta-analytics-export-sess03.csv` — `readiness_blocked` rows 2026-06-11T12:10–12:22 UTC.
