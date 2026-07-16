# N02 after — Criar Post Café Aurora no mobile

## Resultado

Falhou nas três propostas após copy e identidade.

- Início: 15/07/2026 14:12:45 BRT
- Fim: 15/07/2026 14:21:11 BRT
- Trabalho: `79929f3a-b5a5-4cdd-bf12-7bedd99448d1`
- Formato: `9:16`

## O que funcionou

- O formulário mobile aceitou o briefing.
- A copy foi gerada e persistida.
- A identidade foi confirmada.
- Os três eventos foram recebidos e executados pelo Inngest.

## O que bloqueou

- As três funções falharam após a geração no provider.
- O trabalho permaneceu em `generating`.
- Os três outputs permaneceram em `processing`, sem chave, custo ou código de falha.
- A interface não apresentou timeout, erro ou recuperação; mostrou `Gerando...` indefinidamente.

## Leitura brutalmente honesta

O segundo cenário independente confirma que não é um problema de marca, formato ou desktop. O fluxo sem campanha conduz o usuário corretamente até a etapa mais cara e então perde os três resultados. A ausência de estado terminal transforma uma falha técnica determinística em espera infinita.
