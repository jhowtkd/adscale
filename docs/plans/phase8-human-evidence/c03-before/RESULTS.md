# C03 before — nova campanha Café Aurora

**Participante:** P01

**Resultado:** falhou antes da geração

**Início:** 2026-07-15 06:51:00 BRT

**Fim:** +16m16s

## Evidência objetiva

- Campanha: `7c38fe41-9d2e-4d55-b557-5eaba5279385` (`Combo da tarde — Café Aurora`).
- O perfil existente `Phase8 Human Cafe Aurora` foi associado corretamente.
- O briefing persistiu o nome do cliente como produto e oferta e derivou dele um objetivo e público genéricos.
- Persistência encontrada: zero assets e zero derivações.
- Cliques em **Continuar para ações** emitiram telemetria, mas não iniciaram geração nem produziram uma transição útil.
- O painel do Assistente exibiu `signal timed out`.
- Resultado da jornada: `failed`; não conta para a amostra mínima de jornadas concluídas.

## Percepções do participante

| # | Percepção | Classificação | Evidência |
|---|---|---|---|
| 1 | O campo Cliente não deixa claro se digitar o nome vincula a marca existente. | P2 · dúvida | relato observado |
| 2 | Produto, oferta, objetivo e público foram preenchidos a partir do nome do cliente, sem usar o contexto real da marca. | P1 · perda de contexto | [01](01-continue-noop-and-assistant-timeout.png), banco |
| 3 | Sem imagem, **Continuar para ações** ficou inerte mesmo após quatro minutos. | P1 · abandono | [01](01-continue-noop-and-assistant-timeout.png), logs |
| 4 | O Assistente terminou com `signal timed out`. | P1 · erro | captura enviada pelo participante |

## Leitura sem maquiagem

O fluxo reconheceu a marca certa no banco, mas não conseguiu transformar essa associação em briefing útil. Em seguida ofereceu um CTA habilitado que não executava trabalho algum sem uma dependência implícita de imagem. O Assistente falhou em paralelo, deixando o usuário sem geração e sem ajuda.
