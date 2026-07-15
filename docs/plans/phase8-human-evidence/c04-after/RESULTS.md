# C04 after — Assistente de campanha Studio Pulso no mobile

## Resultado

Falhou antes da primeira resposta do Assistente.

- Início: 15/07/2026 10:42:36 BRT
- Fim: 15/07/2026 10:45:40 BRT
- Campanha: `2bf20f25-16a0-40ce-a238-458662122cda`
- Thread: `79aab9f8-63ed-4576-8c17-95767113f2a5`

## O que melhorou

- A conversa iniciou sem `signal timed out`.
- O composer ficou disponível no mobile.
- A mensagem do participante foi persistida corretamente.

## O que bloqueou

- O MiniMax respondeu HTTP 401 `invalid api key (2049)`.
- Nenhuma resposta do Assistente foi persistida.
- A interface mostrou o texto técnico cru `assistantStreamError`, sem orientação ou recuperação.

## Leitura brutalmente honesta

A correção de inicialização funcionou, mas o Assistente continua indisponível como produto. A thread agora abre e aceita texto, porém uma credencial inválida interrompe a primeira ação útil e a UI transfere o erro interno ao usuário. O cenário não é aprovável enquanto a configuração do provider e o tratamento da falha não forem corrigidos.
