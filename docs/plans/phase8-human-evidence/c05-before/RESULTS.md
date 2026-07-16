# C05 before — retomar campanha existente

**Participante:** P01

**Resultado:** falhou antes da geração

**Início:** 2026-07-15 07:20:41 BRT

**Fim:** +10m11s

## Evidência objetiva

- Campanha seeded: `07fff179-686f-4362-9d69-4677612e982e` (`Phase8 Human Cafe Aurora Retomada`).
- O briefing e a marca estavam corretos, mas o trabalho era um draft `art_variation` com zero assets e zero derivações.
- A entrada em recentes abriu novamente o briefing, sem output ou estado criativo retomável.
- A navegação manual para **Produzir** funcionou.
- **Gerar variações** terminou com `Falha ao enfileirar prévia`; nenhuma derivação foi persistida.
- O Assistente permaneceu em **Iniciando conversa…**; nenhuma thread ou mensagem foi persistida.
- Resultado da jornada: `failed`; não conta para a amostra mínima de jornadas concluídas.

## Percepções do participante

| # | Percepção | Classificação | Evidência |
|---|---|---|---|
| 1 | A task apareceu em recentes, mas abriu sem trabalho criativo anterior para continuar. | P1 · perda de contexto | banco e relato observado |
| 2 | Clicar diretamente em Produzir avançou, ao contrário do CTA do briefing. | observação de fluxo | relato observado |
| 3 | A tentativa de geração falhou ao enfileirar a prévia. | P1 · erro | [01](01-preview-enqueue-failed-and-chat-loading.png), logs |
| 4 | O chat lateral permaneceu carregando. | P1 · abandono | [01](01-preview-enqueue-failed-and-chat-loading.png), banco |

## Leitura sem maquiagem

A retomada era nominal: existia uma campanha em recentes, não um trabalho criativo retomável. O usuário encontrou uma rota manual até Produzir, mas o produto aceitou iniciar uma prévia incompatível com o estado sem peça-base e respondeu apenas com erro genérico. O Assistente continuou indisponível.
