# Estudo de previsibilidade de custos OpenAI

Data: 2026-05-05

## Estado atual do app

O app usa os modelos por variáveis de ambiente:

- `OPENAI_IMAGE_MODEL=gpt-image-2`
- `OPENAI_TEXT_MODEL=gpt-5-mini`

No código, imagem é chamada em três caminhos:

- restilização: `openai.images.generate`
- variação artística com referência: `openai.images.edit`
- adaptação de formato: `openai.images.generate`

O texto é chamado para:

- plano criativo da campanha
- análise visual da imagem de referência
- análise de conteúdo/estilo na restilização

Observação: a hipótese de negócio pode usar `gpt-5.4-mini` como baseline de preço, mas o ambiente local ainda está configurado como `gpt-5-mini`. Antes de fechar pricing comercial, decidir se o produto vai padronizar em `gpt-5.4-mini` ou manter `gpt-5-mini` e medir custo real.

## Preços de referência usados

Fonte: pricing oficial da OpenAI em `https://developers.openai.com/api/docs/pricing`, consultado em 2026-05-05.

Baseline para texto:

- `gpt-5.4-mini`: input US$ 0.75 / 1M tokens
- `gpt-5.4-mini`: cached input US$ 0.075 / 1M tokens
- `gpt-5.4-mini`: output US$ 4.50 / 1M tokens

Baseline para imagem:

- `gpt-image-2` image input: US$ 8.00 / 1M tokens
- `gpt-image-2` cached image input: US$ 2.00 / 1M tokens
- `gpt-image-2` output: US$ 30.00 / 1M tokens
- `gpt-image-2` text input: US$ 5.00 / 1M tokens
- `gpt-image-2` cached text input: US$ 1.25 / 1M tokens

## Fórmula por campanha

Separar custo em quatro blocos:

1. Plano criativo:

```txt
plan_cost =
  (plan_input_tokens / 1_000_000 * text_input_price)
  + (plan_output_tokens / 1_000_000 * text_output_price)
```

2. Análise visual opcional:

```txt
analysis_cost =
  (analysis_text_tokens / 1_000_000 * text_input_price)
  + (analysis_image_tokens / 1_000_000 * text_input_price_or_vision_rate)
  + (analysis_output_tokens / 1_000_000 * text_output_price)
```

3. Imagem gerada:

```txt
image_cost =
  (image_prompt_text_tokens / 1_000_000 * image_text_input_price)
  + (reference_image_tokens / 1_000_000 * image_input_price)
  + (generated_image_tokens / 1_000_000 * image_output_price)
```

4. Campanha:

```txt
campaign_cost =
  plan_cost
  + analysis_cost
  + (image_cost * number_of_outputs)
```

## Cenário base

Parâmetros usados na calculadora inicial:

- 80 campanhas/mês
- 6 imagens por campanha
- 3.000 input tokens no plano
- 1.200 output tokens no plano
- 900 tokens de texto por imagem
- 3.200 tokens de imagem de referência
- 8.000 tokens de imagem gerada

Resultado aproximado:

- plano criativo: US$ 0.01 por campanha
- imagem: US$ 0.27 por output
- campanha com 6 imagens: US$ 1.62
- 80 campanhas/mês: US$ 129.94
- orçamento com folga de 25%: US$ 162.43

Para precificar no Brasil, usar câmbio gerencial, não spot. Em 2026-05-05, a cotação consultada estava perto de R$ 4,93 por US$ 1,00. Para planejamento comercial, usar R$ 5,50 por US$ 1,00.

Com câmbio gerencial de R$ 5,50:

- imagem: ~R$ 1,48 por output
- campanha com 6 imagens: ~R$ 8,94
- campanha com folga de 25%: ~R$ 11,17
- 80 campanhas/mês com folga: ~R$ 893,62

Esses números são aproximações. O custo real depende da tokenização de imagem, tamanho/qualidade retornada, uso de cache e quantidade de chamadas auxiliares.

## Implicação para planos

Com o cenário base em reais, a proposta inicial deve ter três tiers simples:

| Tier | Preço | Volume incluído | Saídas estimadas | Custo protegido | Margem bruta estimada |
| --- | ---: | ---: | ---: | ---: | ---: |
| Trial | R$ 0 | 1 campanha única | 6 imagens totais | ~R$ 11,17 | custo de aquisição |
| Starter | R$ 47/mês | 1 campanha/mês | 6 imagens/mês | ~R$ 11,17 | ~76% |
| Growth | R$ 147/mês | 4 campanhas/mês | 24 imagens/mês | ~R$ 44,68 | ~70% |
| Scale | R$ 397/mês | 12 campanhas/mês | 72 imagens/mês | ~R$ 134,04 | ~66% |

Conclusão: dá para começar em R$ 47, mas esse tier precisa ser uma porta de entrada, não um plano de alto volume. O Trial deve ser tratado como custo de aquisição, com limite único e bloqueio automático ao terminar. Com `gpt-image-2`, o plano não pode prometer campanhas ilimitadas. O volume incluído deve ser expresso em campanhas e também em imagens/saídas, porque o custo real cresce por output.

## Recomendação de produto

Não vender tokens OpenAI diretamente.

Criar uma unidade interna chamada crédito, com conversão controlada:

- `1 imagem gerada = N créditos`
- `1 plano criativo = N créditos`
- `1 restilização = N créditos`
- `1 adaptação 1:1/4:5/9:16 = N créditos por output`

Começar com margem defensiva:

- custo OpenAI estimado
- +25% reserva operacional
- +15% erro de tokenização/variação
- +margem bruta alvo do plano

Exemplo prático:

- se uma imagem custa ~R$ 1,48, tratar internamente como ~R$ 1,85 com folga
- se uma campanha média gera 6 imagens, tratar a campanha como ~R$ 11,17 de custo protegido
- evitar planos baratos com 80+ campanhas incluídas, porque a margem fica muito apertada

## Instrumentação necessária

Para previsibilidade real, implementar ledger de uso:

- `workspaceId`
- `campaignId`
- `derivationId`
- `operation`: plan, analysis, image_generate, image_edit, restyling
- `model`
- `inputTokens`
- `cachedInputTokens`
- `outputTokens`
- `imageInputTokens`
- `imageOutputTokens`
- `estimatedCostUsd`
- `actualCostUsd`
- `internalCreditsCharged`
- `createdAt`

O app já tem `trackUsage`, mas hoje ele registra `credits=1` por derivação, sem custo real por modelo. O próximo passo é trocar isso por custo granular.

## Próximas decisões

1. Confirmar modelo de texto final:
   - manter `gpt-5-mini`
   - ou migrar para `gpt-5.4-mini`

2. Definir unidade de crédito:
   - sugestão inicial: 1 crédito = R$ 0,50 de custo protegido
   - imagem `gpt-image-2`: 4 créditos
   - plano criativo: 1 crédito
   - restilização com duas análises + imagem: 5 a 7 créditos

3. Definir limites comerciais:
   - Trial: R$ 0, 30 créditos totais, uma vez por workspace
   - Starter: R$ 47/mês, 30 créditos/mês
   - Growth: R$ 147/mês, 120 créditos/mês
   - Scale: R$ 397/mês, 360 créditos/mês

4. Adicionar alertas:
   - 80% do limite
   - 100% do limite
   - custo real acima do estimado em mais de 20%

## Conclusão

Sim, dá para ter previsibilidade, mas só se o app parar de tratar uma derivação como `1 crédito` fixo e passar a registrar custo por operação/modelo. Com `gpt-image-2`, o preço comercial deve ser desenhado em torno de outputs de imagem, não em torno de campanhas. Campanhas variam demais: uma campanha com 3 imagens e uma campanha com 18 imagens têm economias completamente diferentes.
