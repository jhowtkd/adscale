# N02 before — Criar Post Café Aurora mobile

**Participante:** P01

**Resultado:** falhou após geração no provider

**Início:** 2026-07-15 08:01:44 BRT

**Fim:** +6m38s

## Evidência objetiva

- Trabalho: `f73703cb-8707-4383-a20d-6d15b51ff807`, formato `9:16`.
- A copy foi persistida, mas o cliente exibiu `signal timed out`; um refresh foi necessário para continuar.
- Três eventos de geração foram publicados às `11:06:26Z`.
- OpenAI gerou três candidatos com sucesso em 44,7s, 45,8s e 74,9s.
- Seedream não participou porque `BYTEPLUS_API_KEY` não estava configurada.
- As três funções falharam depois da geração e deixaram o trabalho `generating` e os outputs `processing`.
- Nenhum output final, custo ou código de falha foi persistido.
- Os níveis enviados nos eventos não correspondiam aos níveis persistidos para os mesmos IDs.
- Resultado da jornada: `failed`; não conta para a amostra mínima de jornadas concluídas.

## Percepções do participante

| # | Percepção | Classificação | Evidência |
|---|---|---|---|
| 1 | Criar copy retornou `signal timed out`. | P1 · erro | [01](01-copy-signal-timeout-mobile.png), banco |
| 2 | Após refresh e geração, nenhuma proposta apareceu; todas ficaram Processando. | P1 · abandono | [02](02-three-outputs-stuck-processing-mobile.png), logs e banco |

## Leitura sem maquiagem

O provider fez o trabalho caro, mas o pipeline perdeu o resultado depois. O produto mostrou timeout na copy, exigiu refresh e depois queimou três gerações sem entregar nada, sem finalizar o estado e sem sequer registrar uma falha recuperável.
