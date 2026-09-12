# Decisão: a leitura do funil não libera superfície nova

**Data:** 2026-09-12
**Status:** Aprovada neste commit
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)
**Runbook preenchido:** [`docs/runbooks/progressive-studio-rollout.md`](../runbooks/progressive-studio-rollout.md)
**Snapshot lido:** [`.planning/convergence/baseline.json`](../../.planning/convergence/baseline.json) (`capturedAt` 2026-07-14T23:31:09.469Z)
**Encerramento histórico:** Gate 8 permanece `approved_with_accepted_debt` (1/10). Este arquivo não reabre nem reescreve esse encerramento.

## O que foi lido

Leitura única do funil a partir de artefatos já commitados. Sem consulta a produção, sem números inventados, sem preencher taxa de sessão do Estúdio a partir de `campaign.completed`.

| Origem | Unidade | started | completed | failed | abandoned | mediana (completed) |
| --- | --- | --- | --- | --- | --- | --- |
| `campaign` | `campaign` | 18 | 12 | 1 | unavailable (status sem `abandoned`) | 6360807 ms (n=12) |
| `assistant` | `guided_flow` | 4 | 0 | 0 | 0 | unavailable (n=0) |
| `quick_tool` | `creative_work_item` | 2 | 0 | 0 | unavailable (status sem `abandoned`) | unavailable (n=0) |

O snapshot nomeia os eventos canônicos (`creative_work_started` → … → `creative_work_delivered`) e **não** traz contagem por estágio. O runbook progressivo pede sessões `studio_entry_started`; essa métrica **não existe** no snapshot. O painel owner consulta `/api/feedback/analytics/funnel`, mas nenhum readout de produção dessa consulta está commitado.

Phase 8 (`.planning/convergence/phase8-human-journeys.json`): veredito `iterate`; 1 de 24 registros `completed`; dívida aceita 1/10. P02 completou uma jornada `no_campaign` / `home_create_post`. Waitlist: `POST /api/waitlist` responde 410 `waitlist_closed`.

## Uma decisão que muda

`campaign.completed` (12/18) **não é evidência de go** para o Estúdio, para o rollout progressivo, nem para descongelar Landing/Persona.

Consequências operacionais:

1. O freeze de destinos primários **permanece**. O encerramento do Gate 8 não o levanta. A nota do manifesto deixa de dizer “until Gate 8 lifts the freeze”.
2. `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=100` no `render.yaml` é **exposição, não validação**. A linha de 2026-08-31 no runbook (waiver do PO) continua o registro honesto disso; esta leitura não autoriza novo percentual.
3. `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT` permanece no default **0**. Não sobe neste ciclo.
4. Próxima exceção ao freeze exige funil **escopado em Trabalho** (sessões `studio_entry_started` via `/api/feedback/analytics/funnel`), não `campaign.completed` nem smoke de agente.

## O que esta decisão não faz

- Não alega superioridade estatística (Gate 8 1/10 continua a proibir).
- Não reabre waitlist.
- Não altera percentuais no `render.yaml`.
- Não descongela Landing Page nem Persona Simulation.
- Não observa operadores no Estúdio atual (item 9) nem executa JTBD de mercado (item 10).
