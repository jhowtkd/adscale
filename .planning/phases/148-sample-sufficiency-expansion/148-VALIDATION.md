---
phase: 148
slug: sample-sufficiency-expansion
status: planning
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-19
---

# Phase 148 - Validation Strategy

> Validation contract for expanding the Olhar Cenbrap calibration sample without unlocking claims before human decisions and sample guidance allow it.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | tsx operational scripts + evidence checker + artifact inspection |
| Corpus inspection | `(cd app && npx tsx scripts/seed-cenbrap-calibration-corpus.ts --inspect-only)` |
| Decision recorder | `(cd app && npx tsx scripts/record-cenbrap-calibration-decisions.ts --dry-run)` |
| Calibration rerun | `(cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md)` |
| Evidence rebuild | `(cd app && npm run olhar-release-evidence:build)` |
| Evidence checker | `node app/scripts/check-olhar-release-evidence.mjs --evidence .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json --skip-tests` |
| Metrics spot-check | `node -e 'const e=require("./.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json"); console.log(e.status, e.artDirectionMetrics, e.sampleGuidance)'` |

## Per-Task Verification Map

| Task ID | Plan | Requirement | Test Type | Automated Command | Manual Gate | Status |
|---------|------|-------------|-----------|-------------------|-------------|--------|
| 148-01-01 | 01 | SAMPLE-01 | inventory | `(cd app && npx tsx scripts/seed-cenbrap-calibration-corpus.ts --inspect-only)` | Confirm source labels are truthful | pending |
| 148-01-02 | 01 | SAMPLE-01, SAMPLE-04 | artifact/import | `rg -n "review_ready|sourceLabel|synthetic_fixture|operator_imported|real_customer|additionalNeeded" .planning/phases/148-sample-sufficiency-expansion` | Decide whether fixture expansion is acceptable | pending |
| 148-01-03 | 01 | SAMPLE-01 | decision input | `(cd app && npx tsx scripts/record-cenbrap-calibration-decisions.ts --dry-run)` | Jhonatan supplies decisions for rows that count | pending |
| 148-02-01 | 02 | SAMPLE-02, SAMPLE-03 | calibration | `(cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md)` | Confirm metrics interpretation | pending |
| 148-02-02 | 02 | SAMPLE-02, SAMPLE-03 | evidence | `(cd app && npm run olhar-release-evidence:build) && node app/scripts/check-olhar-release-evidence.mjs --evidence .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json --skip-tests` | Confirm claims remain withheld if blocked | pending |
| 148-02-03 | 02 | SAMPLE-04 | audit | `rg -n "0/5|1/5|2/5|5/5|additionalNeeded|source composition|claims withheld|agreementRate" .planning/phases/148-sample-sufficiency-expansion` | Confirm final sample state | pending |

## Wave 0 Requirements

- [ ] Current reviewable row count and decision count are documented separately.
- [ ] Additional rows are either added with source labels or blocked with exact reason.
- [ ] Jhonatan decisions are recorded only from human input.
- [ ] Evidence keeps `agreementRate=null` while `additionalNeeded > 0`.
- [ ] Source composition appears in Phase 148 audit.
- [ ] No external agreement or quality claim is introduced.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Accept fixture expansion | SAMPLE-04 | Source strength is a product/evidence decision | Confirm whether Phase 148 may add synthetic rows for operational sample or must wait for real rows. |
| Jhonatan decisions | SAMPLE-01 | Only Jhonatan can provide calibration judgment | Fill decisions for every row counted toward sample sufficiency. |
| Claims wording | SAMPLE-02 | Semantic claim safety cannot be inferred from tests alone | Read the sample audit before publishing any agreement statement. |

## Validation Sign-Off

- [x] Every SAMPLE requirement has automated and/or manual verification.
- [x] Claims remain blocked while sample guidance blocks.
- [x] Source composition is a required artifact.
- [x] No watch-mode commands.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
