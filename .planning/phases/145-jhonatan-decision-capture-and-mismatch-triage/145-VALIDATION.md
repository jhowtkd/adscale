---
phase: 145
slug: jhonatan-decision-capture-and-mismatch-triage
status: planning
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-19
---

# Phase 145 - Validation Strategy

> Validation contract for capturing Jhonatan's decisions and computing agreement/mismatch without making premature quality claims.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest + tsx operational scripts + artifact inspection |
| Focused tests | `cd app && npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts src/server/olhar-calibration/olhar-release-evidence.test.ts` |
| Calibration rerun | `cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` |
| Decision artifact | `.planning/phases/145-jhonatan-decision-capture-and-mismatch-triage/145-DECISION-RUN.md` |

## Per-Task Verification Map

| Task ID | Plan | Requirement | Test Type | Automated Command | Manual Gate | Status |
|---------|------|-------------|-----------|-------------------|-------------|--------|
| 145-01-01 | 01 | JUDGE-01 | artifact/input | `rg -n "humanDecision|entra|quase|nao_entra" .planning/phases/145-jhonatan-decision-capture-and-mismatch-triage` | Jhonatan provides decisions | pending |
| 145-01-02 | 01 | JUDGE-02 | script/event | `cd app && npx tsx scripts/record-cenbrap-calibration-decisions.ts --dry-run` if script is added | Confirm reviewer/reviewedAt | pending |
| 145-01-03 | 01 | JUDGE-02 | DB/artifact | `rg -n "decisionEventId|output_decision_event|reviewer|reviewedAt" .planning/phases/145-jhonatan-decision-capture-and-mismatch-triage/145-DECISION-RUN.md` | Confirm no duplicate decisions | pending |
| 145-02-01 | 02 | JUDGE-03 | unit/artifact | `cd app && npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts` | Confirm mismatch bucket meaning | pending |
| 145-02-02 | 02 | JUDGE-04 | live rerun | `cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` | Confirm metrics are interpreted as synthetic calibration only | pending |
| 145-02-03 | 02 | JUDGE-03, JUDGE-04 | claims gate | `node -e 'const r=require("./.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json"); console.log(r.metrics?.decisionCount, r.metrics?.agreementRate, r.sampleGuidance)'` | Confirm Phase 146 can refresh evidence honestly | pending |

## Wave 0 Requirements

- [ ] Capture decisions for all `review_ready` rows or mark remaining rows explicitly `manual_pending`.
- [ ] Persist or normalize reviewer and reviewedAt.
- [ ] Preserve `synthetic_fixture` source labels in all decision evidence.
- [ ] Use normalized mismatch buckets.
- [ ] Re-run calibration live after decisions.
- [ ] Keep sample guidance as blocker for external quality/agreement claims.
- [ ] Scan artifacts for secrets, prompts and signed URLs.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Jhonatan decisions | JUDGE-01 | The calibration authority is human judgment | Review the 2 contact-sheet rows and provide `entra`, `quase` or `nao_entra` |
| Mismatch bucket acceptance | JUDGE-03 | Buckets must match the design reason, not just code convenience | Confirm bucket and optional text for any disagreement |
| Evidence strength | JUDGE-04 | Synthetic fixtures cannot support customer-quality claims | Confirm Phase 146 wording keeps claims withheld |

## Validation Sign-Off

- [x] Every JUDGE requirement has automated and/or manual verification.
- [x] Human decision capture is separated from release claims.
- [x] Synthetic fixture caveat is explicit.
- [x] No watch-mode commands.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
