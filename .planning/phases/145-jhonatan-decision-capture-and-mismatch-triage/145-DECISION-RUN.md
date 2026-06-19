# Phase 145 — Operator Decision Capture Run

Captured: 2026-06-19
Status: **human_needed** — awaiting Jhonatan `entra` / `quase` / `nao_entra` decisions

## Source label caveat

Both contact-sheet rows are **`synthetic_fixture`** (Phase 144 corpus manifest). They exercise the operator calibration loop only — not real customer evidence. Agreement rate and quality claims remain withheld until sample guidance clears (5 decisions required).

## Decision input contract

| Field | Required | Notes |
| --- | --- | --- |
| `derivationId` | yes | Must match a `review_ready` row in `142-CENBRAP-CALIBRATION.json` |
| `decision` | yes | `entra`, `quase`, or `nao_entra` |
| `mismatchBucket` | when disagreeing | One of the normalized buckets in `145-DECISIONS.template.json` |
| `note` | optional | Free-text operator note |
| `reviewer` | yes | `Jhonatan` |
| `reviewedAt` | yes | ISO-8601 timestamp |

Template: `145-DECISIONS.template.json` — copy to `145-DECISIONS.json` and fill decisions. **Do not fabricate decisions.**

## Contact sheet rows (pre-filled context)

| Campaign | Derivation | Olhar | Export | Source |
| --- | --- | --- | --- | --- |
| Cenbrap Calibration — NR1 Convite | `a92788f7-18d7-4289-99eb-bab8a0fa2f80` | `pronta` | `ajuste_menor` | `synthetic_fixture` |
| Cenbrap Calibration — NR1 Gestalt | `01faf2a6-7808-406b-aeff-efd0169be9a1` | `quase` | `ok` | `synthetic_fixture` |

## Recording path

Canonical persistence: `output_decision_events` via `recordOutputDecisionEvidence`.

Script: `app/scripts/record-cenbrap-calibration-decisions.ts`

Behavior:

- Default `--dry-run` (no `--confirm`) — validates derivation ids against calibration JSON, reports pending rows.
- `--confirm` writes `output_decision_events` via `recordOutputDecisionEvidence`.
- Reviewer resolved by `--reviewer-email` or `reviewerEmail` in decisions file (default `dev@adscale.local`).
- Duplicate apply with same idempotency key is skipped (`skipped_existing`).

Mapping:

- `entra` → `approved`
- `quase` → `rejected` + reason code `quase`
- `nao_entra` → `rejected` + reason code `nao_entra`

Event snapshots include sanitized `olharVerdict`, `exportStatus`, reason code/text and mismatch bucket (in `reason.source` when provided).

Idempotency key: `phase145:cenbrap-calibration:{derivationId}:{reviewer}`

## Commands

```bash
# Validate structure (default dry-run; no DB writes)
cd app && npx tsx scripts/record-cenbrap-calibration-decisions.ts --dry-run

# Apply after 145-DECISIONS.json is filled
cd app && npx tsx scripts/record-cenbrap-calibration-decisions.ts --confirm --input ../.planning/phases/145-jhonatan-decision-capture-and-mismatch-triage/145-DECISIONS.json
```

## Event ids

| Derivation | decisionEventId | reviewer | reviewedAt |
| --- | --- | --- | --- |
| `a92788f7` | pending | — | — |
| `01faf2a6` | pending | — | — |

## Metrics expectation

`missingHumanDecisionCount` in `142-CENBRAP-CALIBRATION.json` is **2** until decisions are recorded and calibration is re-run (Phase 145-02). `decisionCount` remains **0** until then.

## Secret scan

_Pending — completed in task 145-01-03._
