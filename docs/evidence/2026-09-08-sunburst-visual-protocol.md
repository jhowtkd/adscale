# Sunburst — protocolo visual e orçamento

Data: 2026-09-09. Status: **protocolo congelado; lotes pagos não executados**.

Sunburst permanece o padrão proposto. A qualidade de produção será escolhida pela comparação visual entre `high` / `xhigh` / `max`. Não há redução automática para economizar. Flare está fora da migração inicial. Este documento não autoriza gasto nem deploy.

## Campos obrigatórios por caso

| Campo | Conteúdo |
|---|---|
| Identificação | caso, marca, segmento, protocolo, formato, versão do builder e política de execução |
| Fontes | paths dos originais autorizados, SHA-256, ordem/role, snapshot de fatos/copy e referência normalizada |
| Pedido | prompt exato e, quando aplicável, instrução de revisão literal |
| Controle | snapshot `gpt-image-2-2026-04-21`, qualidade efetivamente enviada pelo fluxo atual |
| Candidato | snapshot `gpt-image-2.5-sunburst-2026-09-08`, qualidade explícita |
| Resultado | callId, requestId, usage completo, duração, tamanho solicitado, dimensões do arquivo (Sharp), falhas antes/depois da API |
| Decisão humana | aprovação, preferência cega, preservação, texto/fatos, marca/produto e acabamento |

Não preencher resultados com expectativas. Usage ausente é desconhecido, nunca zero. Usage desconhecido interrompe expansão automática e exige reconciliação.

## Corpus — ainda não selecionado

Ainda não há corpus de três marcas aprovado. A seleção é trabalho operacional explícito, não uma fixture fictícia.

Distribuição proposta quando as fontes locais autorizadas existirem: 3 marcas, 2 segmentos, pelo menos 1 fora de educação. 24 casos: 4 peça única, 4 variação, 4 adaptação, 4 restyle, 4 revisão, 4 posições de carrossel. Os quatro slides isolados **não** provam coerência de deck: decks completos do gate de jornadas entram em conta separada.

Antes das chamadas: conferir fonte normalizada contra original a 100% do tamanho de entrega. Anotar perda de normalização (2.048/q85, quatro referências) separadamente de erro do modelo. Não aumentar limites globais por uma imagem problemática.

## Lotes e tetos revisáveis (não executados)

| Lote | Chamadas de imagem propostas | Finalidade |
|---|---:|---|
| Smoke | 6 casos × 2 modelos = 12 | Compatibilidade; teto proposto US$10 |
| Comparação principal | 24 × 2 × 2 = 96 | Isolar modelo, mesmas entradas e qualidade |
| Revisões sucessivas | 3 sequências × 3 alterações = 9 Sunburst | Acúmulo de deriva; +9 baseline se não houver controle equivalente |
| Calibração | 6 × 3 qualidades × 2 = 36 | high/xhigh/max |

Principal + sequências + calibração: 141 ou 150 chamadas; teto adicional proposto US$50. Decks completos / Gate 8 / QA pago **não** estão nessa conta: levantar quantidade exata e acrescentar ao orçamento antes de executar. Não iniciar lote cujo máximo estimado exceda saldo aprovado.

## Critérios de decisão (quando houver lote autorizado)

- Smoke no mesmo path de produto (edit e generate). Provedor E2E controlado não conta como evidência visual.
- Comparação principal com rótulos A/B aleatórios; chave de modelos fora da tela do avaliador.
- Sequências de edição a partir do mesmo original; correção automática continua nas fontes originais.
- `max` só vence se a imagem vencer. Empate visual consistente: custo/latência desempata.
- Meta inicial: ≥90% das revisões sem mudança material fora do pedido; zero erro crítico de marca/pessoa/oferta/produto. Reportar numerador/denominador. Amostra de nove não dá precisão estatística de produção.
- Gate 8: 10 jornadas humanas, 3 marcas, 2 segmentos, 1 não educacional — separado e ainda não autorizado.
- Custo por aprovada soma tentativas, correções, QA e falhas cobradas. Sem detalhamento suficiente: intervalo/desconhecido, nunca conta inventada.

## Código local já preparado (não substitui o ensaio)

- Invariantes de revisão: `AUTHORIZED CHANGE` / `PRESERVE UNLESS EXPLICITLY CHANGED` no builder.
- Referências: peça-base `revision` obrigatória em primeiro; âncora do carrossel primeiro nos slides não-âncora; limite de quatro.
- Percentual Sunburst permanece 0.

## I5 — coerência de âncora após revisão visual

**Não comprovado.** O fluxo existente gera o painel de âncoras na criação inicial e uma revisão visual de um slide cria um filho com o mesmo `anchorKey`, sem invalidar dependentes nem reconstruir o board. Não declarar I5 apenas porque o painel é gerado. Bloquear a promessa de coerência de deck sob revisão de âncora até uma correção delimitada.

## Visual Task 4 — lote pago

**Não executado.** Sem corpus de três marcas, sem orçamento aprovado, sem chamadas. Qualidade vencedora por operação: desconhecida. Diff de liberação (percentual > 0) não deve ser publicado a partir deste documento.

## I6 — regeneração de camadas (lote à parte)

Seis casos propostos com originais autorizados: cabelo, vidro, sombra, borda fina, embalagem, elemento gráfico. Mesma ordem selecionado/composição, mesmas dimensões, mesmo pedido, política congelada.

Comparar baseline Image 2 e Sunburst no mesmo nível inicial; calibrar high/xhigh/max nas falhas e nos casos discriminantes. **Não** incluir este lote nas 141/150 chamadas do ensaio principal.

Inspeção: PNG a 100%, fundo claro e escuro, composição. Rejeitar halo, recorte perdido, sombra errada, produto/identidade alterados ou composição inteira no lugar do elemento. Alpha presente sozinho não aprova.

Aceitar candidato altera só a camada selecionada, preserva desfazer/restaurar, não duplica quota. Rejeitar mantém a camada anterior.

**Status:** código de reserva/provedor/worker é entrega separada neste PR; validação visual I6 **não executada**. Só ativar I6 após aprovação visual própria. Se a qualidade ótima de camadas divergir do default global, preparar ajuste estático por operação antes de ativar.
