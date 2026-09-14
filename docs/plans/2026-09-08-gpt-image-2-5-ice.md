# GPT Image 2.5 no ADScale — estudo e plano ICE

Data: 8 de setembro de 2026. Status: proposta para decisão; não implementada.

Diretriz do usuário incorporada em 08/09/2026: **sempre priorizar qualidade**. Essa decisão orienta o plano; não constitui ativação de modelos ou autorização de gasto.

Base local inspecionada: commit `ac38a30e`, com trabalho não commitado de outras tarefas preservado. Foram consultados anúncio, páginas dos modelos, guias de geração e prompting, referência de edição, preços e system card oficiais. A configuração declarada no repositório foi inspecionada; o ambiente de produção e a habilitação dos novos modelos na conta não foram consultados. Nenhuma geração paga foi executada.

## Recomendação

Adotar **Sunburst como modelo padrão proposto para geração e edição**, validando sua qualidade em todos os Protocolos antes do lançamento. Selecionar os parâmetros pela melhor qualidade visual observada: fidelidade à marca e ao produto, precisão do texto, composição, acabamento e preservação nas revisões. Custo e velocidade são critérios secundários, usados para otimizar configurações de qualidade equivalente.

Flare fica fora da migração inicial. Uma adoção futura só se justifica com qualidade equivalente ao Sunburst no fluxo avaliado, comprovada por comparação visual; atingir um mínimo aceitável não basta. Em caso de dúvida, manter Sunburst. Qualidade prioritária também não implica escolher `max` pelo nome: comparar os níveis e usar o que efetivamente produz o melhor resultado, sem reduzir qualidade para cumprir uma meta de velocidade ou economia.

O ganho estratégico é produzir peças melhores e fazer uma boa direção criativa sobreviver às variações, adaptações e revisões. Redução de retrabalho e aumento de peças utilizáveis por hora são consequências desejáveis, subordinadas à qualidade da entrega. Mais imagens geradas, isoladamente, não demonstram nenhum desses benefícios.

Aproveitar o executor, Brand Training, referências, contratos, revisão e carrossel existentes. Manter uma implementação de geração e uma política pequena de seleção de modelo; não criar outro estúdio, outro provedor, um agente roteador ou uma nova plataforma de avaliação.

## 1. O que o update efetivamente oferece

| Capacidade | Evidência e limite | Aplicação no ADScale |
| --- | --- | --- |
| Flare | Modelo orientado à velocidade. O anúncio fala em latência 50% menor; o guia de prompting descreve qualidade comparável ao Image 2 e exige comparação no próprio caso de uso. | Alternativa futura somente onde demonstrar qualidade equivalente ao padrão Sunburst. |
| Sunburst | Modelo orientado à qualidade e precisão de edição, com maior tempo de geração. | Padrão proposto para peças, variações, adaptações, revisões, carrosséis e elementos em camadas. |
| Melhor preservação | Melhorias anunciadas em sujeito, identidade, composição e continuidade de edições. Não há garantia de igualdade de pixels. | Editar uma peça aprovada preservando produto, marca e composição; manter a revisão humana. |
| Transparência | Os dois modelos suportam fundo transparente em PNG/WebP. Isso já existia em preview no Image 2; não é capacidade inteiramente nova. | Regeneração de elementos no editor de camadas e recortes de produto com alpha real. |
| `xhigh` e `max` | Novos níveis, além de `low`, `medium`, `high` e `auto`. Mesma etiqueta não significa mesmo resultado ou duração entre modelos. | Comparar `high`, `xhigh` e `max` para escolher a melhor entrega visual, incluindo melhorias em peças que já seriam aprovadas. |

Fontes: [anúncio](https://openai.com/index/introducing-chatgpt-images-2-5/), [Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst), [prompting e migração](https://developers.openai.com/api/docs/guides/image-prompting), [edição](https://developers.openai.com/api/reference/resources/images/methods/edit).

IDs documentados para uma comparação reproduzível:

```text
controle: gpt-image-2-2026-04-21
Flare:    gpt-image-2.5-flare-2026-09-08
Sunburst: gpt-image-2.5-sunburst-2026-09-08
```

Usar snapshots datados na validação e no lançamento aprovado. Registrar o modelo solicitado; o campo atual de metadados repete a configuração enviada e não constitui, sozinho, uma confirmação independente do modelo executado pelo serviço.

**Capacidades disponíveis, mas não todas novas no 2.5:** Image API para gerar/editar; Responses API para interação conversacional; máscaras; referências múltiplas; tamanhos personalizados; streaming de imagens parciais. O ADScale já usa Image API, que continua adequada à sua execução por trabalho e revisão persistida. Migrar para Responses não é requisito para editar sucessivamente: a próxima chamada de edição pode receber a peça anterior. Responses acrescentaria contexto, cobrança do modelo principal e mudanças no controle das operações. [Guia da API](https://developers.openai.com/api/docs/guides/image-generation).

O limite documentado é de até 16 imagens de entrada. Dimensões devem ter lados múltiplos de 16, até 3.840 pixels por lado, razão máxima 3:1 e área entre 655.360 e 8.294.400 pixels. Acima de 3.686.400 pixels, o suporte é experimental. Os formatos atuais de anúncio cabem nesse contrato; aumentar para 4K não é requisito da migração. Máscaras orientam o modelo, sem garantir imobilidade absoluta fora da região. [Referência de edição](https://developers.openai.com/api/reference/resources/images/methods/edit), [limites de geração](https://developers.openai.com/api/docs/guides/image-generation).

Sketch, comentários sobre imagens, templates e compartilhamento de prompts são experiências do ChatGPT. Não há, nas fontes consultadas, uma API que entregue essas interfaces prontas para embutir no ADScale. Um rascunho visual pode ser uma referência; desenhar, comentar, versionar e aplicar essa intenção na interface seriam trabalho nosso. [Anúncio](https://openai.com/index/introducing-chatgpt-images-2-5/).

Há pequenas diferenças de redação entre as fontes: o anúncio caracteriza a qualidade do Flare como superior à do Image 2; o guia de migração usa “comparável”. O plano adota a interpretação conservadora: testar não inferioridade antes de prometer qualidade superior. As páginas de modelo também alertam contra usar o calculador do Image 2 para inferir consumo do 2.5, enquanto o guia de geração já descreve uma seleção de modelos no calculador. Por isso o custo será decidido pelo `usage` das chamadas, e não por uma estimativa transplantada.

## 2. Onde o ADScale está preparado — e onde perde oportunidade

| Evidência local atual | Consequência para o plano |
| --- | --- |
| [Configuração de modelos](/Users/jhonatan/Repos/ADScale_2/app/src/server/validation/env.ts:24) e [Render web](/Users/jhonatan/Repos/ADScale_2/render.yaml:59)/[worker](/Users/jhonatan/Repos/ADScale_2/render.yaml:148) fixam `gpt-image-2-2026-04-21`. | Coordenar web e worker. Alterar apenas um serviço pode produzir resultados diferentes para o mesmo fluxo. O estado do Render ao vivo ainda precisa ser verificado. |
| [Provedor central](/Users/jhonatan/Repos/ADScale_2/app/src/server/ai/providers/openai-image-provider.ts:49) chama `images.edit` com referências e `images.generate` sem elas. | Troca básica é pequena; não precisa de nova integração. Preservar a implementação determinística usada em E2E. |
| [Interface do provedor](/Users/jhonatan/Repos/ADScale_2/app/src/server/ai/providers/image-provider.ts:24) aceita somente `medium`/`high`; o [executor](/Users/jhonatan/Repos/ADScale_2/app/src/server/generation/pipeline/execute.ts:123) não encaminha uma qualidade explícita, e a camada inferior assume `medium`. | Os novos níveis não chegam ao motor. Antes de otimizar, registrar qual qualidade cada fluxo realmente envia; “high-quality” em comentário não equivale a `quality: high`. |
| O [executor](/Users/jhonatan/Repos/ADScale_2/app/src/server/generation/pipeline/execute.ts:50) converte `creative_revision` e `social_post` em `art_variation` para o provedor. | Resolver parâmetros de qualidade e registrar a intenção antes dessa conversão. Sunburst será comum aos fluxos; não é necessário um roteador entre modelos na primeira fase. |
| O provedor registra modelo, duração e request ID, mas descarta `response.usage`. A [evidência persistida](/Users/jhonatan/Repos/ADScale_2/app/src/server/jobs/creative-work.ts:145) já guarda prompt, hashes e referências. | Acrescentar consumo e configuração à evidência existente. Hoje não se calcula custo real por peça aprovada a partir desse retorno. |
| [Revisão existente](/Users/jhonatan/Repos/ADScale_2/app/src/server/application/revise-creative-work-output.ts:31) cria uma saída ligada à anterior, com settlement próprio; [referências](/Users/jhonatan/Repos/ADScale_2/app/src/server/creative-work/reference-plan.ts:140) priorizam revisão e fontes obrigatórias. | Melhorar esse fluxo com Sunburst e instruções de preservação, mantendo ancestralidade e o original. Não criar um chat de imagens paralelo. |
| A [correção objetiva automática](/Users/jhonatan/Repos/ADScale_2/app/src/server/jobs/creative-work.ts:1553) parte do prompt e fontes congelados, mantendo a política de duas chamadas no caminho direto. | Revisão de uma peça aceita e recuperação de uma peça objetivamente errada são operações diferentes. Não alimentar a correção com uma peça defeituosa nem alterar essa política junto da primeira migração. |
| [Plano de referências](/Users/jhonatan/Repos/ADScale_2/app/src/server/creative-work/reference-plan.ts:140) e job limitam a quatro imagens; há prioridade entre fontes. A [normalização](/Users/jhonatan/Repos/ADScale_2/app/src/server/creative-work/reference-normalize.ts:22) limita o lado a 2.048 e recomprime opacas em WebP q85. | Testar se detalhes de embalagem e texto se perdem antes de chegar ao modelo. Ampliar referências ou resolução somente nos casos que demonstram necessidade, preservando limites de memória. |
| [Carrossel](/Users/jhonatan/Repos/ADScale_2/app/src/server/creative-work/carousel-visual.ts:229) já tem painel de âncoras, contact sheet e revisão do conjunto. | Aproveitar coerência entre slides; não substituir isso por slides gerados independentemente. |
| [Editor de camadas](/Users/jhonatan/Repos/ADScale_2/app/src/server/layer-editor/openai-provider.ts:9) fixa `gpt-image-2` e já solicita PNG transparente. | A variável global não atualiza esse fluxo. Testar Sunburst ali separadamente e manter validação de transparência e aceitação da edição. |
| [Formatos](/Users/jhonatan/Repos/ADScale_2/app/src/lib/formats.ts:92) já geram em proporções adequadas: `1088x1088`, `1088x1360`, `1152x2048`, entre outras. | Preservar a tabela na primeira comparação. A validação ainda não confere área mínima/máxima; completar isso antes de aceitar dimensões novas. |
| [Render](/Users/jhonatan/Repos/ADScale_2/render.yaml:99) declara os flags de recuperação de qualidade e Brand Cortex de peça única como falsos. O [job](/Users/jhonatan/Repos/ADScale_2/app/src/server/jobs/creative-work.ts:623) decide pela política congelada do trabalho. | Não presumir que todo trabalho usa o caminho direto ou todo o Cortex. Segmentar resultados por política congelada; ativação desses recursos é decisão separada. |

O SDK instalado é `openai@6.34.0`. Aceita nomes de modelo em string, mas suas tipagens de qualidade não contêm `xhigh`/`max`. A fase inicial com `medium` pode reaproveitá-lo; a fase de qualidade exigirá atualização pontual verificada ou adaptação tipada restrita ao provedor, sem espalhar coerções pelo código.

Análise de imagens continua separada de geração: [image-analysis.ts](/Users/jhonatan/Repos/ADScale_2/app/src/server/ai/image-analysis.ts:79) usa `OPENAI_TEXT_MODEL` pela Responses API. Este estudo não propõe migrar o modelo de análise, briefing ou julgamento ao mesmo tempo.

## 3. Priorização ICE

Convenção deste plano: **ICE = Impacto × Confiança × Facilidade ÷ 10**, normalizado até 100. Cada dimensão vai de 1 a 10; maior Facilidade significa menor esforço. A divisão por 10 não altera a ordem. Notas são estimativas para o ADScale, não probabilidades nem resultados de benchmark.

- Impacto: efeito esperado na qualidade visual final, fidelidade, precisão, preservação e cobertura dos protocolos. 10 = eleva o padrão geral; 9 = afeta amplamente o fluxo principal; 7–8 = impacto forte em um fluxo; 5 = ganho restrito. Velocidade e economia não compensam perda de qualidade na decisão.
- Confiança: 8 = fonte oficial e encaixe concreto no código, ainda sem ensaio próprio; 7 = benefício depende mais do corpus; 5–6 = demanda ou ganho pouco demonstrado. Nenhuma melhoria de modelo recebe 10 sem validação própria.
- Facilidade incremental: 9 ≈ até dois dias úteis após pré-requisitos; 7 ≈ três a cinco; 6 ≈ cinco a oito; 4 ≈ dez a quinze. Inclui implementação e testes focados; não inclui espera por aprovação, API ou revisão humana. Estimativa de um desenvolvedor familiarizado com o código.

**Pré-requisito P0, fora da disputa ICE:** preparar baseline, instrumentação de consumo e controle da migração. É a condição para avaliar todas as iniciativas, não uma feature competindo com elas.

| Ordem | Iniciativa | I | C | E | ICE | Por que tem essa posição |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| I1 | Sunburst como padrão de geração e edição | 10 | 8 | 9 | **72,0** | Prioriza a capacidade de qualidade no fluxo central com reaproveitamento da integração. |
| I2 | Selecionar a melhor qualidade por operação, comparando `high`/`xhigh`/`max` | 10 | 8 | 7 | **56,0** | Destrava os novos níveis e escolhe pelo resultado visual, inclusive acima do mínimo de aprovação. |
| I3 | Revisão precisa que preserva a peça aprovada | 9 | 8 | 7 | **50,4** | Melhora a fidelidade das alterações; exige preservar intenção, referências e testar a sequência. |
| I4 | Referências e prompts focados em produto, marca e fatos | 9 | 7 | 7 | **44,1** | Protege detalhes e direção visual antes de chegarem ao modelo; depende da integridade das fontes. |
| I5 | Coerência e revisão localizada de carrosséis | 8 | 7 | 6 | **33,6** | Multiplica o aproveitamento por trabalho; precisa medir o conjunto e seus custos. |
| I6 | Transparência e regeneração de elementos no editor de camadas | 7 | 8 | 6 | **33,6** | Integração já existe, porém serve uma parcela menor do uso e exige QA de recortes. |
| I7 | Marcação de região para edição no Estúdio | 7 | 6 | 4 | **16,8** | Melhora a expressão da intenção, mas demanda interface, coordenadas, máscaras e validação. |
| I8 | Prévia durante a geração por streaming | 5 | 6 | 4 | **12,0** | Pode tornar a espera pelo Sunburst mais clara sem reduzir qualidade; exige transporte de eventos e custo adicional. |
| I9 | Exportação 2K/4K sob demanda | 5 | 5 | 4 | **10,0** | Pouco ganho demonstrado para os formatos atuais; área maior pressiona custo, memória e avaliação. |

No empate I5/I6, priorizar carrossel pela abrangência no Estúdio. Recalcular com distribuição real de uso. Se o editor concentrar demanda ou receita, a ordem muda. Uma iniciativa não avança só por ter nota alta: dependências e critérios de qualidade vêm primeiro.

## 4. Implementação proposta

### P0 — tornar o resultado mensurável e a troca reversível

Reutilizar `generationEvidence`, a telemetria de estágios e os artefatos de avaliação existentes. Por chamada, conservar: trabalho/peça, intenção canônica, política congelada, modelo solicitado, qualidade, tamanho solicitado e retornado, formato, referências e seus hashes, request ID, tokens de texto/imagem/cache, duração e resultado. Separar o custo estimado por tokens do custo reconciliado com faturamento. `usage` ausente é desconhecido, nunca zero.

Capturar o retorno antes de upload, normalização e avaliação: uma imagem gerada pode ser cobrada mesmo quando uma etapa posterior falha. Registrar também tentativas descartadas, chamadas de correção e falhas cuja cobrança seja incerta. Preservar todos os dados já necessários à auditoria, sem um segundo banco de telemetria.

Congelar no trabalho a decisão de renderização relevante à execução: modelo, qualidade e versão de política, com leitura compatível para snapshots existentes. Reutilizar o mecanismo atual de políticas versionadas. Não deixar um retry escolher um modelo diferente porque alguém mudou uma variável no meio da execução. Esta evolução do contrato de snapshot precisa constar do diff de implementação aprovado.

O baseline deve separar `legacy` de `quality_recovery_v1`, geração de revisão, carrossel e camadas. Validar flags efetivos em web/worker antes de interpretar resultados como produção. Não ativar o Cortex nem migrar o fluxo legado silenciosamente para favorecer um resultado de teste.

### I1–I3 — modelo e qualidade sem complicar a interface

Resolver uma configuração explícita antes de `toProviderMode`, usando o Protocolo, a existência de peça anterior e o tipo de trabalho. Encaminhá-la pelo executor existente. Nenhuma chamada extra de LLM para decidir o modelo.

Política candidata, sujeita ao benchmark:

| Operação | Primeira comparação | Regra de adoção |
| --- | --- | --- |
| Peça única/variações que hoje passam | Image 2 × Sunburst, mesma qualidade efetivamente enviada | Buscar melhor composição, acabamento e fidelidade, além de aprovação. |
| Brief complexo que hoje falha | Image 2 × Sunburst, mesma entrada | Resolver a falha e selecionar a configuração com melhor qualidade final. |
| Revisão pedida pelo usuário | Image 2 × Sunburst sobre o mesmo original | Avaliar cumprimento da alteração, acabamento e preservação do restante. |
| Adaptação de formato/restyle | Image 2 × Sunburst com conteúdo e estilo nas mesmas posições | Preservar mensagem/produto e entregar a melhor composição na nova proporção. |
| Carrossel | Comparar o deck inteiro com Sunburst contra o baseline | Usar Sunburst em âncoras e slides; validar qualidade e coerência do conjunto. |
| Elemento transparente | Comparar o provedor atual de camadas com Sunburst | Aprovar alpha, contorno, identidade e aplicação na composição. |

Manter `medium` somente na comparação inicial onde esse é o parâmetro atual, para isolar a troca de modelo. Essa comparação não define a configuração final. Na etapa seguinte, comparar `high`, `xhigh` e `max` no Sunburst e selecionar a melhor qualidade observada por operação, mesmo que uma opção inferior já fosse aceitável. Em empate visual sustentado, preferir menor custo e latência. A qualidade deve ser explícita e auditável; `auto` atrapalha comparações controladas.

A política direta preserva uma chamada por peça visível e o teto existente de recuperação. Não gerar três candidatos escondidos, reduzir automaticamente modelo/qualidade por lentidão ou duplicar chamadas por timeout. Manter `maxRetries: 0`; corrigir classificação de erros quando necessário, distinguindo limite transitório, quota e erro de entrada/moderação. Troca de modelo não resolve indisponibilidade geral da OpenAI.

### I3 — revisão que preserva o trabalho já aprovado

Melhorar a revisão existente: peça-base identificada, instrução curta, campos que podem mudar e elementos que devem permanecer. O usuário pode pedir “troque só a chamada e mantenha a embalagem e o enquadramento”. A revisão gera uma nova Peça ligada à anterior, apresenta comparação e só substitui a seleção após decisão humana.

Usar a peça escolhida como primeira referência e o contexto factual autorizado. Quando houver exigência de identidade perfeita de um logo ou elemento, preservar o asset exato na composição existente. Não prometer que o modelo preserva pixels. A recuperação automática de falha objetiva continua com seu contrato de fontes originais; não confundir com uma revisão deliberada da peça aceita.

Critério: pelo menos 90% das revisões do conjunto de validação cumprem a mudança sem alteração material das regiões protegidas; zero erro crítico de marca, pessoa, oferta ou produto. Esse percentual é meta inicial, não resultado observado.

### I4 — melhor uso de contexto, com menos ambiguidade

Revisar o builder canônico, sem um catálogo novo de prompts. Emitir blocos consistentes: finalidade, composição, copy literal, papel numerado de cada referência, alteração autorizada e invariantes. Fonte de estilo nunca fornece preço, benefício ou identidade factual. Preservar o fact pack e a distinção entre informação sustentada e direção inferida.

Exemplo de estrutura proposta, não de nova interface obrigatória:

```text
RESULTADO: anúncio 4:5 para a intenção registrada neste Trabalho.
TEXTO EXATO: usar somente as strings aprovadas no contrato de copy.
REFERÊNCIA 1 — PEÇA BASE: autoridade de composição e produto.
REFERÊNCIA 2 — ESTILO: somente linguagem visual; ignorar seus textos e marcas.
ALTERAR: somente a chamada especificada pelo operador.
PRESERVAR: geometria e rótulo do produto, identidade, enquadramento e fatos.
```

Investigar detalhes que a normalização pode apagar antes do envio. Comparar a referência normalizada atual com uma alternativa de maior fidelidade somente para os casos afetados. Manter inicialmente quatro referências; experimentar seis a oito apenas se a falta de espaço estiver descartando uma autoridade necessária. Não usar 16 por ser o limite disponível.

Não incluir `input_fidelity: high` indiscriminadamente: a referência geral expõe o parâmetro, mas a documentação consultada não esclarece sua configurabilidade específica nos dois modelos 2.5. Para Image 2, a orientação explícita é omiti-lo. Manter o parâmetro omitido até um teste de compatibilidade ou documentação específica sustentar seu uso.

### I5–I6 — ampliar a qualidade dos fluxos que já existem

**Carrossel:** conservar contrato visual, copy por slide, painel de âncoras, assets exatos e revisão do conjunto. Validar a nova capacidade em capa, miolo e fechamento; medir legibilidade, hierarquia, identidade e continuidade. Ao corrigir um slide, reutilizar o contrato e as âncoras; qualquer revisão que afete uma âncora precisa reavaliar a coerência do conjunto. Medir custo por deck aprovado, não só por slide.

**Camadas:** atualizar a seleção de modelo do provedor separado; manter PNG, transparência efetiva, limites de bytes/pixels, preview e aceitação. O validador atual já verifica conteúdo visível e pixels transparentes, mas isso não garante recorte visual bom: cabelo, vidro, sombra, halo e bordas entram na revisão. Sunburst não substitui o decompositor Seedream/Atlas nem entrega PSD com camadas sem a implementação existente.

### I7–I9 — condicionadas à evidência de demanda

**Região de edição:** começar com uma seleção simples sobre a Peça e coordenadas normalizadas, convertidas à resolução real. Não construir um editor de desenho completo. Testar recorte, máscara, resize e retorno. Quando necessário, compor a edição aceita sobre o original para assegurar preservação fora da região.

**Streaming:** implementar se o tempo até uma informação útil for um problema com Sunburst na qualidade escolhida. Melhorar a experiência de espera preservando a qualidade. Image API já suporta imagens parciais; não exige Responses. Reaproveitar a comunicação de estado do trabalho. Parcial não é Peça pronta, não gera cobrança interna por peça e não pode ser aprovada. Expirar os artefatos temporários conforme a política existente.

**2K/4K:** liberar por necessidade de entrega demonstrada. Validar área total, memória do worker, armazenamento e comportamento de normalização; o helper atual escolhe uma tabela de tamanhos, não a dimensão arbitrária solicitada. Não prometer 4K apenas enviando outra dimensão à interface. Preservar o master se houver requisito de exportação; hoje o fluxo normaliza para o tamanho final do anúncio.

## 5. Economia: a unidade certa é a peça aprovada

A tabela Standard consultada apresenta as mesmas taxas para Image 2, Flare e Sunburst:

| Categoria | US$ por milhão de tokens |
| --- | ---: |
| Texto de entrada | 5,00 |
| Texto de entrada em cache | 1,25 |
| Imagem de entrada | 8,00 |
| Imagem de entrada em cache | 2,00 |
| Imagem de saída | 30,00 |

Tarifa igual não significa custo igual por imagem: consumo depende do modelo, tamanho, qualidade e referências. A tabela Batch consultada não lista os modelos 2.5; não incluir desconto Batch no business case. [Preços oficiais](https://developers.openai.com/api/docs/pricing).

```text
custo_API_estimado =
  (5 × texto_não_cacheado + 1,25 × texto_cacheado
   + 8 × imagem_entrada_não_cacheada + 2 × imagem_entrada_cacheada
   + 30 × imagem_saída) / 1.000.000

custo_por_peça_aprovada =
  (gerações + revisões + tentativas descartadas + QA/modelos auxiliares
   + armazenamento/infra atribuível) / peças aprovadas
```

Não contar tokens em cache duas vezes: subtrair os cacheados do total correspondente quando a API os reportar como subconjunto. Conservar o objeto `usage` para permitir reconciliação.

Exemplo puramente ilustrativo: uma resposta com 1.000 tokens de texto, 1.000 de imagem de entrada e 2.000 de saída, sem cache, custaria **US$ 0,073** de imagem API. Isso não é previsão do consumo do ADScale. Os atuais [50 créditos por saída](/Users/jhonatan/Repos/ADScale_2/app/src/lib/billing/credit-units.ts:18) são unidade comercial interna, não 50 tokens nem US$ 0,50.

Outro exemplo ilustrativo: US$ 0,10 por tentativa com aproveitamento de 60% resulta em US$ 0,167 por aprovada; US$ 0,12 com aproveitamento de 85% resulta em US$ 0,141. O segundo cenário é **15,3% mais barato por aprovada**, apesar de a tentativa custar mais. A conta simplifica tentativas independentes e não inclui trabalho humano; a medição real usa todo o gasto e todas as aprovações da coorte.

O ganho de velocidade também deve ser do fluxo inteiro. Se uma jornada levar 40 segundos fora do gerador e 80 dentro dele, cortar o gerador pela metade resulta em 80 segundos totais: **33,3% de redução**, não 50%. Fila, briefing, upload, avaliação e decisão humana precisam ser medidos separadamente.

Cada imagem parcial adiciona 100 tokens de saída segundo o guia, equivalentes a US$ 0,003 na tarifa atual; três parciais somam US$ 0,009 além da geração. Usar esse custo na decisão de streaming. [Custos de imagens parciais](https://developers.openai.com/api/docs/guides/image-generation#partial-images-cost).

Não alterar planos ou créditos comerciais antes de medir a margem. Considerar um preço diferente para acabamento premium apenas se o custo e o valor percebido justificarem; não expor nomes de modelos como a principal decisão de criação.

Se a melhor qualidade ultrapassar o orçamento autorizado, reduzir o tamanho do lote ou rever o orçamento antes da execução. Não baixar silenciosamente modelo ou qualidade. A prioridade de qualidade não autoriza gasto ilimitado.

## 6. Plano de validação

### Comparação controlada

Reutilizar as peças e estruturas do [harness existente](/Users/jhonatan/Repos/ADScale_2/app/scripts/run-image-harness-blind-comparison.ts) e do [corpus de avaliação](/Users/jhonatan/Repos/ADScale_2/app/scripts/blind-gate-pair-specs.ts). O runner atual chama OpenAI diretamente, pode construir prompts por modelo de texto, não fixa qualidade no request e conserva escolhas antigas de timeout/retry. Antes de executá-lo com custo, adaptá-lo à configuração e ao caminho de provedor avaliados, com prompts congelados e `maxRetries: 0`. Seu `--dry-run` não deve ser presumido como prova de ausência de chamadas de texto.

Montar **24 casos em três marcas e dois segmentos**, com ao menos um segmento fora de educação: seis peças/variações, seis adaptações/restyles, seis revisões de texto/produto/pessoa e seis casos de carrossel/transparência. Cobrir português com acentos, preços, condições de oferta, embalagens, fonte pequena e composição vertical. Usar fontes autorizadas; comparar também o deck completo onde aplicável.

1. Smoke: seis casos × dois modelos (Image 2 e Sunburst) = **12 chamadas de imagem**, sem retry automático. Mesmo prompt final, referências normalizadas, tamanho, formato e qualidade. Teto inicial proposto de US$ 10, incluindo qualquer chamada auxiliar; parar antes de ultrapassar o orçamento autorizado.
2. Ensaio principal: 24 casos × dois modelos × duas repetições = **96 chamadas de imagem**. Acrescentar três sequências × três edições com Sunburst = **9 chamadas**, sobre peças-base compartilhadas; comparar também com a sequência equivalente no baseline. Se essa sequência do baseline não estiver disponível, prever mais nove chamadas explicitamente.
3. Calibração de qualidade: seis casos representativos × três níveis (`high`, `xhigh`, `max`) × duas repetições com Sunburst = **36 chamadas**. Incluir peças já aprováveis para identificar ganhos de acabamento, não somente corrigir falhas. O ensaio principal e a calibração somam **141 chamadas**, ou 150 quando for necessário produzir as nove edições adicionais do baseline. Teto adicional proposto de US$ 50, sujeito à estimativa conservadora do smoke; reduzir o lote ou rever o teto se necessário, preservando os parâmetros avaliados.
4. Flare não integra esses lotes. Uma comparação futura exige seu próprio desenho e orçamento, e só pode resultar em adoção se demonstrar equivalência visual ao Sunburst.
5. Os totais acima são do ensaio do gerador, não autorizam rodar novamente pipelines completos com torneios, QA pago ou planner oculto. Todas as chamadas auxiliares entram no mesmo teto. Testes completos dos Trabalhos usam um orçamento separado explicitamente definido antes da execução.

Não variar modelo, qualidade, prompt e pré-processamento simultaneamente. Depois da primeira comparação, otimizar uma variável por vez. Randomizar apresentação, ocultar modelos e níveis de qualidade na avaliação e alternar ordem de execução para reduzir viés de horário/fila. A comparação é de geração de imagem, não um teste de conversão de anúncios.

### O que medir

| Dimensão | Medida e interpretação |
| --- | --- |
| Qualidade visual | Preferência humana cega e avaliação de composição, acabamento, detalhes e fidelidade. Duas peças aprováveis podem ter qualidades diferentes; essa diferença deve orientar a escolha. |
| Aprovação | Percentual aproveitável na primeira tentativa e após revisão; avaliador humano decide. |
| Integridade | Texto, preço, validade, produto, marca, rosto e fontes obrigatórias. Falha crítica bloqueia adoção no respectivo fluxo. |
| Preservação | Em edição, o que mudou fora da instrução; comparar com a base e inspecionar regiões protegidas. |
| Diversidade útil | Variações diferem em ideia/composição sem perder os invariantes. Vinte peças quase iguais não contam como variedade estratégica. |
| Coerência | Carrossel como conjunto: hierarquia, tipografia, paleta, continuidade e aprovação do deck. |
| Transparência | Alpha real e recorte visual, aplicado em fundos claros e escuros. |
| Tempo | Fila, duração do provedor, processamento, primeira informação útil e tempo até aprovação. p50/p95 por fluxo. |
| Economia | Tokens/custo de todas as chamadas, correções, falhas, trabalho humano e custo por aprovada. |
| Operação | Erros, timeout, consumo de memória e duplicidade de geração/cobrança. |

Não usar exclusivamente outro LLM para eleger o vencedor. Reaproveitar os checks objetivos e revisão humana existentes. Os modelos de avaliação podem errar e não substituem uma comparação visual no tamanho de entrega.

### Critérios de decisão propostos

- **Sunburst:** padrão candidato em todos os fluxos; nenhuma regressão crítica de integridade ou fidelidade. Escolher pelo melhor resultado visual em avaliação humana cega, incluindo acabamento entre peças já aprováveis. +10 pontos percentuais de aprovação ou redução de 20% nas revisões são sinais complementares desejáveis, não condições para reconhecer ganho visual. Não exigir ganho de velocidade ou economia para adotá-lo.
- **Qualidade extra:** comparar `high`, `xhigh` e `max` e escolher o nível com melhor resultado, mesmo quando os demais passam no mínimo de aprovação. Reduzir o nível apenas com qualidade equivalente demonstrada; resultado inconclusivo não justifica redução. Se houver conflito com o orçamento, rever lote ou teto antes de executar.
- **Flare, avaliação futura:** adotar somente com equivalência ao Sunburst em qualidade visual, precisão e preservação no fluxo específico. Taxa de aprovação semelhante, isoladamente, não comprova equivalência. Custo e velocidade só desempatam resultados visualmente equivalentes; não há fallback automático para Flare.
- **Preservação:** meta de 90% de sucesso em revisões, sem falha crítica; assets declarados exatos mantêm o caminho determinístico.
- **Lançamento:** após ensaio, dez jornadas humanas completas em três marcas/dois segmentos, retomada de trabalho, revisão, aprovação, exportação e falha/retry. Conferir identidade de modelo em web/worker e invariantes de cobrança.

Esses números são metas de decisão, não ganhos comprovados. O ensaio pequeno encontra regressões e direciona a escolha, mas não prova não inferioridade estatística de cinco pontos percentuais nem caracteriza de forma estável o p95. Resultados limítrofes exigem aumentar a amostra antes de ampliar o rollout. Reportar numeradores, denominadores e incerteza por segmento.

Benefício comercial posterior: acompanhar peças aprovadas por usuário ativo, horas de correção e uso recorrente; testar CTR/CVR/CPA somente em experimento de mídia com público, verba, oferta e janela comparáveis. Qualidade visual não demonstra ROAS e a presente proposta não autoriza gasto com mídia.

## 7. Sequência de entrega

| Fase | Entrega concreta | Estimativa | Condição de saída |
| --- | --- | --- | --- |
| 0 | P0: baseline, consumo, snapshots e ensaio revisável | 2–3 dias | Configuração rastreável, orçamento fechado, testes locais e matriz de avaliação pronta. |
| 1 | I1: validar Sunburst em coorte interna, mantendo parâmetros para isolar o modelo | 2–4 dias | Smoke autorizado e baseline comparável; ainda não fixa a qualidade final de produção. |
| 2 | I2–I4: escolher a melhor qualidade, validar revisão precisa e ajustar referências/prompts | 4–6 dias | Qualidade visual, preservação e integridade aprovadas; consumo medido. Este gate precede o rollout externo. |
| 3 | I5–I6: carrossel e camadas, um de cada vez | 5–8 dias | Decks e elementos aprovados por humanos dentro do orçamento. |
| Depois | I7–I9 | Reestimar com uso | Demanda observada e ganho maior que o custo de manter a interface. |

Horizonte inicial: **13–21 dias úteis de engenharia**, aproximadamente três a cinco semanas com um responsável e revisão disponível; estimativas das fases já consideram reaproveitamento e não devem ser somadas novamente às faixas de cada item ICE. Ensaios, aprovações e correções descobertas podem aumentar o calendário.

Rollout proposto, após escolher e validar a qualidade final na fase 2: coorte interna → 10% → 50% → 100% dos novos trabalhos elegíveis, usando decisão estável por workspace/trabalho. Não sortear o modelo a cada retry. Aumentar a coorte somente depois dos critérios; uma janela de 24–48h sem volume suficiente não vale como validação. Na primeira ocorrência de erro crítico de integridade, cobrança duplicada ou mistura de configuração, interromper expansão e voltar à configuração aprovada para novos trabalhos. Tratar peças afetadas individualmente; não regenerar em massa.

O modelo anterior permanece como configuração de rollback durante a janela da migração, usando a mesma implementação. Definir retirada dessa configuração operacional após estabilização e reconciliação, respeitando a disponibilidade do modelo. Nenhum fallback automático para ele em cada falha.

O [ADR 0013](/Users/jhonatan/Repos/ADScale_2/docs/adr/0013-trabalho-criativo-first.md) mantém Estúdio/Trabalho como espinha e condiciona expansão ampla à evidência humana. As primeiras fases aperfeiçoam fluxos existentes; uma interface nova de desenho/marcação precisa ser decidida no marco adequado. Não expandir Landing Page ou Persona Simulation por causa deste update.

## 8. Verificação feita e limites desta entrega

Consulta e inspeção concluídas em 08/09/2026. Verificação local executada, sem chamadas ao gerador:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm test -- src/server/ai/providers/openai-image-provider.test.ts src/lib/formats.test.ts src/server/creative-work/reference-plan.test.ts src/server/creative-work/prompt.test.ts src/server/creative-work/carousel-visual.test.ts
```

Resultado: **5 arquivos, 111 testes aprovados, zero falhas**. Esses testes verificam a implementação atual e usam mocks para os provedores. Não provam compatibilidade de API dos modelos 2.5, qualidade visual, preços faturados, habilitação na conta, latência real, runtime de produção ou funcionamento autenticado de ponta a ponta.

Foi criado apenas este plano. Não foram alterados código, SDK, flags, configuração de modelos, contratos ou dados existentes. Não houve deploy, envio de mensagens, publicação ou chamadas pagas. Próximo passo recomendado: implementar P0 e preparar o ensaio de I1/I2; a decisão de produção vem após evidência visual e econômica.


## Planos de implementação executáveis

Detalhamento preparado com a skill writing-plans; implementação e experimentos ainda não executados:

1. [Motor, política congelada e evidências](/Users/jhonatan/Repos/ADScale_2/docs/superpowers/plans/2026-09-08-sunburst-engine.md) — P0, I1 e transporte de qualidade.
2. [Qualidade visual, referências, revisão e carrossel](/Users/jhonatan/Repos/ADScale_2/docs/superpowers/plans/2026-09-08-sunburst-visual-quality.md) — I2–I5 e critérios de adoção.
3. [Regeneração de camadas](/Users/jhonatan/Repos/ADScale_2/docs/superpowers/plans/2026-09-08-sunburst-layer-regeneration.md) — I6, contrato reservado e PNG transparente.

Os planos mantêm ativação inicial em 0%, preservam trabalhos antigos e separam código local, orçamento de validação e publicação. I7–I9 continuam condicionadas à demanda. Qualidade final por operação depende do experimento; nenhum teste mockado demonstra superioridade visual.
