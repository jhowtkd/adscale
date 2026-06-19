---
phase: 145
slug: jhonatan-decision-capture-and-mismatch-triage
status: planning
created: 2026-06-19
depends_on:
  - 144
requirements:
  - JUDGE-01
  - JUDGE-02
  - JUDGE-03
  - JUDGE-04
---

# Phase 145 - Context

## Goal

Transformar o contact sheet em calibracao humana: Jhonatan decide `entra`, `quase` ou `nao_entra` nas linhas `review_ready`, e o sistema classifica acordo/desacordo sem transformar amostra pequena em claim de qualidade.

## Why Now

Phase 144 desbloqueou a captura humana:

- `142-CENBRAP-CALIBRATION.json` esta em `mode=live`.
- `evaluatedCampaignCount=2`.
- `evaluatedDerivationCount=2`.
- `review_ready=2`.
- `missingDualVerdictCount=0`.
- `decisionCount=0`.
- `agreementRate` permanece withheld por falta de decisoes.

A ressalva importante: as duas linhas sao `synthetic_fixture`. Elas servem para calibracao operacional do loop, nao para claim de qualidade sobre cliente real.

## Current Truth

Observed on 2026-06-19:

- `142-CONTACT-SHEET.md` tem 2 linhas `manual_pending`.
- `output_decision_events` e a fonte canonica para decisoes humanas.
- `recordOutputDecisionEvidence` ja grava eventos append-only com snapshot sanitizado.
- A rota `PATCH /api/derivations/[id]/review` ja mapeia:
  - `entra` -> `approved`;
  - `quase_regenerar` -> `rejected` + decision code;
  - `nao_entra` -> `rejected` + decision code.
- `normalizeHumanDecisionFromEvent` ja converte eventos para `entra`, `quase` e `nao_entra`.
- `classifyAgreement` ja calcula `agree`, `mismatch`, `missing_dual_verdict` e `missing_human_decision`.

## Phase Boundary

This phase must deliver:

1. Um mecanismo operador para registrar as decisoes de Jhonatan nas 2 linhas `review_ready`.
2. Persistencia canonica em `output_decision_events`, ou normalizacao explicita no artifact se a captura for manual/offline.
3. Mismatch reasons normalizados em buckets acionaveis.
4. Re-run da calibracao live mostrando `decisionCount > 0`, `missingHumanDecisionCount` atualizado e metricas comparaveis.
5. Gate honesto: `agreementRate` pode aparecer como metric interna de linhas comparaveis, mas claim de qualidade permanece withheld enquanto sample guidance exigir 5 decisoes.

## Non-Goals

- Do not create a taste profile product.
- Do not claim production-quality agreement from `synthetic_fixture` rows.
- Do not refresh final release claims; that is Phase 146.
- Do not store prompt text, signed URLs or raw output keys in planning artifacts.
- Do not overwrite system `olharVerdict` / `exportStatus` with Jhonatan's decision.

## Evidence Principle

The human decision is the calibration authority. The system verdict is evidence under test.

Phase 145 is successful if it captures Jhonatan's judgment cleanly and makes disagreements legible. It is not successful if it turns two synthetic rows into a quality claim.
