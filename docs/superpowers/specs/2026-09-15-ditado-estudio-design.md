# Spec: Ditado na caixa do pedido do Estúdio

Data: 2026-09-15. Handoff executável. Sem protótipo — microfone e estados na execução.

Mapa: [Wayfinder: Meta Ads, voz no pedido e MCP/skills](https://github.com/jhowtkd/adscale/issues/343).
Decisões: [termo e comportamento](https://github.com/jhowtkd/adscale/issues/351), [cobrança e limites](https://github.com/jhowtkd/adscale/issues/352).
Pesquisa: `docs/research/2026-09-14-voice-dictation-transcription-ptbr.md` (branch `research/voice-dictation`).

## Resultado

Na caixa do pedido (`#creative-composer-request` em `CreativeComposer.tsx`), o operador dita. O texto limpo entra na posição do cursor (na prática, anexa ao fim, com espaço). Continua sendo palavra do operador e **Contexto autorizado**.

## Vocabulário

**Ditado** — não “voz” (voz da marca). Evitar input de voz, comando de voz, speech-to-text.

## Comportamento

**Captura.** `MediaRecorder` no browser (`audio/webm;codecs=opus` Chrome, `audio/mp4` Safari). POST do blob para transcrição no servidor. Sem Web Speech API, sem Realtime, sem streaming.

**Motor.** `gpt-4o-mini-transcribe` via `/v1/audio/transcriptions` **sem** `language`. Segundo passo de texto: **limpeza leve** com teste de aceitação — toda palavra de conteúdo do texto limpo existe no bruto, na mesma ordem. Pode: hesitações/muletas, repetições imediatas, pontuar, capitalizar. Nunca: reordenar, resumir, traduzir, sinônimos, concordância, resolver “azul, não, verde”, completar frases.

**Inserção.** Texto limpo no cursor; bruto não aparece na caixa. Não apaga o que já estava escrito.

**Estados.** ocioso → ouvindo → transcrevendo → erro. Sem streaming de palavras.

**Limite por take.** 2 minutos; aviso aos 90 s.

**Idioma.** Detecção automática. Testar marcas em inglês, não só PT-BR.

**Áudio.** Descartado após transcrever. Não guardar blob.

**Cobrança.** **Zero créditos.** Fora do Generation Settlement. Teto de abuso: **15 minutos de áudio / dia UTC / workspace**. Estouro bloqueia só o ditado; digitação segue. Evento de uso + flag no Trabalho.

**Onde.** Só a caixa do pedido do Estúdio nesta spec. Não no chat do assistente nem em direcionamentos manuais (fog do mapa).

## Superfície

- Controle de microfone visível junto do textarea do pedido, desktop e mobile.
- Chrome e Safari, desktop e mobile, nos estados acima.
- Permissão de microfone negada = erro recuperável, pedido intacto.
- PT-BR + `en` nas strings novas.

## Aceite

1. Ditado de 30–90 s em PT-BR: limpo entra no pedido; checker de ordem/palavras passa.
2. Take de 2 min corta; aviso aos 90 s.
3. 15 min/dia/workspace: o 16º minuto é recusado sem débito de crédito.
4. Áudio não permanece em storage nem no banco.
5. `npm test` cobre checker de limpeza, teto diário e “não passa pelo settlement”.

## Fora

Fala virando briefing. Streaming. Cobrança por minuto. Outras caixas de texto.
