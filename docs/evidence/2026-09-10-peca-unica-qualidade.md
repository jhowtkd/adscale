# Peça única — qualidade: prova controlada e comparação humana

Responsável original: D, `codex/estudio-creditos-qa`. Continuação autorizada:
`codex/estudio-qa-continuacao`, sem alterar o worktree original. Data: 2026-09-10.

## Evidência técnica e limite da conclusão

O provider controlado registra `quality` junto de dimensões, modo, referências,
tentativa e marcadores. O teste unitário `records the requested quality in
isolated evidence` integra o lote de 90 testes entregue por D. Os cenários
`integrated API` de `app/tests/e2e/create-post.spec.ts` verificam a chamada real
app→worker→provider controlado, o PNG armazenado e os três registros financeiros:
`credit_grants`, `usage_events` e `credit_transactions`.

A matriz preparada cobre `high`, uma chamada inicial, ausência de autocorreção,
QA fail com preview e refund único, QA inconclusivo com confirmação, revisão
concorrente, pai preservado e adaptação 9:16. O contrato legado é congelado no
banco **antes** do dispatch para a matriz R-010; não se altera output já gerado.
Resultados de execução são registrados em
`2026-09-10-estudio-creditos-qa.md`. Um PNG determinístico não prova superioridade
visual, nem revela a configuração interna da plataforma ChatGPT.

## Três textos concretos para o ensaio

Status de todos os pares: **`not_run`**. Hash é SHA-256 do texto UTF-8 de cada bloco,
sem quebra de linha final. Há diferença entre texto recuperado e proposta
reconstruída: só o pedido promocional foi transcrito integralmente de uma fonte
local. Não se declara que três briefings originais completos foram encontrados.

### Par 1 — institucional

```text
Crie uma peça institucional Cenbrap em 4:5. Texto principal: "Cenbrap: presença humana". Apoio: "Educação médica com clareza, acolhimento e linguagem editorial". CTA: "Conheça a Cenbrap". Dê destaque à imagem, à hierarquia e à legibilidade em celular. Use a identidade dos anexos e não acrescente promessas, títulos profissionais ou fatos não fornecidos.
```

SHA-256: `42a4b20f6565288f388a8a18448a3ae4c799ab2ea27e45a95e2c2abe7fb9e833`.

Origem: texto institucional do protótipo Cenbrap aprovado nesta conversa ("Presença que acolhe"). Pedido reconstruído para ser idêntico nas duas plataformas; a fonte original do briefing não foi exportada. Anexos: o mesmo pacote de identidade Cenbrap e a mesma imagem de referência, quando congelados; pacote original ainda pendente.

### Par 2 — promocao

```text
Variação ousada da arte anexa: teste um layout com o selo de oferta em destaque e hierarquia mais agressiva. Mantenha a mensagem de 50% OFF no plano anual.
```

SHA-256: `dc7600b6a0a147caeecdf9057d3e0da06608f698a268d9e46df90bf121f57adb`.

Origem: transcrição do pedido visível no print `docs/screenshots/2026-09-10-auditoria-cenbrap/06-variacoes-revise-plano.png`. O print08 mostra a oferta com "até sexta-feira", mas isso é dado **histórico do ensaio**, não comprovação de uma promoção vigente. Anexo referido no print06: `1789041335854.png`, original ainda não localizado. Reutilizar esse original nas duas plataformas; screenshot da aplicação serve como evidência, não o substitui. Fixar a mesma proporção 4:5 para ambos ao montar o ensaio.

### Par 3 — evento

```text
Crie uma peça Cenbrap em 4:5 para o evento "IMERSÃO NR1". Use esse título como chamada principal e "Conheça a programação" como CTA. Organize a composição com hierarquia clara e leitura em celular, usando a identidade dos anexos. Não acrescente datas, horários, local, palestrantes, preço, certificação ou promessas; esses dados não foram fornecidos.
```

SHA-256: `8c9344125925599bd48a136fc8eee180a4928e7a31fea040c3b30644789e49f6`.

Origem: apenas o título "IMERSÃO NR1" aparece na lista de trabalhos dos prints03/06. Este é um pedido proposto, limitado ao título observado; data/local e briefing original não estão disponíveis. O recorte completo de evento com título/data/local exigido pelo estudo permanece **bloqueado por fonte ausente**. Antes do ensaio, recuperar o pedido original ou aprovar este recorte sem data/local, então recalcular o hash se houver mudança. Não inventar esses fatos. Anexos originais do evento e identidade Cenbrap pendentes.

## Pacote comum e critérios de execução

Antes das chamadas, congelar um manifesto com paths/nomes e SHA-256 de cada
arquivo original usado no par, incluindo logo, imagens, fontes ou regras da
marca. Fornecer os mesmos bytes e regras ao ChatGPT; se o ADScale tiver contexto
adicional no brand kit, exportá-lo ou registrar a diferença como limite da
comparação. Os prints da auditoria são fontes de rastreio, não assets de marca.
Sem os anexos originais, os pares continuam `not_run`; não gerar um substituto
com IA para preencher essa ausência.

O coordenador apresenta os textos, anexos e teto de custo estimado para **seis
gerações** (uma por plataforma em cada par) e obtém a autorização concreta. Não
usar custo/latência ainda não observados como orçamento confirmado; registrar
estimativa antes e custo/latência reais depois. Publicação não faz parte do ensaio.

Executar uma geração por plataforma por pedido, sem tentativas ocultas ou seleção
da melhor de um lote. Usar Peça única sob `integrated_v1` no ADScale. Registrar
versão do app, identidade congelada, proporção, data, outputId, artefato, chamada,
latência e custo. Randomizar A/B em cada par e ocultar a origem ao Jhonatan.
A tabela de origem fica separada da prancha avaliada até a avaliação terminar.

Jhonatan atribui notas 1–5 para legibilidade, hierarquia, identidade da marca,
precisão factual e prontidão para uso; indica preferência A/B/empate e motivo.
Gate: ADScale vence ou empata em pelo menos 2 de 3, com zero erro factual crítico.
Notas e outputs ruins também ficam registrados. Falha não autoriza novo lote.

| Par | Plataforma | Estado | Output/artefato | Latência real | Custo real | Chamadas |
|---|---|---|---|---|---|---:|
| institucional | ADScale | not_run | — | — | — | 0 |
| institucional | ChatGPT | not_run | — | — | — | 0 |
| promocao | ADScale | not_run | — | — | — | 0 |
| promocao | ChatGPT | not_run | — | — | — | 0 |
| evento | ADScale | not_run | — | — | — | 0 |
| evento | ChatGPT | not_run | — | — | — | 0 |

| Par | Legibilidade A/B | Hierarquia A/B | Marca A/B | Precisão A/B | Prontidão A/B | Preferência/motivo |
|---|---|---|---|---|---|---|
| institucional | — | — | — | — | — | not_run |
| promocao | — | — | — | — | — | not_run |
| evento | — | — | — | — | — | not_run |
