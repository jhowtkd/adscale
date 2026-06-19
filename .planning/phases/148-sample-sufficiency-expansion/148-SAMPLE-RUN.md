# Phase 148 — Sample Sufficiency Run

Captured: 2026-06-19
Status: **expanding** — inventory recorded; human decisions still absent

## Task 148-01-01 — Current sample inventory

**Inspection command:**

```bash
cd app && npx tsx scripts/seed-cenbrap-calibration-corpus.ts --inspect-only
```

**Inspection captured:** 2026-06-19T21:57:55.868Z

| Metric | Value |
| --- | ---: |
| Workspaces scanned | 2 |
| Candidate Cenbrap campaigns | 2 |
| Campaigns with output derivations | 2 |
| Campaigns with dual verdict coverage | 2 |

### Row inventory

| Category | Count | Notes |
| --- | ---: | --- |
| Reviewable rows (`review_ready`, dual verdict) | 2 | Both `manual_pending` |
| Rows with human decisions | 0 | No `output_decision_events` for calibration rows |
| Rows still `manual_pending` | 2 | Awaiting Jhonatan `entra` / `quase` / `nao_entra` |
| Rows missing human decision (of reviewable) | 2 | Matches `missingHumanDecisionCount` in calibration JSON |

### Sample guidance (baseline)

| Metric | Value |
| --- | --- |
| Human decision sample | **0/5** |
| `additionalNeeded` | 5 |
| `agreementRate` | null (withheld) |
| `comparableCount` | 0 |
| `humanDecisionCount` | 0 |

**Baseline rule:** Sample guidance is **0/5**, not 2/5. Reviewable rows without recorded operator decisions do not count toward sample sufficiency.

### Source composition (pre-expansion)

| Source label | Reviewable rows | Customer-real evidence? |
| --- | ---: | --- |
| `synthetic_fixture` | 2 | No — operational calibration only |
| `operator_imported` | 0 | — |
| `real_customer` | 0 | — |

### Reviewable rows (pre-expansion)

| Campaign | Derivation ID | Olhar | Export | humanDecision | Source |
| --- | --- | --- | --- | --- | --- |
| Cenbrap Calibration — NR1 Convite | `a92788f7-18d7-4289-99eb-bab8a0fa2f80` | `pronta` | `ajuste_menor` | `manual_pending` | `synthetic_fixture` |
| Cenbrap Calibration — NR1 Gestalt | `01faf2a6-7808-406b-aeff-efd0169be9a1` | `quase` | `ok` | `manual_pending` | `synthetic_fixture` |

### Operator decision artifacts

| Artifact | Status |
| --- | --- |
| `145-DECISIONS.json` | **Absent** — no operator judgments supplied |
| `145-DECISIONS.template.json` | Present — 2 rows, all `decision: null` |

### Blocker assessment (pre-expansion)

- **Operator decisions:** `human_needed` — Jhonatan has not supplied decisions for existing rows.
- **Row sufficiency:** Only 2 reviewable rows exist; minimum sample requires 5 rows with human decisions.
- **Customer-real inputs:** No safe `operator_imported` or `real_customer` rows available in corpus inspection.
- **Next action:** Expand fixture corpus by 3 additional `synthetic_fixture` rows (Phase 148-01-02), then prepare decision template covering all 5 rows.
