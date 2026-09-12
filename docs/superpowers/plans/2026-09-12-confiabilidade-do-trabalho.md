# Confiabilidade do Trabalho Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar preparação, seleção, geração e recuperação do Trabalho consistentes — sem substituir a arquitetura existente — retirando chamadas externas de transações longas e fazendo cada resposta dizer a verdade sobre o que foi persistido.

**Architecture:** Preservar o monólito modular, o agregado Trabalho, os comandos de aplicação, o executor canônico, PostgreSQL, Inngest e o worker separado. Substituir o lock de preparação que segura uma conexão durante a chamada do modelo por um protocolo de tentativa persistida (claim curto → IA fora de transação → finalize curto com revalidação). Separar o resultado da seleção dos efeitos posteriores, com estados tipados e lastro durável para a única obrigação que precisa sobreviver ao commit.

**Tech Stack:** TypeScript, Next.js, React, Zod, Drizzle/PostgreSQL 16, Inngest, Cloudflare R2, Vitest e Playwright — todos já presentes no projeto. Nenhuma dependência nova.

**Spec:** `/Users/jhonatan/Downloads/adscale-plano-consolidado-confiabilidade-2026-09-12.md` (plano consolidado de 12/09/2026, fornecido pelo proprietário nesta conversa). Fontes secundárias citadas pela spec: `docs/research/2026-09-12-avaliacao-proposta-arquitetura.md`, `CONTEXT.md`, `docs/adr/0013-trabalho-criativo-first.md`, `docs/agents/source-of-truth.md`, `docs/decisions/2026-09-12-funnel-read-gate8-holds.md`.

**Base verificada para este plano:** `b2ee6511a6739e92bb074874078fe0acd88b608f` (`origin/main` em 12/09/2026 — o mesmo SHA que a spec registra em [R2]). Fixar novamente o SHA antes do primeiro PR e reexecutar checks após qualquer rebase. Não transferir resultado de CI de um SHA para outro.

> **Correção de base aplicada em 12/09/2026.** A primeira versão deste plano foi escrita lendo `e6cb33df` (HEAD de `feat/f03-commercial-offer-catalog`), que **divergiu** de `origin/main` no merge-base `6f8b62c7`. `origin/main` tem 13 commits que aquela branch não tem — entre eles `bea4d2bc` (carrossel editorial, #331) e `becca0a8` (caixa unificada, #325). Todas as referências de arquivo:linha abaixo foram reconferidas contra `b2ee6511` e corrigidas. O que mudou de conclusão, e não só de numeração, está marcado em **Descobertas**. Arquivos byte-idênticos nas duas bases estão listados adiante — para eles nada mudou.

---

## Global Constraints

Valores copiados literalmente da spec. Os requisitos de toda tarefa incluem implicitamente esta seção.

- Trabalho é o agregado; Campanha é agrupamento opcional. Estúdio, HTTP e Assistente não ganham regras de negócio concorrentes.
- Preservar snapshots, proveniência factual, separação conteúdo/estilo, contratos de qualidade e confirmação humana. Uma confirmação nunca ignora uma reprovação objetiva.
- Preservar preços, custos em créditos, chaves de cobrança, reembolso e deduplicação de eventos. Alterações financeiras exigem outro escopo.
- Não trocar modelos, provedores ou prompts neste ciclo para tentar corrigir problemas de concorrência.
- Não reintroduzir custos ou estimativas na decisão criativa. Métricas deste plano são operacionais; não são nova etapa no Estúdio.
- Não acrescentar microserviços, Redis, broker, framework de agentes ou outbox genérico nesta intervenção.
- Persistência mínima de uma obrigação do domínio é permitida quando necessária para não mentir sobre uma pendência. Isso não autoriza infraestrutura genérica de recuperação.
- Não remover locks de gravações curtas. A correção é retirar espera externa da transação, mantendo protocolo coerente para todos os escritores.
- Não tornar o repositório público. Mudanças de plano e permissões dependem do proprietário.
- Não colocar modelos reais no CI de PR. Usar fixtures sem dados de clientes em testes de release.
- Não usar `campaign.completed` como conversão do Estúdio nem percentual de rollout como prova de validação.
- O freeze de destinos primários, Landing Page e Persona Simulation permanece. Não alterar percentuais de produto (`STUDIO_CAROUSEL_ROLLOUT_PERCENT`, `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT` — ambos `"100"` hoje) neste plano.
- Um executor por worktree; um revisor independente; somente uma mudança ativa nos arquivos compartilhados de preparação/settlement.
- Não fazer renomeação massiva nem dividir arquivos apenas para atingir um número de linhas.
- Manter `quick_tool` como alias histórico nas fronteiras de persistência/telemetria enquanto houver consumidores.
- Prompts, chaves, conteúdo de cliente e URLs assinadas nunca entram em log, relatório ou fixture.

### Pré-requisito de worktree (antes da Task 1)

A branch atual (`feat/f03-commercial-offer-catalog`) tem trabalho não commitado e dezenas de arquivos não rastreados. **Não implementar este plano nela.** Criar worktree isolado a partir da base fixada usando a skill `superpowers:using-git-worktrees`. O `git status` do worktree precisa estar limpo antes da Task 2.

---

## Descobertas verificadas nesta rodada

Leitura direta do código em `e6cb33dfa13da786aacffccb4becf4043dc0c5bc` (worktree local, cujos arquivos relevantes coincidem com `origin/main` `b2ee6511…`). Estas descobertas confirmam, corrigem ou completam as afirmações da spec e são o que as tarefas abaixo assumem.

**Confirmado — a transação abre antes do lock.** `app/src/server/repositories/creative-work.ts:808-818`: `db.transaction` é aberta e só então `pg_advisory_xact_lock` é executado; o `callback` roda dentro da transação. O comentário `// ponytail:` no próprio código já registra que uma conexão fica presa durante a chamada do modelo. Corresponde a [R4].

**Confirmado — a seleção reporta fracasso por falha posterior ao commit.** `app/src/server/application/select-creative-work-output.ts`: `selectCreativeWorkOutput` commita na linha 99; a falha de receita nas linhas 159-161 retorna `{ ok: false, error: { code: "visual_recipe_not_structured" } }` — **exatamente o mesmo código** usado na pré-validação da linha 94-96, antes de qualquer escrita. O adaptador HTTP (`select/route.ts:61-62`) traduz ambos para `409 visualRecipeNotStructured`, e a interface (`useComposerOutputActions.ts:113-116`) marca `approvalErrorOutputId`. O usuário vê a aprovação falhar embora a peça esteja selecionada no banco. Corresponde a [R3].

**Contagem independente: são 8 loops.** `app/src/server/generation/settlement-adapters.ts` tem exatamente oito laços `for (… attempt < 80 …)`, nas linhas **378, 692, 818, 1068, 1397, 1664, 2284 e 2658**, cada um com pausas `setTimeout(…, 25)`. Isto confirma a contagem que [R1] afirmava e que a spec, corretamente, não adotava sem verificação. O teto de 80 × 25 ms continua sendo soma nominal de pausas, não duração máxima da operação.

**Confirmado e quantificado — consultas de reembolso crescem com o lote.** O laço da linha 1664 relê o conjunto inteiro a cada volta com `Promise.all(originalIds.map((id) => getDerivationById(id, …)))`; o da linha 378 faz o mesmo com `getUsageByIdempotencyKey` por output. Não existe leitor em lote: `app/src/server/repositories/derivation.ts:368` só expõe `getDerivationById`, e `app/src/server/repositories/usage.ts:56` só expõe `getUsageByIdempotencyKey`. Com N outputs o custo por laço é O(N) por iteração.

**Novo — `workspace_assets.key` é único globalmente.** `app/src/server/db/schema.ts:619` declara `key: text("key").notNull().unique()` e `app/drizzle/0019_redundant_human_torch.sql:44` cria `CONSTRAINT "workspace_assets_key_unique" UNIQUE("key")`; nenhuma migração posterior a remove. `createWorkspaceAsset` (`app/src/server/repositories/workspace-asset.ts:23-39`) faz insert puro, sem `onConflict`. Logo, duas recuperações concorrentes do mesmo ativo **não** produzem linha duplicada: a segunda estoura violação de unicidade (SQLSTATE 23505) e derruba o comando. Isto completa [R10] — a conferência de constraint que a spec exigia já foi feita, e o modo de falha é erro, não duplicata.

**Confirmado — `plan: free` está declarado no blueprint.** `render.yaml:195-200` declara `databases: - name: adscale-postgres … plan: free … postgresMajorVersion: "16"`. Isto **não** prova o plano vivo (a spec está certa), mas torna a conferência da Task 1 obrigatória antes de qualquer operação destrutiva.

**Novo — só a web migra o banco.** `render.yaml:22` define `startCommand: npm run db:migrate && … npm run start:prod` para `adscale-app`; `render.yaml:124` define `startCommand: node --conditions=react-server --import=tsx src/server/jobs/image-worker.ts` para `adscale-image-worker`, **sem** migração. O worker depende de a web ter migrado. Nenhum `numInstances` é declarado, então o padrão de 1 réplica por serviço vale até prova em contrário no painel.

**Novo — o pool é 10 por processo, compartilhado.** `app/src/server/db/index.ts:7-16` cria um único `Pool({ max: 10, connectionTimeoutMillis: 10000 })`. Web e worker importam o mesmo módulo, logo cada processo abre até 10. O orçamento da Task 1 parte de 10 × (réplicas web + réplicas worker) + sobreposição de deploy + migração + reserva administrativa.

**Novo — o CI tem um único job.** `.github/workflows/ci.yml` define apenas `test` (linha 15), que encadeia lint, typecheck, convergence gates, migrações, testes, build e Playwright. Um job só pode perfeitamente ser um required check; a contagem de jobs nunca decidiu isso. Corresponde a [R2]/[R9].

**Novo — `dbHttp` não tem consumidor algum.** Busca em `app/src`, `app/scripts`, `app/tests` retorna apenas a própria definição em `app/src/server/db/http.ts:15-16`. Não há import estático fora do módulo. Como grep não prova ausência de import dinâmico, a Task 20 ainda exige a verificação complementar antes de remover.

**Novo — MiniMax é configuração órfã, e o boot não a exige.** `render.yaml:65-68` define `MINIMAX_API_KEY` e `MINIMAX_MODEL` **apenas no serviço web**. Nenhum consumidor existe em `app/src`, `app/scripts` ou `app/tests` (a única ocorrência é o nome de um teste, `registry.test.ts:5`). `app/src/server/validation/env.ts` **não declara** nenhuma chave `MINIMAX_*` — só `ATLASCLOUD_API_KEY`. A hipótese da spec de que a validação de boot poderia exigir a variável está descartada para este SHA.

**Novo — já existe padrão de teste com Postgres real.** `app/tests/integration/creative-work-recovery.test.ts:1-40` estabelece a convenção: suíte pula sem `TEST_DATABASE_URL`/`DATABASE_URL`, falha de verdade no `beforeAll` quando a URL é passada e o banco não responde, mocka apenas `@/server/jobs/client`, e documenta o comando de execução no cabeçalho. Os testes concorrentes deste plano seguem esse padrão em vez de inventar outro.

**Novo — a paridade de adaptadores cobre cinco ações históricas e nenhuma delas é do Estúdio.** `app/src/server/application/adapter-parity.test.ts` exercita rota HTTP e handler do Assistente contra o mesmo comando mockado para exatamente cinco migrações: `save-derivation-reference`, `restyle-campaign`, `regenerate-derivation`, `review-derivation` e `prepare-delivery-package`. Isto confirma [R1] — **não** existe cobertura de paridade para `prepare`/`generate` do Estúdio. E, verificado por busca, o Assistente **não chama** `selectCreativeWorkOutput`, `prepareCreativeWork` nem `planCarouselWork`: para os comandos que este plano altera, o adaptador HTTP é a única superfície. Logo não há paridade a ampliar aqui — mas isso é conclusão verificada, não cobertura universal presumida.

**Corrigido — são nove chamadores do lock em produção, não sete.** Contra `b2ee6511`:

| # | Chamador | Arquivo:linha da chamada | Classificação |
|---|---|---|---|
| 1 | `mutateCreativeWorkPieceReference` (def. 671) | `repositories/creative-work.ts:680` | escrita curta |
| 2 | `mutateCreativeWorkDraftSource` (def. 1029) | `repositories/creative-work.ts:1038` | escrita curta |
| 3 | `reservePreparedCreativeWorkOutputsIfCurrent` (def. 1447) | `repositories/creative-work.ts:1453` | reserva |
| 4 | `reserveCreativeWorkGenerationOutputs` (def. 1474) | `repositories/creative-work.ts:1482` | reserva |
| 5 | `planCarouselWork` — ramo `approve_script`/`approve_cover` | `application/plan-carousel-work.ts:95` | escrita curta |
| 6 | `planCarouselWork` — ramo `select_hook` | `application/plan-carousel-work.ts:105` | escrita curta |
| 7 | `planCarouselWork` — `authorizeSnapshot` dos demais ramos | `application/plan-carousel-work.ts:114` | leitura curta |
| 8 | `prepareCarouselWork` | `application/prepare-carousel-work.ts:109` | só banco — ver abaixo |
| 9 | `prepareCreativeWork` | `application/prepare-creative-work.ts:136` | **externa direta ×2** |

**Corrigido — o carrossel editorial JÁ roda a IA fora da transação.** Esta é a correção de conclusão mais importante. O commit `bea4d2bc` (#331) reescreveu `plan-carousel-work.ts` de 134 para 533 linhas e o estruturou como três transações curtas (linhas 95, 105, 114) que só fazem `authorizeSnapshot`, `persistHookSelection`, `approveScript` e `approveCover`. As chamadas externas — `researchCarousel` (linha 192), `proposeCarouselHooks` (linha 218) e `proposeCarouselDraft` (linha 289) — acontecem em `proposeHooks`, `proposeSelectedScript` e `reviseScript`, **fora** de qualquer lock. A premissa original deste plano (`proposeCarouselDraft` dentro da transação) era um artefato de eu ter lido a base errada. O guard atual contra resultado velho é o CAS de `expectedUpdatedAt`, **não** uma tentativa persistida — é isso, e só isso, que a Task 16 precisa avaliar.

**Confirmado na base — `prepareCarouselWork` não faz I/O externo.** Os `await` dentro do callback da linha 109 são todos de banco: `getCreativeWork`, `updateCreativeWorkIfUnchanged`, `getBrandKit`, `createIdentitySnapshot`, `getCreativeWorkSourceAssetDetails` e `persistSnapshot`. Nenhuma chamada de modelo nem de storage. Pelo critério do plano, ele **conserva a transação curta**.

**Confirmado na base — `prepareCreativeWork` continua com a IA dentro da transação.** `prepare-creative-work.ts:136` abre o lock e tanto `reviewInferredBriefingOnce` (linha 364) quanto `generateSocialPostCopy` (linha 466) são aguardados dentro dele, com `updateCreativeWorkDraftIfUnchanged` na linha 486. Esta é a peça que a Task 15 corrige, e ela sobrevive intacta à correção de base.

**Arquivos byte-idênticos nas duas bases.** Para estes, toda referência de linha da versão original do plano continua exata, e nenhuma tarefa que os toque foi afetada: `select-creative-work-output.ts`, `select-creative-work-output.test.ts`, `workspace-asset.ts`, `ensure-creative-work-output-library.ts`, `db/schema.ts`, `db/index.ts`, `job-telemetry.ts`, `derivation.ts`, `usage.ts`, `useComposerOutputActions.ts` e a rota `select/route.ts`. **Em consequência, as Tasks 2, 4, 6 e 9 não precisaram de nenhuma correção.**

O inventário acima é ponto de partida da Task 7, não substituto dela: chamadas externas **transitivas** dentro de `createIdentitySnapshot`, `authorizeSnapshot` e `getCreativeWorkSourceAssetDetails` ainda precisam ser rastreadas.

**Limites desta leitura.** Não foram executados testes, não foi consultado o banco de produção nem o painel Render, e nenhum código remoto foi alterado. Os comandos de verificação deste plano são passos de execução, não relato de execução feita.

---

## File Structure

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `docs/operations/2026-09-12-reliability-baseline.md` | Relatório operacional da Task 1 (banco, restore, conexões, proteção, base fixada). Sem segredos. |
| `docs/operations/reliability-metrics.md` | Baseline medido por SHA: espera de lock, tempo em transação, tempo de modelo, replays, consultas. Criado pela Task 18; Tasks 9, 16 e 17 acrescentam seções. |
| `docs/operations/2026-09-12-preparation-lock-inventory.md` | Inventário classificado dos chamadores do lock, incluindo chamadas transitivas. |
| `app/tests/integration/creative-work-preparation-concurrency.test.ts` | Caracterização concorrente contra Postgres real. |
| `app/src/server/creative-work/preparation-attempt.ts` | Regras puras da tentativa de preparação (fingerprint, validade, transições). |
| `app/src/server/creative-work/preparation-attempt.test.ts` | Testes das regras puras. |
| `app/src/server/repositories/creative-work-preparation.ts` | Claim, renovação, invalidação e finalização atômicas da tentativa. |
| `app/src/server/repositories/creative-work-preparation.test.ts` | Testes concorrentes do repositório contra Postgres real. |
| `app/src/server/generation/settlement-wait.ts` | Mecânica comum de espera com deadline monotônico. Sem política de compensação. |
| `app/src/server/generation/settlement-wait.test.ts` | Testes do helper de espera. |
| `app/scripts/reliability-release-smoke.ts` | Smoke web+worker+schema por SHA candidato. |
| `.github/workflows/reliability-release-smoke.yml` | Gate manual/por release. Não substitui o CI de PR. |
| `docs/runbooks/reliability-release.md` | Runbook do gate: como rodar, como ler evidência, como bloquear. |
| `app/drizzle/0095_creative_work_selection_effects.sql` | Coluna aditiva do recibo de efeito pendente. |
| `app/drizzle/0096_creative_work_preparation_attempts.sql` | Tabela aditiva de tentativas de preparação. |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `app/src/server/application/select-creative-work-output.ts` | Contrato `SelectionEffects`; sucesso da seleção deixa de virar erro global. |
| `app/src/server/application/ensure-creative-work-output-library.ts` | Resultado tipado; concorrência segura contra a unicidade global de `key`. |
| `app/src/server/repositories/workspace-asset.ts` | `createWorkspaceAssetIfKeyAbsent` (novo export; `createWorkspaceAsset` intocado). |
| `app/src/server/repositories/creative-work.ts` | Recibo de efeito na transação da seleção; escritores compatíveis com a tentativa; lock sem espera externa. |
| `app/src/server/db/schema.ts` | Coluna `selectionEffects`; tabela `creativeWorkPreparationAttempts`. |
| `app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.ts` | Devolve `effects` no sucesso; erros pré-commit continuam erro. |
| `app/src/lib/hooks/use-creative-work.ts` | Tipo de retorno com `effects`. |
| `app/src/components/creative-work/useComposerOutputActions.ts` | Aprovação com efeito parcial não reverte visualmente a seleção. |
| `app/messages/pt-BR.json`, `app/messages/en.json` | Mensagens de efeito parcial. |
| `app/src/server/creative-work/job-telemetry.ts` | `logCreativeWorkPreparationAttempt`, `logCreativeWorkSelectionEffect`. |
| `app/src/server/application/prepare-creative-work.ts` | IA fora da transação, sob tentativa. |
| `app/src/server/application/plan-carousel-work.ts` | Idem. |
| `app/src/server/application/prepare-carousel-work.ts` | Idem, conforme o inventário da Task 7. |
| `app/src/server/generation/settlement-adapters.ts` | Leituras em lote e deadline monotônico; políticas intactas. |
| `app/src/server/repositories/derivation.ts` | `getDerivationsByIds`. |
| `app/src/server/repositories/usage.ts` | `getUsageByIdempotencyKeys`. |
| `render.yaml` | Só se a Task 1 comprovar necessidade operacional; nunca por opinião. |

---

## Task 1 (OPS-00): Base operacional — banco, restore, conexões, proteção

**Responsável:** proprietário/operação, com o agente coletando e redigindo. Esta tarefa **não autoriza** contratar plano, alterar infraestrutura, mudar credenciais nem tocar no banco de produção.

**Files:**
- Create: `docs/operations/2026-09-12-reliability-baseline.md`
- Read-only: `render.yaml`, `app/src/server/db/index.ts`, `app/src/server/db/http.ts`, `app/scripts/migrate-with-retry.mjs`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nada.
- Produces: SHA de execução fixado e o relatório acima. Toda tarefa seguinte cita esse SHA no seu relatório.

Esta tarefa não tem ciclo TDD: a entrega é evidência operacional. Ela é mesmo assim um gate — nenhuma alteração destrutiva ou ampliação operacional acontece sem ela. Desenvolvimento local (Tasks 2 a 6) **não** fica bloqueado esperando compra de plano.

- [ ] **Step 1: Fixar e registrar a base**

```bash
cd /Users/jhonatan/Repos/ADScale_2
git fetch origin
git rev-parse origin/main
git log --oneline --decorate -8 origin/main
```

Registrar o SHA retornado no relatório como "SHA de execução". Se diferir de `b2ee6511a6739e92bb074874078fe0acd88b608f`, reconferir as Descobertas acima antes de prosseguir — não presumir que continuam válidas.

- [ ] **Step 2: Classificar features em voo**

```bash
git branch -r --no-merged origin/main
gh pr list --state open --json number,title,headRefName,mergeable,updatedAt
```

Classificar cada PR aberto em: (a) aceito e indispensável à base; (b) independente e adiável; (c) conflitante com a decisão canônica. Integrar apenas o grupo (a), depois de checks e revisão — ou mantê-lo fora da base e exigir rebase posterior. Não fazer "merge de todas as features primeiro". **Não inferir merge ou descarte porque uma branch remota não foi encontrada** — a spec registra que `feat/f03-commercial-offer-catalog` não apareceu na consulta remota daquela rodada e isso não significa que foi integrada.

- [ ] **Step 3: Registrar provedor, plano e política de backup do Postgres**

No painel Render (ação do proprietário), registrar no relatório: provedor, plano efetivo, versão do Postgres, limite de conexões do plano, data de expiração aplicável e política de backup. `render.yaml:191` declara `plan: free`; o relatório precisa dizer se o banco vivo é esse mesmo ou outro. **Não publicar `DATABASE_URL`, credenciais nem dump no GitHub.**

Se o banco vivo for Render Free: o plano documentado expira em 30 dias, tem 14 dias de carência após expirar e não oferece backups gerenciados. Preservar os dados e decidir o plano adequado **antes** de qualquer expansão ou migração arriscada.

- [ ] **Step 4: Provar que o backup é recuperável**

Restaurar em destino isolado, com webhooks, e-mails e workers de produção desligados. Registrar: momento do backup, duração do restore e verificações de integridade (contagem de linhas por tabela principal, último `created_at` de `creative_work_items` e `usage_events`). **Não alterar o banco de produção durante o exercício.**

- [ ] **Step 5: Conferir objetos R2 de uma amostra**

Restaurar Postgres sozinho não recupera imagens ausentes. Tomar uma amostra de `creative_work_outputs.output_key` não nulos e conferir existência no bucket. Registrar tamanho da amostra e quantos faltaram. Nunca registrar URL assinada.

- [ ] **Step 6: Somar o orçamento de conexões**

Somar: réplicas web × 10 + réplicas worker × 10 + sobreposição de deploy + migrações/scripts + reserva administrativa. O `max: 10` vem de `app/src/server/db/index.ts:9` e vale para **cada processo** que importa o módulo. Não usar "10" como teto global. Comparar com o limite do plano registrado no Step 3 e registrar a folga (ou o déficit).

- [ ] **Step 7: Conferir proteção efetiva de branch**

```bash
gh api repos/jhowtkd/adscale/branches/main --jq '{protected: .protected, protection: .protection}'
```

Registrar: PR obrigatório, qual check está exigido e se ele é avaliado no SHA correto, ausência de force-push e quem pode dar bypass. O CI tem um único job (`test`) — isso não impede que ele seja required. Se a proteção não estiver disponível no plano atual, documentar a limitação e a decisão; **não descrever procedimento manual como bloqueio técnico equivalente**. Não configurar revisão externa impossível num fluxo com uma única identidade GitHub: revisão de agente usando a identidade do autor não equivale a aprovação independente na plataforma. Manter o repositório privado.

- [ ] **Step 8: Registrar a ordem migração → deploy**

Registrar o fato verificado: `render.yaml:22` migra na web, `render.yaml:124` não migra no worker. Documentar que migrações aditivas precisam ser aplicadas **antes** de subir código web/worker que dependa delas, e que nenhum worker pode depender de a web "eventualmente" migrar. As Tasks 10-13 e 14 dependem deste registro.

- [ ] **Step 9: Commit do relatório**

```bash
git add docs/operations/2026-09-12-reliability-baseline.md
git commit -m "docs: record reliability operational baseline"
```

**Aceite:** evidência de restore, plano vivo identificado, orçamento de conexões somado, caminho real de merge/deploy documentado e base fixada. Risco crítico de perda de dados confirmado tem precedência sobre a fila de refatoração.

**Reversão:** não fazer downgrade destrutivo para desfazer decisão operacional; manter cópia e plano de restauração.

---

## Task 2 (PR-01): Testes de regressão que provam a resposta contraditória

Esta tarefa **não corrige nada**. Ela grava, em teste, o comportamento errado de hoje, para que a correção das Tasks 3-6 seja demonstrável e não uma afirmação.

**Files:**
- Test: `app/src/server/application/select-creative-work-output.test.ts` (modificar — acrescentar bloco `describe`)

**Interfaces:**
- Consumes: `selectCreativeWorkOutputCommand` como está hoje.
- Produces: dois testes marcados `it.fails` que documentam a regressão, removidos na Task 4.

- [ ] **Step 1: Acrescentar a fixture de peça estruturada**

O arquivo já mocka `@/server/repositories/creative-work`, `ensure-creative-work-output-library`, `save-visual-recipe` e `record-value-event` (linhas 3-27), mas **não** mocka `extractVisualRecipe`. Logo, para o comando passar da pré-validação da linha 86, o output precisa de `quality` estruturada de verdade. Acrescentar esta fixture logo depois de `completedOutput` (após a linha 62 do arquivo):

```ts
/**
 * Peça estruturada mínima que satisfaz extractVisualRecipe: tipografia
 * determinística, layout válido, fonte, copy completa e geometria de logo.
 * Sem ela a pré-validação recusa antes do commit e o teste mediria outra coisa.
 */
const structuredOutput = {
  ...completedOutput,
  targetFormat: "4:5",
  quality: {
    textComposition: {
      execution: "deterministic",
      appliedLayout: "bottom",
      typographyPlan: { fontAssetKey: "brand/fonts/inter.ttf" },
      copy: { headline: "Titulo", body: "Corpo", cta: "Clique" },
      dimensions: { width: 1080, height: 1350 },
      layers: [{ role: "headline", box: { left: 80, top: 900, width: 920, height: 120 } }],
    },
    exactComposition: {
      composed: [
        {
          referenceId: "ref-logo",
          assetKey: "brand/logo.png",
          category: "logo",
          box: { left: 80, top: 80, width: 200, height: 80 },
        },
      ],
      dimensions: { width: 1080, height: 1350 },
    },
  },
};
```

- [ ] **Step 2: Escrever os testes que provam a regressão**

Acrescentar no fim do `describe("selectCreativeWorkOutputCommand")`, antes do `});` final:

```ts
  describe("efeitos posteriores ao commit da selecao", () => {
    // it.fails documenta a regressao ATUAL: o teste passa enquanto o bug
    // existe e falha quando ele e corrigido. A Task 4 converte os dois em
    // asserts normais.
    it.fails("nao deveria reportar fracasso global quando a receita falha depois do commit", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [structuredOutput], sources: [] } as never);
      mockSelect.mockResolvedValue({ ...structuredOutput, isSelected: true } as never);
      mockSaveRecipe.mockResolvedValue({ ok: false, error: { code: "missing_font" } } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        saveAsRecipe: true,
      });

      expect(result.ok).toBe(true);
    });

    it.fails("nao deveria propagar excecao da biblioteca sobre uma selecao ja confirmada", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [completedOutput], sources: [] } as never);
      mockSelect.mockResolvedValue({ ...completedOutput, isSelected: true } as never);
      mockEnsure.mockRejectedValue(
        Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }),
      );

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        saveToLibrary: true,
      });

      expect(result.ok).toBe(true);
    });
  });
```

- [ ] **Step 3: Rodar e confirmar que a regressão existe**

```bash
cd app && npm test -- src/server/application/select-creative-work-output.test.ts
```

Esperado: **PASS**, com os dois casos reportados como `fails` esperados. Se algum deles for reportado como falha inesperada ("expected to fail but passed"), o bug já não existe naquela forma — parar e reconferir `select-creative-work-output.ts` antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add app/src/server/application/select-creative-work-output.test.ts
git commit -m "test: pin the contradictory selection response before fixing it"
```

**Aceite:** a regressão descrita em [R3] está gravada em teste executável.

---

## Task 3 (PR-01): Recibo durável do efeito pendente

A receita é pedido explícito do usuário (`saveAsRecipe: true`). Para que um `pending` não seja promessa vazia, a intenção é persistida **na mesma transação da seleção**, em campo aditivo no agregado — não em tabela genérica de outbox.

**Files:**
- Modify: `app/src/server/db/schema.ts` (tabela `creativeWorkOutputs`, após `isSelected` na linha 2739)
- Create: `app/drizzle/0095_creative_work_selection_effects.sql`
- Modify: `app/src/server/repositories/creative-work.ts` (`selectCreativeWorkOutput`, linha 2214)
- Test: `app/src/server/repositories/creative-work.test.ts`

**Interfaces:**
- Consumes: `selectCreativeWorkOutput(workspaceId, workItemId, outputId, options)` de hoje.
- Produces:
  - Tipo `CreativeWorkSelectionEffectsState` exportado de `app/src/server/db/schema.ts`.
  - `selectCreativeWorkOutput(workspaceId, workItemId, outputId, options)` onde `options` ganha `pendingRecipeReceiptId?: string`. Quando presente, a coluna `selection_effects` é gravada **dentro da transação que marca `isSelected`**.
  - A Task 4 consome exatamente essa assinatura.

- [ ] **Step 1: Declarar o tipo e a coluna no schema**

Em `app/src/server/db/schema.ts`, acrescentar acima de `export const creativeWorkOutputs`:

```ts
/**
 * Obrigacao minima de dominio persistida junto com a selecao. Existe para que
 * um efeito "pending" tenha lastro: sem ela a resposta so poderia dizer
 * "failed". Nao e outbox generico — so o efeito que o usuario pediu.
 */
export type CreativeWorkSelectionEffectsState = {
  version: 1;
  recipe?: {
    receiptId: string;
    requestedAt: string;
    state: "pending" | "done" | "failed";
    code?: string;
  };
};
```

E, dentro do objeto de colunas de `creativeWorkOutputs`, logo após `isSelected: boolean("is_selected").notNull().default(false),`:

```ts
    selectionEffects: jsonb("selection_effects").$type<CreativeWorkSelectionEffectsState | null>(),
```

- [ ] **Step 2: Escrever a migração**

> **Convenção de migração deste repo — `npm run db:generate` NÃO funciona aqui.**
> A cadeia de snapshots do drizzle-kit para em `drizzle/meta/0037_snapshot.json`, mas existem 99 migrações. O gerador diffa contra o snapshot 0037, enxerga ~40 tabelas "novas" e cai num prompt interativo de renomeação (`promptNamedWithSchemasConflict`), que estoura em execução não interativa. Desde a `0038` as migrações são **escritas à mão**, com `IF NOT EXISTS`, `--> statement-breakpoint` entre statements, e a entrada do journal acrescentada manualmente (`idx` sequencial, `version: "7"`, `tag` igual ao nome do arquivo sem `.sql`). Verificado em 12/09/2026. Siga `drizzle/0094_commercial_offers.sql` como modelo de estilo.

A migração mais recente antes desta é `0094_commercial_offers` (journal `idx` 94), então esta é `0095_creative_work_selection_effects.sql` com `idx` 95. Escrever o arquivo e a entrada do journal no mesmo commit.

Conferir que o SQL é aditivo e nullable:

```bash
cat app/drizzle/0095_*.sql
```

Esperado: um único `ALTER TABLE "adscale_app"."creative_work_outputs" ADD COLUMN "selection_effects" jsonb;`. Se o gerador emitir qualquer `DROP` ou `NOT NULL`, parar — a coluna precisa ser aditiva e compatível com linhas antigas.

**Armadilha a partir daqui:** `getCreativeWork` faz `.select().from(creativeWorkOutputs)`, e o Drizzle expande isso para a lista explícita de colunas do schema. A partir deste commit, qualquer consulta a `creative_work_outputs` referencia `selection_effects` — então um banco de teste não migrado passa a falhar com "column does not exist" em **qualquer** teste de integração, não só nos novos. As Tasks 4 e 5 são unitárias com mocks e não sentem isso; a primeira que sente é a Task 6. Quem rodar `npm test` com `TEST_DATABASE_URL` apontando para um banco antigo, entre uma tarefa e outra, deve rodar antes:

```bash
cd app && npm run test:db:setup
```

Esse script executa `drizzle-kit migrate` e é idempotente.

- [ ] **Step 3: Escrever o teste do recibo na transação**

O arquivo já expõe um duplo de transação com `txSetMock` (definido na linha 91, exportado em `mocks` na linha 132) e o idioma de asserção já usado nas linhas 603-609. `selectCreativeWorkOutput` faz **dois** `.set()` dentro da transação: o primeiro limpa `isSelected: false` da vencedora anterior, o segundo marca `isSelected: true`. O recibo tem de ir no **segundo**.

Acrescentar dentro de `describe("selectCreativeWorkOutput", …)` (linha 2229):

```ts
it("grava o recibo da receita no mesmo set() que marca isSelected", async () => {
  // Preparar o cenario exatamente como o teste vizinho que ja seleciona um
  // output valido (ler o `it` da linha 2240 e reaproveitar o setup dele).
  const result = await selectCreativeWorkOutput("ws-1", "work-1", "output-1", {
    confirmObjective: true,
    pendingRecipeReceiptId: "receipt-1",
  });

  expect(result?.isSelected).toBe(true);
  // 1o set() limpa a selecao anterior; o recibo pertence ao 2o.
  expect(mocks.txSetMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
    isSelected: true,
    selectionEffects: expect.objectContaining({
      version: 1,
      recipe: expect.objectContaining({ receiptId: "receipt-1", state: "pending" }),
    }),
  }));
});

it("nao grava selectionEffects quando o recibo nao e pedido", async () => {
  await selectCreativeWorkOutput("ws-1", "work-1", "output-1", { confirmObjective: true });

  expect(mocks.txSetMock.mock.calls[1]?.[0]).not.toHaveProperty("selectionEffects");
});
```

O segundo teste é o que protege todos os chamadores atuais: sem `pendingRecipeReceiptId`, a escrita precisa continuar idêntica à de hoje.

- [ ] **Step 4: Rodar e ver falhar**

```bash
cd app && npm test -- src/server/repositories/creative-work.test.ts -t "recibo da receita"
```

Esperado: FAIL — `selectCreativeWorkOutput` ainda ignora `pendingRecipeReceiptId`. O segundo teste (`nao grava selectionEffects`) deve **passar** já agora: ele descreve o comportamento atual e existe para detectar regressão.

- [ ] **Step 5: Implementar**

Em `app/src/server/repositories/creative-work.ts`, alterar a assinatura de `selectCreativeWorkOutput` (definição na linha 2214, parâmetro `options` logo abaixo):

```ts
  options: { confirmObjective?: boolean; pendingRecipeReceiptId?: string } = {}
```

E, no **segundo** `update` — o que faz `.set({ isSelected: true, updatedAt: new Date() })`, não o que limpa a seleção anterior — acrescentar ao objeto do `.set({ … })`:

```ts
      ...(options.pendingRecipeReceiptId
        ? {
            selectionEffects: {
              version: 1 as const,
              recipe: {
                receiptId: options.pendingRecipeReceiptId,
                requestedAt: new Date().toISOString(),
                state: "pending" as const,
              },
            },
          }
        : {}),
```

Sem `pendingRecipeReceiptId`, nada muda — o comportamento antigo é preservado para todos os chamadores atuais.

- [ ] **Step 6: Rodar e ver passar**

```bash
cd app && npm test -- src/server/repositories/creative-work.test.ts
```

Esperado: PASS, incluindo os testes antigos de `selectCreativeWorkOutput`.

- [ ] **Step 7: Commit**

```bash
git add app/src/server/db/schema.ts app/drizzle/ app/src/server/repositories/creative-work.ts app/src/server/repositories/creative-work.test.ts
git commit -m "feat: persist a pending recipe receipt inside the selection transaction"
```

**Aceite:** migração aditiva aplicável a dados antigos; recibo gravado atomicamente com a seleção; nenhum chamador existente muda de comportamento.

**Reversão:** a coluna aditiva **permanece** mesmo em rollback de aplicação — versões antigas a ignoram, e apagá-la destruiria pendências reais.

---

## Task 4 (PR-01): Contrato `SelectionEffects` no comando de seleção

**Files:**
- Modify: `app/src/server/application/select-creative-work-output.ts`
- Test: `app/src/server/application/select-creative-work-output.test.ts`

**Interfaces:**
- Consumes: `selectCreativeWorkOutput(…, { confirmObjective?, pendingRecipeReceiptId? })` da Task 3.
- Produces — assinaturas exatas que as Tasks 5 e 6 consomem:

```ts
export type SelectionEffect =
  | { status: "done" }
  | { status: "not_requested" }
  | { status: "pending"; receiptId: string }
  | { status: "failed"; code: string; retryable: boolean };

export type SelectionEffects = {
  library: SelectionEffect;
  valueEvent: SelectionEffect;
  recipe: SelectionEffect;
};

export type SelectCreativeWorkOutputSuccess = {
  output: CreativeWorkOutput;
  recipe?: VisualRecipe;
  effects: SelectionEffects;
};
```

Regra do contrato: **antes** do commit da seleção, erro de validação continua erro (`{ ok: false }`). **Depois** do commit confirmado, o comando retorna `{ ok: true }` com o resultado de cada efeito. Erro ambíguo de commit exige releitura, nunca sucesso inventado. `receiptId` é o id da obrigação persistida — não um UUID criado só para a resposta.

- [ ] **Step 1: Escrever os testes do contrato novo**

Substituir o bloco `describe("efeitos posteriores ao commit da selecao")` da Task 2 por este (os dois `it.fails` viram asserts normais e ganham companhia).

**Todos os casos passam `confirmObjective: true`.** Sem isso, `getCreativeWorkSelectionPolicy` sobre a `quality` da fixture devolve `requiresConfirmation` e o comando sai em `objective_confirmation_required` **antes** de commitar — o teste falharia pelo motivo errado, medindo a pré-validação em vez do efeito.

```ts
  describe("efeitos posteriores ao commit da selecao", () => {
    it("confirma a selecao e marca a receita como pendente quando o efeito falha", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [structuredOutput], sources: [] } as never);
      mockSelect.mockResolvedValue({ ...structuredOutput, isSelected: true } as never);
      mockSaveRecipe.mockResolvedValue({ ok: false, error: { code: "missing_font" } } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveAsRecipe: true,
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          output: { isSelected: true },
          effects: { recipe: { status: "pending" } },
        },
      });
      // O recibo veio da transacao, nao foi inventado na resposta.
      expect(mockSelect).toHaveBeenCalledWith(
        "ws-1",
        "work-1",
        "output-1",
        expect.objectContaining({ pendingRecipeReceiptId: expect.any(String) }),
      );
      const effects = (result as { value: { effects: SelectionEffects } }).value.effects;
      const pending = effects.recipe as { status: "pending"; receiptId: string };
      expect(mockSelect.mock.calls[0][3]).toMatchObject({ pendingRecipeReceiptId: pending.receiptId });
    });

    it("confirma a selecao quando a biblioteca falha e marca o efeito como recuperavel", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [completedOutput], sources: [] } as never);
      mockSelect.mockResolvedValue({ ...completedOutput, isSelected: true } as never);
      mockEnsure.mockRejectedValue(
        Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }),
      );

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveToLibrary: true,
      });

      expect(result).toMatchObject({
        ok: true,
        value: { effects: { library: { status: "failed", retryable: true } } },
      });
    });

    it("isola os efeitos: a falha da biblioteca nao impede o evento de valor nem a receita", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [structuredOutput], sources: [] } as never);
      mockSelect.mockResolvedValue({ ...structuredOutput, isSelected: true } as never);
      mockEnsure.mockRejectedValue(new Error("head timeout"));
      mockSaveRecipe.mockResolvedValue({ ok: true, value: { recipe: { version: 1 } } } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveToLibrary: true,
        saveAsRecipe: true,
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          effects: {
            library: { status: "failed" },
            valueEvent: { status: "done" },
            recipe: { status: "done" },
          },
        },
      });
      expect(mockRecordValue).toHaveBeenCalledTimes(1);
      expect(mockSaveRecipe).toHaveBeenCalledTimes(1);
    });

    it("marca not_requested o que nao foi pedido", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [completedOutput], sources: [] } as never);
      mockSelect.mockResolvedValue({ ...completedOutput, isSelected: true } as never);
      mockEnsure.mockResolvedValue({ asset: { id: "asset-1" }, created: true } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveToLibrary: false,
      });

      expect(result).toMatchObject({
        ok: true,
        value: { effects: { library: { status: "not_requested" }, recipe: { status: "not_requested" } } },
      });
      expect(mockEnsure).not.toHaveBeenCalled();
    });

    it("mantem erro de validacao ANTES do commit como erro do comando", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [completedOutput], sources: [] } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveAsRecipe: true,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "visual_recipe_not_structured", reason: "raster_only" },
      });
      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockSaveRecipe).not.toHaveBeenCalled();
    });

    it("retoma somente o efeito pendente numa segunda chamada, sem regerar nem recobrar", async () => {
      mockGet.mockResolvedValue({
        work: workItem,
        outputs: [{
          ...structuredOutput,
          isSelected: true,
          selectionEffects: {
            version: 1,
            recipe: { receiptId: "receipt-1", requestedAt: "2026-09-12T10:00:00.000Z", state: "pending" },
          },
        }],
        sources: [],
      } as never);
      mockSelect.mockResolvedValue({ ...structuredOutput, isSelected: true } as never);
      mockSaveRecipe.mockResolvedValue({ ok: true, value: { recipe: { version: 1 } } } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveAsRecipe: true,
      });

      expect(result).toMatchObject({ ok: true, value: { effects: { recipe: { status: "done" } } } });
      // O recibo existente e reutilizado: a retentativa nao cria outra obrigacao.
      expect(mockSelect).toHaveBeenCalledWith(
        "ws-1",
        "work-1",
        "output-1",
        expect.objectContaining({ pendingRecipeReceiptId: "receipt-1" }),
      );
    });
  });
```

Acrescentar `SelectionEffects` ao import de tipos no topo do arquivo de teste.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd app && npm test -- src/server/application/select-creative-work-output.test.ts
```

Esperado: FAIL — `effects` não existe no retorno.

- [ ] **Step 3: Implementar o contrato**

Em `app/src/server/application/select-creative-work-output.ts`, acrescentar os tipos do bloco **Interfaces** acima (substituindo `SelectCreativeWorkOutputSuccess`) e, antes de `selectCreativeWorkOutputCommand`, este helper local:

```ts
/**
 * Um efeito posterior nunca derruba a selecao ja confirmada. Erro inesperado
 * vira estado tipado; a excecao nao sobe. `retryable` diz se outra chamada do
 * MESMO comando pode resolver — nao promete recuperacao automatica.
 */
async function runEffect(
  run: () => Promise<void>,
  fallbackCode: string,
): Promise<SelectionEffect> {
  try {
    await run();
    return { status: "done" };
  } catch (cause) {
    const code = cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code: unknown }).code)
      : fallbackCode;
    return { status: "failed", code, retryable: true };
  }
}
```

**3a — calcular o recibo antes do commit.** Substituir a chamada a `selectCreativeWorkOutput` (linhas 99-104) por:

```ts
  // Valores ja estreitados pelas validacoes acima (linhas 57 e 73). Capturar
  // em const porque o estreitamento de propriedade nao sobrevive ao closure
  // dos efeitos.
  const outputKey = output.outputKey;
  const briefTheme = existing.work.brief.theme;

  // O recibo identifica a obrigacao persistida. Numa retomada, reutiliza-se o
  // recibo ja gravado — a retentativa salva so o efeito, nunca gera, cobra ou
  // refaz a aprovacao.
  const receiptId = input.saveAsRecipe
    ? output.selectionEffects?.recipe?.receiptId ?? crypto.randomUUID()
    : "";

  const selected = await selectCreativeWorkOutput(
    input.workspaceId,
    input.workItemId,
    input.outputId,
    {
      confirmObjective: input.confirmObjective,
      ...(input.saveAsRecipe ? { pendingRecipeReceiptId: receiptId } : {}),
    }
  );
```

**3b — trocar os efeitos posteriores.** Substituir o trecho das linhas 133-165 (biblioteca, evento de valor, receita e `return`) por:

```ts
  // A selecao esta commitada a partir daqui. Nenhum caminho abaixo pode
  // reclassificar isso como fracasso do comando.
  let library: SelectionEffect = { status: "not_requested" };
  if (saveToLibrary) {
    library = await runEffect(async () => {
      await ensureCreativeWorkOutputInLibrary({
        workspaceId: input.workspaceId,
        outputKey,
        theme: briefTheme,
        creativeLevel: output.creativeLevel,
      });
    }, "library_failed");
  }

  let valueEvent: SelectionEffect = { status: "not_requested" };
  const selectedKey = selected.outputKey;
  if (existing.work.createdByUserId && selectedKey) {
    const context = valueEventFromCreativeWork(existing.work);
    valueEvent = await runEffect(async () => {
      await recordCreativeWorkValueEvent({
        ...context,
        kind: "approved",
        outputId: selected.id,
        outputKey: selectedKey,
      });
    }, "value_event_failed");
  }

  let recipe: VisualRecipe | undefined;
  let recipeEffect: SelectionEffect = { status: "not_requested" };
  if (input.saveAsRecipe) {
    const saved = await saveVisualRecipeFromOutput({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      outputId: input.outputId,
    }).catch(() => ({ ok: false as const, error: { code: "save_recipe_threw" } }));
    if (saved.ok) {
      recipe = saved.value.recipe;
      recipeEffect = { status: "done" };
      // Fechar o recibo e efeito nao fatal: se esta escrita curta falhar, o
      // recibo fica pendente e uma nova chamada o reconcilia.
      await runEffect(
        () => markCreativeWorkSelectionEffectDone(
          input.workspaceId, input.workItemId, input.outputId, receiptId,
        ).then(() => undefined),
        "receipt_close_failed",
      );
    } else {
      // O recibo ja existe no banco (gravado na transacao da selecao): a
      // pendencia tem lastro e pode ser retomada pelo mesmo comando.
      recipeEffect = { status: "pending", receiptId };
    }
  }

  return {
    ok: true,
    value: { output: selected, recipe, effects: { library, valueEvent, recipe: recipeEffect } },
  };
```

**3c — fechar o recibo.** Decisão já resolvida por inventário: as 17 funções que escrevem em `creativeWorkOutputs` são todas de domínio específico (`completeCreativeWorkOutput`, `failCreativeWorkOutput`, `markCreativeWorkOutputFailureCode`, `claimCreativeWorkOutputImageCall`, …) — **nenhuma é patch genérico**. Acrescentar uma nova, seguindo o estilo de `markCreativeWorkOutputFailureCode` (linha 1939), que é o vizinho mais próximo: setter estreito de um campo só, escopado por workspace. Em `app/src/server/repositories/creative-work.ts`:

```ts
/**
 * Marca o recibo do efeito de receita como concluido. Escrita curta, um unico
 * update escopado por workspace; nunca toca em isSelected.
 */
export async function markCreativeWorkSelectionEffectDone(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  receiptId: string,
): Promise<void> {
  await db.update(creativeWorkOutputs).set({
    selectionEffects: {
      version: 1 as const,
      recipe: { receiptId, requestedAt: new Date().toISOString(), state: "done" as const },
    },
    updatedAt: new Date(),
  }).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, outputId),
  ));
}
```

Importar essa função em `select-creative-work-output.ts` junto de `selectCreativeWorkOutput`.

- [ ] **Step 4: Preservar o que não muda**

Conferir por leitura, antes de rodar: a pré-validação de receita estruturada (linhas 85-97), a `getCreativeWorkSelectionPolicy` e o ramo de confirmação de inconclusivos (linhas 77-83), a releitura em caso de `selected == null` (linhas 105-131) e o escopo workspace/marca continuam idênticos. Nenhum deles é efeito posterior.

- [ ] **Step 5: Rodar e ver passar**

```bash
cd app && npm test -- src/server/application/select-creative-work-output.test.ts
cd app && npm run typecheck
```

Esperado: PASS nos dois.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/application/select-creative-work-output.ts app/src/server/application/select-creative-work-output.test.ts app/src/server/repositories/creative-work.ts
git commit -m "feat: report selection effects instead of failing a committed selection"
```

**Aceite:** nenhum caminho conhecido retorna falha global por erro pós-seleção; efeito parcial é observável; qualidade e isolamento preservados.

**Reversão:** correção para frente. Nunca apagar a seleção para compensar falha de biblioteca.

---

## Task 5 (PR-01): Adaptadores HTTP, hook e interface

**Files:**
- Modify: `app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts` (mutação de seleção; `saveAsRecipe` nas linhas 960-973)
- Modify: `app/src/components/creative-work/useComposerOutputActions.ts` (`approveOutput`: `try` em 102-112, `catch` em 113-116)
- Modify: `app/messages/pt-BR.json`, `app/messages/en.json`
- Test: `app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.test.ts`

**Interfaces:**
- Consumes: `SelectCreativeWorkOutputSuccess` com `effects: SelectionEffects` (Task 4).
- Produces: corpo de resposta `{ output, recipe, effects }` em 200. Nenhuma rota nova.

- [ ] **Step 1: Escrever o teste da rota**

Em `route.test.ts`, acrescentar:

```ts
it("devolve 200 com efeitos parciais quando a selecao foi confirmada", async () => {
  selectMock.mockResolvedValue({
    ok: true,
    value: {
      output: { id: "output-1", isSelected: true },
      recipe: undefined,
      effects: {
        library: { status: "failed", code: "library_failed", retryable: true },
        valueEvent: { status: "done" },
        recipe: { status: "pending", receiptId: "receipt-1" },
      },
    },
  });

  const response = await POST(
    new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
      method: "POST",
      body: JSON.stringify({ saveAsRecipe: true }),
    }),
    { params: Promise.resolve({ id: "work-1", outputId: "output-1" }) },
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    output: { isSelected: true },
    effects: { recipe: { status: "pending" } },
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd app && npm test -- "src/app/api/creative-work/[id]/outputs/[outputId]/select/route.test.ts"
```

Esperado: FAIL — a resposta não inclui `effects`.

- [ ] **Step 3: Implementar a rota**

Em `select/route.ts`, trocar a linha 68 por:

```ts
    return NextResponse.json({
      output: result.value.output,
      recipe: result.value.recipe ?? null,
      effects: result.value.effects,
    });
```

O `switch` de erros (linhas 46-66) fica **intocado**: ele agora só trata erros anteriores ao commit.

- [ ] **Step 4: Ajustar o hook**

Em `use-creative-work.ts`, na mutação que faz `POST` em `outputs/${outputId}/select`, trocar o tipo genérico de `postJson`:

```ts
      postJson<{ output: CreativeWorkOutput; recipe: unknown; effects: SelectionEffects }>(
```

Importar `SelectionEffects` de `@/server/application/select-creative-work-output`. As invalidações de `onSuccess` da mesma mutação ficam como estão: a seleção aconteceu, então a biblioteca e as receitas precisam ser revalidadas de qualquer modo.

- [ ] **Step 5: Ajustar o anúncio da interface**

Em `useComposerOutputActions.ts`, trocar o corpo do `try` de `approveOutput` (linhas 102-112) por:

```ts
      const result = await selectOutputMutation.mutateAsync({
        workItemId: workIdRef.current,
        outputId,
        saveToLibrary: false,
        confirmObjective,
        saveAsRecipe,
      });
      // A peca esta selecionada. Um efeito parcial informa, mas nunca reverte
      // visualmente a selecao nem marca approvalErrorOutputId.
      const recipeIncomplete = saveAsRecipe && result.effects.recipe.status !== "done";
      setAnnouncement(
        recipeIncomplete
          ? tResults("approvedRecipePending")
          : saveAsRecipe
            ? tResults("savedAsRecipe")
            : "Proposta aprovada",
      );
      recordCanonicalEvent("creative_work_approved", workIdRef.current, {
        protocol: toolKind === "social_post" ? "variations" : toolKind ?? "variations",
      });
```

O `catch` (linhas 113-116) continua marcando `approvalErrorOutputId` — ele agora só é atingido por erro anterior ao commit ou falha de rede, que são fracassos reais da aprovação.

- [ ] **Step 6: Acrescentar as mensagens**

Em `app/messages/pt-BR.json`, no objeto `dashboard.home.composer.results`, ao lado de `savedAsRecipe`:

```json
"approvedRecipePending": "Peça selecionada. Não foi possível salvar a receita — tente salvar de novo.",
```

Em `app/messages/en.json`, na mesma posição:

```json
"approvedRecipePending": "Piece selected. The recipe could not be saved — try saving it again.",
```

- [ ] **Step 7: Confirmar que não há segunda superfície a manter em paridade**

```bash
cd /Users/jhonatan/Repos/ADScale_2
grep -rn "selectCreativeWorkOutput" app/src/server/assistant/ || echo "sem handler no Assistente"
```

Esperado: nenhum resultado — o adaptador HTTP é a única superfície da seleção. Se aparecer um handler, **parar** e ampliar `app/src/server/application/adapter-parity.test.ts` com o caso da seleção antes de seguir; esse arquivo hoje cobre apenas cinco ações históricas (`save-derivation-reference`, `restyle-campaign`, `regenerate-derivation`, `review-derivation`, `prepare-delivery-package`) e não deve ser tratado como cobertura universal.

- [ ] **Step 8: Rodar e ver passar**

```bash
cd app && npm test -- "src/app/api/creative-work/[id]/outputs/[outputId]/select/route.test.ts"
cd app && npm run typecheck && npm run lint
```

Esperado: PASS nos três.

- [ ] **Step 9: Commit**

```bash
git add app/src/app/api app/src/lib/hooks/use-creative-work.ts app/src/components/creative-work/useComposerOutputActions.ts app/messages
git commit -m "feat: surface partial selection effects without reverting the approval"
```

**Aceite:** a interface mostra "Peça selecionada. Não foi possível salvar a receita" sem reverter visualmente a seleção. Nenhuma superfície nova foi criada.

---

## Task 6 (PR-01): Recuperação concorrente da biblioteca contra a unicidade global

O `key` de `workspace_assets` é único **no banco inteiro** (Descobertas). Duas recuperações concorrentes do mesmo ativo não duplicam linha: a segunda estoura 23505. Repetição sequencial de teste não prova idempotência concorrente.

**Files:**
- Modify: `app/src/server/repositories/workspace-asset.ts`
- Modify: `app/src/server/application/ensure-creative-work-output-library.ts`
- Test: `app/src/server/application/ensure-creative-work-output-library.test.ts`
- Test: `app/tests/integration/creative-work-preparation-concurrency.test.ts` (criar aqui; a Task 8 o amplia)

**Interfaces:**
- Consumes: `getWorkspaceAssetByKey(workspaceId, key)` existente.
- Produces:
  - `createWorkspaceAssetIfKeyAbsent(data: CreateWorkspaceAssetInput): Promise<WorkspaceAsset | null>` — `null` quando a chave já existe.
  - `ensureCreativeWorkOutputInLibrary` passa a retornar `{ asset, created } | { asset: null; created: false; conflict: "key_owned_elsewhere" }`. A Task 4 já trata exceção; esta tarefa evita que a exceção aconteça no caso normal.

- [ ] **Step 1: Escrever o teste de integração concorrente**

Criar `app/tests/integration/creative-work-preparation-concurrency.test.ts` seguindo o cabeçalho e a convenção de `app/tests/integration/creative-work-recovery.test.ts:1-40` (pular sem `TEST_DATABASE_URL`/`DATABASE_URL`; falhar de verdade no `beforeAll` quando configurado e inacessível).

**A variável que conecta é `DATABASE_URL`, não `TEST_DATABASE_URL`.** O guard de skip aceita qualquer uma das duas, mas o cliente em `app/src/server/db/index.ts:8` lê `env.DATABASE_URL`, e `app/tests/setup.ts` não mapeia uma na outra. Rodar com `TEST_DATABASE_URL` apenas desarma o skip e depois falha no `beforeAll` com "Postgres de teste INACESSÍVEL (DATABASE_URL=(não definida))" — verificado em 12/09/2026. Todo comando de integração deste plano usa `DATABASE_URL=`.

```ts
it("duas recuperacoes concorrentes do mesmo ativo produzem uma linha e nenhum erro", async () => {
  const outputKey = `creative-work/${crypto.randomUUID()}/out.png`;

  const [first, second] = await Promise.all([
    ensureCreativeWorkOutputInLibrary({
      workspaceId,
      outputKey,
      theme: "Tema",
      creativeLevel: "balanced",
    }),
    ensureCreativeWorkOutputInLibrary({
      workspaceId,
      outputKey,
      theme: "Tema",
      creativeLevel: "balanced",
    }),
  ]);

  const rows = await db
    .select()
    .from(workspaceAssets)
    .where(eq(workspaceAssets.key, outputKey));

  expect(rows).toHaveLength(1);
  expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
  expect(first.asset?.id).toBe(rows[0].id);
  expect(second.asset?.id).toBe(rows[0].id);
});
```

Mockar `@/server/storage` para que `objectStorage.head` devolva `{ contentLength: 1024 }` sem tocar em R2. Semear workspace/usuário/perfil pelo mesmo caminho de `creative-work-recovery.test.ts`.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd app && npm run test:db:setup
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-preparation-concurrency.test.ts
```

Esperado: FAIL com violação de unicidade em `workspace_assets_key_unique` numa das duas chamadas.

- [ ] **Step 3: Implementar o insert tolerante a conflito**

Em `app/src/server/repositories/workspace-asset.ts`, acrescentar **abaixo** de `createWorkspaceAsset` (sem alterá-la — ela tem outros chamadores):

```ts
/**
 * Insert idempotente por `key`. A constraint workspace_assets_key_unique e
 * GLOBAL, entao duas recuperacoes concorrentes do mesmo output disputam a
 * mesma chave: a perdedora recebe null em vez de estourar 23505.
 */
export async function createWorkspaceAssetIfKeyAbsent(
  data: CreateWorkspaceAssetInput,
): Promise<Awaited<ReturnType<typeof createWorkspaceAsset>> | null> {
  const result = await db
    .insert(workspaceAssets)
    .values({
      workspaceId: data.workspaceId,
      name: data.name,
      key: data.key,
      type: data.type,
      size: data.size,
      width: data.width ?? null,
      height: data.height ?? null,
      source: data.source ?? "upload",
      ...(data.metadata !== undefined && { metadata: data.metadata }),
    })
    .onConflictDoNothing({ target: workspaceAssets.key })
    .returning();
  return result[0] ?? null;
}
```

- [ ] **Step 4: Implementar o ensure**

Em `ensure-creative-work-output-library.ts`, trocar o tipo de resultado e o corpo a partir da linha 19:

```ts
export type EnsureCreativeWorkOutputLibraryResult =
  | { asset: Awaited<ReturnType<typeof createWorkspaceAsset>>; created: boolean; conflict?: undefined }
  | { asset: null; created: false; conflict: "key_owned_elsewhere" };

export async function ensureCreativeWorkOutputInLibrary(
  input: EnsureCreativeWorkOutputLibraryInput
): Promise<EnsureCreativeWorkOutputLibraryResult> {
  const existing = await getWorkspaceAssetByKey(input.workspaceId, input.outputKey);
  if (existing) return { asset: existing, created: false };

  const head = await objectStorage.head(input.outputKey);
  const size = Number(head?.contentLength ?? 0);
  const asset = await createWorkspaceAssetIfKeyAbsent({
    workspaceId: input.workspaceId,
    name: `Post ${input.theme} - ${input.creativeLevel}`,
    key: input.outputKey,
    type: "image/png",
    size,
    source: "creative_work",
  });
  if (asset) return { asset, created: true };

  // Perdeu a corrida: relemos com escopo de workspace. Se a chave existe mas
  // pertence a outro workspace, NAO devolvemos o ativo alheio — isolamento
  // vale mais do que completar o efeito.
  const winner = await getWorkspaceAssetByKey(input.workspaceId, input.outputKey);
  return winner
    ? { asset: winner, created: false }
    : { asset: null, created: false, conflict: "key_owned_elsewhere" };
}
```

Atualizar o import para incluir `createWorkspaceAssetIfKeyAbsent`.

- [ ] **Step 5: Tratar o conflito no comando**

Em `select-creative-work-output.ts`, dentro do `runEffect` da biblioteca (Task 4), converter o conflito em efeito falho em vez de silêncio:

```ts
    library = await runEffect(async () => {
      const registered = await ensureCreativeWorkOutputInLibrary({
        workspaceId: input.workspaceId,
        outputKey: output.outputKey!,
        theme: existing.work.brief!.theme,
        creativeLevel: output.creativeLevel,
      });
      if (registered.conflict) {
        throw Object.assign(new Error("library_key_owned_elsewhere"), {
          code: "library_key_owned_elsewhere",
        });
      }
    }, "library_failed");
```

- [ ] **Step 6: Rodar e ver passar**

```bash
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-preparation-concurrency.test.ts
cd app && npm test -- src/server/application/ensure-creative-work-output-library.test.ts src/server/application/select-creative-work-output.test.ts
```

Esperado: PASS nos dois. Ajustar o teste unitário existente de `ensure-creative-work-output-library` ao novo tipo de retorno, mantendo os casos que ele já cobria.

- [ ] **Step 7: Rodar a suíte e o build**

```bash
cd app && npm run lint && npm run typecheck && npm test && npm run build
cd app && npm run convergence:test && npm run convergence:gate
```

- [ ] **Step 8: Commit**

```bash
git add app/src/server/repositories/workspace-asset.ts app/src/server/application app/tests/integration/creative-work-preparation-concurrency.test.ts
git commit -m "fix: make library recovery safe against the global asset key constraint"
```

**Aceite (fecha PR-01):** seleção confirmada nunca é reclassificada por falha posterior; efeito pendente tem lastro durável; duas recuperações concorrentes do mesmo ativo produzem uma linha lógica, resultado consistente e nenhuma mudança de cobrança; reload e releitura após perda da resposta mostram a seleção verdadeira.

---

## Task 7 (PR-02): Inventário classificado dos chamadores do lock

O inventário parcial das Descobertas é ponto de partida, não resultado. O que falta é rastrear chamadas externas **transitivas** — é isso que decide o escopo da Task 15 e da Task 16.

**Files:**
- Create: `docs/operations/2026-09-12-preparation-lock-inventory.md`

**Interfaces:**
- Consumes: SHA de execução da Task 1.
- Produces: tabela definitiva `chamador → classificação` usada pelas Tasks 13, 15 e 16 para decidir quem migra e quem conserva a transação curta.

- [ ] **Step 1: Reconfirmar os chamadores diretos no SHA de execução**

```bash
cd /Users/jhonatan/Repos/ADScale_2
BASE_SHA=$(git rev-parse origin/main)
git grep -n 'withCreativeWorkPreparationLock' "$BASE_SHA" -- app/src
```

- [ ] **Step 2: Rastrear chamadas externas transitivas**

Para cada chamador, seguir as funções invocadas dentro do callback e classificar. Focar nas três não resolvidas: `createIdentitySnapshot` (`app/src/server/creative-work/identity.ts`), `buildCarouselVisualContract` e `getCreativeWorkSourceAssetDetails`.

```bash
BASE_SHA=$(git rev-parse origin/main)
git grep -n -E 'fetch\(|openai|OpenAI|requestPlannerResponse|generateSocialPostCopy|reviewInferredBriefingOnce|objectStorage\.' "$BASE_SHA" -- app/src/server/creative-work app/src/server/application
```

Uma chamada a `objectStorage` também é externa: ela sai do processo e pode pendurar a transação como o modelo faz.

- [ ] **Step 3: Escrever o inventário**

Tabela com colunas: chamador, arquivo:linha, chamada externa direta, chamada externa transitiva (qual função, qual arquivo:linha), escrita curta, reserva, decisão (migra para tentativa / conserva transação curta). **Um caller sem I/O externo pode conservar sua transação curta — o inventário decide o escopo, não o nome do arquivo.** Não transformar todo usuário do lock em job.

Registrar explicitamente no documento: SHA consultado, comandos usados e que zero resultados de grep não prova ausência de import dinâmico.

- [ ] **Step 4: Commit**

```bash
git add docs/operations/2026-09-12-preparation-lock-inventory.md
git commit -m "docs: classify every preparation-lock caller by external I/O"
```

**Aceite:** cada um dos nove chamadores tem classificação justificada por leitura, com arquivo e linha.

---

## Task 8 (PR-02): Caracterização concorrente contra Postgres real

**Files:**
- Modify: `app/tests/integration/creative-work-preparation-concurrency.test.ts` (criado na Task 6)

**Interfaces:**
- Consumes: inventário da Task 7.
- Produces: baseline reproduzível e invariantes testáveis que as Tasks 15-17 precisam preservar. **Não remover testes existentes para aceitar o comportamento novo.**

- [ ] **Step 1: Escrever o provedor controlado suspenso por promessa**

No topo do arquivo de teste, antes dos imports de produção:

```ts
/**
 * Provedor controlado suspenso: separa tempo de IA de tempo de banco. Sem ele
 * a medicao mistura as duas coisas e nenhuma conclusao sobre a transacao e
 * possivel.
 */
function suspendedProvider() {
  const calls: Array<{ release: () => void; started: number }> = [];
  let pending: Array<(value: unknown) => void> = [];
  return {
    calls,
    /** Resolve a proxima chamada suspensa. */
    release() {
      const next = pending.shift();
      if (!next) throw new Error("nenhuma chamada suspensa para liberar");
      next(undefined);
    },
    hook: () =>
      new Promise((resolve) => {
        pending.push(resolve);
        calls.push({ release: () => resolve(undefined), started: Date.now() });
      }),
  };
}
```

- [ ] **Step 2: Escrever os quatro cenários de caracterização**

```ts
it("caracteriza: duas preparacoes iguais do mesmo Trabalho", async () => {
  // Enquanto a primeira chamada do modelo esta suspensa, a segunda requisicao
  // e disparada. Registrar o comportamento OBSERVADO hoje, sem julga-lo.
});

it("caracteriza: edicao de fonte durante preparacao suspensa", async () => {
  // A edicao NAO deve esperar a resposta do modelo. Hoje ela espera — o teste
  // grava esse fato com o tempo medido.
});

it("caracteriza: reserva de geracao concorrente com preparacao em curso", async () => {
  // reserveCreativeWorkGenerationOutputs usa o mesmo lock.
});

it("caracteriza: alteracao editorial do carrossel durante planCarouselWork suspenso", async () => {
  // proposeCarouselDraft e chamada externa direta dentro da transacao.
});
```

Cada cenário mede e registra, via `console.info` estruturado capturado pelo teste: espera por pool/lock, tempo dentro da transação, tempo do modelo, duração total, invalidação por revisão e resultado observado. Incluir chamadas duplicadas para o **mesmo** Trabalho e chamadas de Trabalhos **diferentes** — a spec registra, por inferência da ordem `db.transaction → pg_advisory_xact_lock`, que requisições já admitidas na transação podem esperar o mesmo lock ocupando conexões; este é o teste que transforma essa inferência em fato medido.

- [ ] **Step 3: Rodar e registrar**

```bash
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-preparation-concurrency.test.ts
```

Esperado: PASS, com as medições impressas. Os testes caracterizam; não afirmam que o comportamento é correto.

- [ ] **Step 4: Commit**

```bash
git add app/tests/integration/creative-work-preparation-concurrency.test.ts
git commit -m "test: characterize preparation concurrency against real Postgres"
```

---

## Task 9 (PR-02): Telemetria mínima e documento de baseline

**Files:**
- Modify: `app/src/server/creative-work/job-telemetry.ts`
- Modify: `docs/operations/reliability-metrics.md` — **criado pela Task 18**, que já preencheu a seção "Settlement: oito laços". Acrescentar as seções desta tarefa **sem reescrever** a existente.

**Interfaces:**
- Consumes: medições da Task 8.
- Produces:

```ts
export function logCreativeWorkPreparationAttempt(fields: {
  releaseSha: string;
  environment: string;
  process: "web" | "worker";
  workspaceId: string;
  workItemId: string;
  attemptId: string | null;
  kind: string;
  phase: "claim" | "external" | "finalize" | "invalidated" | "expired";
  lockWaitMs: number;
  inTransactionMs: number;
  externalMs: number | null;
  totalMs: number;
}): void;

export function logCreativeWorkSelectionEffect(fields: {
  releaseSha: string;
  workspaceId: string;
  workItemId: string;
  outputId: string;
  effect: "library" | "valueEvent" | "recipe";
  status: "done" | "not_requested" | "pending" | "failed";
  attempt: number;
  code: string | null;
}): void;
```

`attemptId` é `null` antes da Task 12 existir. Prompts, chaves, conteúdo de cliente e URLs assinadas ficam fora. Identificadores de alta cardinalidade (`workspaceId`, `workItemId`, `attemptId`) vão em log/trace, **nunca** em label irrestrito de métrica.

- [ ] **Step 1: Escrever o teste das duas funções**

Em `app/src/server/creative-work/job-telemetry.test.ts` (criar se não existir, seguindo o padrão dos testes vizinhos de `app/src/server/creative-work/`):

```ts
it("nao emite prompt, chave, conteudo de cliente nem URL assinada", () => {
  const spy = vi.spyOn(console, "info").mockImplementation(() => {});
  logCreativeWorkPreparationAttempt({
    releaseSha: "abc1234",
    environment: "test",
    process: "web",
    workspaceId: "ws-1",
    workItemId: "work-1",
    attemptId: null,
    kind: "creative_prepare",
    phase: "claim",
    lockWaitMs: 3,
    inTransactionMs: 12,
    externalMs: null,
    totalMs: 15,
  });
  const payload = JSON.stringify(spy.mock.calls);
  expect(payload).not.toMatch(/X-Amz-Signature|Bearer |sk-|prompt/i);
  spy.mockRestore();
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd app && npm test -- src/server/creative-work/job-telemetry.test.ts
```

Esperado: FAIL — as funções não existem.

- [ ] **Step 3: Implementar**

Acrescentar as duas funções em `job-telemetry.ts` seguindo exatamente o formato de log estruturado já usado por `logCreativeWorkOutputStage` (linha 226) e `logCreativeWorkRetry` (linha 310) — mesmo shape de evento, mesmo canal, mesma disciplina de campos.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd app && npm test -- src/server/creative-work/job-telemetry.test.ts
```

- [ ] **Step 5: Escrever o documento de baseline**

`docs/operations/reliability-metrics.md` registra, por SHA:

- Espera por preparação; tempo até primeira peça; erro por etapa; efeitos posteriores falhos/pendentes; consultas por replay; custo operacional por versão única selecionada/entregue.
- Replay de settlement: número de tentativas, queries, outputs e tempo total. A projeção completa do agregado pode representar várias queries — medir, não estimar.
- Intervalo, `n`, percentis, SHA e flags de cada amostra. Tráfego real e de teste em seções separadas.
- **Sem amostra, escrever "não medido" — nunca zero.**
- Sessões do Estúdio e outputs são denominadores diferentes e não devem ser misturados.
- Registrar explicitamente: 80 × 25 ms é soma nominal de pausas, não duração máxima. Consultas, espera por conexão, escrita e eventual reenvio são adicionais, e as consultas de reembolso dependem do número de outputs. **Não publicar "400 queries no máximo"** sem medir o caminho e o tamanho do lote.
- Registrar o prazo de lease proposto para a Task 12: `lease = clamp(2 × p99(externalMs) medido aqui, 60s, 300s)`. Não copiar os 90 s do editor de camadas.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/creative-work/job-telemetry.ts app/src/server/creative-work/job-telemetry.test.ts docs/operations/reliability-metrics.md
git commit -m "feat: add preparation and selection-effect telemetry with a measured baseline"
```

**Aceite (fecha PR-02):** reproduções determinísticas e baseline por SHA. A ausência de volume real não bloqueia correções de contrato, mas **proíbe prometer ganho percentual**.

**Reversão:** retirar apenas instrumentação que causar overhead; preservar testes. Não aumentar pool indiscriminadamente como substituto da correção.

---

## Task 10 (PR-03): Regras puras da tentativa de preparação

**Files:**
- Create: `app/src/server/creative-work/preparation-attempt.ts`
- Test: `app/src/server/creative-work/preparation-attempt.test.ts`

**Interfaces:**
- Consumes: nada externo. Módulo puro, sem banco.
- Produces — assinaturas exatas consumidas pelas Tasks 11, 12, 13, 15, 16 e 17:

```ts
export type PreparationKind = "creative_prepare" | "carousel_plan" | "carousel_prepare";

export type PreparationAttemptState = "running" | "completed" | "failed" | "invalidated";

export type PreparationAttempt = {
  id: string;
  workspaceId: string;
  workItemId: string;
  kind: PreparationKind;
  /** Revisao do conteudo — o contrato atual de `updatedAt` em ISO. */
  inputRevision: string;
  /** Hash canonico das entradas efetivamente usadas pela chamada externa. */
  inputFingerprint: string;
  state: PreparationAttemptState;
  leaseExpiresAt: string;
};

export function preparationInputFingerprint(input: unknown): string;

export function isAttemptUsable(
  attempt: Pick<PreparationAttempt, "state" | "leaseExpiresAt">,
  now: Date,
): boolean;

export function canFinalizeAttempt(input: {
  attempt: Pick<PreparationAttempt, "id" | "state" | "inputRevision" | "inputFingerprint" | "leaseExpiresAt">;
  finalizingAttemptId: string;
  currentRevision: string;
  currentFingerprint: string;
  now: Date;
}): { ok: true } | { ok: false; reason: "not_owner" | "not_running" | "revision_changed" | "fingerprint_changed" | "lease_expired" };
```

`inputRevision` preserva o contrato atual de revisão (`creativeWorkItems.updatedAt` truncado a milissegundos, como já faz `updateCreativeWorkDraftIfUnchanged` em `creative-work.ts:766`). `inputFingerprint` representa as entradas canônicas efetivamente usadas. **Reserva e heartbeat operacionais não podem invalidar a própria tentativa por alterarem inadvertidamente a revisão de conteúdo** — por isso a renovação de lease (Task 12) escreve apenas `lease_expires_at` e nunca toca em `creative_work_items.updated_at`.

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, expect, it } from "vitest";
import {
  canFinalizeAttempt,
  isAttemptUsable,
  preparationInputFingerprint,
} from "./preparation-attempt";

const now = new Date("2026-09-12T12:00:00.000Z");

describe("preparationInputFingerprint", () => {
  it("e estavel sob reordenacao de chaves", () => {
    expect(preparationInputFingerprint({ a: 1, b: [2, 3] }))
      .toBe(preparationInputFingerprint({ b: [2, 3], a: 1 }));
  });

  it("muda quando uma entrada muda", () => {
    expect(preparationInputFingerprint({ a: 1 }))
      .not.toBe(preparationInputFingerprint({ a: 2 }));
  });
});

describe("isAttemptUsable", () => {
  it("aceita running com lease no futuro", () => {
    expect(isAttemptUsable(
      { state: "running", leaseExpiresAt: "2026-09-12T12:00:30.000Z" },
      now,
    )).toBe(true);
  });

  it("recusa running com lease expirado", () => {
    expect(isAttemptUsable(
      { state: "running", leaseExpiresAt: "2026-09-12T11:59:59.000Z" },
      now,
    )).toBe(false);
  });

  it("recusa qualquer estado terminal", () => {
    for (const state of ["completed", "failed", "invalidated"] as const) {
      expect(isAttemptUsable(
        { state, leaseExpiresAt: "2026-09-12T12:00:30.000Z" },
        now,
      )).toBe(false);
    }
  });
});

describe("canFinalizeAttempt", () => {
  const base = {
    id: "attempt-1",
    state: "running" as const,
    inputRevision: "2026-09-12T11:59:00.000Z",
    inputFingerprint: "fp-1",
    leaseExpiresAt: "2026-09-12T12:00:30.000Z",
  };

  it("aceita o dono com revisao e fingerprint intactos", () => {
    expect(canFinalizeAttempt({
      attempt: base,
      finalizingAttemptId: "attempt-1",
      currentRevision: "2026-09-12T11:59:00.000Z",
      currentFingerprint: "fp-1",
      now,
    })).toEqual({ ok: true });
  });

  it("recusa uma tentativa antiga que tenta substituir a nova", () => {
    expect(canFinalizeAttempt({
      attempt: base,
      finalizingAttemptId: "attempt-0",
      currentRevision: "2026-09-12T11:59:00.000Z",
      currentFingerprint: "fp-1",
      now,
    })).toEqual({ ok: false, reason: "not_owner" });
  });

  it("recusa quando a revisao mudou durante a chamada externa", () => {
    expect(canFinalizeAttempt({
      attempt: base,
      finalizingAttemptId: "attempt-1",
      currentRevision: "2026-09-12T11:59:30.000Z",
      currentFingerprint: "fp-1",
      now,
    })).toEqual({ ok: false, reason: "revision_changed" });
  });

  it("recusa quando o fingerprint mudou", () => {
    expect(canFinalizeAttempt({
      attempt: base,
      finalizingAttemptId: "attempt-1",
      currentRevision: "2026-09-12T11:59:00.000Z",
      currentFingerprint: "fp-2",
      now,
    })).toEqual({ ok: false, reason: "fingerprint_changed" });
  });

  it("recusa conclusao tardia apos o lease expirar", () => {
    expect(canFinalizeAttempt({
      attempt: { ...base, leaseExpiresAt: "2026-09-12T11:59:59.000Z" },
      finalizingAttemptId: "attempt-1",
      currentRevision: "2026-09-12T11:59:00.000Z",
      currentFingerprint: "fp-1",
      now,
    })).toEqual({ ok: false, reason: "lease_expired" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd app && npm test -- src/server/creative-work/preparation-attempt.test.ts
```

Esperado: FAIL com "Cannot find module './preparation-attempt'".

- [ ] **Step 3: Implementar**

```ts
import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "./canonical-json";

export type PreparationKind = "creative_prepare" | "carousel_plan" | "carousel_prepare";
export type PreparationAttemptState = "running" | "completed" | "failed" | "invalidated";

export type PreparationAttempt = {
  id: string;
  workspaceId: string;
  workItemId: string;
  kind: PreparationKind;
  inputRevision: string;
  inputFingerprint: string;
  state: PreparationAttemptState;
  leaseExpiresAt: string;
};

export function preparationInputFingerprint(input: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(input)).digest("hex");
}

export function isAttemptUsable(
  attempt: Pick<PreparationAttempt, "state" | "leaseExpiresAt">,
  now: Date,
): boolean {
  return attempt.state === "running" && new Date(attempt.leaseExpiresAt).getTime() > now.getTime();
}

export function canFinalizeAttempt(input: {
  attempt: Pick<PreparationAttempt, "id" | "state" | "inputRevision" | "inputFingerprint" | "leaseExpiresAt">;
  finalizingAttemptId: string;
  currentRevision: string;
  currentFingerprint: string;
  now: Date;
}): { ok: true } | { ok: false; reason: "not_owner" | "not_running" | "revision_changed" | "fingerprint_changed" | "lease_expired" } {
  const { attempt } = input;
  if (attempt.id !== input.finalizingAttemptId) return { ok: false, reason: "not_owner" };
  if (attempt.state !== "running") return { ok: false, reason: "not_running" };
  if (new Date(attempt.leaseExpiresAt).getTime() <= input.now.getTime()) {
    return { ok: false, reason: "lease_expired" };
  }
  if (attempt.inputRevision !== input.currentRevision) return { ok: false, reason: "revision_changed" };
  if (attempt.inputFingerprint !== input.currentFingerprint) return { ok: false, reason: "fingerprint_changed" };
  return { ok: true };
}
```

Localizar o `canonicalJsonStringify` já usado por `prepare-creative-work.ts` antes de escrever o import:

```bash
cd /Users/jhonatan/Repos/ADScale_2 && grep -rn "canonicalJsonStringify" app/src/server/application/prepare-creative-work.ts app/src/server/creative-work/ | head -3
```

Usar o módulo existente — **não** criar outro serializador canônico.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd app && npm test -- src/server/creative-work/preparation-attempt.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/src/server/creative-work/preparation-attempt.ts app/src/server/creative-work/preparation-attempt.test.ts
git commit -m "feat: add pure preparation-attempt rules"
```

---

## Task 11 (PR-03): Tabela aditiva de tentativas

**Files:**
- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0096_creative_work_preparation_attempts.sql`

**Interfaces:**
- Consumes: tipos da Task 10.
- Produces: `creativeWorkPreparationAttempts` e os tipos `CreativeWorkPreparationAttempt` / `NewCreativeWorkPreparationAttempt`, consumidos pela Task 12.

A exclusão mútua é do **banco**, não da aplicação: um índice único parcial garante no máximo uma tentativa `running` por Trabalho. Persistir a tentativa vigente por Trabalho, **não** singleton em memória.

- [ ] **Step 1: Declarar a tabela**

Em `app/src/server/db/schema.ts`, depois de `creativeWorkCarouselSlides`:

```ts
/**
 * Tentativa vigente de preparacao. Existe para que a chamada externa aconteca
 * FORA da transacao sem reabrir corridas: o dono e unico por Trabalho (indice
 * unico parcial), a revisao e o fingerprint congelam a entrada, e o lease
 * impede que uma execucao morta bloqueie o Trabalho para sempre.
 */
export const creativeWorkPreparationAttempts = adscaleSchema.table(
  "creative_work_preparation_attempts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => creativeWorkItems.id, { onDelete: "cascade" }),
    kind: text("kind")
      .notNull()
      .$type<import("../creative-work/preparation-attempt").PreparationKind>(),
    inputRevision: text("input_revision").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    state: text("state")
      .notNull()
      .default("running")
      .$type<import("../creative-work/preparation-attempt").PreparationAttemptState>(),
    leaseExpiresAt: timestamp("lease_expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    // A exclusao mutua e do banco: no maximo uma tentativa viva por Trabalho.
    uniqueIndex("creative_work_preparation_attempts_active_uq")
      .on(table.workItemId)
      .where(sql`${table.state} = 'running'`),
    index("creative_work_preparation_attempts_scope_idx").on(
      table.workspaceId,
      table.workItemId,
      table.updatedAt,
    ),
    check(
      "creative_work_preparation_attempts_state_check",
      sql`${table.state} in ('running','completed','failed','invalidated')`
    ),
    check(
      "creative_work_preparation_attempts_kind_check",
      sql`${table.kind} in ('creative_prepare','carousel_plan','carousel_prepare')`
    ),
  ]
);

export type CreativeWorkPreparationAttempt = typeof creativeWorkPreparationAttempts.$inferSelect;
export type NewCreativeWorkPreparationAttempt = typeof creativeWorkPreparationAttempts.$inferInsert;
```

- [ ] **Step 2: Escrever e conferir a migração**

> **Convenção de migração deste repo — `npm run db:generate` NÃO funciona aqui.**
> A cadeia de snapshots do drizzle-kit para em `drizzle/meta/0037_snapshot.json`, mas existem 99 migrações. O gerador diffa contra o snapshot 0037, enxerga ~40 tabelas "novas" e cai num prompt interativo de renomeação (`promptNamedWithSchemasConflict`), que estoura em execução não interativa. Desde a `0038` as migrações são **escritas à mão**, com `IF NOT EXISTS`, `--> statement-breakpoint` entre statements, e a entrada do journal acrescentada manualmente (`idx` sequencial, `version: "7"`, `tag` igual ao nome do arquivo sem `.sql`). Verificado em 12/09/2026. Siga `drizzle/0094_commercial_offers.sql` como modelo de estilo.

Criar `app/drizzle/0096_creative_work_preparation_attempts.sql` à mão: um `CREATE TABLE IF NOT EXISTS`, duas FKs, dois `ADD CONSTRAINT … CHECK`, o `CREATE UNIQUE INDEX IF NOT EXISTS … WHERE "state" = 'running'` e um `CREATE INDEX IF NOT EXISTS` de escopo. Nenhum `DROP`, nenhuma alteração em tabela existente.

Acrescentar a entrada no journal no **mesmo commit** do arquivo — journal e arquivo fora de sincronia quebram a migração em produção de um jeito que passa despercebido em teste local.

- [ ] **Step 3: Aplicar no banco de teste e provar o índice parcial**

```bash
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm run db:migrate
psql postgres://test:test@localhost:5433/adscale_test -c "\d adscale_app.creative_work_preparation_attempts"
```

Esperado: o índice `creative_work_preparation_attempts_active_uq` aparece como `UNIQUE, btree (work_item_id) WHERE state = 'running'::text`. Se o predicado não aparecer, o índice não protege nada — corrigir antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add app/src/server/db/schema.ts app/drizzle/
git commit -m "feat: add the preparation-attempt table with a partial unique owner index"
```

**Reversão:** o schema aditivo **permanece**. Não reverter para binário que ignora tentativas ativas.

---

## Task 12 (PR-03): Repositório de reserva, renovação, invalidação e finalização

**Files:**
- Create: `app/src/server/repositories/creative-work-preparation.ts`
- Test: `app/src/server/repositories/creative-work-preparation.test.ts`

**Interfaces:**
- Consumes: Task 10 (regras puras) e Task 11 (tabela).
- Produces — assinaturas exatas consumidas pelas Tasks 13, 15, 16 e 17:

```ts
export type ClaimPreparationAttemptResult =
  | { outcome: "claimed"; attempt: CreativeWorkPreparationAttempt }
  | { outcome: "joined"; attempt: CreativeWorkPreparationAttempt }
  | { outcome: "revision_changed" };

export async function claimPreparationAttempt(input: {
  workspaceId: string;
  workItemId: string;
  kind: PreparationKind;
  inputRevision: string;
  inputFingerprint: string;
  leaseSeconds: number;
}): Promise<ClaimPreparationAttemptResult>;

export async function renewPreparationAttempt(input: {
  workspaceId: string;
  attemptId: string;
  leaseSeconds: number;
}): Promise<boolean>;

export async function invalidatePreparationAttempts(input: {
  workspaceId: string;
  workItemId: string;
  executor?: Pick<typeof db, "update">;
}): Promise<number>;

export async function finalizePreparationAttempt(input: {
  workspaceId: string;
  workItemId: string;
  attemptId: string;
  currentRevision: string;
  currentFingerprint: string;
  state: "completed" | "failed";
}): Promise<{ ok: true } | { ok: false; reason: "not_owner" | "not_running" | "revision_changed" | "fingerprint_changed" | "lease_expired" }>;

export async function getActivePreparationAttempt(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<CreativeWorkPreparationAttempt | null>;
```

Todas usam **transação curta** com CAS e **relógio do banco** (`now()`), nunca o relógio do processo. Nenhuma delas mantém transação aberta esperando I/O externo.

- [ ] **Step 1: Escrever os testes concorrentes contra Postgres real**

Criar `app/src/server/repositories/creative-work-preparation.test.ts` com o mesmo cabeçalho/convenção de `app/tests/integration/creative-work-recovery.test.ts` (pular sem `TEST_DATABASE_URL`/`DATABASE_URL`, falhar de verdade quando configurado e inacessível):

```ts
it("claim concorrente admite exatamente um dono", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      claimPreparationAttempt({
        workspaceId, workItemId, kind: "creative_prepare",
        inputRevision, inputFingerprint: "fp-1", leaseSeconds: 60,
      }),
    ),
  );
  expect(results.filter((r) => r.outcome === "claimed")).toHaveLength(1);
  expect(results.filter((r) => r.outcome === "joined")).toHaveLength(7);
  const ids = new Set(results.flatMap((r) => (r.outcome === "revision_changed" ? [] : [r.attempt.id])));
  expect(ids.size).toBe(1);
});

it("requisicao equivalente recebe a MESMA tentativa enquanto ela e valida", async () => {
  const first = await claimPreparationAttempt({ workspaceId, workItemId, kind: "creative_prepare", inputRevision, inputFingerprint: "fp-1", leaseSeconds: 60 });
  const second = await claimPreparationAttempt({ workspaceId, workItemId, kind: "creative_prepare", inputRevision, inputFingerprint: "fp-1", leaseSeconds: 60 });
  expect(first.outcome).toBe("claimed");
  expect(second).toMatchObject({ outcome: "joined" });
  expect((second as { attempt: { id: string } }).attempt.id).toBe((first as { attempt: { id: string } }).attempt.id);
});

it("revisao diferente invalida a tentativa incompativel e reclama", async () => { /* claim fp-1, depois claim com inputRevision novo -> claimed, e a antiga vira invalidated */ });

it("tentativa expirada nao bloqueia: o proximo claim assume", async () => { /* leaseSeconds: 1, aguardar expiracao via relogio do banco, reclamar */ });

it("renovacao estende o lease sem tocar em creative_work_items.updated_at", async () => {
  const before = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, workItemId));
  await renewPreparationAttempt({ workspaceId, attemptId, leaseSeconds: 120 });
  const after = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, workItemId));
  expect(after[0].updatedAt.getTime()).toBe(before[0].updatedAt.getTime());
});

it("conclusao tardia de tentativa antiga NAO substitui a nova", async () => {
  // claim A -> invalidar por edicao -> claim B -> finalize(A) recusa com reason
  const result = await finalizePreparationAttempt({
    workspaceId, workItemId, attemptId: attemptA.id,
    currentRevision: revisionB, currentFingerprint: "fp-2", state: "completed",
  });
  expect(result).toMatchObject({ ok: false });
});

it("dois workspaces com Trabalhos distintos nao interferem", async () => { /* isolamento */ });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/repositories/creative-work-preparation.test.ts
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

O `claim` roda numa transação curta e faz, nesta ordem: (1) expirar tentativas `running` com `lease_expires_at <= now()` marcando `invalidated`; (2) expirar tentativas cujo `input_revision` difere do recebido; (3) ler a tentativa `running` restante; (4) se existir e `isAttemptUsable`, devolver `joined`; (5) senão, inserir com `onConflictDoNothing` no índice parcial e, em conflito, reler e devolver `joined`. O lease é calculado **no banco**: `sql\`now() + make_interval(secs => ${input.leaseSeconds})\``.

`finalizePreparationAttempt` relê a tentativa e o Trabalho na mesma transação curta, aplica `canFinalizeAttempt` da Task 10 e só então grava o estado terminal. **Resultado incompatível é descartado de forma auditável**: registrar o `reason` via `logCreativeWorkPreparationAttempt` (Task 9) com `phase: "invalidated"` antes de retornar.

`invalidatePreparationAttempts` aceita um `executor` opcional para poder rodar **dentro** da transação curta de edição de fonte (Task 13) — é assim que a edição invalida a tentativa sem esperar a IA.

Preservar o orçamento de tentativas do produto: expiração de lease **não** vira permissão para retries infinitos nem para nova cobrança. O contador de tentativas financeiras continua sendo `manualRetryAttempt` em `creative_work_outputs`; nada aqui o incrementa.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/repositories/creative-work-preparation.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/src/server/repositories/creative-work-preparation.ts app/src/server/repositories/creative-work-preparation.test.ts
git commit -m "feat: add atomic claim, renew, invalidate and finalize for preparation attempts"
```

**Aceite:** testes concorrentes em Postgres real demonstram um dono vigente e invalidação correta.

---

## Task 13 (PR-03): Escritores compatíveis — sem ativar o caminho novo

Implantar primeiro uma versão compatível: **todos** os escritores reconhecem a tentativa, mas nenhuma chamada de produção usa ainda o caminho novo. Nada muda no fluxo de produto nesta entrega.

**Files:**
- Modify: `app/src/server/repositories/creative-work.ts` (`mutateCreativeWorkPieceReference` def. 671 / lock 680; `mutateCreativeWorkDraftSource` def. 1029 / lock 1038; `reservePreparedCreativeWorkOutputsIfCurrent` def. 1447 / lock 1453; `reserveCreativeWorkGenerationOutputs` def. 1474 / lock 1482)
- Test: `app/src/server/repositories/creative-work.test.ts`
- Test: `app/src/server/repositories/creative-work-preparation.test.ts`

**Interfaces:**
- Consumes: `invalidatePreparationAttempts` e `getActivePreparationAttempt` (Task 12).
- Produces: garantia de que nenhuma reserva de outputs acontece sobre briefing antigo.

- [ ] **Step 1: Escrever os testes**

```ts
it("edicao de fonte invalida a tentativa incompativel na mesma transacao curta", async () => {
  await claimPreparationAttempt({ workspaceId, workItemId, kind: "creative_prepare", inputRevision, inputFingerprint: "fp-1", leaseSeconds: 60 });
  await mutateCreativeWorkDraftSource({ workspaceId, workItemId, expectedUpdatedAt, sourceId, mutation });
  const active = await getActivePreparationAttempt({ workspaceId, workItemId });
  expect(active).toBeNull();
});

it("reserva de outputs recusa quando ha tentativa de preparacao em curso", async () => {
  await claimPreparationAttempt({ workspaceId, workItemId, kind: "creative_prepare", inputRevision, inputFingerprint: "fp-1", leaseSeconds: 60 });
  const reserved = await reserveCreativeWorkGenerationOutputs({ workspaceId, workItemId, preparedRevision, plans });
  expect(reserved).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/repositories/creative-work-preparation.test.ts
```

- [ ] **Step 3: Implementar**

Dentro do callback do lock de `mutateCreativeWorkPieceReference` e `mutateCreativeWorkDraftSource`, logo após o `update` bem-sucedido da fonte, chamar `invalidatePreparationAttempts({ workspaceId, workItemId, executor: tx })`. A edição grava e invalida numa transação curta e **não espera resposta da IA**.

Dentro do callback de `reservePreparedCreativeWorkOutputsIfCurrent` e `reserveCreativeWorkGenerationOutputs`, antes de criar os outputs, ler a tentativa ativa com o mesmo `tx` e retornar `null` se houver uma utilizável. **Exigir revisão preparada vigente e ausência de conflito ao reservar outputs; não deixar o novo estado permitir geração com briefing antigo.**

Nenhum caminho de produção cria tentativas ainda — só a Task 15 em diante faz isso. Até lá, `getActivePreparationAttempt` sempre devolve `null` em produção e o comportamento observável é idêntico.

- [ ] **Step 4: Rodar tudo e ver passar**

```bash
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test
cd app && npm run lint && npm run typecheck && npm run build
```

Esperado: PASS, incluindo **todos** os testes antigos de preparação, fontes, reserva e carrossel. Se algum teste antigo falhar, a mudança não é compatível — corrigir a mudança, nunca o teste antigo.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/repositories
git commit -m "feat: make every work writer attempt-aware without activating the new path"
```

**Aceite (fecha PR-03):** um dono vigente e invalidação correta comprovados em Postgres real; **nada muda no fluxo de produto nesta entrega**.

---

## Task 14 (PR-04): Gate de release web + worker + schema

Ter o gate disponível **antes** da ativação da Task 17. Não substitui o CI de PR.

**Files:**
- Create: `app/scripts/reliability-release-smoke.ts`
- Create: `.github/workflows/reliability-release-smoke.yml`
- Create: `docs/runbooks/reliability-release.md`
- Modify: `.github/workflows/ci.yml` — **apenas** se a integração exigir; por padrão, não tocar.

**Interfaces:**
- Consumes: nada do código de produto. Reusa as oito funções v2 e o wiring Inngest existentes — **não criar outro worker de negócio**.
- Produces: relatório por SHA em `artifacts/reliability-release/<sha>.json` (sem segredos, sem URLs assinadas).

- [ ] **Step 1: Escrever o runbook primeiro**

`docs/runbooks/reliability-release.md` descreve: quando rodar (antes de ativar a Task 17 e antes de cada release que toque preparação/settlement), como rodar, como ler o relatório, e a regra dura — **CI verde de outro SHA não é aceito**; o gate produz evidência positiva ou bloqueio explícito.

- [ ] **Step 2: Escrever o script de smoke**

`app/scripts/reliability-release-smoke.ts` executa, em staging isolado criado sob demanda, com web e worker em **processos separados** no **mesmo SHA candidato**:

1. Migrar o schema **antes** de liberar as novas versões de web/worker. Registrar a versão do schema e o readiness de ambos. `/api/health` da web sozinho **não** comprova worker pronto — checar o worker pelo seu próprio sinal.
2. Provar `publish → consume → persist → seleção → download de objeto válido`, correlacionando a **mesma** operação em todas as etapas pelo `generationCorrelationId`.
3. Reentregar o evento, reiniciar o worker durante a execução e simular ack ausente / erro ambíguo. Comprovar estado terminal coerente e cobrança/reembolso **não duplicados** (conferir `usage_events` + `credit_transactions`).
4. Testar falha parcial de lote/carrossel e reuso correto de peças já concluídas.
5. Arquivar o relatório por SHA, ambiente, flags, IDs de eventos, versões dos processos e custo do exercício.

Usar Inngest/R2 de **staging**. Primeiro executar com provedor controlado. Depois, **com autorização explícita do proprietário e teto de chamadas**, um pequeno smoke do provedor real para validar integração. **Nunca usar dados privados de clientes como fixture.**

- [ ] **Step 3: Escrever o workflow**

`.github/workflows/reliability-release-smoke.yml` com `on: workflow_dispatch` e `on: release`. **Não** rodar em `pull_request` — modelo real não entra no CI de PR. Criar o ambiente sob demanda e encerrá-lo ao fim da validação; **não reativar previews permanentes por PR** (`render.yaml:12-13` mantém `previews: generation: manual`).

- [ ] **Step 4: Executar uma vez com provedor controlado**

```bash
gh workflow run reliability-release-smoke.yml -f sha=$(git rev-parse HEAD) -f provider=controlled
gh run watch
```

Esperado: relatório arquivado com as cinco provas acima.

- [ ] **Step 5: Commit**

```bash
git add app/scripts/reliability-release-smoke.ts .github/workflows/reliability-release-smoke.yml docs/runbooks/reliability-release.md
git commit -m "feat: add the web+worker+schema release smoke gate"
```

**Aceite (fecha PR-04):** o gate produz evidência positiva ou bloqueio explícito do release, no mesmo SHA.

**Reversão:** parar novas tentativas, manter dados/ledger, drenar ou invalidar execuções em voo e restaurar somente versão compatível. **Não executar rollback destrutivo do schema** para acompanhar rollback de aplicação.

---

## Task 15 (PR-05): `prepareCreativeWork` com a IA fora da transação

**Files:**
- Modify: `app/src/server/application/prepare-creative-work.ts`
- Test: `app/src/server/application/prepare-creative-work.test.ts`
- Test: `app/tests/integration/creative-work-preparation-concurrency.test.ts`

**Interfaces:**
- Consumes: `claimPreparationAttempt`, `renewPreparationAttempt`, `finalizePreparationAttempt` (Task 12); `preparationInputFingerprint` (Task 10).
- Produces: `prepareCreativeWork` ganha o resultado tipado `{ ok: false, error: { code: "preparation_in_progress", details: { attemptId: string } } }` para requisição que encontra tentativa em curso. Consumido pela Task 17.

**Fluxo-alvo:**

```text
Claim curto: revisão + snapshot + tentativa
        ↓ commit
IA / leitura externa fora de transação
        ↓
Finalize curto: tentativa + revisão ainda válidas?
        ├─ sim: persistir preparação
        └─ não: descartar resultado antigo
```

Não alterar prompts, modelos nem regras criativas.

- [ ] **Step 1: Escrever os testes**

```ts
it("a edicao de fonte conclui ANTES da resposta do modelo ser liberada", async () => {
  // O modelo fica suspenso; a edicao de fonte precisa terminar enquanto ele
  // espera. Hoje ela bloqueia — este teste prova a mudanca.
  const provider = suspendedProvider();
  const preparing = prepareCreativeWork({ workspaceId, workItemId });
  await waitFor(() => expect(provider.calls).toHaveLength(1));

  await expect(
    mutateCreativeWorkDraftSource({ workspaceId, workItemId, expectedUpdatedAt, sourceId, mutation }),
  ).resolves.not.toBeNull();

  provider.release();
  const result = await preparing;
  // O resultado antigo NAO sobrescreve a edicao.
  expect(result).toMatchObject({ ok: false });
});

it("duas requisicoes iguais compartilham UMA tentativa ativa", async () => {
  const provider = suspendedProvider();
  const [a, b] = await Promise.all([
    prepareCreativeWork({ workspaceId, workItemId }).catch((e) => e),
    prepareCreativeWork({ workspaceId, workItemId }).catch((e) => e),
  ]);
  // Uma preparacao pode legitimamente ter revisao + copy: duas etapas NAO sao
  // duplicacao. O que se conta e o numero de TENTATIVAS, nao de chamadas.
  const attempts = await db.select().from(creativeWorkPreparationAttempts)
    .where(eq(creativeWorkPreparationAttempts.workItemId, workItemId));
  expect(attempts).toHaveLength(1);
  expect([a, b].some((r) => r?.error?.code === "preparation_in_progress")).toBe(true);
});

it("tentativa expirada + conclusao atrasada nao persiste resultado antigo", async () => { /* lease curto */ });

it("isolamento: workspaces e marcas distintas nao compartilham tentativa", async () => { /* … */ });

it("o tempo suspenso no provedor nao aparece como transacao aberta", async () => {
  // Usa o teste isolado da Task 8: medir inTransactionMs enquanto o provedor
  // esta suspenso. Deve ficar na ordem das escritas curtas, nao do modelo.
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-preparation-concurrency.test.ts
```

Esperado: FAIL — hoje a edição espera o modelo.

- [ ] **Step 3: Reestruturar `prepareCreativeWork`**

Dividir o callback atual (`prepare-creative-work.ts`, lock aberto na linha 136) em três fases, **sem mover nenhuma regra criativa**:

1. **Claim curto** (dentro de `withCreativeWorkPreparationLock`, como hoje): tudo desde a abertura do lock (linha 137) até a construção de `snapshotBase` — leitura do agregado, validações, `getBrandKit`, fact pack, typography plan. Ao final, calcular `inputFingerprint = preparationInputFingerprint(snapshotBase)` e chamar `claimPreparationAttempt`. Se o resultado for `joined`, retornar `{ ok: false, error: { code: "preparation_in_progress", details: { attemptId } } }` e **sair da transação**. Se `revision_changed`, retornar `stale_input`.

   O atalho de reaproveitamento que devolve o briefing persistido quando nada mudou (bloco `canonicalJsonStringify(...) === canonicalJsonStringify(...)`, logo após `snapshotBase`) fica **antes** do claim: se a preparação já está válida, não há por que reservar tentativa nem chamar o modelo.

2. **Fora de transação**: `reviewInferredBriefingOnce` (linha 364) e `generateSocialPostCopy` (linha 466). Renovar o lease entre as duas com `renewPreparationAttempt` — a renovação escreve apenas `lease_expires_at` e **não** mantém transação aberta. `logCreativeWorkBriefingCheck` permanece exatamente onde está, logo após a revisão.

3. **Finalize curto** (nova transação curta): reler o agregado, recalcular o fingerprint, chamar `finalizePreparationAttempt`. Se `ok`, persistir via `updateCreativeWorkDraftIfUnchanged` (chamada hoje na linha 486, já com CAS). Se não, descartar o resultado e retornar `stale_input`.

Preservar sem alteração: `assertOfferActive`, todos os ramos de `sources_not_ready` / `piece_reference_*` / `source_usage_required` / `missing_input` / `invalid_preparation`, a detecção de conflito de marca (`brand_conflict`), `briefing_blocked`, `invalid_context` e o congelamento de `generationPolicyVersion`.

**Garantia pretendida:** uma tentativa vigente, resultado aplicado apenas à revisão válida e sem duplicação financeira. Após queda com resposta externa ambígua, **não prometer exatamente uma chamada ao provedor** sem suporte específico: limitar tentativas, rejeitar resultado antigo e registrar a ambiguidade via `logCreativeWorkPreparationAttempt`.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd app && npm test -- src/server/application/prepare-creative-work.test.ts
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-preparation-concurrency.test.ts
```

Esperado: PASS, incluindo **todos** os testes antigos de `prepare-creative-work.test.ts` sem edição.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/application/prepare-creative-work.ts app/src/server/application/prepare-creative-work.test.ts app/tests/integration/creative-work-preparation-concurrency.test.ts
git commit -m "feat: run single-piece preparation model calls outside the transaction"
```

---

## Task 16 (PR-05): Carrossel — deduplicar tentativa concorrente, preservando o que já funciona

> **Esta tarefa foi reescrita após a correção de base.** A versão original mandava "tirar `proposeCarouselDraft` da transação". Isso já é verdade em `b2ee6511`: o commit `bea4d2bc` (#331) reestruturou `plan-carousel-work.ts` em três transações curtas (linhas 95, 105, 114), com `researchCarousel` (192), `proposeCarouselHooks` (218) e `proposeCarouselDraft` (289) **fora** de qualquer lock, e `persistEditorial` (linhas 400-411) relendo o Trabalho e recusando com `stale_input` quando a revisão mudou, seguido de um CAS em `writeSettings`. **O carrossel já faz claim curto → externa fora → finalize com revalidação.** Não reconstruir isso.

**Objetivo:** fechar a única lacuna que sobra — duas requisições concorrentes iguais hoje fazem **cada uma** a sua chamada ao provedor, porque não há tentativa compartilhada. O CAS protege a escrita, não o gasto.

**Files:**
- Modify: `app/src/server/application/plan-carousel-work.ts` — **somente** se o Step 2 provar a chamada duplicada
- Test: `app/src/server/application/plan-carousel-work.test.ts`
- Test: `app/tests/integration/creative-work-preparation-concurrency.test.ts`
- Modify: `docs/operations/2026-09-12-preparation-lock-inventory.md` — registrar a decisão

**Interfaces:**
- Consumes: `claimPreparationAttempt` / `finalizePreparationAttempt` (Task 12), com `kind: "carousel_plan"`.
- Produces: nenhuma assinatura nova. `PlanCarouselWorkErrorCode` ganha `"preparation_in_progress"` **apenas** se o Step 3 for executado.

- [ ] **Step 1: Escrever o teste que preserva a proteção existente**

Este teste precisa passar **antes e depois** de qualquer mudança. Ele grava a garantia que já existe e que não pode regredir:

```ts
it("resultado velho do planner nao sobrescreve edicao concorrente (garantia ja existente)", async () => {
  const provider = suspendedProvider();
  const planning = planCarouselWork({ workspaceId, workItemId, expectedUpdatedAt, answers: {} });
  await waitFor(() => expect(provider.calls).toHaveLength(1));

  // A edicao roda em transacao curta e nao espera o planner.
  await mutateCreativeWorkDraftSource({ workspaceId, workItemId, expectedUpdatedAt, sourceId, mutation });

  provider.release();
  // persistEditorial relê o Trabalho e recusa: esta protecao ja existe hoje.
  await expect(planning).resolves.toMatchObject({ ok: false, error: { code: "stale_input" } });
});
```

- [ ] **Step 2: Medir a chamada duplicada**

```ts
it("mede quantas chamadas ao provedor duas requisicoes concorrentes iguais produzem", async () => {
  const provider = suspendedProvider();
  const both = Promise.all([
    planCarouselWork({ workspaceId, workItemId, expectedUpdatedAt, answers: {} }),
    planCarouselWork({ workspaceId, workItemId, expectedUpdatedAt, answers: {} }),
  ]);
  await waitFor(() => expect(provider.calls.length).toBeGreaterThan(0));
  // Registrar o numero OBSERVADO. Uma preparacao pode legitimamente ter
  // pesquisa + ganchos: duas ETAPAS nao sao duplicacao. O que se conta e
  // quantas vezes a MESMA etapa roda para o mesmo Trabalho.
  provider.release(); provider.release();
  await both;
  console.info(JSON.stringify({ chamadasObservadas: provider.calls.length }));
});
```

Rodar e registrar em `docs/operations/reliability-metrics.md`.

```bash
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-preparation-concurrency.test.ts -t "carrossel"
```

- [ ] **Step 3: Decidir pelo resultado medido, não por expectativa**

**Se o Step 2 mostrar uma chamada por etapa por requisição** (duplicação real): envolver os ramos que chamam o provedor — `proposeHooks`, `proposeSelectedScript`, `reviseScript` — com `claimPreparationAttempt` (`kind: "carousel_plan"`, `inputFingerprint = preparationInputFingerprint({ requestContext, factPack, toneOfVoice, command })`) logo após `authorizeSnapshot`, e `finalizePreparationAttempt` imediatamente antes de `persistEditorial`. Em `joined`, devolver `{ ok: false, error: { code: "preparation_in_progress", details: { attemptId } } }`. **Não tocar em `persistEditorial`, `writeSettings` nem nas três transações curtas** — a revalidação de revisão fica exatamente como está.

**Se o Step 2 mostrar que já existe dedupe** (uma chamada por etapa no total): **não mudar nada**. Registrar a medição e a decisão no inventário da Task 7 e seguir para a Task 17. Um caller já correto não precisa de tentativa.

- [ ] **Step 4: `prepareCarouselWork` — conservar a transação curta**

Verificado contra `b2ee6511`: o callback do lock em `prepare-carousel-work.ts:109` só tem `await` de banco (`getCreativeWork`, `updateCreativeWorkIfUnchanged`, `getBrandKit`, `createIdentitySnapshot`, `getCreativeWorkSourceAssetDetails`, `persistSnapshot`). Nenhuma chamada de modelo ou de storage. Pelo critério do plano — *um caller sem I/O externo pode conservar sua transação curta* — **não alterar este arquivo**. Registrar a decisão no inventário.

Se a Task 7 tiver encontrado I/O externo **transitivo** dentro de `createIdentitySnapshot` ou `getCreativeWorkSourceAssetDetails`, aí sim aplicar as três fases com `kind: "carousel_prepare"` — e só então.

- [ ] **Step 5: Rodar e ver passar**

```bash
cd app && npm test -- src/server/application/plan-carousel-work.test.ts src/server/application/prepare-carousel-work.test.ts
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-preparation-concurrency.test.ts
```

Esperado: PASS, com o teste do Step 1 passando **sem edição** — se ele quebrar, a mudança regrediu uma garantia existente e precisa ser desfeita.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/application/plan-carousel-work.ts app/tests/integration/creative-work-preparation-concurrency.test.ts docs/operations/2026-09-12-preparation-lock-inventory.md docs/operations/reliability-metrics.md
git commit -m "test: pin carousel stale-result protection and record attempt-dedupe decision"
```

**Aceite:** a proteção contra resultado velho continua provada por teste; a decisão sobre deduplicação está sustentada por medição, não por suposição; nada foi reescrito por engano.

---

## Task 17 (PR-05): Estado tipado para requisição concorrente e ativação controlada

**Files:**
- Modify: `app/src/app/api/creative-work/[id]/prepare/route.ts` (localizar com o comando do Step 1)
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Test: as rotas correspondentes

**Interfaces:**
- Consumes: `{ ok: false, error: { code: "preparation_in_progress", details: { attemptId } } }` das Tasks 15 e 16.
- Produces: resposta HTTP `409` com `{ error: "creativeWorkPreparationInProgress", attemptId }`. **Usar a rota já existente de consulta do Trabalho para acompanhar — sem superfície nova.**

- [ ] **Step 1: Localizar os adaptadores**

```bash
cd /Users/jhonatan/Repos/ADScale_2
grep -rn "prepareCreativeWork\|planCarouselWork\|prepareCarouselWork" app/src/app/api --include="*.ts" | grep -v "\.test\."
```

- [ ] **Step 2: Escrever o teste do adaptador**

```ts
it("devolve 409 tipado com o attemptId quando ja existe preparacao em curso", async () => {
  prepareMock.mockResolvedValue({
    ok: false,
    error: { code: "preparation_in_progress", details: { attemptId: "attempt-1" } },
  });
  const response = await POST(request, { params });
  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ attemptId: "attempt-1" });
});
```

- [ ] **Step 3: Rodar, implementar, rodar**

Acrescentar o caso ao `switch` de erros de cada rota encontrada no Step 1. O consumidor acompanha pela consulta do Trabalho já existente e **não cria nova tentativa**.

- [ ] **Step 4: Ativar controladamente**

Ativar **somente** depois que a Task 14 passar **no mesmo SHA**. Começar por workspaces internos autorizados usando o mecanismo de rollout já existente (`resolveStudioRolloutVariant` / `isStudioCarouselEnabled`, `app/src/app/(dashboard)/page.tsx:16-17`). **Não criar experimento de produto** e **não mudar `STUDIO_CAROUSEL_ROLLOUT_PERCENT` nem `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT`** — ambos permanecem `"100"`.

- [ ] **Step 5: Comparar contra o baseline**

Rodar as jornadas humanas e registrar em `docs/operations/reliability-metrics.md`: edição, preparo, primeira peça, falha parcial, seleção e retomada. **Registrar amostra pequena como validação funcional, não prova estatística.** Não prometer ganho percentual.

- [ ] **Step 6: Commit**

```bash
git add app/src/app/api app/src/lib/hooks/use-creative-work.ts docs/operations/reliability-metrics.md
git commit -m "feat: expose an in-progress preparation state and activate behind existing rollout"
```

**Aceite (fecha PR-05):** nenhuma chamada externa identificada permanece dentro da transação longa; invariantes antigas preservadas; teste web+worker e jornadas humanas registrados; peça única e carrossel passam nos testes concorrentes.

**Reversão:** desativar novas tentativas no caminho novo, drenar/invalidar as ativas e voltar à versão compatível da Task 13. **Não alternar por flag para um caminho antigo que ignora reservas em voo.**

---

## Task 18 (PR-06): Enumerar os oito loops e caracterizá-los por família

**Files:**
- Create: `docs/operations/reliability-metrics.md` — seção "Settlement: oito laços" (o arquivo já existe desde a Task 9)
- Test: `app/src/server/generation/settlement-adapters.test.ts`

**Interfaces:**
- Consumes: SHA de execução da Task 1.
- Produces: a lista autoritativa de famílias que a Task 19 usa para decidir o que é mecânica comum e o que é política.

- [ ] **Step 1: Enumerar no SHA de execução**

```bash
cd /Users/jhonatan/Repos/ADScale_2
BASE_SHA=$(git rev-parse origin/main)
git grep -n -E 'attempt[[:space:]]*<[[:space:]]*80|setTimeout' "$BASE_SHA" -- app/src/server/generation/settlement-adapters.ts
```

Esperado (verificado contra `b2ee6511`): oito laços, nas linhas **378, 692, 818, 1068, 1397, 1664, 2284, 2658**. Se a contagem divergir, o SHA mudou — registrar a nova lista antes de prosseguir.

- [ ] **Step 2: Documentar cada laço**

Para cada um dos oito, registrar na seção nova: adaptador, reads executados por volta, condição de sucesso, condição de falha, reenvio e compensação. **Não presumir que loops textualmente parecidos têm contratos iguais** — o laço da linha 1664 devolve `dispatch_failed` com refund, enquanto o da 378 devolve `settled` após escrever `generating`; são políticas distintas sob a mesma forma.

- [ ] **Step 3: Escrever testes de caracterização por família**

Um teste por família em `settlement-adapters.test.ts`, cada um fixando: número de operações lógicas cobradas, chaves de idempotência literais emitidas e estado terminal. Estes testes são a rede de segurança da Task 19 — eles precisam passar **sem edição** depois dela.

- [ ] **Step 4: Rodar e registrar**

```bash
cd app && npm test -- src/server/generation/settlement-adapters.test.ts src/server/generation/settlement.test.ts
```

Registrar no documento: número de tentativas, queries, outputs e tempo total por replay, com tamanho de lote variável. A projeção completa do agregado pode representar várias queries — medir, não estimar.

- [ ] **Step 5: Commit**

```bash
git add docs/operations/reliability-metrics.md app/src/server/generation/settlement-adapters.test.ts
git commit -m "test: characterize each settlement loop family before changing it"
```

---

## Task 19 (PR-06): Leituras em lote e deadline monotônico

**Files:**
- Create: `app/src/server/generation/settlement-wait.ts`
- Test: `app/src/server/generation/settlement-wait.test.ts`
- Modify: `app/src/server/repositories/derivation.ts`
- Modify: `app/src/server/repositories/usage.ts`
- Modify: `app/src/server/generation/settlement-adapters.ts`

**Interfaces:**
- Consumes: as famílias documentadas na Task 18.
- Produces:

```ts
// derivation.ts
export async function getDerivationsByIds(
  ids: string[],
  workspaceId: string,
): Promise<Array<Awaited<ReturnType<typeof getDerivationById>>>>;

// usage.ts
export async function getUsageByIdempotencyKeys(
  workspaceId: string,
  keys: string[],
): Promise<Map<string, Awaited<ReturnType<typeof getUsageByIdempotencyKey>>>>;

// settlement-wait.ts
export function settlementDeadline(input: { maxAttempts: number; maxMs: number }): {
  shouldContinue: (attempt: number) => boolean;
  pause: () => Promise<void>;
};
```

`settlement-wait.ts` contém **apenas mecânica de espera/leitura**. Políticas de compensação e reativação permanecem explicitamente associadas aos adaptadores. **Não reescrever o settlement inteiro nem criar novo modelo de tentativa financeira neste PR.**

- [ ] **Step 1: Escrever o teste do deadline**

```ts
it("para pelo deadline mesmo com o contador de tentativas intacto", async () => {
  const deadline = settlementDeadline({ maxAttempts: 80, maxMs: 50 });
  const started = performance.now();
  let attempt = 0;
  while (deadline.shouldContinue(attempt)) {
    attempt += 1;
    await deadline.pause();
  }
  // Uma promessa pendurada nao e limitada pelo contador do loop: e o tempo
  // real que precisa ter politica explicita.
  expect(performance.now() - started).toBeLessThan(500);
  expect(attempt).toBeLessThan(80);
});

it("para pelo numero de tentativas quando o tempo nao esgota", async () => {
  const deadline = settlementDeadline({ maxAttempts: 3, maxMs: 60_000 });
  let attempt = 0;
  while (deadline.shouldContinue(attempt)) attempt += 1;
  expect(attempt).toBe(3);
});
```

Usar relógio monotônico (`performance.now()`), não `Date.now()`.

- [ ] **Step 2: Escrever o teste do lote**

```ts
it("le os reembolsos em UMA consulta por volta, nao uma por output", async () => {
  const spy = vi.spyOn(usageRepo, "getUsageByIdempotencyKeys");
  const single = vi.spyOn(usageRepo, "getUsageByIdempotencyKey");
  await runDispatchSettlement({ outputIds: Array.from({ length: 12 }, (_, i) => `out-${i}`) });
  expect(spy).toHaveBeenCalled();
  expect(single).not.toHaveBeenCalled();
});

it("o numero de consultas nao cresce linearmente com o tamanho do lote", async () => {
  const small = await countQueries(() => runDispatchSettlement({ outputIds: ids(3) }));
  const large = await countQueries(() => runDispatchSettlement({ outputIds: ids(30) }));
  expect(large).toBeLessThan(small * 3);
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd app && npm test -- src/server/generation/settlement-wait.test.ts src/server/generation/settlement-adapters.test.ts
```

- [ ] **Step 4: Implementar os leitores em lote**

Em `derivation.ts`, ao lado de `getDerivationById` (linha 368 — arquivo idêntico nas duas bases), acrescentar `getDerivationsByIds` com um único `inArray(derivations.id, ids)` mais `eq(derivations.workspaceId, workspaceId)`. Em `usage.ts`, ao lado de `getUsageByIdempotencyKey` (linha 56 — arquivo idêntico nas duas bases), acrescentar `getUsageByIdempotencyKeys` com um único `inArray` e devolver `Map` indexado pela chave. Ambos preservam o escopo de workspace — **isolamento não é negociável por desempenho**.

- [ ] **Step 5: Substituir os fan-outs**

Trocar cada `Promise.all(ids.map(…))` dos oito laços pelas versões em lote — notadamente os três fan-outs de `getDerivationById` em torno do laço da linha 1664 e o de `getUsageByIdempotencyKey` no laço da linha 378. Ler projeção mínima para recuperar despacho, **sem carregar o agregado inteiro em cada volta quando não necessário**.

Acrescentar `settlementDeadline` a cada laço **além** do limite de tentativas existente, e timeouts de I/O coerentes. O contador `attempt < 80` permanece; o deadline é adicional.

- [ ] **Step 6: Preservar as chaves financeiras**

Conferir por leitura: cada literal de chave de idempotência (`creativeWorkDispatchRefundKey`, `creativeWorkTerminalReactivationIdempotencyKey`, `creativeWorkTerminalReactivationRefundIdempotencyKey` e os IDs de evento) permanece **byte a byte** igual. Comparar metadados históricos relevantes nos testes de replay.

- [ ] **Step 7: Cobrir os casos difíceis**

Testes obrigatórios, um por caso: ACK ausente com job já iniciado; reenvio aceito mas resposta perdida; cobrança já existente; refund parcial; conclusão tardia. **Falta de ACK não é prova suficiente para devolver créditos** — o teste precisa provar que o código não devolve.

- [ ] **Step 8: Rodar e ver passar**

```bash
cd app && npm test -- src/server/generation/settlement.test.ts src/server/generation/settlement-adapters.test.ts src/server/generation/settlement-wait.test.ts
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-recovery.test.ts
cd app && npm run lint && npm run typecheck && npm test && npm run build
```

Esperado: PASS, incluindo os testes de caracterização da Task 18 **sem edição**.

- [ ] **Step 9: Commit**

```bash
git add app/src/server/generation app/src/server/repositories/derivation.ts app/src/server/repositories/usage.ts
git commit -m "perf: batch settlement refund reads and add a monotonic wait deadline"
```

**Aceite (fecha PR-06):** testes antigos e novos passam; consultas por leitura de reembolsos deixam de crescer linearmente com cada output; a espera tem política temporal explícita; ledger e comportamento de recuperação permanecem compatíveis.

**Reversão:** helper e consultas podem voltar à implementação anterior se os testes de compatibilidade de dados forem preservados. **Não reverter lançamentos financeiros.**

---

## Task 20 (Higiene condicionada): `dbHttp`, MiniMax e configuração órfã

Fora do caminho crítico. **Não bloqueia o fechamento do núcleo.** PRs locais separados, um por item. Só executar depois que a Task 19 estiver estável.

**Files:**
- Modify: `app/src/server/db/http.ts` (remover apenas se o inventário provar ausência de uso)
- Modify: `render.yaml` (remover `MINIMAX_API_KEY` / `MINIMAX_MODEL` apenas se o inventário provar ausência de uso)

**Interfaces:**
- Consumes: nada.
- Produces: nada que outra tarefa consuma.

- [ ] **Step 1: Inventário completo de `dbHttp`**

As Descobertas registram zero importadores estáticos. Zero resultados de grep **não** prova ausência de import dinâmico. Completar:

```bash
cd /Users/jhonatan/Repos/ADScale_2
BASE_SHA=$(git rev-parse origin/main)
git grep -n -E 'dbHttp|db/http|neon-http|@neondatabase' "$BASE_SHA" -- app/src app/scripts app/tests render.yaml .github
git grep -n -E "import\(|require\(" "$BASE_SHA" -- app/src | grep -iE "db|http"
```

Conferir também os entrypoints: `app/src/server/jobs/image-worker.ts`, as rotas de `app/src/app/api`, e `app/scripts/*.ts`.

- [ ] **Step 2: Confirmar o provedor real antes de decidir**

`dbHttp` usa Neon HTTP, mas **isso não prova que produção esteja em Render Postgres nem em Neon**. Usar o provedor registrado no relatório da Task 1. **Não "resolver" a transação longa trocando o driver** — isso já foi tratado pelas Tasks 15-17, que atacam o contrato concorrente.

- [ ] **Step 3: Remover só o que o inventário autorizar**

Se e somente se o Step 1 provar ausência total de uso, remover `app/src/server/db/http.ts` e a dependência `@neondatabase/serverless` de `app/package.json`.

```bash
cd app && npm run lint && npm run typecheck && npm test && npm run build
```

- [ ] **Step 4: MiniMax — mesmo procedimento**

As Descobertas já registram: zero consumidores em `app/src`, `app/scripts`, `app/tests`, e **nenhuma** chave `MINIMAX_*` em `app/src/server/validation/env.ts`. A hipótese de que a validação de boot exigiria a variável está descartada para este SHA. Reconfirmar no SHA de execução antes de remover as linhas 65-68 de `render.yaml`.

**Default diferente de variável explícita não prova bug.** `OPENAI_TEXT_MODEL: gpt-5.6` e `OPENAI_IMAGE_MODEL: gpt-image-2-2026-04-21` em `render.yaml` podem ser decisão deliberada. **Não alterar modelo nem remover essa configuração** sem provar divergência funcional — e este plano proíbe trocar modelos.

- [ ] **Step 5: Commits separados**

```bash
git commit -m "chore: remove the unused HTTP database client"
git commit -m "chore: remove orphaned MiniMax configuration"
```

Um commit por item. Se um inventário for inconclusivo, **não remover** — registrar a inconclusão no relatório e parar.

**Aceite:** cada remoção é justificada por inventário completo; nada foi removido por opinião.

---

## Critério global de encerramento

- [ ] Banco e restore comprovados; objetos R2 necessários disponíveis; proteção e limitações de merge explícitas. *(Task 1)*
- [ ] Seleção confirmada não é reclassificada por falha posterior; efeito pendente tem lastro durável; efeito falho é recuperável quando declarado como tal. *(Tasks 2-6)*
- [ ] Nenhuma espera de IA identificada dentro de transação longa de preparação. *(Tasks 7, 15, 16)*
- [ ] Edição não espera a resposta do modelo; resultado antigo não sobrescreve edição; duplicata compartilha tentativa ativa; reserva de outputs usa revisão válida. *(Tasks 13, 15, 16)*
- [ ] Peça única e carrossel passam nos testes concorrentes e nas jornadas humanas definidas, **sem prometer superioridade estatística**. *(Tasks 8, 15, 16, 17)*
- [ ] Web, worker, schema e serviços de staging demonstrados no mesmo SHA; restart/replay/falha parcial não duplicam cobrança. *(Task 14)*
- [ ] Recuperação de settlement preserva chaves, política financeira e estados históricos. *(Tasks 18, 19)*
- [ ] Métricas por SHA e versão de output, com tamanho de amostra e distinção entre teste e produção. *(Tasks 9, 17, 18)*
- [ ] Nenhum módulo congelado reaberto, nenhum percentual de produto alterado, nenhuma feature nova incluída por conveniência.

**Interromper rollout** diante de: seleção revertida indevidamente, cobrança duplicada, vazamento entre workspaces/marcas, resultado antigo aplicado, geração sobre snapshot inválido ou incompatibilidade de schema. Registrar evidência e corrigir antes de ampliar. **Não contornar com exclusão de teste nem aumento indiscriminado de pool.**

## Handoff para executor e revisor

Cada tarefa entrega: SHA-base e SHA-candidato; escopo e invariantes; arquivos alterados; regressão demonstrada **antes** da correção; comandos e resultados reais; migração/compatibilidade quando aplicável; risco residual; critérios de rollback; e relatório do revisor.

O executor implementa **apenas a próxima tarefa elegível**. O revisor confere a diferença contra este plano e os testes de fronteira, sem adicionar funcionalidades. O proprietário decide merge e qualquer mudança operacional paga. **Falha de um gate não autoriza enfraquecê-lo.**

Comando verde com zero testes não conta como evidência. E2E e smoke usam a configuração existente e o gate da Task 14.

**Invariante concorrente exige passo vermelho executado por quem escreve o teste.** Sem rodar, um teste vazio é indistinguível de um bom — na Task 6 (12/09/2026) o teste tinha as asserções certas, o mock certo e a limpeza certa, e mesmo assim passava idêntico contra o insert desprotegido, porque a corrida nunca abria. Tarefas cujo aceite é uma invariante concorrente (**8, 12, 15, 16**) são estruturalmente do proprietário: um executor sem acesso TCP ao Postgres de teste não consegue escrever nem validar esses testes, e não tem sinal algum que o avise disso.
