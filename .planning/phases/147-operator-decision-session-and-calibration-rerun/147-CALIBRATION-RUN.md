# Phase 147 — Calibration Rerun Log

Captured: 2026-06-19
Status: **human_needed** — rerun completed; operator decisions still absent

## Decision session context (147-01)

| Artifact | Status |
| --- | --- |
| `145-DECISIONS.json` | **Absent** — no operator judgments supplied |
| `145-DECISIONS.template.json` | 2 rows, `decision: null` |
| Recorder `--confirm` | Skipped per stop condition |

Expected outcome: calibration rerun refreshes live metrics but remains `human_needed` until Jhonatan supplies decisions.

## Task 147-02-01 — Calibration rerun

**Command:**

```bash
cd app && npx tsx scripts/run-cenbrap-calibration.ts \
  --output ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json \
  --contact-sheet ../.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md
```

**Exit code:** 0

**Output:** `Status=insufficient_sample campaigns=2 derivations=2 decisions=0`

### Metrics before (pre-rerun baseline)

Source: `142-CENBRAP-CALIBRATION.json` captured `2026-06-19T17:54:36.476Z` (Phase 146 evidence refresh baseline)

| Metric | Value |
| --- | ---: |
| `humanDecisionCount` / `decisionCount` | 0 |
| `missingHumanDecisionCount` | 2 |
| `comparableCount` | 0 |
| `agreementRate` | null |
| `mismatchReasonCounts` | `{}` |
| sample guidance | 0/5 (`additionalNeeded=5`) |
| calibration status | `insufficient_sample` |

### Metrics after (post-rerun)

Source: `142-CENBRAP-CALIBRATION.json` captured `2026-06-19T21:12:48.318Z`

| Metric | Value | Delta |
| --- | ---: | --- |
| `humanDecisionCount` / `decisionCount` | 0 | unchanged |
| `missingHumanDecisionCount` | 2 | unchanged |
| `comparableCount` | 0 | unchanged |
| `agreementRate` | null | withheld (correct) |
| `mismatchReasonCounts` | `{}` | unchanged |
| sample guidance | 0/5 (`additionalNeeded=5`) | unchanged |
| calibration status | `insufficient_sample` | unchanged |

**Interpretation:** Rerun against live mode succeeded. Metrics correctly remain `human_needed` because `145-DECISIONS.json` is absent and no decision events were persisted. No agreement or quality claims introduced.

### Artifacts updated

- `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json`
- `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md`

Both rows remain `manual_pending`:

| Campaign | Derivation ID | humanDecision |
| --- | --- | --- |
| Cenbrap Calibration — NR1 Convite | `a92788f7-18d7-4289-99eb-bab8a0fa2f80` | `manual_pending` |
| Cenbrap Calibration — NR1 Gestalt | `01faf2a6-7808-406b-aeff-efd0169be9a1` | `manual_pending` |

## Task 147-02-02 — Release evidence rebuild

**Build command:**

```bash
cd app && npm run olhar-release-evidence:build
```

**Exit code:** 0

**Output:** `Status=human_needed Campaigns=2 derivations=2 decisions=0 agreementRate=null`

**Checker command:**

```bash
node app/scripts/check-olhar-release-evidence.mjs \
  --evidence .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json \
  --skip-tests
```

**Checker result:** exit 0 — `Olhar release evidence check passed. Status: human_needed`

### Evidence metrics (post-rebuild)

Captured: `2026-06-19T21:13:42.047Z`

| Field | Value |
| --- | --- |
| `status` | `human_needed` |
| `humanDecisionCount` | 0 |
| `missingHumanDecisionCount` | 2 |
| `agreementRate` | null (withheld — `additionalNeeded=5`) |
| `mismatchReasonCounts` | `{}` |
| `qualityImprovementClaimed` | null |

**Claims gate:** `agreementRate` correctly withheld while sample guidance shows `0/5 (need 5 more)`. No agreement or quality claim introduced.

### Focused tests

```bash
cd app && npm test -- src/server/olhar-calibration/cenbrap-calibration.test.ts src/server/olhar-calibration/olhar-release-evidence.test.ts
```

**Result:** 22 passed (2 files)

### Artifacts updated

- `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json`
