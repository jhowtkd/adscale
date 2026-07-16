# C04 before — Assistente com campanha no mobile

**Participante:** P01

**Resultado:** falhou antes da primeira mensagem

**Início:** 2026-07-15 07:15:00 BRT

**Fim:** +3m35s

## Evidência objetiva

- Campanha seeded: `59559a81-d2b7-4a46-9cbf-c58455fb0af2` (`Phase8 Human Studio Pulso Assistente`).
- A campanha possuía produto, objetivo, público, oferta e perfil de marca válidos antes do teste.
- No mobile, a aba Chat permaneceu em **Iniciando conversa…** e nunca mostrou o campo de mensagem.
- Os logs não registraram `POST /api/assistant/threads` durante a tentativa.
- O banco permaneceu com zero threads de Assistente associadas à campanha.
- Resultado da jornada: `failed`; não conta para a amostra mínima de jornadas concluídas.

## Percepção do participante

| # | Percepção | Classificação | Evidência |
|---|---|---|---|
| 1 | O Assistente travou em “Iniciando conversa…” antes de permitir qualquer ação. | P1 · abandono | [01](01-assistant-startup-hang-mobile.png), logs e banco |

## Leitura sem maquiagem

Este não foi um erro do modelo nem do provider: o cliente sequer tentou criar a thread. A superfície principal do cenário ficou permanentemente em loading e tornou impossível começar o trabalho.
