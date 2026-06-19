---
phase: 143
slug: live-cenbrap-calibration-run
status: planning
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-19
---

# Phase 143 - Validation Strategy

> Validation contract for live Cenbrap calibration. This phase validates real operational evidence, not just script success.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest via `app/config/vitest.config.ts` + Node/tsx scripts |
| Focused command | `cd app && npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts src/server/olhar-calibration/olhar-release-evidence.test.ts` |
| Template control command | `cd app && npx tsx scripts/run-cenbrap-calibration.ts --template --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.template.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` |
| Live command | `cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` |
| Full command | `cd app && npm test && npm run build` |

## Per-Task Verification Map

| Task ID | Plan | Requirement | Test Type | Automated Command | Manual Gate | Status |
|---------|------|-------------|-----------|-------------------|-------------|--------|
| 143-01-01 | 01 | CENLIVE-01 | env/script | `test -n "$DATABASE_URL"` or documented env source without printing value | Confirm canonical DB target | pending |
| 143-01-02 | 01 | CENLIVE-01, CENLIVE-02 | live script/artifact | `cd app && npx tsx scripts/run-cenbrap-calibration.ts --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` | Confirm data source is allowed | pending |
| 143-01-03 | 01 | CENLIVE-02, CENLIVE-03 | artifact inspection | `node -e 'const r=require("./.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json"); console.log(r.mode, r.metrics?.evaluatedCampaignCount, r.metrics?.evaluatedDerivationCount, r.metrics?.decisionCount)'` | Review contact sheet readability | pending |
| 143-02-01 | 02 | CENLIVE-04 | artifact inspection | `rg -n "missing_dual_verdict|missing_olhar|missing_export|manual_pending" .planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json .planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` | Confirm classification vocabulary is actionable | pending |
| 143-02-02 | 02 | CENLIVE-03, CENLIVE-04 | docs/blocker | `test -f .planning/phases/143-live-cenbrap-calibration-run/143-LIVE-RUN.md` | Confirm blocker/action owner if live data is insufficient | pending |
| 143-02-03 | 02 | CENLIVE-01..04 | phase verification | `test -f .planning/phases/143-live-cenbrap-calibration-run/143-BLOCKERS.md || test -f .planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json` | Decide if Phase 144 can proceed | pending |

## Wave 0 Requirements

- [ ] Record whether a real `DATABASE_URL` is available without exposing the value.
- [ ] Run calibration without `--template`.
- [ ] Verify JSON `mode` and campaign/derivation counters after the run.
- [ ] Verify contact sheet has real rows or an explicit "no rows" blocker.
- [ ] Count and classify missing dual-verdict rows.
- [ ] Record blocker causes in `143-BLOCKERS.md` when live acceptance fails.
- [ ] Keep `agreementRate` and quality claims withheld when sample guidance blocks them.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Canonical live DB choice | CENLIVE-01 | The agent must not guess production/staging intent from secret names alone | Confirm which environment should back the live calibration run |
| Contact sheet usefulness | CENLIVE-03 | A readable review sheet is a design/operator judgment | Open the contact sheet and confirm rows are understandable enough for Jhonatan review |
| Phase 144 readiness | CENLIVE-02, CENLIVE-04 | Human decision capture only makes sense if rows are reviewable | Confirm whether enough real rows exist to ask for `entra/quase/nao_entra` decisions |

## Validation Sign-Off

- [x] All CENLIVE requirements have at least one verification path.
- [x] Live fallback-to-template is explicitly guarded.
- [x] Missing evidence is a first-class outcome.
- [x] No watch-mode commands.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
