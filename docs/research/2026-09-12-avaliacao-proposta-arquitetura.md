# Avaliação da proposta de arquitetura

**Data:** 2026-09-12  
**Status:** endosso com correções  
**Commit analisado:** `7db57fc` (`main`)  
**CI:** [sucesso](https://github.com/jhowtkd/adscale/actions/runs/34664208122)  
**Escopo:** revisão da proposta de priorizar concorrência, consistência de estado e validação operacional antes de novos agentes ou funcionalidades. Não altera código de produção.

Fonte: `main` @ `7db57fc` (12 set 2026). Contratos conferidos no repositório. A suíte não foi executada localmente e o Postgres vivo não foi consultado.

---

## Resumo executivo

| Critério | Resultado |
| -------- | --------- |
| Tese: não acrescentar camadas | Sim |
| Decisões a preservar | 5/5 |
| Fidelidade dos achados de código | Alta |
| Impacto em produção | Médio (não medido) |

A tese está certa: o ADScale precisa tornar confiáveis as fronteiras que já tem, não ganhar mais agentes. Os achados de código no commit `7db57fc` conferem. O que muda é a tática das duas primeiras intervenções e a urgência relativa do teste de topologia.

**Veredito:** aprovar como documento de direção. Não reescrever o sistema, não introduzir microserviços, não criar um framework de agentes. Tratar a transação longa da preparação como o único P1 de código; isolar os efeitos da aprovação com o padrão que o job de imagem já usa; deixar o teste web+worker como gate de release, não como refatoração do núcleo.

---

## 1. O que a proposta acerta

A leitura do produto coincide com o `CONTEXT.md` e com o ADR 0013: o Trabalho é o agregado; Estúdio, API e Assistente são superfícies; a IA interpreta e cria; cobrança, autorização e aprovação permanecem determinísticas.

O Foglamp é inventário, não o fluxo real. Com `executionPolicy === "direct"`, o executor canônico realmente pula planejador e seletor de candidatos.

Recomendar “criar uma camada de aplicação compartilhada” seria ignorar o que já existe. O matiz: os testes de paridade HTTP/Assistente cobrem cinco ações antigas de campanha/derivação (`adapter-parity.test.ts`), não prepare/generate do Estúdio. A conclusão permanece; o alcance da paridade é menor do que o texto sugere.

### Decisões a preservar

| Decisão | Conferência | Julgamento |
| ------- | ----------- | ---------- |
| Executor canônico | `executeCanonicalGeneration()` é o único caminho de provedor + storage | Preservar |
| Settlement centralizado | `reserve → charge → dispatch → compensate`, com chaves de idempotência | Preservar |
| Snapshot versionado | fact pack, briefing, política de geração; referências visuais não viram fato | Preservar |
| Aprovação explícita | `getCreativeWorkSelectionPolicy()` bloqueia fail; confirmação não ignora reprovação | Preservar |
| Web ≠ worker | `IMAGE_JOB_TARGET=worker`, `maxWorkerConcurrency=2`, 8 jobs v2 | Preservar |

---

## 2. Achados versus evidência

A proposta rotula dois problemas como P1. Abaixo, a prioridade depois de reler os contratos.

### P1 de código — preparação segura a conexão enquanto espera o modelo

**Endosso.**

`withCreativeWorkPreparationLock()` abre transação, toma `pg_advisory_xact_lock` e chama o modelo dentro do callback. Em peça única isso pode ser duas idas à OpenAI na mesma transação (`reviewInferredBriefingOnce` e `generateSocialPostCopy`). `planCarouselWork()` faz o mesmo com `proposeCarouselDraft()`. O pool tem 10 conexões por processo. O próprio comentário no lock já pede lease.

O mutex é mais largo do que o texto isola: também serializa mutação de fontes e reserva de outputs (`reservePreparedCreativeWorkOutputsIfCurrent`). Não basta soltar o lock. A IA sai da transação; a revisão de entrada e a exclusão mútua ficam. O lock atual já impede duas preparações independentes do mesmo Trabalho — a refatoração precisa conservar isso, não só liberar conexão.

Há leases de editor de camadas (90 s), CAS de conclusão de peça e ack de settlement. Não inventar um quarto estilo: tentativa com id, validade e compare-and-set da revisão.

**Critério (mantido):** uma IA lenta não deve manter transação aberta; uma edição durante a preparação deve invalidar o resultado antigo; duas solicitações equivalentes não devem disparar preparações independentes.

### P1 de produto — aprovação persistida, resposta de erro

**Diagnóstico certo, remédio pesado.**

`selectCreativeWorkOutputCommand()` grava a seleção e só então registra na biblioteca, emite evento de valor e salva receita. Os testes não cobrem falha de storage depois do commit. O caso mais nítido é `saveAsRecipe` depois do persist.

O job de imagem já isolou isso: falha de library não reclassifica peça concluída. Select faz o inverso. O primeiro PR é copiar esse padrão e devolver sucesso da seleção com pendência explícita. Outbox só se a recuperação precisar ser durável. Inngest já existe; uma tabela nova agora seria infraestrutura por estética — exatamente o que a proposta quer evitar em outro ponto.

**Critério (mantido):** simular falha do armazenamento após a seleção e comprovar que a interface continua mostrando o estado correto.

### P1 de release — CI verde ≠ topologia de produção

**Gap de evidência, não bug do CI.**

CI usa `IMAGE_JOB_TARGET=web`, Inngest de desenvolvimento e storage local. O blueprint usa worker, R2 e Inngest Cloud. Essa diferença está congelada de propósito em `ci-workflow.test.ts`. Não é um CI frágil — é uma suíte determinística que não prova o caminho implantado.

O smoke certo é staging: publicar evento, consumir no worker, persistir, repetir após restart. Não colocar modelo real no CI de PR.

**Critério (mantido):** comprovar que um Trabalho percorre a topologia de produção e chega ao estado terminal correto, inclusive quando o worker reinicia ou recebe um evento repetido.

### P2 — `join()` reconstrói estado com polling

**Concordo, com teto.**

Há **oito** loops de até 80 tentativas × 25 ms (~2 s). Cada volta lê Trabalho, cobrança, ack e reembolsos. O teto evita tempestade infinita; o custo é duplicação e pressão no banco sob retry. Já existe `dispatch-ack` no livro de uso. Promover esse ack a estado de tentativa; não mexer nas chaves financeiras.

### P2 — núcleo ainda fala `quick_tool` / campanha / `/quick-tools/create-post`

**Dívida real, frente de higiene.**

`GenerationSurface` inclui `campaign | assistant | quick_tool`. `settlement-adapters` importa `updateCampaign` e grava `returnPath` legado. Migração incremental, sem rename em massa.

---

## 3. Ordem de execução

| # | Proposta original | Ajuste |
| - | ----------------- | ------ |
| 0 | Ops no fim das primeiras frentes | Começar por plano real do Postgres, backup/restore e o que de fato impede merge. É tarde de calendário, não refatoração. |
| 1 | Tirar IA da transação longa | Manter. Escopo: `prepareCreativeWork` + `planCarouselWork`. Reserva de geração continua no mesmo critério de revisão. |
| 2 | Separar aprovação de efeitos | Manter o critério; PR pequeno isolando library/evento/receita, no padrão do job. |
| 3 | Validar topologia web+worker | Staging/smoke de release, não job de PR. Provar publish → consume → persist → replay após restart. |
| 4 | Simplificar `join()` | Colapsar os 8 loops iguais sobre um estado de tentativa. Chaves financeiras intocadas. |
| 5 | Isolar traduções legadas | Manter como higiene contínua, não como frente que compete com 1–2. |

---

## 4. Correções táticas

### A transação longa é pior do que o texto isola

No caminho de peça única, uma preparação incompleta pode fazer duas chamadas ao modelo na mesma transação: revisão do briefing e geração de texto. O planejador de carrossel segura o mesmo lock durante `proposeCarouselDraft()`. Editar fonte, reservar output e preparar compartilham o mutex — de propósito.

O lock atual já serializa duplicata e invalidação por edição. A refatoração precisa conservá-las, não só “liberar conexão”.

### Outbox não é o primeiro passo da aprovação

O job já documenta: falha de library não pode reclassificar peça concluída. Select faz o inverso. `saveAsRecipe` depois do commit é o caso mais nítido de resposta que contradiz o estado.

Isolar efeitos, devolver sucesso da seleção com pendência explícita, e só então decidir entre Inngest e outbox.

### Não inventar um quarto lease

O produto já tem:

- leases de editor de camadas (90 s)
- CAS de conclusão de peça
- reserva/ack de settlement

A preparação pede o mesmo vocabulário: tentativa com id, validade e compare-and-set da revisão de entrada. Remover o advisory lock sem esse contrato reabre a corrida que `mutateCreativeWorkDraftSource()` e `reservePreparedCreativeWorkOutputsIfCurrent()` hoje serializam.

---

## 5. Infraestrutura

| Sinal | Blueprint / GitHub | Estado desta revisão |
| ----- | ------------------ | -------------------- |
| Postgres `plan: free` | `render.yaml` `databases[0].plan` | Continua só no blueprint. Plano contratado, backup e restore não foram confirmados. |
| Migrate só no web | `startCommand` do `adscale-app`; worker sobe `image-worker.ts` | Confirmado. Deploy web/worker/schema não tem barreira explícita no arquivo. |
| `main` `protected: false` | API de branch | Confirmado. Rulesets: 403. Deploy depende de `checksPass` no Render, não de proteção GitHub visível. |
| CI do SHA | check-run `test` + workflow CI | Sucesso. Um job agrega lint, tipos, migrações, testes, build e jornadas. |

Essas três conferências de ops cabem numa tarde e deveriam abrir a fila, não acompanhar a refatoração.

O complemento que a própria proposta pede continua em falta: espera no banco, tempo de fila, falhas por etapa e custo por peça aprovada. Sem isso, P1 de desenho e gargalo real continuam indistinguíveis. A assimetria do blueprint (web starter 512 MB, worker standard, Postgres free) torna essa medição mais urgente do que qualquer rename legado.

---

## 6. O que esta avaliação não autoriza

- Abrir as cinco frentes em paralelo.
- Tratar o Foglamp como mapa de runtime.
- Promover teste contra modelo real para o CI de PR.
- Reescrever settlement.
- Usar este documento como autorização para acrescentar agentes ou microserviços.

Workspace no momento da revisão: `feat/f03-commercial-offer-catalog`, não `7db57fc`. O lock e o settlement descritos aqui seguem no código dessa branch; qualquer trabalho novo de catálogo comercial continua dentro da mesma transação até o P1 da preparação existir.

---

## Referências

- Commit: `7db57fc907102f918826ab786ffd08c7f0c40b9d`
- CI: https://github.com/jhowtkd/adscale/actions/runs/34664208122
- Foglamp: https://www.foglamp.dev/scan/adscale-qjsbuh
- `CONTEXT.md`, ADR 0013
- `app/src/server/repositories/creative-work.ts` (`withCreativeWorkPreparationLock`)
- `app/src/server/application/prepare-creative-work.ts`
- `app/src/server/application/plan-carousel-work.ts`
- `app/src/server/application/select-creative-work-output.ts`
- `app/src/server/jobs/creative-work.ts` (isolamento de library no job)
- `app/src/server/generation/settlement.ts`
- `app/src/server/generation/settlement-adapters.ts`
- `app/src/server/generation/pipeline/execute.ts`
- `app/src/server/application/adapter-parity.test.ts`
- `app/src/server/jobs/ci-workflow.test.ts`
- `render.yaml`, `.github/workflows/ci.yml`
