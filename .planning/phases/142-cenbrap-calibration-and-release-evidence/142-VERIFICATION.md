---
phase: 142-cenbrap-calibration-and-release-evidence
verified: 2026-06-19T15:05:00Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "At least two real Cenbrap campaigns are re-evaluated with contact sheets and dual verdicts"
    status: failed
    reason: "Only template artifacts exist — evaluatedCampaignCount=0, no 142-CENBRAP-CALIBRATION.json live run"
    artifacts:
      - path: ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.template.json"
        issue: "mode=template, campaigns=[], 0 evaluated campaigns"
      - path: ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json"
        issue: "Missing — live calibration never produced"
    missing:
      - "Run run-cenbrap-calibration.ts against DATABASE_URL with ≥2 Cenbrap campaigns"
      - "Commit 142-CENBRAP-CALIBRATION.json and contact sheet with live campaign rows"
  - truth: "Jhonatan's decisions are captured against system verdicts with mismatch reasons"
    status: failed
    reason: "humanDecisionCount=0; contact sheet rows are manual_pending placeholders only"
    artifacts:
      - path: ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md"
        issue: "Template table with _pending_ row; no operator decisions recorded"
    missing:
      - "Record Jhonatan entra/quase/nao_entra decisions in contact sheet or via output_decision_events"
      - "Regenerate calibration JSON with humanDecisionCount > 0 before claiming agreement"
human_verification:
  - test: "Run live Cenbrap calibration against production/staging DB"
    expected: "≥2 Cenbrap campaigns selected, derivations show olharVerdict and exportStatus columns in contact sheet"
    why_human: "Requires DATABASE_URL with real Cenbrap campaign data not available in CI"
  - test: "Jhonatan reviews contact sheet and records operator decisions"
    expected: "Rows move from manual_pending to entra/quase/nao_entra with mismatch reasons where applicable"
    why_human: "Calibration authority is human judgment; cannot be verified programmatically"
  - test: "Regenerate release evidence after live calibration"
    expected: "142-EVIDENCE.json status moves from template toward ok/insufficient_sample/human_needed with real counts"
    why_human: "End-to-end operator workflow confirmation"
---

# Phase 142: Cenbrap Calibration and Release Evidence Verification Report

**Phase Goal:** Provar o novo olhar em campanhas reais Cenbrap, medir concordancia com Jhonatan e fechar com evidencia honesta, sem transformar amostra pequena em claim de qualidade.

**Verified:** 2026-06-19T15:05:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | At least two real Cenbrap campaigns re-evaluated with contact sheets and dual verdicts | ✗ FAILED | `142-CENBRAP-CALIBRATION.template.json` has `evaluatedCampaignCount: 0`, `mode: "template"`. No `142-CENBRAP-CALIBRATION.json` live artifact exists. Contact sheet states "No live Cenbrap campaigns selected." |
| 2 | Jhonatan's decisions captured against system verdicts with mismatch reasons | ✗ FAILED | `humanDecisionCount: 0`. Contact sheet has `manual_pending` placeholder row only. `output_decision_events` join exists in `service.ts` but no live data flowed through. |
| 3 | Evidence reports agreement, approved-invalid prevention, sem-opiniao detection and export-block separation | ✓ VERIFIED | `142-EVIDENCE.template.json` includes `artDirectionMetrics` (agreementRate null, mismatchReasonCounts) and `factualExportMetrics` (approvedInvalidPreventedCount, semOpiniaoDetectionCount, exportBlockSeparationCount). `buildCenbrapMetrics` computes all counters; 17 unit tests pass. |
| 4 | Release audit keeps factual fidelity, art-direction quality and sample sufficiency separate | ✓ VERIFIED | `olhar-release-evidence.ts` splits `artDirectionMetrics` / `factualExportMetrics` with distinct denominator notes. `check-olhar-release-evidence.mjs` rejects blended fields and cross-section leakage. `v12.7-MILESTONE-AUDIT.md` status `tech_debt` with explicit sample gates. |
| 5 | Repeatable calibration pipeline with honest template fallback when live data unavailable | ✓ VERIFIED | `run-cenbrap-calibration.ts` supports `--template` and catches DB failures to emit template artifacts. `buildTemplateCalibrationReport` preserves `insufficient_sample` guidance without fabricating campaigns. |
| 6 | Release evidence gate validates sample honesty and blocks dishonest quality claims | ✓ VERIFIED | `check-olhar-release-evidence.mjs` passes on template evidence; rejects `agreementRate` when `additionalNeeded > 0`. `qualityImprovementClaimed` is null in template. `npm run olhar-release-evidence` alias wired in `package.json`. |

**Score:** 4/6 truths verified (2 operational roadmap criteria unmet; 4 implementation/honesty criteria met)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/src/server/olhar-calibration/cenbrap-calibration.ts` | Calibration metric domain | ✓ VERIFIED | 762 lines; agreement classification, metrics, contact-sheet renderer |
| `app/src/server/olhar-calibration/cenbrap-calibration.test.ts` | Fixture tests | ✓ VERIFIED | 11 tests covering agreement, export separation, override, insufficient sample |
| `app/src/server/olhar-calibration/service.ts` | Live DB campaign selection | ✓ VERIFIED | Wired to campaigns, derivations, output_decision_events repos |
| `app/scripts/run-cenbrap-calibration.ts` | CLI orchestrator | ✓ VERIFIED | Template + live modes; writes JSON + contact sheet |
| `app/src/server/olhar-calibration/olhar-release-evidence.ts` | Release evidence builder | ✓ VERIFIED | Separated metrics, sample guidance, accepted gaps |
| `app/src/server/olhar-calibration/olhar-release-evidence.test.ts` | Sufficient/insufficient tests | ✓ VERIFIED | 6 tests including 2-campaign sufficient sample path |
| `app/scripts/check-olhar-release-evidence.mjs` | Release gate checker | ✓ VERIFIED | Schema validation, blended-field denylist, sample honesty |
| `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.template.json` | Honest empty-sample template | ✓ VERIFIED | Explicit `insufficient_sample` guidance, no fabricated campaigns |
| `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json` | Live calibration output | ✗ MISSING | Never generated — live DB run pending |
| `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.template.json` | Release evidence artifact | ✓ VERIFIED | status `template`, agreementRate null, acceptedGaps populated |
| `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` | Operator review contact sheet | ⚠️ HOLLOW | Exists but template-only; no campaign rows or decisions |
| `.planning/milestones/v12.7-MILESTONE-AUDIT.md` | Milestone closure audit | ✓ VERIFIED | tech_debt verdict, operator next actions, gate run results |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `run-cenbrap-calibration.ts` | `service.ts` | `runCenbrapCalibration()` | ✓ WIRED | Live path calls service; template path uses `buildTemplateCalibrationReport` |
| `service.ts` | DB repos | `getCampaigns`, `getDerivationsByCampaign`, `listOutputDecisionEvents` | ✓ WIRED | Conservative Cenbrap match via `matchCenbrapCampaign` |
| `olhar-release-evidence.ts` | `cenbrap-calibration.ts` | `buildOlharReleaseEvidence({ calibration })` | ✓ WIRED | Consumes `CenbrapCalibrationReport` metrics |
| `check-olhar-release-evidence.mjs` | `142-EVIDENCE.template.json` | `validateEvidenceShape` | ✓ WIRED | Checker passes; runs unit tests unless `--skip-tests` |
| `v12.7-MILESTONE-AUDIT.md` | Phase 142 artifacts | References evidence paths and gate commands | ✓ WIRED | Documents tech_debt and operator refresh steps |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `142-CONTACT-SHEET.md` | campaign rows, decisions | `renderContactSheetMarkdown(report)` | No — report is template with empty campaigns | ⚠️ STATIC |
| `142-EVIDENCE.template.json` | artDirectionMetrics | `buildTemplateOlharReleaseEvidence` | No — all counts zero | ⚠️ STATIC (intentional) |
| `service.ts` live path | campaigns, derivations | DB queries | Capable but not exercised in committed artifacts | ✓ FLOWING (code path verified) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Calibration unit tests | `npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts src/server/olhar-calibration/olhar-release-evidence.test.ts` | 17 passed | ✓ PASS |
| Release evidence checker | `node scripts/check-olhar-release-evidence.mjs --evidence ../.planning/.../142-EVIDENCE.template.json --skip-tests` | "Olhar release evidence check passed. Status: template" | ✓ PASS |
| Template calibration script | `npx tsx scripts/run-cenbrap-calibration.ts --template` | Writes template JSON with status=template, 0 campaigns | ✓ PASS |
| Commits from SUMMARYs | `git cat-file -t` on 6 hashes | All resolve to commit objects | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| CALIB-01 | 142-01 | ≥2 real Cenbrap campaigns re-evaluated with contact sheets | ✗ BLOCKED | Pipeline implemented (`service.ts`, `run-cenbrap-calibration.ts`) but `evaluatedCampaignCount=0`; no live JSON artifact. REQUIREMENTS.md marked Complete at implementation level — operational deliverable not met. |
| CALIB-02 | 142-01 | Jhonatan decisions captured for agreement/mismatch | ✗ BLOCKED | Decision capture workflow exists (contact sheet sections, `normalizeHumanDecisionFromEvent`) but `humanDecisionCount=0`. |
| CALIB-03 | 142-02 | Evidence reports metrics without false sample sufficiency claims | ✓ SATISFIED | `142-EVIDENCE.template.json` has all required counters; agreementRate null; sampleGuidance blocks claims. |
| CALIB-04 | 142-02 | Release gate separates factual/export from art-direction | ✓ SATISFIED | Checker enforces section separation; `BLENDED_FIELD_DENYLIST`; insufficient_sample language preserved. |

**Orphaned requirements:** None — all four CALIB IDs appear in plan frontmatter.

**Documentation discrepancy:** `.planning/REQUIREMENTS.md` marks CALIB-01 and CALIB-02 as Complete. Codebase evidence shows operational calibration not yet executed; milestone audit correctly reports `tech_debt`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TODO/FIXME/placeholder stubs in olhar-calibration module | — | — |

No blocker anti-patterns in implementation code. Template artifacts intentionally use zero counts — not stubs because evidence notes explicitly forbid inferring claims.

### Human Verification Required

### 1. Live Cenbrap calibration run

**Test:** Point `DATABASE_URL` at environment with Cenbrap campaigns; run `npx tsx scripts/run-cenbrap-calibration.ts` without `--template`.
**Expected:** ≥2 campaigns in JSON and contact sheet with `olharVerdict`, `exportStatus`, `packageEligible` columns per derivation.
**Why human:** Requires live database with Cenbrap campaign data.

### 2. Operator decision capture

**Test:** Jhonatan reviews contact sheet rows and records `entra`/`quase`/`nao_entra` with mismatch reasons (or confirms decisions exist in `output_decision_events`).
**Expected:** `humanDecisionCount > 0`; rows no longer `manual_pending`.
**Why human:** Calibration authority is human art-direction judgment.

### 3. Release evidence refresh

**Test:** Build `142-EVIDENCE.json` from live calibration JSON; run `npm run olhar-release-evidence`.
**Expected:** Status progresses from `template` toward `ok`/`insufficient_sample`/`human_needed` with real metric values; agreementRate remains null until sample guidance clears.
**Why human:** End-to-end operator workflow after live data available.

### Gaps Summary

Phase 142 delivered a complete, tested calibration and release-evidence **infrastructure** with honest template fallback — consistent with v12.5/v12.6 evidence honesty and the milestone `tech_debt` closure. However, the phase **goal** requires proving the new Olhar on real Cenbrap campaigns and measuring agreement with Jhonatan. Those operational outcomes are not yet present in committed artifacts:

1. **No live calibration run** — only `142-CENBRAP-CALIBRATION.template.json` exists; `evaluatedCampaignCount` is 0.
2. **No operator decisions** — contact sheet is a placeholder; agreement claims correctly withheld.

Implementation truths (evidence structure, metric separation, release gate, honest insufficient-sample handling) are verified. Roadmap success criteria 1 and 2 remain open until operator actions documented in `v12.7-MILESTONE-AUDIT.md` are completed.

---

_Verified: 2026-06-19T15:05:00Z_
_Verifier: Claude (gsd-verifier)_
