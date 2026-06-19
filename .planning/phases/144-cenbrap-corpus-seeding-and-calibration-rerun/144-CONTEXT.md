---
phase: 144
slug: cenbrap-corpus-seeding-and-calibration-rerun
status: planning
created: 2026-06-19
depends_on:
  - 143
requirements:
  - CORPUS-01
  - CORPUS-02
  - CORPUS-03
  - CORPUS-04
---

# Phase 144 - Context

## Goal

Desbloquear a calibracao humana criando ou identificando um corpus Cenbrap real, revisavel e seguro: pelo menos duas campanhas com derivacoes, refs seguras, dual verdict e contact sheet `review_ready`.

## Why Now

Phase 143 provou que o pipeline live funciona, mas tambem provou que a base conectada esta vazia para Cenbrap:

- `142-CENBRAP-CALIBRATION.json` agora existe e tem `mode=live`.
- O status do artifact e `no_live_data`.
- `evaluatedCampaignCount=0`, `evaluatedDerivationCount=0`, `decisionCount=0`.
- `143-BLOCKERS.md` classifica o resultado como `insufficient_campaigns`.
- Phase 144 original, de decisao do Jhonatan, esta bloqueada porque `review_ready=0`.

Sem corpus, pedir `entra/quase/nao_entra` vira teatro. A proxima fase precisa produzir linhas reais ou declarar, com evidencia, que o ambiente escolhido nao pode sustentar a calibracao.

## Current Truth

Observed on 2026-06-19:

- `app/scripts/run-cenbrap-calibration.ts` executa live sem `--template` e grava os artifacts canonicos de Phase 142.
- `app/src/server/olhar-calibration/service.ts` varre workspaces e seleciona campanhas por sinais conservadores de Cenbrap.
- `app/src/server/repositories/campaign.ts` expoe `createCampaign` e `getCampaigns`.
- `app/src/server/repositories/derivation.ts` expoe `createDerivation`, `updateDerivationStatus` e `updateDerivationDualVerdict`.
- Seed scripts existentes (`seed-visual-foundations.ts`, `seed-testsprite.ts`) mostram o padrao local para fixtures idempotentes, mas nao devem ser confundidos com evidencia de cliente real.

## Phase Boundary

This phase must deliver:

1. Uma decisao explicita sobre a fonte do corpus: campanhas reais existentes, import manual controlado, ou fixtures operacionais marcadas como synthetic.
2. Pelo menos duas campanhas Cenbrap no ambiente de calibracao com derivacoes e `outputKey` seguro, ou blocker `operator_data_unavailable`.
3. Dual verdict (`olharVerdict` + `exportStatus`) presente nas linhas que serao julgadas por Jhonatan, ou roteamento para QA/regeneration antes de julgamento.
4. Re-run da calibracao live gerando `evaluatedCampaignCount >= 2` e `review_ready > 0`, ou blocker atualizado.
5. `144-CORPUS-RUN.md` documentando o que foi criado, importado, excluido e por que.

## Non-Goals

- Do not record Jhonatan's final decisions here; that moves to Phase 145.
- Do not claim quality agreement or improvement.
- Do not use synthetic fixtures as if they were real customer evidence.
- Do not write secrets, prompts or signed URLs into planning artifacts.
- Do not broaden this into a generic corpus admin UI.

## Evidence Principle

The product needs a real review surface, not a green script.

Phase 144 succeeds only if the contact sheet has rows that a designer can actually judge, or if the blocker explains why the selected environment cannot provide them.
