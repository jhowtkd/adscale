# Decisão: Trabalho criativo-first

**Data:** 2026-07-12
**Status:** Aprovada (Gate 0 do plano de convergência)
**Dono:** Produto
**Plano de execução:** [docs/plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md](../plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md)

## Contexto

O ADScale acumulou três jornadas concorrentes para o mesmo trabalho:
campanha/workspace, Assistente conversacional e Quick Tools/Criar Post.
Cada uma tem modelo mental, persistência, cobrança, geração, qualidade e
recuperação próprios. O usuário precisa aprender onde começar; o time
mantém regras equivalentes em mais de um lugar.

## Decisão

A espinha do produto é **um único trabalho criativo**. Todas as
superfícies são adapters sobre o mesmo contrato canônico:

```text
Marca/cliente
  → intenção e briefing
  → trabalho criativo
  → geração
  → revisão e aprovação
  → entrega
  → aprendizado
```

## Papéis canônicos por superfície

| Superfície        | Papel                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Trabalho criativo | Agregado canônico do que está sendo produzido.                              |
| Campanha          | Contexto estratégico opcional que pode agrupar trabalhos criativos.         |
| Assistente        | Interface conversacional que cria e opera os mesmos trabalhos.              |
| Quick Tools       | Atalhos que iniciam trabalhos preconfigurados. Sem persistência paralela.   |
| Brand Training    | Módulo independente por marca, consumido por trabalhos e campanhas.         |
| Templates         | Aceleradores que materializam intenção e briefing dentro do fluxo canônico. |

## Princípios obrigatórios

1. Um comportamento de negócio possui uma implementação canônica.
2. Interface HTTP, chat e painel são adapters; não duplicam regras.
3. Compatibilidade temporária tem prazo e critério de remoção.
4. Nenhuma nova função ampla entra antes do gate de evidência humana.
5. Status de planejamento é derivado de requisitos e evidências verificáveis.
6. Testes observam comportamento pela interface pública do módulo.
7. Brand Training continua independente de campanhas e Quick Tools.
8. Postgres continua como verdade operacional; memória aprendida é auxiliar.

## Congelamento de superfície (plano Fase 0, passo 2)

As seguintes superfícies estão **congeladas** durante o marco de
convergência: apenas correções críticas são permitidas; expansão é
proibida até o Gate 8 liberar novas funções.

- **Landing Page generator** — `src/server/ai/landing-page.ts`,
  `src/app/api/derivations/[id]/landing-page/`, repositório
  `src/server/repositories/landing-page.ts`.
- **Persona Simulation** — `src/server/ai/persona-simulator.ts`,
  `src/app/api/creatives/[id]/persona-simulation/`, repositório
  `src/server/repositories/persona-simulation.ts`, handler do Assistente
  `src/server/assistant/action-execution/handlers/quick-persona-simulate.ts`.

## Funil canônico (plano Fase 0, passo 3)

Eventos que descrevem uma jornada de trabalho criativo, independentemente
da origem:

| Evento                  | Significado                                            |
| ----------------------- | ------------------------------------------------------ |
| `creative_work_started` | Usuário iniciou um trabalho (intenção declarada).      |
| `briefing_ready`        | Briefing está completo o suficiente para gerar.        |
| `generation_confirmed`  | Cobrança/escrita confirmadas; pipeline acionado.       |
| `output_ready`          | Pelo menos um output está disponível para revisão.     |
| `creative_work_reviewed`| Usuário registrou uma decisão de revisão.              |
| `creative_work_approved`| Uma versão foi promovida a estado atual.               |
| `creative_work_delivered`| Pacote de entrega foi preparado.                      |

Implementação de referência: `src/server/creative-work/funnel-events.ts`.

## Baseline (plano Fase 0, passo 4)

Captura separada por origem (Campanhas, Assistente, Criar Post):
início, conclusão, abandono, erro e tempo. Script:
`app/scripts/capture-convergence-baseline.mjs`.

## Gate anti-expansão (plano Fase 0, passo 5)

Durante o marco, novas jornadas primárias ou novos pipelines criativos
são rejeitados. A lista de destinos primários permitidos está em
`docs/decisions/allowed-primary-destinations.json` e validada por
`app/scripts/check-primary-destinations.mjs`.
