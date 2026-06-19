# Phase 143 — Operational Blockers

## insufficient_campaigns

| Field | Value |
|-------|-------|
| `blocker` | insufficient_campaigns |
| `detected_at` | 2026-06-19T16:44:10.333Z |
| `artifact_mode` | live |
| `artifact_status` | no_live_data |
| `evaluated_campaign_count` | 0 |
| `required_minimum` | 2 |

### Cause

Live calibration ran without `--template` and connected to the database, but no workspaces contained Cenbrap campaigns matching conservative selection signals (`mode=live`, `status=no_live_data`).

### Next action

Seed or identify at least two Cenbrap campaigns with derivations in the target environment, then re-run Phase 143 calibration. Do not proceed to Phase 144 agreement claims until `evaluatedCampaignCount >= 2`.
