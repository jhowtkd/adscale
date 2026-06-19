# Phase 143 — Live Cenbrap Calibration Run

## Environment Readiness

| Field | Value |
|-------|-------|
| `env_source` | `.env.local` |
| `secret_exposed` | false |
| `run_allowed` | true |

### Source detection (2026-06-19T16:43:52Z)

- Shell `DATABASE_URL`: unset
- `app/.env.local` `DATABASE_URL`: present (value not recorded)
- Root `.env.local`: absent
- `app/.env`: absent

No database connection string or credential appears in this document.

## Live Calibration Run

| Field | Value |
|-------|-------|
| `command` | `cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` |
| `template_flag` | not used |
| `captured_at` | 2026-06-19T16:44:10.333Z |
| `exit_code` | 0 |
| `artifact_mode` | live |
| `artifact_status` | no_live_data |
| `evaluated_campaign_count` | 0 |
| `evaluated_derivation_count` | 0 |
| `decision_count` | 0 |

### Run summary

Live path executed against `app/.env.local` database. Exit code zero with `mode=live` — no template fallback. Zero Cenbrap campaigns matched conservative selection signals; classified as `insufficient_campaigns` blocker (implementation OK, corpus not ready).
