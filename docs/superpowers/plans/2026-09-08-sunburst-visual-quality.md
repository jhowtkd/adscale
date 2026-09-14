# Sunburst — qualidade visual, referências e revisão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validar e selecionar a melhor qualidade por operação, reforçando preservação nas revisões e continuidade do carrossel.

**Architecture:** Reutilizar prompt builder, referências ordenadas, fact pack, painel de âncoras e revisão do conjunto. Os testes locais protegem contratos; um experimento controlado separado decide os parâmetros de produção.

**Tech Stack:** TypeScript, Zod, OpenAI SDK 6.34.0, Vitest, Sharp, Inngest e persistência JSONB existentes.

**Spec:** [Estudo e priorização ICE](/Users/jhonatan/Repos/ADScale_2/docs/plans/2026-09-08-gpt-image-2-5-ice.md). Ler ambos antes de executar.

## Global Constraints

“sempre priorizar qualidade”.
“Flare fica fora da migração inicial.”
“Manter `maxRetries: 0`”.
“`usage` ausente é desconhecido, nunca zero.”
“Manter inicialmente quatro referências”.
“Não incluir `input_fidelity: high` indiscriminadamente”.
“Não gerar três candidatos escondidos, reduzir automaticamente modelo/qualidade por lentidão ou duplicar chamadas por timeout.”
Manter os 50 créditos por saída e os flags de recuperação/Brand Cortex atuais.
Não alterar análise/briefing, decomposição Seedream/Atlas, APIs públicas ou interface nesta migração.
Implementação local, benchmark pago e publicação são entregas distintas. Este documento não autoriza gasto ou deploy.

---

Base inspecionada: `ac38a30e`, em 08/09/2026. Caminhos abaixo são relativos a `/Users/jhonatan/Repos/ADScale_2`; comandos partem dessa raiz, exceto quando indicado. Preservar todo WIP alheio. Antes da execução, usar worktree conforme a skill de execução. Os snippets são alterações propostas, ainda não compiladas no produto.

## Dependência e mapa de arquivos

Depende do [motor preparado](2026-09-08-sunburst-engine.md). Produz melhorias testáveis no builder e um protocolo de decisão; resultados de chamadas não executadas continuam desconhecidos.

| Arquivo | Mudança |
|---|---|
| `app/src/server/creative-work/prompt.ts` e `.test.ts` | Tornar invariantes da revisão explícitos. |
| `app/src/server/creative-work/reference-plan.test.ts` | Provar prioridade da peça-base e manutenção das autoridades obrigatórias. |
| `app/src/server/creative-work/carousel-visual.test.ts` | Exercitar painel e avaliação existentes; não trocar arquitetura do deck. |
| `docs/evidence/2026-09-08-sunburst-visual-protocol.md` (criar ao executar) | Matriz congelada, critérios, orçamento proposto e resultados observados. |

`reference-normalize.ts`, `reference-plan.ts`, `carousel-visual.ts` e o limite de quatro referências não recebem mudanças sem demonstração de defeito. O harness `app/scripts/run-image-harness-blind-comparison.ts` usa contratos de derivação antigos e faz chamadas de QA; não usá-lo como prova automática do Estúdio nem executá-lo sem orçamento. Reaproveitar sua forma de comparação cega, não copiar seu fluxo legado para o produto.

### Task 1: Revisão com alteração autorizada e invariantes explícitos

**Files:** modificar `app/src/server/creative-work/prompt.ts` e `.test.ts`.

**Interfaces:**
- Consumes: `BuildCreativeWorkPromptInput` existente, incluindo `mode`, `revisionInstruction`, `references` e contrato factual.
- Produces: `buildCreativeWorkPrompt(input: BuildCreativeWorkPromptInput): string`, assinatura preservada.

- [ ] **Step 1: Adicionar teste com helpers existentes.**

```ts
it("makes revision invariants explicit without borrowing facts from style", () => {
  const prompt = buildCreativeWorkPrompt(creativeWorkPromptInput({
    mode: "creative_revision",
    revisionInstruction: "Troque somente a chamada por Oferta de setembro",
    references: [slot("revision", "peca-aprovada.png"), slot("style", "estilo.png", false)],
  }));
  expect(prompt).toContain("AUTHORIZED CHANGE:");
  expect(prompt).toContain("Troque somente a chamada por Oferta de setembro");
  expect(prompt).toContain("PRESERVE UNLESS EXPLICITLY CHANGED:");
  expect(prompt).toContain("product geometry and labels");
  expect(factPackSection(prompt)).toEqual(factPackSection(buildCreativeWorkPrompt(creativeWorkPromptInput())));
});
```

- [ ] **Step 2: Run in app:** `npm test -- src/server/creative-work/prompt.test.ts`. Esperar falta de AUTHORIZED CHANGE.
- [ ] **Step 3: No ramo `creative_revision` de `buildModePolicyBlock`, substituir o retorno pelo bloco completo:**

```ts
return [
  "MODE POLICY — REVISION:",
  "Use the revision reference as the accepted base piece. Apply only the authorized change while honoring the original factual contract.",
  `AUTHORIZED CHANGE: ${input.revisionInstruction?.trim() || "No change authorized; preserve the base piece."}`,
  "PRESERVE UNLESS EXPLICITLY CHANGED: product geometry and labels, subject identity, brand assets, framing, composition, colors, and all approved copy outside the requested edit.",
  "Style references guide visual language only; they never authorize new facts, offers, prices, identities, or copy.",
  "Preservation describes visual intent, not a guarantee of identical pixels. Exact assets remain governed by the composition contract.",
].join("\n");
```

Não alterar a branch de correção objetiva nem o caminho `textExecution` determinístico. Não inventar parsing de áreas protegidas ou uma UI de máscara.

- [ ] **Step 4: Reexecutar prompt.test.ts; esperar PASS.** Conferir que copy literal, fontes numeradas e fatos continuam no prompt completo, sem truncamento.
- [ ] **Step 5: Commit.**

```bash
git add app/src/server/creative-work/prompt.ts app/src/server/creative-work/prompt.test.ts
git commit -m "feat: clarify authorized image edits and preserved content"
```

### Task 2: Proteger ordem das referências e coerência do deck com os testes existentes

**Files:** `app/src/server/creative-work/reference-plan.test.ts`, `carousel-visual.test.ts`; não alterar produção se os contratos já passarem.

**Interfaces:**
- Consumes: `planCreativeWorkReferences` e `planCarouselSlideReferences` existentes.
- Produces: regressão para a peça escolhida em primeiro lugar e âncora obrigatória nos slides seguintes.

- [ ] **Step 1: Acrescentar ao teste de `planCarouselSlideReferences` existente a verificação completa abaixo.** Importar a função do módulo já usado no arquivo.

```ts
it("keeps the approved anchor board first for non-anchor slides", () => {
  const slots = planCarouselSlideReferences({
    isAnchor: false,
    anchorBoardKey: "creative-work/work-1/anchor-board.png",
    identityReferenceAssets: [],
    temporaryReference: null,
    limit: 4,
  });
  expect(slots[0]).toMatchObject({ role: "anchor_board", required: true, assetKey: "creative-work/work-1/anchor-board.png" });
  expect(slots).toHaveLength(1);
});
```

- [ ] **Step 2: Run in app:** `npm test -- src/server/creative-work/reference-plan.test.ts src/server/creative-work/carousel-visual.test.ts`.

Este caso deve passar na implementação atual; é caracterização de um requisito que a migração não pode perder. Se já houver teste idêntico, manter o existente e registrar a cobertura, sem duplicar código.

- [ ] **Step 3: Conferir no teste existente de referências de revisão que a primeira role é `revision` e o excesso de referências obrigatórias falha.** Reutilizar a fixture atual do teste e acrescentar apenas se ausentes:

```ts
expect(plan[0]?.role).toBe("revision");
expect(plan[0]?.required).toBe(true);
```

A fixture é a saída `plan` do teste `keeps the completed parent as the first reference`, que já verifica essa propriedade; não criar assets novos. Para carrossel, executar também `npm test -- src/server/application/revise-carousel.test.ts src/server/application/advance-carousel-generation.test.ts`. Uma revisão de âncora deve invalidar/reavaliar a coerência dependente pelo fluxo existente; se os testes ou leitura demonstrarem ausência dessa propriedade, bloquear I5 e abrir uma correção delimitada antes de ativar carrossel. Não declarar a propriedade provada apenas porque o painel é gerado.

- [ ] **Step 4: Commit somente dos testes efetivamente modificados:** `test: protect image reference authority during model migration`.

### Task 3: Congelar corpus, critérios e orçamento antes de chamadas

**Files:** criar `docs/evidence/2026-09-08-sunburst-visual-protocol.md`.

**Interfaces:**
- Consumes: snapshots, originais autorizados e evidências produzidas pelo motor; nenhuma leitura de produção implícita.
- Produces: lista fechada de casos com IDs, hashes, instruções literais, critérios e orçamento revisáveis pelo usuário.

- [ ] **Step 1: Registrar o conteúdo abaixo como protocolo de avaliação.**

| Campo obrigatório por caso | Conteúdo |
|---|---|
| Identificação | caso, marca, segmento, protocolo, formato, versão do builder e política de execução |
| Fontes | paths dos originais autorizados, SHA-256, ordem/role, snapshot de fatos/copy e referência normalizada |
| Pedido | prompt exato e, quando aplicável, instrução de revisão literal |
| Controle | snapshot `gpt-image-2-2026-04-21`, qualidade efetivamente enviada pelo fluxo atual |
| Candidato | snapshot `gpt-image-2.5-sunburst-2026-09-08`, qualidade explícita |
| Resultado | callId, requestId, usage completo, duração, tamanho solicitado, dimensões do arquivo, falhas antes/depois da API |
| Decisão humana | aprovação, preferência cega, preservação, texto/fatos, marca/produto e acabamento |

Não preencher resultados com expectativas. Os 24 casos são selecionados de fontes locais autorizadas: 3 marcas, 2 segmentos, pelo menos 1 fora de educação. Distribuição proposta: 4 peça única, 4 variação, 4 adaptação, 4 restyle, 4 revisão e 4 posições de carrossel. Os quatro slides isolados não provam coerência de deck: usar também os decks completos do gate de jornadas, contabilizando suas chamadas separadamente antes da autorização.

- [ ] **Step 2: Conferir fonte normalizada contra original nos 24 casos.** Abrir lado a lado a 100% do tamanho de entrega, observar rótulos e detalhes. Anotar perda causada por normalização separadamente de erro do modelo. Manter 2.048/q85 e quatro referências se não houver defeito demonstrado. Não aumentar limites de todos os usuários por uma imagem problemática.

- [ ] **Step 3: Preparar lotes e limites revisáveis.**

| Lote | Chamadas de imagem propostas | Finalidade |
|---|---:|---|
| Smoke | 6 casos × 2 modelos = 12 | Compatibilidade antes de escala; teto proposto US$10 |
| Comparação principal | 24 × 2 × 2 = 96 | Isolar modelo, mesmas entradas e qualidade |
| Revisões sucessivas | 3 sequências × 3 alterações = 9 Sunburst | Acúmulo de deriva; +9 baseline se não houver controle equivalente |
| Calibração | 6 × 3 qualidades × 2 = 36 | high/xhigh/max, qualidade visual acima do mínimo |

Principal + sequências + calibração: 141 ou 150 chamadas; teto adicional proposto US$50. Não incluir decks completos ou QA pago como se já coubessem nessa conta: levantar a quantidade exata e acrescentar ao orçamento antes de executá-los. Não iniciar um lote cujo máximo estimado exceda saldo aprovado. Usage desconhecido interrompe expansão automática e exige reconciliação; não equivale a custo zero.

- [ ] **Step 4: Apresentar corpus e orçamento concretos para aprovação de chamadas pagas.** O plano de código pode continuar enquanto essa decisão estiver pendente. Ainda não há corpus de três marcas aprovado nesta tarefa de planejamento; sua seleção é trabalho operacional explícito, não uma fixture fictícia.

### Task 4: Executar comparação, escolher parâmetros e decidir liberação

**Files:** atualizar somente o documento de evidência; eventual ajuste dos defaults em env/Render pertence ao commit de liberação aprovado.

**Interfaces:**
- Consumes: lote aprovado, motor preparado, originais e máscaras de avaliação humana (sem exigir máscara enviada à API).
- Produces: decisão registrada por operação: Sunburst + high/xhigh/max, ou bloqueio com razão observada.

- [ ] Executar smoke autorizado no ambiente de validação e nos mesmos paths do produto; verificar edição e geração, dimensões reais e usage. Não usar o provedor controlado como evidência visual.
- [ ] Executar comparação principal autorizada; randomizar rótulos A/B na revisão, mantendo a chave de modelos fora da tela do avaliador. Avaliar as imagens finais a 100% e na composição de entrega.
- [ ] Executar as três sequências de edição a partir do mesmo original por modelo. Cada edição deliberada usa a saída anterior aceita. A correção automática continua usando as fontes originais, sem alimentar erros de uma tentativa rejeitada.
- [ ] Comparar high/xhigh/max por operação. Examinar texto, identidade, embalagem, composição e acabamento. `max` só vence se sua imagem vencer; não escolher medium porque passou no smoke. Em empate visual consistente, custo/latência desempata.
- [ ] Verificar pelo menos 90% de revisões sem mudança material fora do pedido e zero erro crítico de marca, pessoa, oferta ou produto no conjunto avaliado. Reportar numerador/denominador; uma amostra de nove não dá precisão estatística para prometer 90% em produção. Se não houver evidência suficiente, ampliar corpus sob novo orçamento aprovado.
- [ ] Medir decks completos e Gate 8: 10 jornadas humanas, 3 marcas, 2 segmentos, 1 não educacional. Publicar resultados por protocolo e política congelada. O pequeno ensaio não demonstra não inferioridade de 5 pontos percentuais nem p95 robusto.
- [ ] Calcular custo por aprovada somando tentativas, correções, QA e falhas cobradas. Usar taxas Standard do estudo, preservar cache como subconjunto; se o detalhamento for insuficiente, reportar intervalo/valor desconhecido, não uma conta exata inventada.
- [ ] Registrar a qualidade vencedora de cada operação e a decisão humana. Se uma única qualidade vencer em todas, manter um default. Se houver vencedoras distintas, preparar um mapa estático validado por intenção canônica **antes de `toProviderMode`** e uma alteração separada para aprovação; não publicar um default que já se sabe inferior em alguma operação. Isso é uma dependência condicional do resultado, não um roteador por LLM.
- [ ] Preparar diff de configuração web+worker para liberação interna; depois 10/50/100% somente com verificação de cada etapa. Manter trabalhos já congelados no modelo original. Registrar política escolhida, commit, datas, métricas, incidentes e autorização de produção.

## Cobertura e exclusões

I2: Tasks 3–4. I3: Task 1 + sequências. I4: Task 2 + inspeção de fontes. I5: âncoras existentes + avaliação de decks completos. I6: executar o plano separado de camadas antes de prometer qualidade em todos os fluxos. I7, I8 e I9 não recebem implementação: dependem de demanda comprovada, como definido no estudo.

A escolha final de qualidade, o custo real e a habilitação da conta são resultados do experimento; não podem ser decididos por documentação ou testes mockados. Essa incerteza não impede preparar e verificar o código local.
