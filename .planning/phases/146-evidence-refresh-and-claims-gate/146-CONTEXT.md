---
phase: 146
slug: evidence-refresh-and-claims-gate
status: planning
created: 2026-06-19
depends_on:
  - 145
requirements:
  - CLAIM-01
  - CLAIM-02
  - CLAIM-03
  - CLAIM-04
---

# Phase 146 - Context

## Goal

Atualizar a evidencia de release do Olhar Cenbrap a partir da calibracao live e fechar v12.8 com linguagem honesta: `ok`, `human_needed`, `insufficient_sample` ou `tech_debt`, sem score unico que misture direcao de arte com seguranca de exportacao.

## Why Now

Phase 145 entregou o caminho tecnico para capturar decisoes do Jhonatan e normalizar mismatch buckets, mas a verdade atual ainda e:

- `decisionCount=0`.
- `missingHumanDecisionCount=2`.
- `comparableCount=0`.
- `agreementRate=null`.
- `sampleGuidance.calibration_global.current=0`.
- `sampleGuidance.calibration_global.additionalNeeded=5`.
- As 2 linhas revisaveis sao `synthetic_fixture`, suficientes para testar o loop operacional, nao para claim de qualidade de cliente.

Isso significa que a proxima fase pode refrescar a evidencia e provar que os gates estao corretos, mas nao pode declarar acordo criativo nem melhoria de qualidade enquanto a amostra humana nao existir.

## Current Truth

Observed on 2026-06-19:

- `142-CENBRAP-CALIBRATION.json` esta em `mode=live` com `evaluatedCampaignCount=2` e `evaluatedDerivationCount=2`.
- `142-CONTACT-SHEET.md` tem 2 linhas `review_ready` / `manual_pending`.
- `olhar-release-evidence.ts` ja separa `artDirectionMetrics` de `factualExportMetrics`.
- `check-olhar-release-evidence.mjs` aceita `human_needed`, `insufficient_sample`, `template` e `tech_debt` como status validos.
- O checker rejeita `agreementRate` quando sample guidance ainda exige decisoes adicionais.
- Phase 145 terminou como `manual_decisions_missing + metrics_ready_claims_withheld`.

## Phase Boundary

This phase must deliver:

1. Evidencia JSON refrescada a partir da calibracao live, nao da evidencia template.
2. Gate que preserve `human_needed` enquanto decisoes humanas estiverem ausentes.
3. Audit que separe:
   - seguranca factual/exportacao;
   - acordo de direcao de arte;
   - suficiencia de amostra;
   - caveat `synthetic_fixture`.
4. Atualizacao de PROJECT/ROADMAP/STATE/MILESTONES com fechamento ou carry-forward explicito da divida v12.7/v12.8.

## Non-Goals

- Do not fabricate Jhonatan decisions.
- Do not mark `CLAIM-*` complete from template evidence alone.
- Do not collapse factual/export pass into art-direction agreement.
- Do not claim customer-quality improvement from `synthetic_fixture` rows.
- Do not build a dashboard, taste profile or multi-client voice system.

## Evidence Principle

`human_needed` is a truthful release state, not a failure to hide. The system is acceptable only if it refuses to make the claim when the evidence is not there.
