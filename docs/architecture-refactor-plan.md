# Plano de execução por PRs — ADScale Architecture Review

> **Versão ajustada:** 2026-06-30 · branch `arch/refactor-2026-q3`
> **Fonte:** [`/var/folders/95/s9tsrvnx7x7dp9t149ty6y980000gn/T/architecture-review-1782842575.html`](file:///var/folders/95/s9tsrvnx7x7dp9t149ty6y980000gn/T/architecture-review-1782842575.html)

---

## Princípios de execução

1. Um PR deve provar uma tese pequena.
2. Nenhum PR grande deve misturar extração, migração e deleção sem testes.
3. Primeiro preservar comportamento, depois simplificar.
4. Toda deleção precisa passar pelo "deletion test": se o arquivo sumir, o sistema fica mais simples sem perder capacidade real?
5. Todo PR precisa ter rollback óbvio.
6. Mudanças de domínio, billing, rate limit e sanitização exigem mais cautela do que mudanças puramente estruturais.

---

## Convenções deste plano

| Item | Valor |
| --- | --- |
| Gerenciador de pacotes | **npm** |
| Diretório de execução dos comandos | **`app/`** |
| Branch de trabalho | **`arch/refactor-2026-q3`** |
| Caminhos de código | prefixados com `app/src/...` |
| i18n | `app/messages/en.json`, `app/messages/pt-BR.json` |

### Comandos reais (substituem `pnpm` em todo o plano)

```bash
# todos rodam de app/
cd app

npm run lint
npm run typecheck
npm test
npm run test:e2e
```

### Testes focados

```bash
# rodar um arquivo
npx vitest run src/server/jobs/derivation.test.ts

# rodar por termo
npm test -- derivation
npm test -- billing
npm test -- sanitize
```

---

## Ordem recomendada dos PRs

| Ordem | PR                                                               | Prioridade | Risco           | Motivo                                 |
| ----: | ---------------------------------------------------------------- | ---------- | --------------- | -------------------------------------- |
|     0 | Criar baseline de testes e mapa de imports                       | P0         | Baixo           | Reduz risco antes de refatorar         |
|     1 | Remover `server/storage/r2.ts` shim                              | P0         | Baixo           | Deleção clara, baixo acoplamento       |
|     2 | Consolidar helpers de display de derivation                      | P0         | Baixo           | Pure functions, ganho rápido           |
|     3 | Criar `ai/derivation-pipeline.ts` sem migrar chamadas            | P0         | Médio           | Base segura para o maior refactor      |
|     4 | Migrar initial generation para `executeGenerationStep()`         | P1         | Médio/Alto      | Primeiro caminho real da pipeline      |
|     5 | Migrar auto-retry e deletar bloco inline                         | P1         | Alto            | Maior ganho, maior risco               |
|     6 | Criar contrato único do billing paywall no server                | P1         | Médio/Alto      | Consolida decisão sem quebrar client   |
|     7 | Migrar rotas para `server/billing/paywall.ts` e deletar wrappers | P1         | Alto            | Deleção grande em billing              |
|     8 | Consolidar rate limit com validação de runtime                   | P2         | Médio           | Depende de compatibilidade Edge/server |
|     9 | Spike: progression como fonte de verdade para missions           | P2         | Alto conceitual | Precisa provar que missions é view     |
|    10 | Consolidar sanitizers em core comum                              | P2         | Médio/Alto      | Área sensível, fazer incremental       |

---

## Blocos de execução

| Bloco | PRs           | Notas                                                      |
| ----- | ------------- | ---------------------------------------------------------- |
| 1     | 0, 1, 2       | Baixo risco. Confiança + limpeza.                          |
| 2     | 3, 4, 5       | Derivação. Maior ganho, maior risco. Não juntar.           |
| 3     | 6, 7          | Billing. Não começar antes da derivação.                   |
| 4     | 8, 9, 10      | Exploração + consolidação cuidadosa. Não travar entregas.   |

---

# PR 0 — Baseline de segurança antes das refatorações

## Prioridade

P0

## Risco

Baixo

## Objetivo

Criar uma base objetiva antes de mexer na arquitetura: testes atuais, mapa de imports e pontos de acoplamento. Esse PR não deve mudar comportamento.

## Escopo

* Rodar suite atual (`npm run lint`, `npm run typecheck`, `npm test`).
* Identificar testes quebrados antes da refatoração.
* Mapear imports dos arquivos-alvo com `rg`.
* Criar uma checklist de validação para os próximos PRs em `app/docs/architecture-refactor-baseline.md`.
* Adicionar scripts de diagnóstico se ainda não existirem.

## Arquivos afetados prováveis

* `app/docs/architecture-refactor-baseline.md` (novo, documenta baseline)
* `app/package.json` (apenas se algum script de diagnóstico precisar ser adicionado)
* Nenhum arquivo de produção.

## Comandos de diagnóstico

```bash
# de app/
npm run lint
npm run typecheck
npm test

# mapa de imports por candidato do review
rg "server/storage/r2" app/src
rg "derivation-review-display|derivation-auto-retry-badge|derivation-formats|derivation-quality|derivation-regeneration-feedback" app/src
rg "runDerivationAutoRetry|promptContext|auto-retry" app/src
rg "spendCreditsOrApiError|SpendCheck|conversion-gate|conversion-client|conversion-contract" app/src
rg "with-rate-limit|api-rate-limit-category" app/src
rg "inferWorkspaceEvidence|PROGRESSION_TO_MISSION|mission-credit-signals" app/src
rg "SENSITIVE_KEY_PATTERN|DENIED_KEY_NAMES|sanitize" app/src
```

## Entregável do PR 0

Arquivo `app/docs/architecture-refactor-baseline.md` com seções:

* Status de `npm run lint`, `npm run typecheck`, `npm test` antes de qualquer mudança.
* Lista de testes atualmente quebrados (se houver) — registrar explicitamente.
* Mapa de imports por candidato (PR 1 a PR 10), com contagem de ocorrências e arquivos.
* Lista de snapshots visuais existentes (componentes, derivation review) que serão afetados.
* Critérios de aceite individuais por PR seguinte, numerados e referenciáveis.

## Critérios de aceite

* `app/docs/architecture-refactor-baseline.md` commitado.
* Baseline de comandos executado e resultado documentado.
* Nenhuma alteração funcional.
* Se algum teste já estiver quebrando antes das mudanças, isso está registrado.

## Critérios de rollback

* Reverter o PR inteiro se qualquer coisa atrapalhar CI.
* Como não há alteração funcional, rollback é trivial (`git revert`).

## Prompt para Cursor

```text
Create the PR 0 baseline for the architecture refactor on branch arch/refactor-2026-q3.
Do not change production behavior.
Run and document the current lint, typecheck, and test status from app/ (npm run lint, npm run typecheck, npm test).
Map imports for the target modules listed in the architecture review:
- storage r2 shim (app/src/server/storage/r2.ts)
- derivation display helpers (app/src/lib/derivation-*.ts)
- derivation pipeline/retry (app/src/server/jobs/derivation.ts, app/src/server/ai/derivation-auto-retry*.ts)
- billing paywall modules (app/src/server/billing/*.ts and app/src/lib/billing/*.ts)
- rate limit modules (app/src/lib/rate-limit.ts, app/src/lib/api-rate-limit-category.ts, app/src/lib/with-rate-limit.ts, app/src/proxy.ts)
- progression/missions (app/src/server/progression/** and app/src/lib/progression/**)
- sanitizers (app/src/server/{feedback,beta-analytics,mission-insights,beta-sessions,olhar-calibration}/*sanitize*)
Produce app/docs/architecture-refactor-baseline.md with status, import map (counts + files), and acceptance criteria checklist that future PRs can reuse.
```

---

# PR 1 — Remover `app/src/server/storage/r2.ts` shim

## Prioridade

P0

## Risco

Baixo

## Objetivo

Eliminar o shim deprecated `app/src/server/storage/r2.ts` e fazer os callers importarem diretamente o seam real de storage.

## Tese

O review aponta que `r2.ts` é apenas uma camada de re-export deprecated, enquanto o seam real é `ObjectStorage`, com adapters reais para R2 e in-memory. Portanto, `r2.ts` não merece existir.

## Arquivos afetados prováveis

* `app/src/server/storage/r2.ts` (a deletar)
* `app/src/server/storage/object-storage.ts`
* `app/src/server/storage/index.ts`
* `app/src/server/storage/r2-object-storage.ts`
* `app/src/server/storage/in-memory-object-storage.ts`
* `app/src/server/storage/storage-helpers.ts`

Callers (validados pelo baseline do PR 0):

* `app/src/server/jobs/derivation.ts`
* `app/src/server/jobs/workspace-asset.ts`
* `app/src/server/ai/derivation-auto-retry.ts`
* `app/src/server/ai/landing-page.ts`
* demais encontrados via `rg "server/storage/r2"`

## Mudança esperada

Antes:

```ts
import { putR2Object } from "@/server/storage/r2";
```

Depois (preferido):

```ts
import { objectStorage } from "@/server/storage";
```

## Testes obrigatórios

```bash
cd app
npm run typecheck
npm test

# focados
npm test -- storage
npm test -- derivation
npm test -- workspace-asset
```

## Critérios de aceite

* `app/src/server/storage/r2.ts` deletado.
* Nenhum import restante para `r2.ts` (verificado por `rg "storage/r2" app/src`).
* Callers usam `objectStorage` diretamente.
* Adapters R2 e in-memory preservados.
* Nenhuma mudança no comportamento de upload, get, delete ou URL generation.

## Critérios de rollback

* Algum caller exigir assinatura que não exista em `objectStorage`.
* Ambiente de teste/local depender diretamente de helper antigo.
* Upload ou leitura de assets falhar em teste/integrado.

Rollback:

```bash
git revert <commit-do-pr>
```

## Prompt para Cursor

```text
Refactor storage imports to remove the deprecated app/src/server/storage/r2.ts shim.
Replace every caller with the real objectStorage seam while preserving behavior.
Do not change storage semantics.
After all imports are migrated, delete r2.ts.
From app/, run npm run typecheck and relevant storage/derivation tests (npm test -- storage, npm test -- derivation, npm test -- workspace-asset).
Stop if any caller depends on behavior that objectStorage does not expose directly.
```

---

# PR 2 — Consolidar helpers de display de derivation

## Prioridade

P0

## Risco

Baixo

## Objetivo

Fundir os cinco arquivos pequenos de display/review de derivation em um único módulo `app/src/lib/derivation-display.ts`.

## Tese

Os arquivos atuais são muito pequenos, altamente relacionados e sem seam real. Como são funções puras de formatação/display, o risco é baixo e o ganho de localidade é alto.

## Arquivos afetados prováveis

Origem:

* `app/src/lib/derivation-auto-retry-badge.ts`
* `app/src/lib/derivation-formats.ts`
* `app/src/lib/derivation-quality.ts`
* `app/src/lib/derivation-regeneration-feedback.ts`
* `app/src/lib/derivation-review-display.ts`

Destino:

* `app/src/lib/derivation-display.ts` (novo)

Callers:

* Componentes de review de derivation.
* Testes de review/display.
* Arquivos encontrados por `rg "derivation-(auto-retry-badge|formats|quality|regeneration-feedback|review-display)" app/src`.

## Mudança esperada

* Criar `app/src/lib/derivation-display.ts`.
* Mover constantes e helpers para esse arquivo.
* Exportar apenas a API usada pelos componentes.
* Atualizar imports.
* Deletar os quatro ou cinco arquivos antigos, conforme o resultado.

## Testes obrigatórios

```bash
cd app
npm run typecheck
npm test

npm test -- derivation-display
npm test -- derivation-review
npm test -- components
```

## Critérios de aceite

* Um único módulo concentra display/review helpers.
* Imports antigos removidos (`rg` confirma zero matches).
* Nenhuma mudança visual intencional.
* Snapshots, se existirem, continuam iguais ou têm diff explicado.
* Redução real de arquivos (de 5 para 1).

## Critérios de rollback

* Houver mudança visual inesperada.
* Snapshot mudar sem justificativa.
* Algum helper tiver dependência circular após consolidação.

Rollback simples: `git revert <commit-do-pr>`.

## Prompt para Cursor

```text
Consolidate the derivation display/review helper modules into one app/src/lib/derivation-display.ts module.
Preserve all existing behavior and public outputs.
Update all imports.
Delete obsolete helper files only after typecheck passes.
From app/, run component/review/derivation tests (npm run typecheck, npm test, npm test -- derivation-display, npm test -- derivation-review, npm test -- components).
Stop if consolidation creates a circular dependency or visual snapshot changes unexpectedly.
```

---

# PR 3 — Criar `ai/derivation-pipeline.ts` sem migrar chamadas

## Prioridade

P0

## Risco

Médio

## Objetivo

Criar o novo módulo profundo da derivation pipeline sem ainda trocar o caminho principal de execução, mas com **golden test / snapshot test do request shape** obrigatório antes de qualquer migração.

## Tese

A refatoração mais importante é também a mais arriscada. Por isso, o primeiro PR deve extrair comportamento de forma controlada e **provar** que o request shape gerado é idêntico ao caminho atual. Sem essa prova, o PR 4 fica sem rede de segurança.

## Arquivos afetados prováveis

* `app/src/server/ai/derivation-pipeline.ts` (novo)
* `app/src/server/ai/derivation-pipeline.test.ts` (novo, golden test obrigatório)
* `app/src/server/ai/derivation-pipeline.snap` (novo, snapshot do request shape, se Vitest snapshot for o caminho escolhido)
* possivelmente `app/src/server/ai/derivation-auto-retry.ts` (apenas se helpers estáveis forem extraídos para o novo módulo)

## Mudança esperada

Criar interface inicial:

```ts
export async function executeGenerationStep(
  ctx: ExecuteGenerationStepContext
): Promise<ExecuteGenerationStepResult> {
  // extracted behavior only
}
```

Atenção: neste PR, a função pode existir com testes, mas **não** deve substituir todas as chamadas reais ainda.

### Golden test / snapshot test do request shape — OBRIGATÓRIO

Antes de fechar o PR 3, deve existir um teste que:

1. Capture o `promptContext` exato (estrutura serializável) gerado pelo caminho atual em `derivation.ts` para um input canônico.
2. Capture o `promptContext` gerado por `executeGenerationStep()` para o mesmo input canônico.
3. Falhe se os dois divergirem (deep equality).

Implementação sugerida: serializar para JSON estável, comparar via `toEqual`. Se a equipe preferir Vitest snapshot, congelar `app/src/server/ai/derivation-pipeline.snap` no primeiro commit e exigir atualização consciente em PRs seguintes.

Esse teste é o **contrato** que o PR 4 vai usar para provar que a migração preservou comportamento.

## Testes obrigatórios

```bash
cd app
npm run typecheck
npm test

npm test -- derivation
npm test -- derivation-auto-retry
npm test -- derivation-pipeline
```

## Critérios de aceite

* Novo módulo existe em `app/src/server/ai/derivation-pipeline.ts`.
* Interface clara e pequena.
* Golden test / snapshot test do request shape presente e passando.
* Nenhuma mudança de comportamento no job principal.
* Testes atuais continuam passando.
* A função nova tem teste de contrato (golden ou snapshot).

## Critérios de rollback

* A extração exigir mocks demais.
* A nova interface ficar maior do que o próprio problema.
* Surgirem mudanças funcionais no job antes da migração.
* O golden test ficar difícil de manter (sinal de que a interface ainda não está no formato certo).

## Prompt para Cursor

```text
Introduce app/src/server/ai/derivation-pipeline.ts with an executeGenerationStep interface.
Extract only stable generation-step behavior needed by both initial generation and auto-retry, but do not migrate the main derivation job yet.
Preserve behavior.
MANDATORY: add a golden test or snapshot test that captures the request/prompt shape produced by the current path inside app/src/server/jobs/derivation.ts for a canonical input, and asserts that executeGenerationStep produces the same shape (deep equality or Vitest snapshot). This test is the contract that PR 4 will rely on.
From app/, run npm run typecheck and npm test -- derivation, npm test -- derivation-auto-retry, npm test -- derivation-pipeline.
Stop if the new interface becomes too broad, requires changing runtime behavior, or the golden test is impossible to write without a circular setup.
```

---

# PR 4 — Migrar initial generation para `executeGenerationStep()`

## Prioridade

P1

## Risco

Médio/Alto

## Objetivo

Fazer o caminho inicial de geração usar `executeGenerationStep()`.

## Tese

Migrar primeiro o caminho inicial reduz risco. O retry continua intacto, então qualquer regressão fica isolada no fluxo principal de geração.

## Arquivos afetados prováveis

* `app/src/server/jobs/derivation.ts`
* `app/src/server/ai/derivation-pipeline.ts`
* testes do derivation job
* testes da pipeline

## Mudança esperada

Antes:

```ts
step.run("generate-and-store", async () => {
  // build prompt context
  // resolve assets
  // call OpenAI
  // normalize
  // upload
  // persist
});
```

Depois:

```ts
step.run("generate-and-store", async () => {
  return executeGenerationStep(ctx);
});
```

## Testes obrigatórios

```bash
cd app
npm run typecheck
npm test -- derivation
npm test -- derivation-auto-retry
npm test -- derivation-pipeline

# integração Inngest se existir
npm test -- inngest
```

## Critérios de aceite

* Initial generation usa `executeGenerationStep()`.
* Retry ainda não foi migrado.
* Nenhuma mudança no payload persistido.
* Nenhuma mudança na estrutura do prompt final.
* Nenhuma mudança na forma de upload/storage.
* Golden test / snapshot test do PR 3 continua passando sem atualização.

## Critérios de rollback

* Prompt gerado mudar.
* Persistência mudar.
* Upload/storage quebrar.
* Testes de derivation ficarem instáveis.

Rollback: reverter apenas este PR. O PR 3 pode permanecer.

## Prompt para Cursor

```text
Migrate only the initial derivation generation path inside app/src/server/jobs/derivation.ts to call executeGenerationStep().
Do not migrate auto-retry yet.
Preserve prompt context, asset resolution, OpenAI call parameters, normalization, upload, persistence, and memory side effects.
Add tests or assertions proving the persisted result and prompt request shape remain unchanged (the golden test from PR 3 must still pass without snapshot update).
From app/, run npm run typecheck and npm test -- derivation, npm test -- derivation-auto-retry, npm test -- derivation-pipeline, npm test -- inngest.
Stop if retry code needs to change in this PR.
```

---

# PR 5 — Migrar auto-retry e deletar bloco inline

## Prioridade

P1

## Risco

Alto

## Objetivo

Fazer o auto-retry usar a mesma pipeline do initial generation e deletar o bloco inline duplicado em `derivation.ts`.

## Tese

Este é o PR com maior ganho de arquitetura. Ele elimina a seam invertida: o job não deve conhecer o formato interno do retry a ponto de reconstruir prompt context manualmente.

## Arquivos afetados prováveis

* `app/src/server/jobs/derivation.ts`
* `app/src/server/ai/derivation-pipeline.ts`
* `app/src/server/ai/derivation-auto-retry.ts`
* `app/src/server/ai/derivation-auto-retry-policy.ts`
* testes de auto-retry
* testes de derivation job

## Mudança esperada

* `runDerivationAutoRetry()` ou equivalente passa a delegar para `executeGenerationStep()`.
* O bloco inline de retry em `derivation.ts` é removido.
* `derivation.ts` vira orquestrador fino: Inngest + step wiring.
* A regra de retry continua em módulo próprio ou vira modo dentro da pipeline.

Exemplo conceitual:

```ts
await executeGenerationStep({
  ...ctx,
  mode: "auto-retry",
  retryReason,
  previousAttempt,
});
```

## Testes obrigatórios

```bash
cd app
npm run typecheck
npm test -- derivation-auto-retry
npm test -- derivation
npm test
```

Testes que precisam existir ou ser ajustados:

```text
auto-retry uses same generation pipeline as initial generation.
auto-retry preserves retry policy.
auto-retry persists the regenerated asset correctly.
auto-retry does not rebuild prompt context outside the pipeline.
```

## Critérios de aceite

* Auto-retry usa a pipeline compartilhada.
* Bloco inline duplicado removido.
* Não existem três call sites reconstruindo prompt context.
* Testes de retry continuam passando.
* `derivation.ts` perde complexidade real.
* O retry continua observável/debugável.

## Critérios de rollback

* Auto-retry passar a gerar prompt diferente sem intenção.
* Retry deixar de respeitar policy.
* Persistência de tentativa/regeneração quebrar.
* Testes ficarem flaky.
* Debuggabilidade piorar.

Rollback: reverter este PR; manter PRs 3 e 4 se estiverem estáveis.

## Prompt para Cursor

```text
Migrate the auto-retry derivation path to reuse executeGenerationStep().
Remove the duplicated inline retry block from derivation.ts only after tests prove behavior is preserved.
The job should remain an orchestrator, not a prompt/retry implementation.
Preserve retry policy, prompt context semantics, storage behavior, persistence, and memory side effects.
From app/, run npm run typecheck, npm test -- derivation-auto-retry, npm test -- derivation, npm test.
Stop if prompt generation differs without an explicit test update.
```

---

# PR 6 — Criar contrato único do billing paywall no server

## Prioridade

P1

## Risco

Médio/Alto

## Objetivo

Criar `app/src/server/billing/paywall.ts` como o ponto único de decisão para spend/access/conversion payload, mas sem deletar tudo no mesmo PR.

## Tese

"Spend credits or return 402" deve ser uma decisão de domínio do server. Mas o client pode ainda precisar de um contrato leve para interpretar o payload. Por isso, primeiro criamos o módulo canônico no server.

## Arquivos afetados prováveis

Origem (a serem absorvidos em PRs seguintes, **não deletados** neste PR):

* `app/src/server/billing/access.ts`
* `app/src/server/billing/credits.ts`
* `app/src/server/billing/gates.ts`
* `app/src/server/billing/conversion.ts`
* `app/src/server/billing/unlimited-access.ts`

Client/contract (preservado como tipo compartilhado):

* `app/src/lib/billing/conversion-gate.ts`
* `app/src/lib/billing/conversion-client.ts`
* `app/src/lib/billing/conversion-contract.ts`

Destino (novo):

* `app/src/server/billing/paywall.ts`
* `app/src/server/billing/paywall.test.ts`

## Mudança esperada

Criar API:

```ts
export async function spend(params): Promise<SpendResult>;
export async function getAccess(workspaceId): Promise<BillingAccess>;
export function getAccessFromBilling(billing): BillingAccess;
```

O retorno deve representar:

```ts
type SpendResult =
  | { ok: true; creditsSpent: number }
  | { ok: false; status: 402; conversionPayload: ConversionPayload };
```

## Testes obrigatórios

```bash
cd app
npm run typecheck
npm test -- billing
npm test

# tests necessários
spend returns ok when workspace has credits/access.
spend returns 402 conversion payload when blocked.
getAccess preserves current access behavior.
unlimited access behavior remains unchanged.
conversion payload shape remains compatible with client.
```

## Critérios de aceite

* `app/src/server/billing/paywall.ts` criado.
* Decisão de spend/access está centralizada.
* Nenhuma rota migrada em massa ainda.
* Client contract não é quebrado.
* Stripe continua como adapter real.
* Testes cobrem comportamento atual.

## Critérios de rollback

* Payload 402 mudar acidentalmente.
* Contrato client/server ficar ambíguo.
* Stripe ou dev-admin ficarem misturados com regra de domínio.
* O módulo novo virar apenas mais um wrapper sem deletabilidade futura.

## Prompt para Cursor

```text
Create app/src/server/billing/paywall.ts as the canonical server-side module for billing access, spend decision, and conversion payload generation.
Do not mass-migrate routes yet.
Preserve the existing 402 payload shape and client compatibility.
Keep Stripe as an adapter, not embedded business logic.
Add tests for spend allowed, spend blocked, unlimited access, and conversion payload compatibility.
From app/, run npm run typecheck, npm test -- billing, npm test.
Stop if this becomes just another wrapper over the existing modules.
```

---

# PR 7 — Migrar rotas para paywall e deletar wrappers de billing

## Prioridade

P1

## Risco

Alto

## Objetivo

Migrar route handlers para `app/src/server/billing/paywall.ts` e deletar módulos redundantes.

## Tese

Depois que o contrato canônico estiver testado, as rotas devem importar um único módulo. Só então faz sentido deletar `gates.ts`, `conversion.ts`, `unlimited-access.ts` e client twins redundantes.

## Arquivos afetados prováveis

* Route handlers que chamam:

  * `spendCreditsOrApiError`
  * `canSpend`
  * `buildConversionErrorPayloadForWorkspace`
  * `getWorkspaceBillingAccess`
* `app/src/server/billing/gates.ts`
* `app/src/server/billing/conversion.ts`
* `app/src/server/billing/unlimited-access.ts`
* `app/src/lib/billing/conversion-gate.ts`
* `app/src/lib/billing/conversion-client.ts`
* `app/src/lib/billing/conversion-contract.ts`, se for realmente redundante

## Mudança esperada

Antes:

```ts
const spendCheck = await canSpend(...);
if (!spendCheck.ok) {
  return buildConversionErrorPayloadForWorkspace(...);
}
```

Depois:

```ts
const result = await paywall.spend(...);
if (!result.ok) {
  return Response.json(result.conversionPayload, { status: 402 });
}
```

## Testes obrigatórios

```bash
cd app
npm run typecheck
npm test -- billing
npm test -- api
npm test
```

Testes importantes:

```text
each paid route returns the same success response as before.
each blocked route returns the same 402 payload as before.
idempotency behavior remains unchanged.
workspace access behavior remains unchanged.
client still renders conversion/paywall state correctly.
```

## Critérios de aceite

* Rotas usam `paywall.spend()` ou API equivalente.
* `SpendCheck` não é redefinido em múltiplos lugares.
* Wrappers deletados apenas se nenhum import restar (`rg` confirma zero).
* Payload 402 compatível.
* Testes de API e billing passam.
* Stripe/dev-admin continuam adaptadores separados.

## Critérios de rollback

* Qualquer rota paga mudar status code.
* 402 payload quebrar o client.
* Idempotency quebrar.
* Unlimited access ou grants ficarem incorretos.

Rollback: reverter PR 7; manter PR 6 se só adicionou módulo e testes.

## Prompt para Cursor

```text
Migrate billing route handlers to use app/src/server/billing/paywall.ts.
Replace duplicated SpendCheck/canSpend/conversion payload logic with the canonical paywall API.
Delete redundant billing wrappers only after no imports remain (verify with rg).
Preserve status codes, 402 payload shape, idempotency, unlimited access, grants, and client rendering behavior.
From app/, run npm run typecheck, npm test -- billing, npm test -- api, npm test.
Stop if a client contract needs to be changed unexpectedly.
```

---

# PR 8 — Consolidar rate limit com validação Edge/server

## Prioridade

P2

## Risco

Médio

## Objetivo

Unificar `with-rate-limit.ts`, `api-rate-limit-category.ts` e `rate-limit.ts` sem quebrar runtime Edge/server.

## Tese

O review indica que há três arquivos para um único store/limite/categoria. Mas `proxy.ts` pode rodar em runtime diferente dos route handlers. Essa compatibilidade precisa ser provada antes da deleção.

## Arquivos afetados prováveis

* `app/src/lib/rate-limit.ts`
* `app/src/lib/api-rate-limit-category.ts`
* `app/src/lib/with-rate-limit.ts`
* `app/src/proxy.ts`
* route handlers com rate limit

## Mudança esperada

Criar ou consolidar API:

```ts
checkRateLimit(pathname, opts)
```

Com responsabilidades:

* classificar pathname/categoria;
* aplicar limite;
* montar resposta 429;
* usar adapter compatível com ambiente.

## Testes obrigatórios

```bash
cd app
npm run typecheck
npm test -- rate-limit
npm test -- proxy
npm test -- api
```

Testes necessários:

```text
pathname maps to the same category as before.
rate limit threshold remains unchanged.
429 response shape remains unchanged.
proxy runtime can import the module safely.
memory adapter works in tests.
redis adapter works in production-like environment or mocked integration.
```

## Critérios de aceite

* Categoria e limite vivem juntos.
* `with-rate-limit.ts` deletado se for pass-through real.
* `api-rate-limit-category.ts` deletado se a tabela for movida para `rate-limit.ts`.
* `proxy.ts` importa sem quebrar runtime.
* Redis e memory adapters continuam separados.

## Critérios de rollback

* Bundle do proxy quebrar.
* Redis client for importado em ambiente Edge indevidamente.
* Categoria de rota mudar.
* 429 mudar sem intenção.
* Rate limit ficar mais permissivo ou mais agressivo por acidente.

## Prompt para Cursor

```text
Consolidate rate limit logic into app/src/lib/rate-limit.ts with checkRateLimit(pathname, opts), including category mapping and 429 response building.
Preserve Redis and memory adapters.
Before deleting wrappers, prove app/src/proxy.ts can import the module safely in its runtime.
Preserve existing thresholds and route category behavior.
From app/, run npm run typecheck, npm test -- rate-limit, npm test -- proxy, npm test -- api, npm run lint.
Stop if Redis or server-only code leaks into Edge runtime.
```

---

# PR 9 — Spike: progression como fonte de verdade para missions

## Prioridade

P2

## Risco

Alto conceitual

## Objetivo

Provar ou rejeitar a tese de que `missions` é apenas uma view de `progression`.

## Tese

O review sugere duas hierarquias paralelas respondendo "o que o usuário fez?". A consolidação só é segura se missions não tiver regra de produto independente que progression não representa.

## Tipo de PR

Discovery/spike com pouco ou nenhum código de produção.

## Arquivos analisados

* `app/src/server/progression/service.ts`
* `app/src/server/progression/evidence.ts`
* `app/src/server/progression/levels.ts`
* `app/src/server/progression/missions/service.ts`
* `app/src/server/progression/missions/evidence.ts`
* `app/src/server/progression/missions/definitions.ts`
* `app/src/server/progression/missions/status.ts`
* `app/src/server/progression/missions/credits.ts`
* `app/src/server/progression/missions/hrefs.ts`
* `app/src/lib/progression/types.ts`
* `app/src/lib/progression/missions/types.ts`
* `app/src/server/feedback/mission-credit-signals.ts`
* i18n `app/messages/en.json`
* i18n `app/messages/pt-BR.json`

## Entregável

Criar `app/docs/progression-missions-spike.md` com:

* Quais regras são duplicadas.
* Quais regras existem só em missions.
* Quais regras existem só em progression.
* Quais estados não podem ser colapsados.
* Se `PROGRESSION_TO_MISSION` pode ser deletado.
* **Forma canônica de i18n para os 11 prompts de missão**: árvore única de chaves que cobre `dashboard.missions.*` e `dashboard.progression.levels.*` simultaneamente, sem campos vazios back-compat (`blockedReason: ""`, `label: ""`) que aparecem hoje em `missions/definitions.ts`.
* **Diff de cobertura de chaves en/pt-BR**: listar todas as chaves usadas por missions vs progression em `app/messages/en.json` e `app/messages/pt-BR.json`; identificar chaves presentes em um locale mas não no outro; identificar chaves presentes em missions mas não em progression e vice-versa. Conclusão: dá pra colapsar sem perder cobertura?
* Plano de PRs futuros se a tese for válida.

## Testes obrigatórios

```bash
cd app
npm run typecheck
npm test -- progression
npm test -- missions

# snapshots de dashboard, se existirem
npm test -- dashboard
```

## Critérios de aceite

* A tese é comprovada ou rejeitada no documento.
* Nenhuma refatoração grande feita por impulso.
* Lista de diferenças progression vs missions documentada.
* **Forma canônica de i18n** documentada com exemplo concreto de chave única.
* **Diff de cobertura en/pt-BR** registrado (nenhuma chave perdida, nenhuma chave duplicada desnecessariamente).
* Próximo PR fica claro.

## Critérios de rollback

* Reverter se o documento estiver errado ou inconclusivo.
* Não migrar produção neste PR.

## Prompt para Cursor

```text
Run a discovery spike to determine whether missions can safely become a thin view over progression.
Do not perform a major production refactor.
Compare progression service/evidence/levels with progression missions service/evidence/definitions/status/credits/hrefs and mission-credit-signals.
In app/docs/progression-missions-spike.md, document:
- duplicated rules
- mission-only rules
- progression-only rules
- whether PROGRESSION_TO_MISSION is deletable
- canonical i18n shape for the 11 mission prompts (one tree covering both dashboard.missions.* and dashboard.progression.levels.*, without back-compat empty fields)
- i18n key coverage diff between app/messages/en.json and app/messages/pt-BR.json (keys present in one locale but not the other, keys only in missions, keys only in progression)
From app/, run npm run typecheck, npm test -- progression, npm test -- missions.
Stop if missions contains independent product rules that progression cannot represent, or if collapsing i18n would lose keys in either locale.
```

---

# PR 10 — Consolidar sanitizers em core comum

## Prioridade

P2

## Risco

Médio/Alto

## Objetivo

Criar um core comum de sanitização sem apagar políticas específicas antes da hora.

## Tese

O review aponta sobreposição entre deny rules, mas sanitização é área sensível. Consolidar tudo de uma vez pode criar vazamento de dados ou bloquear dados legítimos. A abordagem segura é extrair denylist/cap comum e manter políticas por contexto.

## Arquivos afetados prováveis

* `app/src/server/feedback/sanitize.ts`
* `app/src/server/beta-analytics/sanitize.ts`
* `app/src/server/mission-insights/sanitize.ts`
* `app/src/server/beta-sessions/types.ts`
* `app/src/server/olhar-calibration/cenbrap-calibration.ts`
* novo `app/src/server/sanitize/index.ts` ou `app/src/server/sanitize/sanitize-for-telemetry.ts`

## Mudança esperada

Criar API:

```ts
sanitizeForTelemetry(input, {
  kind: "feedback" | "beta_event" | "mission_insight",
});
```

Ou:

```ts
sanitizeWithPolicy(input, policy);
```

Com:

* denylist comum;
* limite comum de tamanho;
* políticas específicas por tipo;
* testes de regressão para chaves sensíveis.

## Testes obrigatórios

```bash
cd app
npm run typecheck
npm test -- sanitize
npm test -- feedback
npm test -- beta-analytics
npm test -- mission-insights
```

Testes necessários:

```text
sensitive keys are removed in all contexts.
allowed keys remain allowed per context.
32KB cap or current cap remains enforced.
nested sensitive keys are removed.
arrays are sanitized correctly.
unknown objects do not crash sanitizer.
```

## Critérios de aceite

* Existe core comum.
* Políticas específicas continuam explícitas.
* Nenhum dado sensível volta a aparecer.
* Nenhum allowlist importante é apagado.
* Sanitizers antigos podem virar wrappers finos temporários.
* Deleção total só acontece em PR posterior, se segura.

## Critérios de rollback

* Qualquer teste indicar vazamento de chave sensível.
* Dados analíticos necessários forem removidos por engano.
* Contextos diferentes exigirem políticas incompatíveis.
* O sanitizer comum ficar genérico demais e difícil de auditar.

## Prompt para Cursor

```text
Extract a common telemetry sanitization core while preserving context-specific policies.
Do not delete all existing sanitizers in this PR unless tests prove exact compatibility.
Centralize shared sensitive-key deny rules and size cap, but keep feedback, beta_event, and mission_insight policies explicit.
Add regression tests for sensitive keys, nested objects, arrays, allowed keys, and size limits.
From app/, run npm run typecheck, npm test -- sanitize, npm test -- feedback, npm test -- beta-analytics, npm test -- mission-insights.
Stop if any context requires incompatible behavior.
```

---

# Critérios gerais de merge

Todo PR deve cumprir, executado de `app/`:

```bash
npm run lint
npm run typecheck
npm test
```

Quando o PR tocar UI:

```bash
npm run test:e2e
```

Além disso:

1. Não pode misturar refatoração com feature.
2. Não pode alterar payload público sem teste explícito.
3. Não pode deletar arquivo enquanto houver import restante (verificar com `rg`).
4. Não pode reduzir cobertura em billing, derivation, sanitizer ou rate limit.
5. Deve ter descrição clara de:
   * O que foi deletado.
   * O que ficou igual.
   * Como foi testado.
   * Como reverter.

---

# Template de descrição de PR

````markdown
## Objetivo

Explique em uma frase o problema arquitetural que este PR resolve.

## Escopo

- [ ] Arquivos migrados
- [ ] Arquivos deletados
- [ ] Testes adicionados/ajustados
- [ ] Sem mudança funcional intencional

## Antes

Descreva a duplicação, wrapper ou seam artificial.

## Depois

Descreva o novo módulo/interface.

## Arquivos afetados

- `app/src/...`

## Comandos executados (de `app/`)

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] testes específicos: `npm test -- <termo>`

## Riscos

- ...

## Rollback

```bash
git revert <commit>
````

## Evidência

Logs curtos ou links do CI.

````

---

# Stop conditions gerais

Parar e não avançar o PR se acontecer qualquer um dos pontos abaixo:

1. A refatoração exigir mudança de comportamento para passar.
2. A interface nova ficar maior e mais confusa que os módulos antigos.
3. Algum teste crítico precisar ser removido em vez de ajustado.
4. O payload público mudar sem decisão explícita.
5. O runtime Edge/server ficar ambíguo.
6. O client depender de contrato que foi apagado.
7. Um domínio supostamente "view" tiver regra própria relevante.
8. A deleção não reduzir complexidade real.

---

# Resumo executivo

A melhor estratégia não é abrir um PR gigante de "architecture cleanup". A execução correta é:

1. Fazer duas deleções fáceis primeiro: storage shim (PR 1) e derivation display helpers (PR 2).
2. Atacar a derivation pipeline em três PRs (PR 3 com golden test obrigatório, PR 4, PR 5), porque é o maior ganho e o maior risco técnico.
3. Consolidar billing em duas fases: primeiro contrato canônico (PR 6), depois migração/deleção (PR 7).
4. Tratar progression/missions e sanitizers como teses a provar, não como refatoração automática.
5. Exigir teste e rollback explícito em todos os PRs.

*Mantenido em `app/docs/` · Última atualização: 2026-06-30 · Branch: `arch/refactor-2026-q3`*
````