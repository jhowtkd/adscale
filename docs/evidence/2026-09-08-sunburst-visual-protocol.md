# Sunburst — protocolo visual e orçamento

Data: 2026-09-09. Status: **corpus selecionado; smoke executado (12/12, ~US$0,51); demais lotes não autorizados**.

Sunburst permanece o padrão proposto. A qualidade de produção será escolhida pela comparação visual entre `high` / `xhigh` / `max`. Não há redução automática para economizar. Flare está fora da migração inicial. Este documento não autoriza gasto nem deploy. Percentual Sunburst permanece **0**.

Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.

Catálogo máquina: `docs/evidence/2026-09-08-sunburst-visual-corpus.json`. Verificar hashes locais (nunca chama OpenAI):

```bash
cd app && node scripts/check-sunburst-visual-corpus.mjs --binaries-root /Users/jhonatan/Repos/ADScale_2
```

Worktrees não copiam os binários gitignored. O `--binaries-root` aponta para o checkout que contém `docs/commercial-studies/real-brands/originals/` e `results/`. Não commitar esses arquivos.

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

Não preencher resultados com expectativas. Usage ausente é desconhecido, nunca zero. Usage desconhecido interrompe expansão automática e exige reconciliação. Os campos `result` do catálogo permanecem `null` até existir lote autorizado.

O texto de `promptSha256` das peças aprovadas em 2026-08-28/29 não foi persistido — só o hash. Os pedidos congelados neste corpus são as instruções literais do catálogo, derivadas dos dossiês e do seed `seed-commercial-brand-studies.ts`. Não tratar o hash histórico como o prompt do ensaio.

## Corpus selecionado

Fontes reais do kit `docs/commercial-studies/real-brands`. Não é fixture de educação (`app/tests/fixtures/creative-corpus/`). Não usar `run-image-harness-blind-comparison.ts` como prova do Estúdio.

| Marca | Segmento | Fora de educação | Originais | Resultados isolados aprovados |
|---|---|---|---:|---:|
| Nike | esporte | sim | 2 | 2 |
| MTV | mídia | sim | 2 | 2 |
| Absolut | destilados | sim | 1 | 2 |

Três marcas, três segmentos, nenhum caso educacional. Disclaimer: estudo interno, sem afiliação.

### Originais (gitignored; SHA-256 conferido em 2026-09-09)

| Arquivo | SHA-256 | Dimensão |
|---|---|---|
| `nike-just-do-it-1988-card.jpg` | `76953e7c80dd3b59ab24229adb698fa4e08f7973bfeb99a3ffbe6b23e7eb578e` | 880×495 |
| `nike-walt-stack-1988-card.jpg` | `f05c5540636bf082d41be226f7fa38d7b048322ff120358d6332ece4d236c0a0` | 880×495 |
| `mtv-id-1981-a.jpg` | `a61b7dc3a323279007d1fb18026b2f32c946b44b010c6125009df4d015bb2515` | 500×377 |
| `mtv-id-1981-b.jpg` | `a663b32d9aea9018c571271e96c70a47adf793f3208a8bb09f8a3b27d03da0ee` | 167×125 |
| `absolut-perfection-1980.jpg` | `a71cd7ab0e986e7d86d882576e70db6a94ffb0f6219fa1889aba922e7cc84f46` | 2000×1500 |

### Resultados aprovados (gitignored; 1080×1350 PNG)

Hashes iguais a `docs/commercial-studies/real-brands/evidence/ARTIFACTS.json`. Usados como peça-base de variação, adaptação 9:16/1:1, restyle e revisão. Não são originais de campanha.

### Distribuição dos 24 casos

4 peça + 4 variação + 4 adaptação + 4 restyle + 4 revisão + 4 carrossel.

- **20 ready** — binário autorizado + instrução literal no catálogo.
- **4 blocked (carrossel)** — não há deck autorizado neste kit. Peça única 4:5 não prova capa/miolo/fechamento nem dependentes. Não inventar imagens.

IDs ready: `piece-nike-just-do-it-4x5`, `piece-nike-walt-stack-system`, `piece-mtv-network-id-4x5`, `piece-absolut-perfection-4x5`, `variation-mtv-skin-change`, `variation-nike-copy-only`, `variation-absolut-concept`, `variation-nike-approved-sibling`, `adaptation-mtv-landscape-to-4x5`, `adaptation-absolut-print-to-4x5`, `adaptation-nike-approved-to-9x16`, `adaptation-mtv-approved-to-1x1`, `restyle-mtv-keep-skeleton`, `restyle-nike-keep-action`, `restyle-absolut-keep-bottle`, `restyle-mtv-keep-composition`, `review-nike-copy-only`, `review-mtv-element-only`, `review-absolut-color-only`, `review-nike-preserve-rest`.

Smoke (6, um par por marca + variação/restyle/revisão): `piece-nike-just-do-it-4x5`, `piece-mtv-network-id-4x5`, `piece-absolut-perfection-4x5`, `variation-mtv-skin-change`, `restyle-absolut-keep-bottle`, `review-nike-copy-only`.

## Normalização 2048 / WebP q85

Inspecionado em 2026-09-09 com `normalizeCreativeWorkReferenceImage` (long edge 2048, sem enlarge, opacos em WebP q85).

- Nenhum original ultrapassa 2048: **não houve downscale**.
- Os SHA-256 WebP atuais batem com os hashes de referência do estudo comercial (`evidence/nike|mtv|absolut/*.json`). A recompressão é estável.
- Perda visível a esperar **antes** do modelo: cartões Nike já são tipografia pequena em JPEG 880×495; `mtv-id-1981-b` tem 167×125. Julgar nitidez de serifa/rótulo contra o original a 100% do tamanho de entrega; não contar essa suavização como erro Sunburst.
- Absolut 2000×1500 conserva dimensão; o risco é banding do holofote e texto legal miúdo após WebP, não corte dimensional.
- Quatro referências mantidas. Não aumentar limites globais por uma imagem problemática.

## Lotes e tetos

| Lote | Chamadas | Autorização 2026-09-09 | Finalidade |
|---|---:|---|---|
| Smoke | 6 casos × 2 modelos = 12 | **aprovado**, teto US$10 | Compatibilidade no path de produto; qualidade `medium` nos dois modelos |
| Comparação principal | 24 × 2 × 2 = 96 (80 executáveis) | não | Isolar modelo |
| Revisões sucessivas | 9 Sunburst (+9 baseline) | não | Acúmulo de deriva |
| Calibração | 36 | não | high/xhigh/max |

Smoke usa `OpenAIImageProvider` (edit, porque todos os 6 casos têm referências). Não usa o harness legado nem o provedor E2E controlado. Generate sem referências fica para um lote seguinte, se o teto restante e uma autorização extra permitirem — não entra nestas 12.

**Execução 2026-09-09:** 12/12 ok, estimado Standard US$ 0,511, arquivos 1088×1360. Evidência: `docs/evidence/sunburst-visual-runs/smoke/`.

```bash
cd app && npm run sunburst:visual-smoke -- --dry-run --binaries-root /Users/jhonatan/Repos/ADScale_2
cd app && npm run sunburst:visual-smoke -- --confirm-paid --binaries-root /Users/jhonatan/Repos/ADScale_2
```

Parar se `usage` vier ausente (desconhecido, nunca zero) ou se o estimado Standard atingir US$10. Percentual Sunburst permanece 0. Flare fora. `maxRetries: 0`. Sem `input_fidelity`.

Principal + sequências + calibração: teto adicional proposto US$50 **ainda não aprovado**.


## Critérios de decisão (quando houver lote autorizado)

- Smoke no mesmo path de produto (edit e generate). Provedor E2E controlado não conta como evidência visual.
- Comparação principal com rótulos A/B aleatórios; chave de modelos fora da tela do avaliador.
- Sequências de edição a partir da peça aprovada de cada marca; correção automática continua nas fontes originais.
- `max` só vence se a imagem vencer. Empate visual consistente: custo/latência desempata.
- Meta inicial: ≥90% das revisões sem mudança material fora do pedido; zero erro crítico de marca/pessoa/oferta/produto. Reportar numerador/denominador. Amostra de nove não dá precisão estatística de produção.
- Gate 8: 10 jornadas humanas, 3 marcas, 2 segmentos, 1 não educacional — separado e ainda não autorizado.
- Custo por aprovada soma tentativas, correções, QA e falhas cobradas. Sem detalhamento suficiente: intervalo/desconhecido, nunca conta inventada.

## Código local já preparado (não substitui o ensaio)

- Invariantes de revisão: `AUTHORIZED CHANGE` / `PRESERVE UNLESS EXPLICITLY CHANGED` no builder **generativo e determinístico**.
- Referências: peça-base `revision` obrigatória em primeiro; âncora do carrossel primeiro nos slides não-âncora; limite de quatro.
- Percentual Sunburst permanece 0.

## I3 — revisão com tipografia determinística

**Feito** em `main` (#326 e follow-ups). Com fonte aprovada, `buildProviderOnlyPrompt` recebe `mode` e `revisionInstruction`.

## I5 — coerência de âncora após revisão visual

**Feito no código** (#328): revisão visual/retry de âncora invalida dependentes, cria drafts e deixa a cadeia reconstruir o board; `generation_in_flight` se dependente já corre.

**Ainda bloqueado como caso visual:** não há deck de carrossel autorizado neste corpus. O código não substitui Gate 8.

## Visual Task 4 — lote pago

### Smoke — executado 2026-09-09

12/12 chamadas `images.edit` no `OpenAIImageProvider`. Qualidade pedida e devolvida: `medium`. Tamanho pedido e arquivo: **1088×1360** PNG. `usage` presente em todas (base `detailed`). Percentual Sunburst **0**. Flare fora. `maxRetries: 0`.

| | Chamadas | Estimativa Standard | Duração média |
|---|---:|---:|---:|
| Image 2 (`gpt-image-2-2026-04-21`) | 6 | US$ 0,362 | 40,4 s |
| Sunburst (`gpt-image-2.5-sunburst-2026-09-08`) | 6 | US$ 0,149 | 25,4 s |
| Total | 12 | **US$ 0,511** / teto 10 | |

Isso **não** é faturamento reconciliado nem veredito de qualidade. Sunburst devolveu 397 tokens de imagem de saída vs 1587 no Image 2, no mesmo `medium`; custo/latência menores não escolhem o modelo. `max` só vence se a imagem vencer, na calibração ainda não autorizada.

Revisão humana: abrir `docs/evidence/sunburst-visual-runs/smoke/review.html` **antes** de `manifest.json` (lá está a chave A/B). PNGs gitignored, ficam no mesmo diretório `images/`.

Generate sem referências **não** entrou neste 12: os seis casos do catálogo têm fontes, então o path de produto foi edit.

### Ainda não autorizado

Principal, sequências, calibração high/xhigh/max, Gate 8 e I6 visual. Qualidade vencedora por operação: **desconhecida**. Diff de liberação (percentual > 0) não deve ser publicado a partir deste documento.

## I6 — regeneração de camadas (lote à parte)

Seis casos propostos: cabelo, vidro, sombra, borda fina, embalagem, elemento gráfico. **Não** incluir nas 141/150 chamadas do ensaio principal.

Absolut cobre embalagem/vidro como *sujeito* de peça, MTV cobre gráfico como *sujeito* de peça. Isso **não** é PNG de camada transparente. Não há original autorizado com alpha para recorte. Bloqueado até layerize das peças aprovadas ou origem nova, com orçamento próprio.

Inspeção futura: PNG a 100%, fundo claro e escuro, composição. Rejeitar halo, recorte perdido, sombra errada, produto/identidade alterados ou composição inteira no lugar do elemento. Alpha presente sozinho não aprova.

**Status:** código de reserva/provedor/worker já está em `main`. Validação visual I6 **não executada**.
