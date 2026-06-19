---
phase: 142
slug: cenbrap-calibration-and-release-evidence
status: planning
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-19
---

# Phase 142 - Validation Strategy

> Validation contract for Cenbrap calibration and v12.7 release evidence.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest via `app/config/vitest.config.ts` + Node evidence checkers |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts src/server/olhar-calibration/olhar-release-evidence.test.ts && node scripts/check-olhar-release-evidence.mjs --evidence ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.template.json --skip-tests` |
| **Full suite command** | `cd app && npm test && npm run build` |
| **Estimated runtime** | ~120 seconds focused, longer for full suite/build |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 142-01-01 | 01 | 1 | CALIB-01 | unit/script | `cd app && npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts` | W0 | pending |
| 142-01-02 | 01 | 1 | CALIB-01 | script/artifact | `cd app && npx tsx scripts/run-cenbrap-calibration.ts --template --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.template.json` | W0 | pending |
| 142-01-03 | 01 | 1 | CALIB-02 | unit/script | `cd app && npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts` | W0 | pending |
| 142-02-01 | 02 | 2 | CALIB-03 | unit/checker | `cd app && npm test -- src/server/olhar-calibration/olhar-release-evidence.test.ts` | W0 | pending |
| 142-02-02 | 02 | 2 | CALIB-04 | evidence checker | `cd app && node scripts/check-olhar-release-evidence.mjs --evidence ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.template.json --skip-tests` | W0 | pending |
| 142-02-03 | 02 | 2 | CALIB-03, CALIB-04 | audit/docs | `test -f .planning/milestones/v12.7-MILESTONE-AUDIT.md && rg -n "insufficient_sample|agreementRate|approvedInvalidPrevented|factual" .planning/milestones/v12.7-MILESTONE-AUDIT.md` | W0 | pending |

## Wave 0 Requirements

- [ ] Add calibration metrics module and tests.
- [ ] Add Cenbrap calibration run script.
- [ ] Add template evidence JSON for environments without live DB.
- [ ] Add contact-sheet markdown artifact.
- [ ] Add v12.7 release evidence checker.
- [ ] Add milestone audit only after evidence exists.
- [ ] Fixtures include sufficient and insufficient sample cases.
- [ ] Fixtures include missing dual-verdict rows.
- [ ] Fixtures include export blocked separately from art-direction blocked.
- [ ] Fixtures include override-approved rows.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Jhonatan agreement review | CALIB-01, CALIB-02 | The calibration target is Jhonatan's design judgment | Review contact-sheet outputs and record `entra`, `quase`, `nao entra` plus mismatch reasons |
| Release wording honesty | CALIB-03, CALIB-04 | Requires product judgment on accepted-gap wording | Confirm audit does not claim quality improvement when sample is insufficient |

## Validation Sign-Off

- [x] All tasks have automated verification or explicit manual gate.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing scripts/artifacts.
- [x] No watch-mode flags.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
