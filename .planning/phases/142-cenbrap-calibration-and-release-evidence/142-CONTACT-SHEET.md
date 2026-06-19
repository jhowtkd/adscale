# Phase 142 — Cenbrap Calibration Contact Sheet

Captured: 2026-06-19T16:44:10.333Z
Status: no_live_data
Mode: live

## Calibration authority

Jhonatan's `entra`, `quase`, and `nao_entra` decisions are the calibration authority in Phase 142.
System `olharVerdict` and `exportStatus` values are evidence being calibrated — not the final truth.
Rows without operator decisions stay `manual_pending` until entered below.

## Sample guidance

- **Cenbrap art-direction agreement rate**: 0/5 (need 5 more)
- **multi-campaign Cenbrap calibration coverage**: 0/2 (need 2 more)

## Metrics snapshot

- Campaigns: 0
- Derivations: 0
- Operator decisions: 0
- Agreement rate: withheld (insufficient comparable decisions)
- Missing dual verdict rows: 0
- Missing human decision rows: 0

## Row readiness (Phase 144 gate)

| Readiness | Count | Notes |
|-----------|------:|-------|
| `review_ready` | 0 | Requires `olharVerdict` + `exportStatus` + safe `outputRef` |
| `missing_dual_verdict` | 0 | No derivation rows to classify |
| `missing_output_ref` | 0 | No derivation rows without output |
| `manual_pending` | 1 | Template placeholder row only — not a real derivation |

**Template-only:** No live campaign sections exist. This sheet cannot support Jhonatan decision capture until campaigns are seeded.

**Blocker:** [insufficient_campaigns](../143-live-cenbrap-calibration-run/143-BLOCKERS.md) — re-run calibration after ≥2 Cenbrap campaigns with derivations exist in the connected database.

Do not invent operator decisions here; Phase 144 fields remain empty/pending.

## Campaigns

_No live Cenbrap campaigns selected. Use this template to record manual review when data becomes available._

### Manual decision table (template)

| derivationId | olharVerdict | exportStatus | packageEligible | override | humanDecision | mismatchReason | reviewer | reviewedAt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _pending_ | — | — | — | — | manual_pending | — | Jhonatan | — |

_Readiness: `manual_pending` (template) — not `review_ready`. See [143-BLOCKERS.md](../143-live-cenbrap-calibration-run/143-BLOCKERS.md)._

