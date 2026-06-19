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

## Artifact Inspection (2026-06-19T16:45:05Z)

### JSON (`142-CENBRAP-CALIBRATION.json`)

| Field | Value |
|-------|-------|
| `mode` | live |
| `status` | no_live_data |
| `metrics.evaluatedCampaignCount` | 0 |
| `metrics.evaluatedDerivationCount` | 0 |
| `metrics.decisionCount` | 0 |
| `sampleGuidance` | 2 gates — calibration_global (0/5), calibration_slice cenbrap_campaigns (0/2) |

### Contact sheet (`142-CONTACT-SHEET.md`)

| Check | Result |
|-------|--------|
| Real campaign sections | absent — `_No live Cenbrap campaigns selected_` |
| Safe derivation refs | absent (no rows) |
| `olharVerdict` | template table header only |
| `exportStatus` | template table header only |
| Package eligibility | template table header only |
| Override marker | template table header only |
| Human-decision placeholder (Phase 144) | present — `manual_pending` row |

### Safety scan

Scanned `143-LIVE-RUN.md`, `143-BLOCKERS.md`, `142-CENBRAP-CALIBRATION.json`, `142-CONTACT-SHEET.md` for `DATABASE_URL=`, signed URL query params, and prompt payload labels. **No secrets or sensitive payloads found.**

### Verification tests

```
npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts src/server/olhar-calibration/olhar-release-evidence.test.ts
→ 17 passed (2 files)
```

## Dual-Verdict Coverage Analysis (2026-06-19T16:48:00Z)

Parsed `142-CENBRAP-CALIBRATION.json` (`mode=live`, `status=no_live_data`). JSON shape exposes `campaigns[].rows[].derivation` with `olharVerdict`, `exportStatus`, `outputRef`, and `dualVerdictState` — no `artifact_shape_gap`.

### Row counts

| Metric | Count |
|--------|------:|
| Total campaign sections | 0 |
| Total derivation rows | 0 |
| Rows with both `olharVerdict` and `exportStatus` | 0 |
| `review_ready` (dual verdict + safe output ref) | 0 |
| Rows missing only `olharVerdict` (`missing_olhar`) | 0 |
| Rows missing only `exportStatus` (`missing_export`) | 0 |
| Rows missing both (`missing_both`) | 0 |
| Rows without safe output refs (`no_output_key` / `missing_output_ref`) | 0 |
| Legacy derivations without modern verdict payloads (`legacy_derivation`) | 0 |
| Total `missing_dual_verdict` rows | 0 |

### Classification notes

- With zero derivation rows, dual-verdict coverage cannot be evaluated — this is a **corpus gap**, not missing evidence on existing rows.
- `metrics.missingDualVerdictCount` in JSON: **0** (consistent — no rows to classify).
- Contact sheet is **template-only**; the single `manual_pending` placeholder is not a reviewable derivation row.
- Primary blocker remains `insufficient_campaigns` (see `143-BLOCKERS.md`).

### Phase 144 readiness

| Gate | Status |
|------|--------|
| `review_ready` rows for Jhonatan | **0** — blocked |
| `manual_pending` placeholders | 1 (template table only) |
| Phase 144 decision capture | **blocked** until `evaluatedCampaignCount >= 2` and rows have visible system verdict context |

## Contact Sheet Readiness (2026-06-19T16:48:30Z)

| Readiness state | Count |
|-----------------|------:|
| `review_ready` | 0 |
| `missing_dual_verdict` | 0 |
| `missing_output_ref` | 0 |
| `manual_pending` (template placeholder) | 1 |

Contact sheet updated with explicit row-readiness table and link to `143-BLOCKERS.md`. Template-only state preserved — not collapsed into disagreement or fake review rows.
