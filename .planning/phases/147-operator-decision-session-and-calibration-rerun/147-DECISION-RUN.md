# Phase 147 — Operator Decision Session Run

Captured: 2026-06-19
Status: **human_needed** — awaiting Jhonatan `entra` / `quase` / `nao_entra` decisions

## Reconciliation (147-01-01)

**Input artifacts checked:**

| Artifact | Status |
| --- | --- |
| `142-CONTACT-SHEET.md` | 2 rows, both `manual_pending` |
| `142-CENBRAP-CALIBRATION.json` | 2 derivations, `missingHumanDecisionCount=2` |
| `145-DECISIONS.template.json` | Present — 2 rows with `decision: null` |
| `145-DECISIONS.json` | **Absent** — operator has not supplied decisions |

**Review-ready rows awaiting Jhonatan:**

| Campaign | Derivation ID | Olhar (evidence) | Export (evidence) | humanDecision | Blocker |
| --- | --- | --- | --- | --- | --- |
| Cenbrap Calibration — NR1 Convite | `a92788f7-18d7-4289-99eb-bab8a0fa2f80` | `pronta` | `ajuste_menor` | `manual_pending` | `human_needed` |
| Cenbrap Calibration — NR1 Gestalt | `01faf2a6-7808-406b-aeff-efd0169be9a1` | `quase` | `ok` | `manual_pending` | `human_needed` |

**Decision id alignment:** Both derivation ids in `145-DECISIONS.template.json` match `142-CENBRAP-CALIBRATION.json` operator rows.

**Operator action required:**

1. Copy `145-DECISIONS.template.json` → `145-DECISIONS.json`
2. Fill `decision` (`entra` \| `quase` \| `nao_entra`), `reviewedAt` (ISO-8601), optional `mismatchBucket` and `note` per row
3. Re-run recorder with `--confirm` (Phase 147-01-02 or operator session)

**Constraints honored:** No decisions pre-filled from `olharVerdict` or `exportStatus`. System verdicts listed above are evidence context only.

**Source label:** Both rows are `synthetic_fixture` — operational calibration, not customer-real evidence.
