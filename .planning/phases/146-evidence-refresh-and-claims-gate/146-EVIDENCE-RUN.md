# Phase 146 — Evidence Refresh Run Log

Captured: 2026-06-19

## Source artifacts

| Artifact | Path | Notes |
| --- | --- | --- |
| Live calibration | `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json` | `mode=live`, 2 campaigns, 2 derivations |
| Generated evidence | `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json` | Built from live calibration, not template |
| Corpus manifest | `.planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-MANIFEST.json` | `synthetic_fixture` source labels |
| Contact sheet | `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` | 2 `manual_pending` rows |

## Critical constraints verified

- Evidence generated from **live** `142-CENBRAP-CALIBRATION.json`, not `142-EVIDENCE.template.json`.
- `status=human_needed` — reviewable rows exist, Jhonatan decisions missing (`decisionCount=0`, `missingHumanDecisionCount=2`).
- `agreementRate=null` — sample guidance blocks claims (`additionalNeeded=5`).
- `synthetic_fixture` caveat present in `acceptedGaps`.
- Art-direction and factual/export metrics reported separately.

## Task 146-01-01 — Build live evidence

```bash
cd app && npx tsx scripts/build-olhar-release-evidence.ts \
  --calibration ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json \
  --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json
```

**Result:** exit 0

```
Wrote Olhar release evidence to .../142-EVIDENCE.json
Status=human_needed
Campaigns=2 derivations=2 decisions=0 agreementRate=null
Source caveats: 2
```

## Task 146-01-02 — Release checker against live evidence

```bash
node app/scripts/check-olhar-release-evidence.mjs \
  --evidence .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json \
  --skip-tests
```

**Result:** exit 0 — checker passed

```
Olhar release evidence check passed.
Status: human_needed
```

### Status truth check

| Condition | Expected | Observed |
| --- | --- | --- |
| `decisionCount=0` with reviewable derivations | `human_needed` | `human_needed` |
| `additionalNeeded > 0` | `agreementRate=null` | `null` |
| `decisionCount=0` | not `ok` | `human_needed` |
| Quality/agreement claim withheld | `qualityImprovementClaimed=null` | `null` |
| `synthetic_fixture` caveat | in `acceptedGaps` | yes (2 entries) |

### Evidence snapshot

| Field | Value |
| --- | --- |
| `status` | `human_needed` |
| `artDirectionMetrics.humanDecisionCount` | 0 |
| `artDirectionMetrics.agreementRate` | null |
| `artDirectionMetrics.missingHumanDecisionCount` | 2 |
| `factualExportMetrics.approvedInvalidPreventedCount` | 0 |
| `factualExportMetrics.semOpiniaoDetectionCount` | 0 |
| `factualExportMetrics.exportBlockSeparationCount` | 0 |
| `sampleGuidance[0].additionalNeeded` | 5 |

## Task 146-01-03 — Focused tests and consistency scan

```bash
cd app && npm test -- src/server/olhar-calibration/olhar-release-evidence.test.ts src/server/olhar-calibration/cenbrap-calibration.test.ts
```

**Result:** exit 0 — 22 tests passed (2 files)

### Consistency scan (`142-EVIDENCE.json`)

```bash
node -e 'const e=require("./.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json"); console.log(e.status, e.artDirectionMetrics, e.factualExportMetrics, e.sampleGuidance)'
```

| Check | Result |
| --- | --- |
| `status` | `human_needed` |
| `artDirectionMetrics.agreementRate` | `null` (blocked by sample guidance) |
| `artDirectionMetrics.humanDecisionCount` | `0` |
| `artDirectionMetrics.missingHumanDecisionCount` | `2` |
| `factualExportMetrics` | Separate block with export-safety counters at 0 |
| `sampleGuidance[0].additionalNeeded` | `5` |
| `acceptedGaps` includes `synthetic_fixture` | yes |
| `requirements` include `human_needed` | CALIB-03 and CALIB-04 both `human_needed` |
| Blended fields absent | no `overallPass`, `qualityScore`, etc. |

### Full verification chain

```bash
cd app && npx tsx scripts/build-olhar-release-evidence.ts --calibration ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json
node app/scripts/check-olhar-release-evidence.mjs --evidence .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json --skip-tests
```

**Result:** build exit 0, checker exit 0, status `human_needed`.
