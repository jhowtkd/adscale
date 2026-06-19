---
phase: 147
slug: operator-decision-session-and-calibration-rerun
status: planning
created: 2026-06-19
---

# Phase 147 - Research

## Inputs Reviewed

| Source | What It Proves |
|--------|----------------|
| `.planning/phases/146-evidence-refresh-and-claims-gate/146-CLAIMS-GATE.md` | Current canonical status is `human_needed`; claims are forbidden until decisions/sample sufficiency. |
| `.planning/phases/146-evidence-refresh-and-claims-gate/146-VERIFICATION.md` | Phase 146 goal was achieved; remaining blocker is human operator decisions. |
| `.planning/milestones/v12.8-MILESTONE-AUDIT.md` | v12.8 closes as `tech_debt`; carry-forward is missing decisions, sample 0/5, fixture source limitation. |
| `.planning/phases/145-jhonatan-decision-capture-and-mismatch-triage/145-DECISION-RUN.md` | Decision recorder workflow exists but decisions were not provided. |
| `app/scripts/record-cenbrap-calibration-decisions.ts` | Existing CLI is the correct persistence path for Jhonatan decisions. |
| `app/scripts/run-cenbrap-calibration.ts` | Existing CLI reruns calibration and writes calibration/contact-sheet artifacts. |
| `app/scripts/build-olhar-release-evidence.ts` | Existing CLI rebuilds release evidence from live calibration. |

## Current Data Contract

Decision flow:

1. Operator fills `145-DECISIONS.json` from `145-DECISIONS.template.json`.
2. Recorder validates derivation ids against `142-CENBRAP-CALIBRATION.json`.
3. Recorder persists canonical `output_decision_events` with idempotency.
4. Calibration rerun reads decision events and updates metrics.
5. Evidence builder refreshes `142-EVIDENCE.json`.
6. Checker validates honest status.

Expected outcomes:

- If decisions remain absent: status stays `human_needed`; Phase 147 records a human blocker.
- If 1-2 decisions are recorded: `humanDecisionCount` increases; sample may still be `insufficient_sample` or `human_needed` depending remaining rows.
- `agreementRate` remains `null` until sample guidance has `additionalNeeded=0`.

## Validation Architecture

Phase 147 validation should combine:

- artifact inspection for `145-DECISIONS.json` or explicit pending/blocker state;
- recorder dry-run and confirm when decisions exist;
- calibration rerun;
- evidence rebuild/check;
- secret scan over planning artifacts.

The validation must treat missing operator input as a truthful human gate, not as permission to fabricate data.

## Risks

| Risk | Mitigation |
|------|------------|
| Automation fabricates Jhonatan decisions to pass the phase | Stop condition: no decision may be inferred from system verdict. |
| Phase appears failed when decisions are simply unavailable | Verification must allow `human_needed` carry-forward with exact blocker. |
| Duplicate decision events skew metrics | Use idempotency and latest-event behavior; inspect recorder output. |
| Sensitive data leaks into planning artifacts | Run targeted scans for `DATABASE_URL`, signed URL patterns and prompt payload markers. |
