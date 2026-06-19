---
phase: 147
slug: operator-decision-session-and-calibration-rerun
status: human_needed
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-19
---

# Phase 147 - Validation Strategy

> Validation contract for capturing Jhonatan decisions and rerunning calibration without fabricating human judgment.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | tsx operational scripts + Vitest focused tests + artifact inspection |
| Decision recorder | `(cd app && npx tsx scripts/record-cenbrap-calibration-decisions.ts --dry-run)` |
| Calibration rerun | `(cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md)` |
| Evidence rebuild | `(cd app && npm run olhar-release-evidence:build)` |
| Evidence checker | `node app/scripts/check-olhar-release-evidence.mjs --evidence .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json --skip-tests` |
| Focused tests | `(cd app && npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts src/server/olhar-calibration/olhar-release-evidence.test.ts)` |

## Per-Task Verification Map

| Task ID | Plan | Requirement | Test Type | Automated Command | Manual Gate | Status |
|---------|------|-------------|-----------|-------------------|-------------|--------|
| 147-01-01 | 01 | HUMDEC-01 | artifact | `rg -n "entra|quase|nao_entra|manual_pending|human_needed" .planning/phases/145-jhonatan-decision-capture-and-mismatch-triage .planning/phases/147-operator-decision-session-and-calibration-rerun` | Jhonatan provides decisions | complete (manual_pending) |
| 147-01-02 | 01 | HUMDEC-02 | recorder | `(cd app && npx tsx scripts/record-cenbrap-calibration-decisions.ts --dry-run)` | Confirm `--confirm` only when decisions are real | complete (`--confirm` skipped) |
| 147-01-03 | 01 | HUMDEC-02, HUMDEC-04 | safety | `rg -n "DATABASE_URL|postgres://|X-Amz-Signature|prompt" .planning/phases/145-jhonatan-decision-capture-and-mismatch-triage .planning/phases/147-operator-decision-session-and-calibration-rerun` | Review any hit before proceeding | complete |
| 147-02-01 | 02 | HUMDEC-03 | calibration | `(cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md)` | Confirm decision count meaning | complete (human_needed) |
| 147-02-02 | 02 | HUMDEC-03, HUMDEC-04 | evidence | `(cd app && npm run olhar-release-evidence:build) && node app/scripts/check-olhar-release-evidence.mjs --evidence .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json --skip-tests` | Confirm claims still withheld if sample blocks | complete (human_needed) |
| 147-02-03 | 02 | HUMDEC-01..04 | verification | `node -e 'const c=require("./.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json"); console.log(c.metrics)'` | Confirm phase outcome | complete (human_needed) |

## Wave 0 Requirements

- [x] Decision artifact or explicit pending state exists for every current review-ready row.
- [x] Recorder dry-run passes.
- [x] Recorder confirm is run only with real Jhonatan decisions.
- [x] Calibration rerun completes.
- [x] Evidence refresh/check completes with truthful status.
- [x] No sensitive payload appears in planning artifacts.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Jhonatan decision | HUMDEC-01 | The system cannot judge on behalf of the calibration authority | Fill `145-DECISIONS.json` with `entra`, `quase` or `nao_entra` for each row. |
| Confirm DB write | HUMDEC-02 | `--confirm` persists canonical events | Review dry-run output, then run confirm only if decisions are intentional. |
| Claim language | HUMDEC-04 | Structural pass can still be semantically overclaimed | Read verification before publishing agreement or quality claims. |

## Validation Sign-Off

- [x] Every HUMDEC requirement has automated and/or manual verification.
- [x] Missing human decisions remain an explicit valid blocker.
- [x] No watch-mode commands.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** human_needed — automated path verified; Jhonatan decisions still required for claim advancement.
