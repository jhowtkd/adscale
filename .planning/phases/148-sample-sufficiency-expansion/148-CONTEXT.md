---
phase: 148
slug: sample-sufficiency-expansion
status: planning
created: 2026-06-19
depends_on:
  - 147
requirements:
  - SAMPLE-01
  - SAMPLE-02
  - SAMPLE-03
  - SAMPLE-04
---

# Phase 148 - Context

## Goal

Atingir a amostra minima de 5 decisoes humanas para liberar metricas de acordo do Olhar Cenbrap, ou documentar com precisao por que a amostra ainda esta indisponivel.

## Why Now

Phase 147 validou o workflow de decisao e rerodou calibracao/evidencia, mas a verdade operacional ainda e:

- `humanDecisionCount=0`.
- `missingHumanDecisionCount=2`.
- `comparableCount=0`.
- `agreementRate=null`.
- sample guidance `0/5` (`additionalNeeded=5`).
- as rows atuais sao `synthetic_fixture`.

Sem expandir a amostra, o produto continua com gate honesto, mas sem base para dizer se o Olhar concorda com o criterio humano.

## Current Truth

Observed on 2026-06-19:

- Existem 2 rows `review_ready` e `manual_pending`.
- `145-DECISIONS.json` ainda esta ausente.
- `record-cenbrap-calibration-decisions.ts` pode persistir decisoes quando Jhonatan preencher o artifact.
- `seed-cenbrap-calibration-corpus.ts` consegue inspecionar e semear o corpus atual, mas o fixture existente cobre apenas 2 campanhas/derivacoes.
- Phase 149 deve tratar customer-real corpus. Phase 148 pode preparar rows revisaveis adicionais, mas nao pode chama-las de customer-real se forem fixture/import operacional.

## Phase Boundary

This phase must deliver:

1. Um plano/execucao para chegar a 5 rows revisaveis com decisoes humanas, ou blocker typed se isso nao for possivel agora.
2. Source composition explicita para cada row (`synthetic_fixture`, `operator_imported`, `real_customer`).
3. Rerun de calibracao/evidencia mantendo claims withheld enquanto `additionalNeeded > 0`.
4. Um audit de sample guidance que diga exatamente o que falta para liberar agreement metrics.

## Non-Goals

- Do not claim art-direction agreement before 5 human decisions.
- Do not treat synthetic fixtures as customer-real evidence.
- Do not build a taste profile or dashboard.
- Do not perform prompt/rubric calibration from zero comparable rows.
- Do not bypass Jhonatan decisions with system verdicts.

## Evidence Principle

Sample sufficiency is a gate, not a decoration. A larger corpus only matters if rows are reviewable, source-labeled and judged by the human calibration authority.
