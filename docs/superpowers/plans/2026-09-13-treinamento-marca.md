# Evolução do treinamento de marca Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar aprendizado visual profundo, pessoas nomeadas, calibração humana e direção de arte com refinamento limitado.

**Architecture:** Quatro entregas incrementais, todas no fluxo existente. A primeira cria a barreira de ativação; as seguintes enriquecem o conhecimento congelado e seu uso na composição. A quarta adiciona crítica e revisões automáticas sem reabrir a política de duas chamadas de cada saída.

**Tech Stack:** Next.js, React, TypeScript, Zod, PostgreSQL/Drizzle, Inngest, Vitest e Testing Library já instalados.

**Spec:** [Entrevista e decisões](../../plans/2026-09-13-treinamento-marca-entrevista.md), [ADR 0015](../../adr/0015-refinamento-criativo-com-orcamento.md), [ADR 0016](../../adr/0016-ativacao-treinamento-apos-calibracao.md).

## Global Constraints

- A nova versão do treinamento só entra em uso após a validação humana dos exemplos da calibração.
- O lote padrão de calibração é de quatro imagens por rodada, cobrindo aspectos diferentes do aprendizado.
- O teto inicial é de três rodadas por treinamento — uma inicial e duas de ajustes —, totalizando até 12 imagens.
- Há liberdade para criar novas poses, roupas e cenas a partir das referências de uma pessoa, desde que suas características anatômicas sejam preservadas.
- A crítica deve justificar a tentativa com um problema concreto e uma intervenção.
- Next.js 16.2.6, React 19.2.4, TypeScript 5, Zod 3, Drizzle 0.45.2, Vitest 4.1.5; nenhuma dependência nova.
- Reutilizar Creative Work, settlement, Inngest e o provedor canônico GPT Image 2. Nenhuma campanha artificial ou segundo gerador.
- Somente planejamento nesta entrega. APIs e armazenamento descritos são propostas concretas para aprovação de execução; nenhuma migração, geração paga ou publicação está autorizada por este documento.
- Preservar trabalhos e versões congeladas anteriores. Não alterar outras mudanças locais. Testes locais não comprovam geração real, fidelidade visual ou deploy.

---

## Ordem e entregas

1. [Calibração e ativação](2026-09-13-treinamento-marca-01-calibracao.md): sessão candidata, quatro exemplos, feedback e publicação da versão exata validada.
2. [Repertório e linguagens](2026-09-13-treinamento-marca-02-repertorio.md): análise entre referências, revisão visual do conjunto e uso de regras relacionais na composição.
3. [Pessoas nomeadas](2026-09-13-treinamento-marca-03-pessoas.md): cadastro, resolução no briefing, referências obrigatórias e avaliação de identidade/anatomia.
4. [Direção de arte e refinamento](2026-09-13-treinamento-marca-04-refinamento.md): proposta compositiva, crítica fundamentada, comparação e até duas revisões automáticas por saída inicial.

Executar nessa ordem. Cada plano tem um resultado verificável; a entrega 1 pode calibrar o conhecimento atual, sem depender do enriquecimento das entregas 2 e 3. Não abrir quatro escritores sobre os mesmos arquivos. Os planos compartilham contratos, repositórios e o job de geração.

## Decisões técnicas propostas

| Tema | Decisão |
| --- | --- |
| Estado candidato | Tabela de sessões com rodadas limitadas em JSON validado; versões publicadas continuam contendo apenas versões publicadas. |
| Integridade | Hash inclui conhecimento e identidade efetiva, fotos, fontes e respectivos hashes; cada rodada congela exatamente o que testa. |
| Unidade de calibração | Quatro Creative Works `single`, cada um com uma saída; nenhuma dependência de campanha. |
| Contagem | 12 exemplos no ciclo inicial. Cada saída mantém no máximo duas chamadas de imagem da política atual: teto técnico de 24 chamadas, incluindo recuperação. Falha ocupa o slot, sem reposição escondida. |
| Créditos | Mostrar quatro vezes a cotação canônica de `single` antes da rodada. Reservas/reembolsos continuam por saída no settlement. Não prometer reserva atômica do lote. |
| Aprovação | Os quatro exemplos da rodada atual precisam estar concluídos, sem falha objetiva e marcados como bons; depois há confirmação explícita de ativação. Alterar conhecimento exige nova rodada. |
| Mais de quatro aspectos | Quatro casos podem combinar aspectos, mas a interface mostra os IDs cobertos e os não exercitados. Não afirmar validação exaustiva da marca. |
| Feedback | Bom/ruim sem comentário guarda preferência pelo exemplo; não inventa causa. Sugestões de regras exigem revisão humana antes de compilar outra candidata. |
| Teto atingido | Sessão fica pendente. Abrir extensão é ação explícita, mais uma rodada de quatro, com nova cotação; cada extensão acrescenta quatro slots, sem apagar histórico. |
| Refinamento de trabalho | Até duas novas saídas por saída inicial, com orçamento de créditos aceito antes de gerar. Não é o teto de três rodadas da marca. |
| Anatomia | Comparação visual assistida, com evidências e estado inconclusivo. Divergência confirmada impede seleção; dúvida pede revisão humana. Não há promessa de garantia biométrica. |

Os tetos de aprovação dos quatro exemplos, as duas revisões por saída e a contagem de chamadas técnicas são recomendações de implementação deste plano; a entrevista confirmou o comportamento e o teto de exemplos, não esses detalhes internos.

## Mapa de responsabilidades

| Área | Dono existente / extensão |
| --- | --- |
| Analisar arquivos e sintetizar lote | `app/src/server/jobs/brand-training.ts`; novo sintetizador pequeno no mesmo domínio |
| Candidatas, conflitos, evidências e publicação | `app/src/server/brand-knowledge/` e `app/src/server/repositories/brand-knowledge.ts` |
| Estado das rodadas | Novo `app/src/server/brand-training/calibration.ts` e repositório de sessões |
| Preparar e gerar exemplos | `app/src/server/application/prepare-creative-work.ts`, `generate-creative-work.ts` e settlement existente |
| Congelar e aplicar conhecimento | `app/src/server/creative-work/identity.ts`, `prompt.ts`, `reference-plan.ts`, `carousel-visual.ts` |
| Revisão visível | `BrandKnowledgeReview.tsx`, montado diretamente em `app/src/app/(dashboard)/brand-kit/page.tsx`; não o Wizard sem montagem nessa página |
| Julgar e refinar | Job canônico, post-generation e `revise-creative-work-output.ts` |

## Preparação da execução

- [ ] Ler `AGENTS.md`, `app/AGENTS.md`, `CONTEXT.md` e os três documentos da especificação acima.
- [ ] Registrar `git status --short` e usar checkout isolado conforme `superpowers:using-git-worktrees`; não transportar WIP sem instrução.
- [ ] Consultar `graphify query "Brand Training calibration Creative Work" --budget 1800` se o grafo existir; confirmar assinaturas no código.
- [ ] Ler documentação Next instalada em `app/node_modules/next/dist/docs/` antes de editar as rotas.
- [ ] Aprovar em conjunto as mudanças de API/armazenamento explicitadas nos quatro planos antes de executá-las. As migrações serão geradas e revisadas localmente; aplicação em banco externo é decisão separada.

## Verificação e aceitação

Cada tarefa traz teste focal e commit com allowlist. Os testes mostrados são o primeiro caso vermelho, não autorização para omitir os outros casos enumerados. Para testes de componente/API, estender os mocks já existentes em arquivos vizinhos; nenhum cliente real de provedor deve ser carregado. Para invariantes transacionais, usar PostgreSQL local descartável e duas conexões com barreira de concorrência; mock sequencial não comprova exclusividade.

Ao final da execução local:

```bash
cd app
npm run typecheck
node scripts/run-convergence-gate.mjs
```

Executar lint apenas nos arquivos TypeScript alterados e os testes focais dos quatro planos. Rodar `graphify update .` na raiz após alterações de código. Separar a validação visual paga: com autorização própria, escolher uma marca, calibrar, reprovar exemplos, verificar mudança na segunda rodada, ativar e criar um Trabalho novo citando pessoa e linguagem. Aprovação visual continua humana.

## Auto-revisão do plano

| Requisito da entrevista | Cobertura |
| --- | --- |
| Criar, criticar e refinar como designer sênior | 02-T3, 04-T1 a T3 |
| Padrões, tipografia, relações e acabamento | 02-T1 a T3 |
| Pessoas reais nomeadas e várias fotos | 03-T1 e T2 |
| Novas poses/roupas/cenas, preservando anatomia | 03-T2 e T3 |
| Linguagens sobre identidade comum | 02-T1 a T3 |
| Revisão visual consolidada por lote | 01-T3, 02-T2, 03-T1 |
| Quatro imagens, até três rodadas e extensão explícita | 01-T1 a T3 |
| Feedback melhora rodada seguinte e trabalhos futuros | 01-T3, 02-T2 e T3 |
| Candidata privada, versão anterior preservada | 01-T1, T2 e T4 |
| Melhor Peça válida com pendências ao atingir teto | 04-T2 e T3 |
| Não presumir motivo de rejeição | 01-T3 e 02-T2 |

Nenhuma avaliação automática de gosto substitui a calibração humana. Nenhuma estética específica da pasta Artes vira padrão universal. Esta entrega é documentação de implementação, não evidência de software implementado ou validado.
