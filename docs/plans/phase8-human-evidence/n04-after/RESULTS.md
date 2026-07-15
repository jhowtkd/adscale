# N04 after — Home para Criar Post Studio Pulso no mobile

## Resultado

Falhou depois de gerar as três imagens no provider.

- Início: 15/07/2026 14:45:20 BRT
- Fim: 15/07/2026 14:48:59 BRT
- Trabalho: `0126f21d-1830-4943-a7b2-51428dbb6432`
- Formato: `4:5`

## Evidência objetiva

- Home abriu corretamente o Criar Post no mobile.
- Briefing, copy e identidade foram persistidos para Studio Pulso.
- Os três eventos chegaram ao Inngest.
- A OpenAI gerou as três imagens.
- As três funções falharam após a geração.
- O trabalho permaneceu em `generating` e os três outputs em `processing`, sem `output_key`, custo ou código de falha.
- A UI permaneceu em `PROCESSANDO` e `Gerando...` sem ação de recuperação.

## Leitura brutalmente honesta

A entrada pela Home e o fluxo mobile funcionam até o ponto caro. Depois disso, o mesmo defeito pós-geração perde todas as imagens e deixa o trabalho eternamente aberto. Esta é a terceira reprodução independente e não precisa de mais gasto para ser comprovada.
