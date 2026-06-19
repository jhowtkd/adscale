---
phase: 145
slug: jhonatan-decision-capture-and-mismatch-triage
status: planning
created: 2026-06-19
---

# Phase 145 - Research

## Code Map

| Area | Files | Current Capability | Phase 145 Use |
| --- | --- | --- | --- |
| Contact sheet | `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` | Lists 2 `manual_pending` rows with system verdict context | Operator input surface for Jhonatan's decisions |
| Calibration JSON | `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json` | Live report with rows, metrics and sample guidance | Source ids and post-decision metric target |
| Decision events | `app/src/server/repositories/output-decision-event.ts` | Append-only insert/list of `output_decision_events` | Canonical persistence path |
| Decision recorder | `app/src/server/output-learning/output-decision-recorder.ts` | Validates ownership and writes sanitized event snapshots | Reuse for script/API decision capture |
| Review API | `app/src/app/api/derivations/[id]/review/route.ts` | Maps review decisions to status and output decision events | Existing user-facing path; reference semantics |
| Calibration domain | `app/src/server/olhar-calibration/cenbrap-calibration.ts` | Normalizes events, classifies agreement/mismatch and renders contact sheet | Recompute metrics after decisions |
| Corpus manifest | `.planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-MANIFEST.json` | Labels rows as `synthetic_fixture` | Preserve evidence strength caveat |

## Current Row Set

Phase 144 produced two reviewable rows:

| Campaign | Derivation | Olhar | Export | Source |
| --- | --- | --- | --- | --- |
| Cenbrap Calibration — NR1 Convite | `a92788f7-18d7-4289-99eb-bab8a0fa2f80` | `pronta` | `ajuste_menor` | `synthetic_fixture` |
| Cenbrap Calibration — NR1 Gestalt | `01faf2a6-7808-406b-aeff-efd0169be9a1` | `quase` | `ok` | `synthetic_fixture` |

Both rows are package eligible and have safe `derivation:` output refs. Both are `manual_pending`.

## Decision Semantics

Operator vocabulary:

- `entra`: the piece is acceptable enough to enter the delivery/review path.
- `quase`: the piece has direction but needs correction/regeneration.
- `nao_entra`: the piece should not enter; direction is not acceptable.

Existing event mapping:

- `approved` normalizes to `entra`.
- `rejected` + reason code `quase_regenerar` or `quase` normalizes to `quase`.
- `rejected` + reason code `nao_entra` normalizes to `nao_entra`.
- `regenerated` normalizes to `quase`.

## Mismatch Buckets

Phase 145 needs actionable buckets, not free-form drift:

- `system_too_permissive`: system says `pronta/quase`, Jhonatan says `nao_entra`.
- `system_too_harsh`: system blocks or doubts, Jhonatan says `entra`.
- `voice_nuance`: decision differs because Cenbrap tone/authority/people treatment feels off.
- `export_setup_issue`: disagreement is about export/compliance/setup, not art direction.
- `acceptable_override`: Jhonatan intentionally accepts a known blocked/weak row.
- `unclear_sample`: row is too synthetic/ambiguous to calibrate confidently.

The bucket can live in `contextSnapshot.reason.code` and/or post-calibration artifact, but it must not erase the original human decision.

## Risks

| Risk | Why It Matters | Handling |
| --- | --- | --- |
| Decisions recorded only in markdown | Re-run cannot compute metrics canonically | Prefer `output_decision_events`; if manual artifact is used, normalize it explicitly |
| `synthetic_fixture` rows treated as customer proof | Claims become dishonest | Preserve source label in artifacts and Phase 146 gate |
| Approval mutates derivation status unexpectedly | Calibration may alter fixture state | If using a script, consider direct event recording instead of review PATCH when status mutation is unnecessary |
| Mismatch reason text is unstructured | No actionable learning loop | Require one normalized bucket plus optional note |
| Sample remains below 5 decisions | Agreement claim blocked | Keep `qualityImprovementClaimed` and public claim withheld |

## Recommended Implementation Shape

1. Add a small operator decision artifact or script:
   - reads the current calibration JSON;
   - accepts decisions for the two `manual_pending` derivations;
   - writes canonical `output_decision_events` through `recordOutputDecisionEvidence`;
   - uses idempotency keys to avoid duplicate decisions.
2. Re-run `run-cenbrap-calibration.ts` without `--template`.
3. Inspect metrics:
   - `decisionCount`;
   - `comparableCount`;
   - `agreementCount`;
   - `mismatchCount`;
   - `missingHumanDecisionCount`;
   - `mismatchReasonCounts`.
4. Write `145-DECISION-RUN.md` with source label caveats, reviewer, reviewedAt and sample guidance.

## Validation Architecture

Automated:

- Unit tests for decision normalization/mismatch buckets if new mapping code is added.
- Script dry-run validates decisions without DB writes.
- Script apply path records events idempotently.
- Live calibration rerun shows decisions in report.
- Secret scan confirms no prompt/signed URL/DB URL in artifacts.

Manual:

- Jhonatan supplies/approves the actual `entra/quase/nao_entra` decisions.
- Jhonatan confirms mismatch bucket text when there is disagreement.
- Operator acknowledges `synthetic_fixture` evidence strength before Phase 146.
