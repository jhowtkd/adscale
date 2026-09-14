# Diagnóstico: por que as gerações perdem pro ChatGPT, e o que decidimos

Data: 2026-09-10. Classe: finding (diagnóstico + decisões de produto). Não é spec nem plano; vira spec quando houver pedido de implementação.

Material analisado: [auditoria Cenbrap de 2026-09-10](../evidence/2026-09-10-auditoria-cenbrap-geracoes.md) e seus 10 prints em `docs/screenshots/2026-09-10-auditoria-cenbrap/`; resultados dos estudos comerciais Nike/MTV/Absolut em `docs/commercial-studies/real-brands/results/`; código do pipeline de geração em `app/src/server/`; plano ICE do GPT Image 2.5 (`docs/plans/2026-09-08-gpt-image-2-5-ice.md`); plano da caixa unificada (`docs/plans/2026-09-08-studio-caixa-unificada.md`, PR #325).

Percepção de partida do Jhonatan: a mesma peça da Cenbrap sai melhor no ChatGPT do que no ADScale; o produto perde pra plataforma nativa sem oferecer vantagem; a interface tem coisa demais espalhada e tudo deveria acontecer dentro da caixa gradiente do Palco.

---

## 1. Achado central: o motor é o mesmo do ChatGPT; a nossa pipeline é que piora a peça

O ADScale não está perdendo pro modelo. Está perdendo pro que coloca em volta dele. Três evidências no código:

| Evidência | Onde | Efeito |
|---|---|---|
| Mesmo modelo do ChatGPT: `gpt-image-2-2026-04-21` | `render.yaml:59,148`, `app/src/server/validation/env.ts:24` | A comparação é entre pipelines, não entre modelos. Sunburst (2.5) está congelado em 0% (#326). |
| Qualidade `medium` por omissão | `app/src/server/ai/providers/openai-image-provider.ts:68` (`quality: input.quality ?? "medium"`); o executor em `generation/pipeline/execute.ts` não repassa `quality` | Tudo indica que o ChatGPT roda em qualidade alta. Estamos comparando medium contra high. |
| Na Peça única, o modelo é proibido de desenhar a peça | `app/src/server/creative-work/identity-policy.ts:14-16` (`single` é o único protocolo com `typographyPlan: true`); `typography-plan.ts:84-90` (uma fonte aprovada → `deterministic`); `prompt.ts:111` (`PROVIDER-ONLY ABSTRACT BACKGROUND`) | O modelo devolve só um fundo abstrato. `text-composite.ts` desenha o texto com Pango num painel (top/center/bottom/side) com placa de contraste WCAG. O logo é carimbado depois. Resultado: gradiente + caixa escura + texto + logo pequeno no canto. Um template. É a peça do print 03 (nota 6/10). |

Prova por contraste: tudo que saiu bem não passa por esse caminho. Variações, Adaptar formatos, Mudar estilo e Carrossel têm `typographyPlan: false`, então o modelo desenhou tipografia, hierarquia, selo e CTA. A variação "Ousada" (print 08) ficou 8/10; Nike e Absolut nos estudos comerciais ficaram no nível de anúncio real.

**Conclusão de produto.** "Fidelidade de marca comprovável" foi implementada como *renderização exata pelo app antes da geração* (copyHash, fontHash, safe_area "Comprovado"). Isso destrói justamente o que faz alguém usar GPT Image: design integrado. Os badges "Comprovado" provam a coisa errada. Fidelidade precisa ser **verificação depois** (o modelo desenha; a aplicação lê de volta com visão e reprova o que fugiu), não **renderização antes**.

Já existe verificação pós-geração no caminho generativo: `analyzeCreativeWorkQa` em `app/src/server/ai/creative-qa.ts` produz veredito tri-state `pass | fail | inconclusive` com códigos objetivos (`missing_required_fact`, `unsupported_claim`, `wrong_brand`, `unreadable_required_text`, etc.). O que falta é o `single` parar de forçar o caminho determinístico, o avaliador ganhar contexto de marca, e o veredito aparecer em linguagem de operador.

Um quarto fator: o prompt de produção é um contrato de até 8.000 caracteres (`PROMPT_SIZE_WARN_CHARS`) com blocos PROVIDER EXCLUSION, NEGATIVE PATTERNS, RESERVED PLACEMENTS e "do not infer brand identity from text". No ChatGPT, a pessoa escreve três frases e anexa os PNGs da marca, e o modelo de texto reescreve isso num prompt visual rico antes de chamar a imagem. O modelo obedece melhor a referência visual e a um brief curto do que a cláusula.

## 2. O que temos que resolver (ordem de prioridade)

1. **Tese da tipografia na Peça única.** Decisão de produto, não bug. Deixar o modelo desenhar; verificação depois.
2. **Qualidade do provider.** `high` explícito em todos os protocolos. Sunburst depois, com a comparação que o ICE já planeja.
3. **Dieta do prompt.** Brief visual curto em linguagem natural + referências reais da marca em todo protocolo, não só em Variações.
4. **Uma máquina de estados de geração para os protocolos.** A auditoria mostrou cinco fluxos distintos: um pula o plano, outro trava no botão, outro rejeita anexo visível, outro morre na fila sem erro. Fila que some sem erro é o pior bug de confiança.
5. **Uma superfície só: a caixa.** O PR #325 juntou a *criação* na caixa, mas o *resultado* ainda cai em `/creative-work/:id`: página longa com hashes, `quality.textComposition.copy`, "Córtex da Marca v3 · Congelada", "format neutral (unmeasured)", briefing em inglês. Telemetria de dev vazando pro operador.
6. **Menos protocolos, funcionando.** Carrossel morto ("Organizar conteúdo" não abre), Mudar estilo bloqueado por validação que não vê o anexo, Create post e Assistente órfãos da navegação. Três protocolos fechando ponta a ponta valem mais que cinco pela metade.
7. **Créditos legíveis.** "Total gasto 190" com "Nenhuma transação encontrada", 30 na página e 999999 na sidebar, filtros com enums crus.

### O que não fazer

- Não abrir as 17 issues de polish da auditoria agora. Boa parte some ou muda quando 1, 4 e 5 forem resolvidos.
- Não migrar pra Sunburst achando que resolve o item 1. Com o prompt "abstract background", o Sunburst vai gerar um fundo abstrato melhor.

## 3. Decisões tomadas nesta conversa

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Tipografia na Peça única | **Modelo desenha tudo** (texto + composição), como em Variações e no ChatGPT. Fidelidade vira verificação pós-geração por visão. Logo continua carimbado exato pelo app. |
| D2 | Ordem dos subsistemas | **Motor e Superfície juntos** num spec só. Orquestração (itens 4, 6, 7) vai pra um spec posterior. |
| D3 | Quando o veredito falha | **Sem correção automática.** 1 chamada de imagem por peça; veredito e achados vão pro humano, que decide refinar ou descartar. |
| D4 | Onde vive a peça pronta | **A caixa é o palco da revisão.** Caixa dinâmica: sobe, expande e encolhe conforme a etapa; mesa desfocada quando a caixa está em foco; todo o fluxo dentro dela. (Alternativas descartadas: peça na mesa com painel lateral; página do trabalho redesenhada.) |
| D5 | O que a caixa faz enquanto gera | **Encolhe e vira fila visível na própria caixa.** Chips "⏳ gerando" / "✓ pronta — abrir" / "✗ falhou — ver" lidos do servidor; campo livre pra pedir a próxima. (Alternativa descartada: ficar expandida mostrando progresso.) |
| D6 | Como o prompt chega ao GPT Image | **Etapa de direção de arte.** O modelo de texto escreve um brief visual curto a partir do fact pack, brand kit e análise das referências; brief + imagens da marca vão pro GPT Image com um contrato técnico de 3 regras. |

Premissas assumidas sem pergunta explícita: `quality: high` em todos os protocolos (diretriz de 08/09 "sempre priorizar qualidade"); Sunburst fora deste recorte; Carrossel fora deste recorte; `/creative-work/:id` vira redirect em vez de conviver com a caixa.

## 4. Design resultante (pronto pra virar spec)

### 4.1 Objetivo e critério de sucesso

Uma Peça única da Cenbrap gerada no ADScale ganha da mesma peça pedida no ChatGPT, e o operador não sai da caixa pra fazer isso.

Gate mensurável: 3 pedidos reais da Cenbrap (promoção, institucional, evento), cada um gerado no ADScale e no ChatGPT com o mesmo texto e os mesmos anexos. Avaliação cega do Jhonatan. ADScale vence ou empata em pelo menos 2 de 3. Custo: ~6 gerações.

### 4.2 Motor

- **Tipografia generativa.** `protocolIdentityContract("single").typographyPlan` → `false`. `text-composite.ts`, `typography-plan.ts` e os checks determinísticos `copy` / `font` / `safe_area` de `brand-fidelity.ts` saem do caminho de produção. O check `exact_assets` (logo) fica.
- **Direção de arte.** Builder novo, antes da chamada de imagem. Entrada: fact pack congelado, brand kit (cores, famílias de fonte por nome, tom), `contentAnalysis` das referências (já existe), direção escolhida (Conservadora / Equilibrada / Ousada). Chama `OPENAI_TEXT_MODEL` (mesmo da inferência de briefing) e devolve um brief visual de até ~120 palavras: conceito, hierarquia, tratamento tipográfico, paleta aplicada, onde fica o espaço limpo do logo. Persistido no output como evidência. Vai pro GPT Image com as imagens de referência e um contrato de 3 regras: fatos exatos (copy validada verbatim), espaço limpo pro logo, formato. RULE MODE, NEGATIVE PATTERNS, REFERENCE MODE e "do not infer brand identity from text" saem do prompt de imagem; o que for regra real vira frase no brief. Falha do passo → fallback pro builder generativo atual, marcado na evidência.
- **Qualidade.** Executor passa `quality: "high"` em todos os protocolos. Custo em créditos recalculado e mostrado no plano antes de confirmar.
- **Verificação pós-geração.** `analyzeCreativeWorkQa` continua sendo o juiz objetivo. Ganha brand kit e referências da marca como contexto e um código advisory novo, `brand_visual_drift` (paleta ou tipografia visivelmente fora da marca), que nunca reprova sozinho. UI traduz códigos em frases: `missing_required_fact` → "Faltou: 50% OFF"; `unsupported_claim` → "'até sexta' sem fonte — confirme ou remova"; sem achados → "Copy confirmada · Marca ok". Fonte declarada como "aproximada".
- **Correções no caminho.** Formato "Automático" herda o formato da referência quando há referência (hoje 4:5 virou 9:16). Direções: o que o operador marcou vale; sugestões da IA aparecem como sugestão, não pré-marcadas.

### 4.3 Superfície: a caixa dinâmica

Um objeto, cinco estados, um único `useCreativeComposer` como autoridade (já é assim desde o #325):

| Estado | Altura | Mesa | Conteúdo |
|---|---|---|---|
| Repouso | compacta | nítida | faixa de fila (se houver), chip da marca, protocolos, pedido, anexar, Gerar |
| Plano | expandida | desfocada | pedido + "Revise seu plano" em linguagem de operador (objetivo, formato, fatos, referências, direções, créditos) · Editar / Confirmar e gerar |
| Gerando | volta a compacta | nítida | trabalho vira chip na faixa de fila ("⏳ Equilibrada · 4:5 · ~40 s"); campo livre pro próximo pedido |
| Peça pronta | expandida | desfocada | peça grande (miniaturas à esquerda se >1 direção/versão), veredito em frases, Aprovar / Baixar / Nova variação / Adaptar, "Detalhes técnicos ▸", campo vira "Refinar" com a peça pinada |
| Refinado | expandida | desfocada | Peça pronta com v2 em destaque e v1 empilhada; "Comparar v1 ↔ v2" |

Regras:

- Aprovar manda a peça pra Produção na mesa; a caixa volta ao Repouso. Recolher em qualquer estado preserva tudo. Escape fecha primeiro o que estiver aberto dentro.
- **Fila na caixa** lê do servidor (`resolveCreativeWorkStatus`: `generating` / `completed` / `failed`), não de estado local. "✓ pronta — abrir" expande no estado Peça pronta daquele trabalho. "✗ falhou — ver" abre o erro traduzido com "Tentar de novo" (sem cobrar de novo se a reserva já foi compensada). O estado local "Na fila" deixa de existir.
- **Nova variação / Adaptar / Mudar estilo a partir da peça** trocam o protocolo dentro da caixa com a peça já anexada como `content_art`, sem download/re-upload. Em Mudar estilo, a inspiração do palco vira `style_reference` real (o anexo fantasma da auditoria deixa de existir).
- **Rotas.** `/creative-work/:id` redireciona pra Palco com `?workId=` e a caixa abre no estado do trabalho. "Trabalhos" e a sidebar apontam pro mesmo lugar. O link externo de revisão (`/share`, #323) permanece. `CreativeWorkResumeSurface` é aposentado; o reaproveitável vira conteúdo do estado Peça pronta.
- **Linguagem.** Nenhuma chave técnica, hash, "Córtex da Marca v3 · Congelada", "format neutral (unmeasured)" ou inglês fora de "Detalhes técnicos". Restrições do briefing em pt-BR. "1 peça" no singular. A caixa mostra o custo do plano.

### 4.4 Erros

Falha da direção de arte → fallback pro builder atual, marcado na evidência. Falha do provider → chip "✗ falhou" com mensagem traduzida; settlement existente compensa. Avaliador indisponível → "Não verificado" (inconclusive), peça entregue, como já é a regra canônica.

### 4.5 Validação

Vitest nos builders (direção de arte, contrato de 3 regras, tradução de códigos), na máquina de estados do composer (cada transição preserva estado; fila lê do servidor) e nos redirects. E2E com provider controlado: pedir → plano → fila → pronta → refinar → aprovar sem sair do Palco; dois trabalhos em paralelo na fila. Gate final: comparação cega Cenbrap × ChatGPT (4.1).

## 5. Fora deste recorte (spec de Orquestração, depois)

Carrossel ("Organizar conteúdo" morto; fluxo próprio continua como está dentro da caixa), Create post e Assistente órfãos, histórico de créditos incoerente, Sunburst (ICE próprio, percent 0), Layer Editor, polish P3 da auditoria.

## 6. Riscos e pontos de atenção

- Remover o caminho determinístico remove a única prova por hash de copy exata. A aposta é que a verificação por visão + copy validada verbatim no contrato basta. Se a comparação cega mostrar erro de texto recorrente, a resposta é reforçar o contrato de fatos, não voltar ao painel.
- A etapa de direção de arte adiciona uma chamada de texto (~2 s, centavos) e não-determinismo no prompt. O brief fica persistido na evidência justamente pra permitir comparar prompts entre versões.
- `quality: high` aumenta custo por peça. Deve aparecer no plano antes de confirmar.
- Aposentar `/creative-work/:id` como página exige que a caixa suporte todos os estados de um trabalho existente, inclusive falhado e parcialmente concluído (2 de 3 direções prontas).

## 7. Referências

- Auditoria: `docs/evidence/2026-09-10-auditoria-cenbrap-geracoes.md`; prints `docs/screenshots/2026-09-10-auditoria-cenbrap/01–10`.
- Estudos comerciais: `docs/commercial-studies/real-brands/results/` (Nike, MTV, Absolut).
- Código citado: `app/src/server/creative-work/identity-policy.ts`, `typography-plan.ts`, `text-composite.ts`, `prompt.ts`, `brand-fidelity.ts`; `app/src/server/ai/creative-qa.ts`, `providers/openai-image-provider.ts`; `app/src/server/jobs/creative-work.ts:852,1086`.
- Planos relacionados: `docs/plans/2026-09-08-gpt-image-2-5-ice.md` (Sunburst), `docs/plans/2026-09-08-studio-caixa-unificada.md` (PR #325).
- Mockups da discussão (locais, fora do git): `.superpowers/brainstorm/77977-1789047884/content/result-surface.html` (onde vive a peça pronta) e `box-states.html` (estados da caixa e decisão sobre a fila).
