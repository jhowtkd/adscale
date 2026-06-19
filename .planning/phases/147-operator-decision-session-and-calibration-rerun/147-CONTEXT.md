---
phase: 147
slug: operator-decision-session-and-calibration-rerun
status: planning
created: 2026-06-19
depends_on:
  - 146
requirements:
  - HUMDEC-01
  - HUMDEC-02
  - HUMDEC-03
  - HUMDEC-04
---

# Phase 147 - Context

## Goal

Capturar ou bloquear explicitamente as decisoes do Jhonatan nas linhas `review_ready`, persistir eventos de decisao com seguranca e rerodar a calibracao para transformar `missing_human_decision` em metricas comparaveis.

## Why Now

v12.8 fechou a infraestrutura e o claims gate, mas a evidencia final ainda esta em `human_needed`:

- `humanDecisionCount=0`.
- `missingHumanDecisionCount=2`.
- `comparableCount=0`.
- `agreementRate=null`.
- sample guidance `0/5`.
- corpus atual `synthetic_fixture`.

Sem esta fase, o produto continua honesto mas sem aprendizado humano real.

## Current Truth

Observed on 2026-06-19:

- `.planning/phases/145-jhonatan-decision-capture-and-mismatch-triage/145-DECISIONS.template.json` exists for operator input.
- `app/scripts/record-cenbrap-calibration-decisions.ts` exists and supports dry-run / confirm.
- `142-CONTACT-SHEET.md` has 2 review-ready/manual-pending rows.
- `142-EVIDENCE.json` status is `human_needed`.
- `146-CLAIMS-GATE.md` forbids agreement and quality claims until decisions and sample guidance clear.

## Phase Boundary

This phase must deliver:

1. A concrete operator decision artifact or explicit `manual_pending` blocker per row.
2. Idempotent persistence of decisions via the existing recorder when decisions are provided.
3. Calibration rerun after decision persistence.
4. Evidence/verification showing updated counters or a truthful `human_needed` carry-forward.

## Non-Goals

- Do not fabricate Jhonatan decisions.
- Do not chase 5-sample sufficiency; that is Phase 148.
- Do not replace `synthetic_fixture` with customer-real rows; that is Phase 149.
- Do not claim agreement or quality improvement in this phase.

## Evidence Principle

The system can prepare and verify the operator workflow. Only Jhonatan can supply the calibration judgment.
