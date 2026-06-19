---
phase: 144
slug: cenbrap-corpus-seeding-and-calibration-rerun
status: planning
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-19
---

# Phase 144 - Validation Strategy

> Validation contract for producing a reviewable Cenbrap corpus after Phase 143's `insufficient_campaigns` result.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest + tsx operational scripts + JSON/contact-sheet inspection |
| Focused tests | `cd app && npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts src/server/olhar-calibration/olhar-release-evidence.test.ts` |
| Live rerun | `cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` |
| Artifact check | `node -e 'const r=require("./.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json"); console.log(r.mode, r.metrics?.evaluatedCampaignCount, r.metrics?.evaluatedDerivationCount, r.metrics?.missingDualVerdictCount)'` |

## Per-Task Verification Map

| Task ID | Plan | Requirement | Test Type | Automated Command | Manual Gate | Status |
|---------|------|-------------|-----------|-------------------|-------------|--------|
| 144-01-01 | 01 | CORPUS-01 | inspector/docs | `test -f .planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-RUN.md` | Confirm target DB/workspace | pending |
| 144-01-02 | 01 | CORPUS-01, CORPUS-02 | script/dry-run | `cd app && npx tsx scripts/seed-cenbrap-calibration-corpus.ts --dry-run` if script is added | Confirm source label | pending |
| 144-01-03 | 01 | CORPUS-02 | script/manifest | `test -f .planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-MANIFEST.json || test -f .planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-BLOCKERS.md` | Confirm rows are acceptable evidence | pending |
| 144-02-01 | 02 | CORPUS-03 | unit/artifact | `cd app && npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts` | Confirm missing-verdict routing | pending |
| 144-02-02 | 02 | CORPUS-03, CORPUS-04 | live rerun | `cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` | Confirm contact sheet reviewability | pending |
| 144-02-03 | 02 | CORPUS-04 | gate/docs | `rg -n "review_ready|evaluatedCampaignCount|phase_145_ready|operator_data_unavailable" .planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun .planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` | Decide Phase 145 entry | pending |

## Wave 0 Requirements

- [ ] Document target environment without exposing `DATABASE_URL`.
- [ ] Inspect existing DB for Cenbrap candidates before writing seed/import data.
- [ ] Create/import at least two Cenbrap campaigns or write `operator_data_unavailable`.
- [ ] Ensure reviewable derivations have safe `outputKey`, `olharVerdict` and `exportStatus`.
- [ ] Re-run calibration without `--template`.
- [ ] Confirm `review_ready > 0` or keep Phase 145 blocked.
- [ ] Preserve source labels: `real_customer`, `operator_imported`, `synthetic_fixture`.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Target environment | CORPUS-01 | DB writes are operational decisions | Confirm `.env.local` or another environment is the correct calibration target |
| Corpus source label | CORPUS-02 | Synthetic/imported rows change evidence strength | Confirm whether imported rows are acceptable for this milestone |
| Reviewability | CORPUS-04 | A designer must be able to judge the rows | Open the contact sheet and confirm rows can be reviewed by Jhonatan |

## Validation Sign-Off

- [x] Every CORPUS requirement has an automated and/or manual verification path.
- [x] Empty-corpus blocker remains first-class.
- [x] No quality claim depends on this phase alone.
- [x] No watch-mode commands.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
