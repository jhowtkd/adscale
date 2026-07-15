# Fase 8 — protocolo de evidência humana

**Status:** aguardando sessões humanas

## Regra de honestidade

Playwright, provider controlado e agentes podem preparar estado, verificar rede e coletar artefatos, mas não contam como jornada humana. Uma jornada só entra na amostra quando uma pessoa opera a interface sem instrução passo a passo e um observador registra o que ela fez.

## Amostra mínima

- 10 jornadas concluídas antes das correções: 5 com campanha e 5 sem campanha. Tentativas abandonadas ou falhas são registradas, mas não substituem uma jornada concluída.
- As mesmas 10 jornadas repetidas depois das três principais correções.
- Pelo menos 3 marcas e 2 segmentos; um segmento precisa ser diferente de educação.
- Desktop e mobile presentes nos dois blocos.
- Toda jornada concluída deve chegar a primeiro output, aprovação/seleção e entrega/download.

As marcas podem ser reais ou fixtures autorizadas, mas devem ter briefings distintos e material de marca suficiente para uma decisão humana. Identifique participantes por pseudônimo; não grave e-mail ou outro dado pessoal no repositório.

## Matriz fixa

| Cenário | Modo | Entrada | Dispositivo | Marca/segmento |
|---|---|---|---|---|
| C01 | com campanha | Nova campanha | desktop | Marca A / educação |
| C02 | com campanha | Template materializado | mobile | Marca A / educação |
| C03 | com campanha | Nova campanha | desktop | Marca B / não educação |
| C04 | com campanha | Assistente com contexto de campanha | mobile | Marca C / não educação |
| C05 | com campanha | Continuar trabalho existente | desktop | Marca B / não educação |
| N01 | sem campanha | Criar Post | desktop | Marca A / educação |
| N02 | sem campanha | Criar Post | mobile | Marca B / não educação |
| N03 | sem campanha | Assistente sem campanha | desktop | Marca C / não educação |
| N04 | sem campanha | Home → Criar Post | mobile | Marca C / não educação |
| N05 | sem campanha | Continuar post existente | desktop | Marca B / não educação |

## Instrução ao participante

> Crie uma peça pronta para uso a partir do objetivo e dos materiais desta marca. Escolha por onde começar. Revise o resultado, aprove ou selecione a melhor versão e faça a entrega. Fale em voz alta quando algo gerar dúvida, parecer errado, custar diferente do esperado ou perder contexto.

O moderador pode explicar a finalidade da sessão, mas não pode indicar qual botão usar nem corrigir a navegação durante a tarefa.

## Registro por jornada

Cada entrada em `.planning/convergence/phase8-human-journeys.json` deve conter:

- `scenarioId`, `phase` (`before` ou `after`) e `participantId` pseudônimo;
- `mode`, marca, segmento, entrada e dispositivo;
- `startedAt`, `firstOutputAt`, `approvedAt`, `deliveredAt`, `endedAt` em ISO-8601;
- `outcome`: `completed`, `abandoned` ou `failed`;
- `observerConfirmedHuman: true`;
- `breakpoints`: lista com `id` estável para ocorrências do mesmo problema, categoria, severidade (`P0`–`P3`), instante e nota observável;
- custo inesperado, se houve, e notas do observador.

Categorias fechadas de breakpoint: `doubt`, `abandonment`, `return`, `error`, `unexpected_cost`, `context_loss`.

Para campanha, aprovação é aprovar a derivação e entrega é baixar/compartilhar o pacote. Sem campanha, selecionar o output equivale à aprovação e baixar ou salvar na Biblioteca equivale à entrega.

## Ordem de execução

1. Capturar e congelar o baseline de produção antes do rollout.
2. Rodar C01–C05 e N01–N05; registrar sem corrigir no meio do bloco.
3. Ordenar breakpoints por frequência, depois severidade.
4. Corrigir os três maiores e registrar commits e breakpoints atacados; bloqueios adicionais podem ser corrigidos sem serem escondidos da amostra.
5. Repetir a matriz com os mesmos briefings e condições equivalentes.
6. Rodar `npm run convergence:phase8-check`.
7. Publicar uma decisão: `expand`, `iterate` ou `revert`.

## Critério de decisão

- `expand`: amostra completa, nenhum P0/P1 aberto, conclusão e entrega não pioram, e tempo para primeiro output melhora ou permanece dentro de 10% com ganho qualitativo explícito.
- `iterate`: amostra completa, mas métricas são inconclusivas, há regressão limitada ou o baseline não suporta uma alegação de superioridade.
- `revert`: regressão relevante de conclusão/entrega, perda de contexto recorrente ou custo inesperado sem correção segura.

Sem amostra completa, o status é apenas `collecting`; Gate 8 não pode ser aprovado.
