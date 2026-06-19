# Phase 143 — Operational Blockers

**Phase 143 outcome:** `insufficient_campaigns` (not `live_ready_for_human_review`)

Phase 144 is **blocked** for agreement claims. Partial-row review is not applicable — zero derivation rows exist.

---

## insufficient_campaigns (primary)

| Field | Value |
|-------|-------|
| `blocker` | insufficient_campaigns |
| `detected_at` | 2026-06-19T16:44:10.333Z |
| `artifact_mode` | live |
| `artifact_status` | no_live_data |
| `evaluated_campaign_count` | 0 |
| `evaluated_derivation_count` | 0 |
| `required_minimum` | 2 |
| `phase_144_blocked` | yes — full block (no partial rows) |

### Cause

Live calibration ran without `--template` and connected to the database, but no workspaces contained Cenbrap campaigns matching conservative selection signals (`mode=live`, `status=no_live_data`).

### Observed evidence

- `142-CENBRAP-CALIBRATION.json`: `campaigns=[]`, `metrics.evaluatedCampaignCount=0`
- `142-CONTACT-SHEET.md`: template-only; `_No live Cenbrap campaigns selected_`
- Sample guidance: calibration_slice `0/2` (need 2 more)

### Owner / next action

**Operator (Jhonatan / data seeding):** Seed or identify at least two Cenbrap campaigns with derivations in the target environment (`app/.env.local` database), then re-run Phase 143 calibration.

Do not proceed to Phase 144 `entra/quase/nao_entra` decision capture until `evaluatedCampaignCount >= 2` and rows expose `olharVerdict` + `exportStatus`.

---

## missing_dual_verdict_coverage (not applicable — zero rows)

| Field | Value |
|-------|-------|
| `blocker` | missing_dual_verdict_coverage |
| `status` | not triggered |
| `review_ready` | 0 |
| `missing_olhar` | 0 |
| `missing_export` | 0 |
| `missing_both` | 0 |
| `no_output_key` | 0 |
| `legacy_derivation` | 0 |
| `phase_144_partial` | n/a |

### Cause

Dual-verdict classification requires derivation rows. With zero campaigns selected, there are no rows to classify as `missing_olhar`, `missing_export`, or `missing_both`. This is subordinate to `insufficient_campaigns`.

### If re-run produces campaigns but rows lack verdicts

Re-run dual-verdict coverage analysis (see `143-LIVE-RUN.md`). Route `missing_dual_verdict` rows to QA/regeneration before asking Jhonatan to judge. Phase 144 may proceed with **partial rows** only when `review_ready > 0` and missing rows are explicitly excluded from agreement claims.
