---
phase: 146
slug: evidence-refresh-and-claims-gate
status: planning
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-19
---

# Phase 146 - Validation Strategy

> Validation contract for refreshing Olhar release evidence without turning missing human judgment into false quality claims.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest + tsx operational scripts + release evidence checker + artifact inspection |
| Focused tests | `cd app && npm test -- src/server/olhar-calibration/olhar-release-evidence.test.ts src/server/olhar-calibration/cenbrap-calibration.test.ts` |
| Live calibration source | `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json` |
| Generated evidence | `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json` |
| Release checker | `node app/scripts/check-olhar-release-evidence.mjs --evidence .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json --skip-tests` |
| Phase audit | `.planning/phases/146-evidence-refresh-and-claims-gate/146-CLAIMS-GATE.md` |

## Per-Task Verification Map

| Task ID | Plan | Requirement | Test Type | Automated Command | Manual Gate | Status |
|---------|------|-------------|-----------|-------------------|-------------|--------|
| 146-01-01 | 01 | CLAIM-01 | builder/artifact | `cd app && npx tsx scripts/build-olhar-release-evidence.ts --calibration ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json` | Confirm generated evidence is from live calibration | pending |
| 146-01-02 | 01 | CLAIM-02 | release gate | `node app/scripts/check-olhar-release-evidence.mjs --evidence .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json --skip-tests` | Confirm `human_needed` or `insufficient_sample` wording | pending |
| 146-01-03 | 01 | CLAIM-01, CLAIM-03 | tests | `cd app && npm test -- src/server/olhar-calibration/olhar-release-evidence.test.ts` | Confirm metric split is readable in artifact | pending |
| 146-02-01 | 02 | CLAIM-03 | audit | `rg -n "human_needed|insufficient_sample|artDirectionMetrics|factualExportMetrics|claims withheld|synthetic_fixture" .planning/phases/146-evidence-refresh-and-claims-gate/146-CLAIMS-GATE.md` | Confirm claims language is acceptable | pending |
| 146-02-02 | 02 | CLAIM-04 | planning sync | `rg -n "v12.8|human_needed|tech_debt|CLAIM-0|Phase 146" .planning/PROJECT.md .planning/ROADMAP.md .planning/STATE.md .planning/MILESTONES.md` | Confirm final milestone status | pending |

## Wave 0 Requirements

- [ ] Evidence builder consumes the latest live calibration JSON.
- [ ] Evidence checker passes with a truthful status.
- [ ] `agreementRate` remains `null` while sample guidance blocks the claim.
- [ ] Audit separates factual/export safety from art-direction agreement.
- [ ] Audit keeps `synthetic_fixture` caveat visible.
- [ ] v12.7/v12.8 tech debt is closed or carried forward with exact blockers.
- [ ] PROJECT/ROADMAP/STATE/MILESTONES are synchronized.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claim wording | CLAIM-03 | The risk is semantic, not only structural | Read `146-CLAIMS-GATE.md` and confirm it does not overclaim quality/agreement. |
| Tech-debt closure | CLAIM-04 | The operator decides whether unresolved human decisions are accepted carry-forward | Confirm whether v12.8 closes as `human_needed`, `tech_debt`, or accepted carry-forward. |
| Jhonatan decisions | CLAIM-02 | Only Jhonatan can supply the calibration authority | If decisions exist, rerun Phase 145 decision script before Phase 146 execution. |

## Validation Sign-Off

- [x] Every CLAIM requirement has automated and/or manual verification.
- [x] `human_needed` is a valid expected result.
- [x] Technical green is separated from evidence strength.
- [x] No watch-mode commands.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
