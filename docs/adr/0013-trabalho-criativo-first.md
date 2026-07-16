# 0013 — Trabalho criativo-first (convergência de produto e arquitetura)

**Data:** 2026-07-12
**Status:** ✅ Aceita
**Decisor:** Jhonatan Soares (founder)

> A espinha do produto é um único trabalho criativo. Campanha, Assistente, Quick Tools, Templates e Brand Training são adapters sobre o mesmo contrato canônico.

---

## Contexto

O ADScale acumulou três jornadas concorrentes para o mesmo trabalho criativo:

- **Campanha/workspace** — pipeline histórico com derivações e hipóteses.
- **Assistente conversacional** — `/assistant` com fluxos guiados, comandos tipados e CAS de revisão.
- **Quick Tools / Criar Post** — wizard curto, com persistência própria (`creative_work_items`).

Essas jornadas compartilham parte da infraestrutura, mas divergem em modelo mental, persistência, cobrança, geração, qualidade e recuperação. Sintomas visíveis:

- o usuário precisa aprender onde começar;
- o time mantém regras equivalentes em mais de um lugar;
- o planejamento declara estados incompatíveis para o mesmo marco;
- funções periféricas (Landing Page, Persona Simulation) competem com o fluxo principal;
- existem ações visíveis que não concluem o que prometem (ex.: `Usar template` que não materializa).

O objetivo não é apenas reorganizar código: é fazer o produto operar como uma única jornada coerente.

Plano de execução completo: [`docs/plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md`](../plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md).

## Decisão

Adotar a espinha canônica:

```text
Marca/cliente
  → intenção e briefing
  → trabalho criativo
  → geração
  → revisão e aprovação
  → entrega
  → aprendizado
```

Cada superfície passa a ter um papel canônico:

| Superfície        | Papel                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Trabalho criativo | Agregado canônico do que está sendo produzido.                              |
| Campanha          | Contexto estratégico opcional que pode agrupar trabalhos criativos.         |
| Assistente        | Interface conversacional que cria e opera os mesmos trabalhos.              |
| Quick Tools       | Atalhos que iniciam trabalhos preconfigurados. Sem persistência paralela.   |
| Brand Training    | Módulo independente por marca, consumido por trabalhos e campanhas.         |
| Templates         | Aceleradores que materializam intenção e briefing dentro do fluxo canônico. |

### Princípios obrigatórios

1. Um comportamento de negócio possui uma implementação canônica.
2. Interface HTTP, chat e painel são adapters; não duplicam regras.
3. Compatibilidade temporária tem prazo e critério de remoção.
4. Nenhuma nova função ampla entra antes do gate de evidência humana (Gate 8).
5. Status de planejamento é derivado de requisitos e evidências verificáveis.
6. Testes observam comportamento pela interface pública do módulo.
7. Brand Training continua independente de campanhas e Quick Tools.
8. Postgres continua como verdade operacional; memória aprendida é auxiliar.

### Funil canônico

Eventos que descrevem uma jornada de trabalho criativo, independentemente da origem: `creative_work_started`, `briefing_ready`, `generation_confirmed`, `output_ready`, `creative_work_reviewed`, `creative_work_approved`, `creative_work_delivered`, `creative_work_abandoned`, `creative_work_failed`, `creative_work_reopened`.

Implementação: [`app/src/server/creative-work/funnel-events.ts`](../../app/src/server/creative-work/funnel-events.ts).

### Congelamento de superfície

Durante o marco de convergência, apenas correções críticas são permitidas em:

- **Landing Page generator** (`src/server/ai/landing-page.ts` e adjacências).
- **Persona Simulation** (`src/server/ai/persona-simulator.ts` e adjacências).

Marcador no repo: [`app/src/server/ai/FROZEN.md`](../../app/src/server/ai/FROZEN.md).
Manifesto: [`docs/decisions/allowed-primary-destinations.json`](../decisions/allowed-primary-destinations.json).

### Gates automáticos

- **Anti-expansion gate** (`app/scripts/check-primary-destinations.mjs`): rejeita novos grupos de rota dashboard, novas árvores de API, novos módulos geradores em `src/server/ai/` e novas páginas dashboard não presentes no snapshot do freeze.
- **Frozen-modules gate** (`app/scripts/check-frozen-modules.mjs`): falha quando um commit toca módulo congelado sem a linha `frozen-exception:`.
- **Wrapper** (`app/scripts/run-convergence-gate.mjs`): roda ambos, conectado ao CI (`.github/workflows/ci.yml`) e ao release gate (`app/scripts/run-release-gate.mjs`).

## Relação com o Cognitive Atlas (ADR 0012)

O Cognitive Atlas descreve a **cognição** do ADScale (órgãos da cabeça criativa: Cortex, Hands, Gaze, Skin, Nerve, Taste, Memory, Marrow, Energy). Este ADR descreve a **espinha de produto** (jornada de trabalho criativo). São camadas distintas e compatíveis:

- **Convivem, não competem.** Atlas = "como o sistema pensa/faz/julga/aprende"; ADR 0013 = "como o usuário percorre a jornada".
- **Mapeamento parcial.** O funil canônico cruza o Atlas em pontos específicos:
  - `intenção/briefing` → **Cortex** (intent → confirmed actions)
  - `geração` → **Hands** (produce the image)
  - `revisão/aprovação` → **Gaze** (art judgment) + **Skin** (export readiness)
  - `entrega` → **Skin**
  - `aprendizado` → **Nerve** (fast decision learning) + **Marrow** (deep calibration) + **Memory** (recalled context)
- **Conflito → código vence, depois atualiza o atlas** (regra herdada do ADR 0012 §37). Esta decisão não move pastas nem renomeia órgãos.
- **Energy (billing)** permanece como combustível, não como cognição; o pipeline canônico da Fase 3 o trata como política canônica de cobrança, não como novo órgão.

Esta decisão **não substitui** o ADR 0012. São complementares: o Atlas descreve os órgãos, o ADR 0013 descreve o esqueleto que os conecta numa única jornada.

## Consequências

**Mais fácil:**

- Onboarding de produto: uma jornada, cinco entradas com papéis explícitos.
- Refatoração guiada por princípios (um comportamento, uma implementação).
- Telemetria comparável entre origens (funil canônico + baseline por jornada única).
- Redução de custo permanente após Fase 7 (remoção da árvore paralela).

**Mais difícil:**

- Exige disciplina para não adicionar nova jornada primária durante o marco — enforcement agora automatizado pelos gates.
- Compatibilidade temporária precisa ter prazo; dívida técnica deve ser explícita.
- Migrar Criar Post, Assistente e Campanhas para o contrato canônico é trabalho longo (Fases 2–5).

**Destrava:**

- Fase 8 (UAT humano) com baseline comparável para validar melhoria real.
- Roadmap pós-convergência livre de duplicação estrutural.

## Alternativas consideradas

- **Manter as três jornadas, apenas melhor documentadas:** rejeitado. Documentação não resolve duplicação de regras; o usuário continuaria confuso sobre onde começar.
- **Migração big-bang para um novo modelo:** rejeitado. O plano exige gates e preserva Brand Training independente; big-bang quebraria isolamento e cobrança.
- **Campanha obrigatória para Criar Post e Brand Training:** rejeitado. Princípio 7 mantém Brand Training independente; Criar Post deve permanecer rápido (Gate 5).
- **Esconder, em vez de remover, os caminhos antigos:** rejeitado. Critério final de conclusão exige remoção, não ocultamento.
- **Atlas (ADR 0012) como espinha de produto:** rejeitado. Atlas é modelo mental cognitivo, não jornada; usá-lo como espinha would diluir seu propósito e violar sua regra de "atlas aponta, código vence".

## Upgrade path

A expansão de escopo após o marco de convergência é liberada no **Gate 8** (evidência humana, Fase 8), que exige:

- pelo menos 10 jornadas humanas completas, em 3 marcas e 2 segmentos (1 fora de educação);
- três maiores breakpoints observados corrigidos e reavaliados;
- melhora demonstrada contra o baseline por origem.

Sem isso, o freeze permanece ativo.

---

*Decidido em 2026-07-12 · Registrado 2026-07-12 · Owner: Jhonatan Soares*
