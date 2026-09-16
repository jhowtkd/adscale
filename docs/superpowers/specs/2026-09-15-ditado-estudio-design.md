# Ditado na caixa do pedido do Estúdio

Data: 2026-09-15 (rev. 2). Especificação de implementação proposta; nenhuma
alteração de aplicação, migração ou publicação foi executada nesta etapa.

Mapa: [#343](https://github.com/jhowtkd/adscale/issues/343).
Pesquisa: `docs/research/2026-09-14-voice-dictation-transcription-ptbr.md` (branch `research/voice-dictation`).
Decisões: [#350](https://github.com/jhowtkd/adscale/issues/350) (motores),
[#351](https://github.com/jhowtkd/adscale/issues/351) (termo/comportamento),
[#352](https://github.com/jhowtkd/adscale/issues/352) (cobrança/limites).
Protótipo [#353](https://github.com/jhowtkd/adscale/issues/353) pulado —
ditado real com transcrição real fica nesta execução.

## Resultado e recorte

Na caixa do pedido do Estúdio (`<textarea id="creative-composer-request">`
em `app/src/components/creative-work/CreativeComposer.tsx`), o operador
clica no microfone, fala, e o texto transcrito com **limpeza leve** entra
na posição do cursor sem apagar nada. O que ele vê é só texto limpo,
editável; o bruto não aparece. Fala nunca vira pedido estruturado nem
conversa por voz — ditado é entrada de texto por fala, ponto.

Fora desta spec: streaming de transcrição; ditado nas outras caixas (chat
do assistente, direcionamentos manuais); fala virando briefing.

## Fontes e precedência

- `CONTEXT.md`: **Ditado**. "Voz" fica reservado para voz da marca
  (`src/server/ai/voices/voice-extractor.ts`, `OlharVoiceConfigPayload`).
  Evitar: input de voz, comando de voz, speech-to-text.
- Pesquisa #350: motor da v1 é **servidor** — `MediaRecorder`
  (`audio/webm;codecs=opus` no Chrome, `audio/mp4` no Safari) + POST do
  blob em `/v1/audio/transcriptions` **sem** `language` (detecção
  automática) + limpeza leve num **segundo passo de texto**. Browser-only
  (Web Speech API) e Realtime fora da v1.
- Código inspecionado no checkout `main` HEAD `78a7378b`: `request` sem
  limite de tamanho no contrato (`contracts.ts:251`, `z.string()`) nem
  nas rotas `/api/creative-work` — 2 min de fala cabem sem alterar
  contrato; nenhum código de microfone/transcrição existe
  (`audio/transcriptions` ausente); SDK `openai@6.34.0` em
  `app/package.json`.

## Limpeza leve — regra estrita e verificável

Pode: remover hesitações e muletas ("é…", "tipo", "né"); remover
repetições imediatas ("o o produto"); pontuar; capitalizar.

Nunca: reordenar frases, resumir, traduzir, trocar palavras por
sinônimos, corrigir concordância, resolver autocorreções do falante
("azul, não, verde" fica como está), completar frases, preencher lacunas.

Teste de aceitação (checker executável na suíte): **toda palavra de
conteúdo do texto limpo existe no bruto, na mesma ordem.** Nenhum modelo
OpenAI faz essa limpeza nativamente; Dictation API da AssemblyAI
(autocorreções) e Smart Formatting da Deepgram (reescreve data/moeda)
são proibidos porque quebram o checker.

## Modelos e custo (lista OpenAI, 2026-09-14)

- `gpt-4o-mini-transcribe` (tipado no SDK): **US$ 0,003/min** → 30 s
  US$ 0,0015 · 60 s US$ 0,003 · 90 s US$ 0,0045 · 120 s US$ 0,006.
- `gpt-transcribe` (recomendado nas docs 2026, devolve `languages[]`;
  **não** está no `AudioModel` do SDK — se escolhido, chamar via REST):
  **US$ 0,0045/min**.
- Realtime / `gpt-live-transcribe` (US$ 0,017/min): fora — streaming
  proibido na v1.

Default: `gpt-4o-mini-transcribe`, sem `language`. O segundo passo
(limpeza) usa modelo de texto barato existente; o checker valida a saída
antes de inserir.

## Comportamento da UI

- Botão de microfone junto à caixa. Estados: **ocioso** → **ouvindo**
  (tempo decorrido, clique para parar) → **transcrevendo** (caixa segue
  editável) → ocioso; **erro** com mensagem própria por causa
  (permissão negada, sem microfone, falha de rede, navegador sem
  suporte), voltando ao ocioso. Sem streaming.
- Limite de **2 minutos** por gravação, aviso aos **90 s**; ao atingir,
  para e transcreve o que tem.
- Inserção: texto limpo entra **na posição do cursor** (na prática,
  anexa ao fim), com espaço separador, sem apagar nada. Ditado e
  digitação se misturam livremente.
- Idioma: **detecção automática**. Aceite inclui fala em PT-BR com
  marcas e termos em inglês ("lançamento do Black Friday do app") sem
  erro de detecção que quebre o checker.
- PT-BR na superfície; strings novas em `app/messages/pt-BR.json` e
  `app/messages/en.json`.

## Cobrança e limites

- Ditado **não consome créditos**. Custo de transcrição absorvido pelo
  plano. Transcrição não é geração; **não entra no Generation
  Settlement** — sem reserva, sem refund, sem dispatch.
- Antiabuso: teto de **15 minutos de áudio por dia UTC, por workspace**.
  Ao estourar: bloqueia novos ditados com mensagem clara; o pedido
  digitado continua funcionando.
- **Áudio descartado** após transcrever — nunca armazenado.

## Rastro

- Evento de uso por ditado: duração do áudio, tamanho do bruto e do
  limpo, idioma detectado, sucesso/erro (telemetria e custo).
- Marca no Trabalho que o pedido **teve trecho ditado**.

## Aceites

1. Gravar 30 s de PT-BR com termos em inglês → texto limpo no cursor,
   nada apagado, checker verde.
2. Bruto com "é… tipo o o produto azul, não, verde" → limpo mantém
   "produto", "azul", "não", "verde" na ordem; muletas e repetição
   removidas; checker verde.
3. Gravação de 2 min para sozinha e transcreve; aviso exibido aos 90 s.
4. Cada causa de erro (permissão, sem microfone, rede, sem suporte)
   mostra sua mensagem e volta ao ocioso.
5. Workspace com 15 min ditados no dia UTC bloqueia novo ditado com
   mensagem; digitação segue normal; nenhum crédito consumido.
6. Áudio não aparece em storage, log ou banco após a transcrição.
