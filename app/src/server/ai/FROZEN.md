# Módulos congelados — Generadores de saída periféricos

> **Status:** Congelado em 2026-07-12 pelo Gate 0 do plano de convergência
> produto & arquitetura ([plano](../../../../docs/plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md))
> ([decisão](../../../../docs/decisions/2026-07-12-trabalho-criativo-first.md)).

Durante o marco de convergência, os geradores abaixo aceitam somente
**correções críticas** (bugs de segurança, quebra de build, perda de
dado, isolamento de workspace). **Expansão de escopo é proibida.** O
Gate 8 encerrou em 2026-07-16 como `approved_with_accepted_debt` (1/10)
e **não** libera estes módulos. `campaign.completed` também não. Nova
função aqui exige funil escopado em Trabalho (`studio_entry_started`),
não o encerramento histórico do gate.

| Módulo                                  | Por quê                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `landing-page.ts`                       | Não sustenta a jornada central; sem evidência de uso decisório atual.  |
| `persona-simulator.ts`                  | Idem. Avaliado para remoção/ocultação na Fase 7.                        |

## O que entra aqui

- Correção de bug que cause erro em produção ou viole isolamento.
- Atualização de dependência quebrada.
- Patch de segurança.

## O que **não** entra

- Novo formato, novo template, novo canal.
- Novo critério de qualidade específico destes módulos.
- Novo destino de UI que dependa destes módulos.
- Refatorações estéticas.

## Como proceder

Se o PR tocar estes arquivos sem ser correção crítica, ele deve:

1. Referenciar um requisito aprovado com funil escopado em Trabalho
   (`studio_entry_started` via `/api/feedback/analytics/funnel`), **ou**
2. Ser redirecionado para o roadmap pós-convergência.

O encerramento do Gate 8 (1/10, `iterate`) não conta como o item 1.
Ver [`docs/decisions/2026-09-12-funnel-read-gate8-holds.md`](../../../../docs/decisions/2026-09-12-funnel-read-gate8-holds.md).

O validador `app/scripts/check-frozen-modules.mjs` alerta quando um PR
toca estes caminhos sem a tag `frozen-exception:` no título do commit.
