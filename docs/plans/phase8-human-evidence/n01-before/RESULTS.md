# N01 before — Criar Post Horizonte Educação

**Participante:** P01

**Resultado:** falhou na geração visual

**Início:** 2026-07-15 07:35:48 BRT

**Fim:** +23m03s

## Evidência objetiva

- Trabalho: `8728db84-8357-42cd-9902-fd4e7113bc75`.
- A marca foi selecionada, mas tema, objetivo, público e oferta precisaram ser preenchidos manualmente.
- A copy foi gerada e persistida, porém a etapa Copy apareceu vazia; um refresh recuperou headline, corpo e CTA.
- A identidade foi confirmada às `10:51:53Z`.
- Três eventos `creative-work.generate` foram recebidos e os três jobs iniciaram às `10:52:03Z`.
- Após mais de seis minutos, o trabalho continuava `generating` e os três outputs continuavam `processing`, sem `outputKey`, custo ou código de falha.
- Os níveis enviados nos eventos não correspondiam aos níveis persistidos para os mesmos IDs de output.
- Resultado da jornada: `failed`; não conta para a amostra mínima de jornadas concluídas.

## Percepções do participante

| # | Percepção | Classificação | Evidência |
|---|---|---|---|
| 1 | Selecionar a marca não preencheu nem sugeriu os campos do briefing. | P2 · dúvida | relato observado |
| 2 | “Criar copy” avançou para uma tela vazia, apesar de a copy existir no banco. | P1 · perda de contexto | [01](01-generated-copy-not-hydrated.png), banco |
| 3 | As três propostas ficaram indefinidamente em Processando/Gerando. | P1 · abandono | [02](02-three-outputs-stuck-processing.png), logs e banco |

## Leitura sem maquiagem

Criar Post chegou mais longe que as campanhas: criou trabalho, copy e identidade. Ainda assim, exigiu refresh para revelar um resultado já pronto e depois abandonou três gerações em estado eterno. Além disso, o contrato entre nível criativo e output já estava corrompido no enqueue, antes mesmo de qualquer imagem voltar.
