# C01 before — campanha desktop

**Participante:** P01

**Resultado:** falhou na entrega

**Início:** 2026-07-15 04:21:30 BRT

**Primeiro output:** +4m11s

**Primeira aprovação persistida:** +7m44s

**Fim:** +18m55s

## Evidência objetiva

- Campanha: `4d0e7e21-9bab-4eb4-9aa6-0cd3fb9572ee` (`Teste C01`).
- O contexto pretendido de Horizonte Educação não foi associado. A campanha criou um perfil vazio chamado `C01`.
- Persistência encontrada: 1 preview, 3 outputs de produção 1:1 e 4 adaptações de formato.
- Duas derivações chegaram a `approved`, mas nenhuma entrega/exportação foi concluída.
- O chat persistiu `Teste de chat.` e não persistiu resposta do assistente.
- Resultado da jornada: `failed`; não conta para a amostra mínima de jornadas concluídas.

## Percepções do participante

| # | Percepção | Classificação | Evidência |
|---|---|---|---|
| 1 | “Problemas bloqueantes” deveriam orientar, não fechar o caminho. | P1 · abandono | [01](01-blocking-problems.png) |
| 2 | Feedback apareceu antes de preview ou geração visível. | P2 · dúvida | [02](02-feedback-before-preview.png) |
| 3 | Animação de carregamento sobrepôs letras. | P3 · erro visual | [03](03-loader-overlap.png) |
| 4 | Rejeição pede direção, mas não existe onde responder aos bloqueantes exibidos. | P1 · erro | [04](04-rejection-no-resolution.png) |
| 5 | Não houve aprovação explícita do piloto; preview e lote pareceram geração direta e duplicada. | P1 · perda de contexto | estado persistido |
| 6 | Chat não funcionou e mostrou `assistantStreamError`. | P1 · erro | [05](05-chat-stream-error.png) |
| 7 | Geração inventou marca, mês promocional e condição de pagamento. | P1 · erro | [06](06-hallucinated-brand.png) |
| 8 | Adaptações de formato sangraram/cortaram informações. | P1 · erro | [07](07-format-bleed.png) |
| 9 | Entrega pareceu vazia e não recapitulou as últimas gerações. | P2 · perda de contexto | [08](08-empty-delivery-state.png) |
| 10 | Exportação ficou impossível por causa dos bloqueios anteriores. | P1 · abandono | [01](01-blocking-problems.png), [08](08-empty-delivery-state.png) |

## Leitura sem maquiagem

O fluxo produziu imagens, mas não produziu uma entrega confiável. A UI chamou a campanha de concluída enquanto a etapa Entregar apagava a percepção do trabalho feito e mantinha o usuário bloqueado. Qualidade automática detectou parte das alucinações, porém seu comportamento foi punitivo: encontrou problemas sem oferecer um caminho operacional para resolvê-los.
