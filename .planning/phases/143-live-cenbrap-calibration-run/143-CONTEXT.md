---
phase: 143
slug: live-cenbrap-calibration-run
status: planning
created: 2026-06-19
depends_on:
  - 142
requirements:
  - CENLIVE-01
  - CENLIVE-02
  - CENLIVE-03
  - CENLIVE-04
---

# Phase 143 - Context

## Goal

Rodar a calibracao Cenbrap contra ambiente real e substituir a evidencia template por artefatos com campanhas/derivacoes reais, ou registrar um blocker operacional tipado que explique exatamente o que falta.

## Why Now

v12.7 entregou a infraestrutura do Olhar ADScale: constituicao, voz Cenbrap, dual verdict, export validator, advisor reescrito, review surface e pipeline de evidencia. O audit fechou como `tech_debt` porque a prova que importa ainda nao aconteceu:

- `142-CENBRAP-CALIBRATION.json` live nao existe.
- `142-CENBRAP-CALIBRATION.template.json` tem `mode=template` e `evaluatedCampaignCount=0`.
- `142-CONTACT-SHEET.md` tem placeholder `manual_pending`.
- `humanDecisionCount=0` e `agreementRate=null`.

Phase 143 nao deve inventar mais teoria de design. Ela deve forcar o sistema a encarar campanhas reais Cenbrap e revelar se o corpus esta pronto para julgamento humano.

## Current Truth

Observed on 2026-06-19:

- `app/scripts/run-cenbrap-calibration.ts` ja executa o caminho live quando chamado sem `--template`.
- O mesmo script tambem cai para template quando a DB falha; portanto a validacao precisa checar `mode`, contadores e notas, nao apenas exit code.
- `app/src/server/olhar-calibration/service.ts` varre workspaces, seleciona campanhas por sinais Cenbrap, le derivacoes e junta `output_decision_events`.
- O pipeline ja renderiza JSON e contact sheet seguros, sem depender de prompt ou signed URL.
- A evidencia v12.7 separa art-direction agreement de factual/export safety e bloqueia claims com amostra insuficiente.

## Phase Boundary

This phase must deliver:

1. Um run live do script sem `--template`, com `DATABASE_URL` apontando para ambiente real, ou um blocker operacional explicito.
2. `142-CENBRAP-CALIBRATION.json` com `mode=live` e pelo menos duas campanhas Cenbrap, ou uma classificacao `insufficient_campaigns`.
3. `142-CONTACT-SHEET.md` com linhas reais, refs seguras, dual verdict, export status, package eligibility e override markers.
4. Contagem e roteamento de linhas sem dual verdict (`missing_dual_verdict`) sem inferir julgamento.
5. Registro em `143-LIVE-RUN.md` / `143-BLOCKERS.md` do que foi provado, bloqueado ou enviado para Phase 144.

## Non-Goals

- Do not capture Jhonatan's final `entra/quase/nao_entra` decisions here; that is Phase 144.
- Do not regenerate final release evidence claims; that is Phase 145.
- Do not change the Olhar constitution, advisor voice or generation prompt unless the live run exposes a hard compatibility bug.
- Do not fabricate campaigns, decisions or agreement rates.

## Evidence Principle

Exit code zero is not enough.

The phase only counts as operationally useful if the artifact proves one of two things:

- `live_ready`: real Cenbrap rows exist and can be reviewed by Jhonatan.
- `blocked_with_cause`: the environment, data or verdict coverage is insufficient, with exact next action.

Anything else is another template pass disguised as progress.
