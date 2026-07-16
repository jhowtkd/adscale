# N01 after — Criar Post Horizonte Educação no desktop

## Resultado

Falhou após gerar copy, identidade e três imagens no provider.

- Início: 15/07/2026 13:51:13 BRT
- Fim: 15/07/2026 13:57:09 BRT
- Trabalho: `33a08630-402f-474f-ac2b-8426d00dd09e`
- Formato: `1:1`

## O que funcionou

- O briefing foi persistido corretamente.
- A copy foi gerada e preenchida.
- A identidade foi confirmada.
- Os três eventos chegaram ao Inngest.
- O OpenAI gerou e armazenou as três imagens.

## O que bloqueou

- O job devolveu um `Buffer` na etapa `load-final-buffer`, que o Inngest não serializou.
- As três funções falharam depois do custo de geração.
- O trabalho permaneceu em `generating`.
- Os três outputs permaneceram em `processing`, sem chave, custo ou código de falha.
- A UI continuou mostrando `Gerando...` indefinidamente.

## Leitura brutalmente honesta

A correção anterior removeu o `Buffer` de `generate-base`, mas deixou o mesmo defeito em uma etapa posterior. O produto agora paga e produz as imagens, porém perde o resultado antes de apresentá-lo. Para o usuário, continua sendo uma espera infinita; operacionalmente é pior, porque houve custo real sem entrega nem recuperação terminal.
