# Finalizacao do ADScale: Prompt, Auth e Billing

Date: 2026-05-19
Mode: Brainstorming / planning only

## Checklist

- [x] Revisar contexto do projeto, instrucoes locais e trabalho recente
- [x] Mapear superficies atuais de prompt, autenticacao, cobranca e creditos
- [x] Propor abordagens com trade-offs
- [x] Dividir demandas em epicos priorizados
- [x] Validar direcao com o usuario antes de escrever design doc
- [x] Documentar design aprovado em `docs/plans/2026-05-19-finalizacao-prompt-auth-billing-design.md`
- [x] Transicionar para plano de implementacao apos aprovacao

## Contexto observado

- O app real fica em `app/`; docs e tarefas ficam na raiz.
- A geracao de imagens passa por `app/src/server/ai/prompt-builder.ts`, `app/src/server/jobs/derivation.ts` e os fluxos de campanha/derivacao.
- Ja existem contratos importantes de prompt: CTA literal, modos `art_variation`, `format_adaptation`, `restyling`, nivel criativo, diagnostico criativo e referencias de cliente.
- Autenticacao ja usa Better Auth com Drizzle/Postgres em `app/src/server/auth/index.ts` e tabelas de usuario/sessao/workspace em `app/src/server/db/schema.ts`.
- Billing ainda parece ser principalmente UI/simulador em settings; Stripe nao esta instalado no pacote.
- Ja existe `usage_events`, mas ainda nao ha uma camada clara de assinatura, creditos, entitlement e bloqueio de uso por plano.

## Abordagens

### Recomendada: endurecer o MVP atual com Better Auth + Stripe Checkout + creditos internos

- Mantem Better Auth como autenticacao gratuita/self-hosted.
- Adiciona Stripe Checkout/Customer Portal para reduzir codigo proprio de pagamento.
- Usa webhooks Stripe como fonte de verdade de assinatura.
- Usa creditos internos para controlar custo de IA e bloquear geracoes sem plano/credito.
- Refina prompt/briefing com contratos testaveis antes de alterar muitos fluxos de UI.

### Alternativa 2: migrar autenticacao para Supabase Auth

- Bom free tier e painel pronto.
- Aumenta risco de prazo porque migraria a base de auth/workspace ja existente.
- Melhor apenas se houver necessidade forte de OAuth/email transacional/painel gerenciado imediatamente.

### Alternativa 3: lancar sem billing real, apenas manual/trial

- Menor escopo tecnico.
- Nao resolve cobranca confiavel nem controle de custo.
- Risco alto se usuarios reais puderem gerar imagens sem limite de pagamento.

## Epicos propostos

### Epico 1: Prompt Input Prime

- Criar contrato de briefing obrigatorio por modo: objetivo, publico, oferta, CTA literal, elementos obrigatorios, elementos proibidos, formato e referencias.
- Transformar campos soltos em prompt estruturado com prioridades: leis rigidas, brief de campanha, diagnostico, referencias, preferencias.
- Adicionar prompt preview/debug interno para ver o prompt final salvo na derivacao.
- Salvar metadados de prompt por derivacao para auditoria e reproducibilidade.
- Criar testes de prompt para CTA literal, portugues, formato, referencias, diagnostico e limites por modo.
- Validar manualmente com 3 campanhas reais: produto, servico e restyling.

### Epico 2: Autenticacao Segura e Gratuita

- Manter Better Auth + Postgres/Drizzle como base gratuita/self-hosted.
- Revisar schema de usuario, sessao e workspace para garantir unicidade, ownership e roles.
- Adicionar verificacao de email e reset de senha se ainda faltar provedor de email.
- Endurecer sessoes: expiracao, refresh, trusted origins, logout, troca de senha revogando outras sessoes.
- Mapear workspace ativo como fronteira obrigatoria em toda rota privada.
- Adicionar testes de auth/workspace para acesso negado, troca de workspace e sessao ausente.

### Epico 3: Stripe Billing e Entitlements

- Instalar Stripe SDK e variaveis `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs e success/cancel URLs.
- Criar tabelas para `stripeCustomerId`, assinatura, status, plano, priceId, periodo atual e creditos.
- Criar endpoint de Checkout Session para escolher plano.
- Criar Customer Portal para trocar/cancelar plano.
- Criar webhook Stripe com verificacao de assinatura.
- Processar eventos centrais: checkout concluido, assinatura criada/atualizada/cancelada, invoice pago/falhou.
- Provisionar creditos/limites somente a partir dos webhooks.
- Mostrar status real de plano/cobranca em Settings.

### Epico 4: Creditos, Limites e Protecao de Custo

- Definir custo em creditos por acao: plano criativo, geracao, restyling, pacote multiformato, landing page.
- Criar servico central `canSpend` / `recordUsage` para todas as rotas/jobs.
- Bloquear antes de enfileirar job quando nao houver credito/plano ativo.
- Debitar somente quando a operacao chegar em estado cobrado, com idempotencia por job/derivacao.
- Exibir creditos restantes no dashboard/topbar com fonte real.
- Alertar em 80% e bloquear em 100%, preservando acesso de leitura/export.

### Epico 5: Hardening Final e Prova de Pronto

- Rodar migracoes/Drizzle check.
- Rodar testes focados de prompt, auth, billing e creditos.
- Rodar lint e build com env dummy completo.
- Fazer smoke manual: signup/login, criar campanha, gerar imagem, consumir credito, checkout teste, webhook teste, portal.
- Atualizar docs de setup de env e Stripe test mode.
- Produzir checklist final de go/no-go.

## Recomendacao de ordem

1. Prompt Input Prime.
2. Auth hardening.
3. Stripe + entitlements.
4. Creditos/bloqueios.
5. Hardening final.

## Review

Plano inicial criado a partir do estado atual do repositorio. Direcao aprovada: manter Better Auth como auth principal do MVP e integrar Stripe como fonte de verdade de cobranca. Design salvo em `docs/plans/2026-05-19-finalizacao-prompt-auth-billing-design.md`; plano de implementacao salvo em `docs/plans/2026-05-19-finalizacao-prompt-auth-billing.md`.

## Implementation Review: Billing Foundation

Date: 2026-05-19
Status: Completed

### Files Changed

- `app/package.json` / `app/package-lock.json` — added the Stripe SDK dependency.
- `app/src/server/validation/env.ts` — added required Stripe secret, webhook, price ID and redirect URL variables.
- `app/src/server/db/schema.ts` — added billing customers, subscriptions, credit grants and processed Stripe event tables under `adscale_app`.
- `app/drizzle/0012_billing_foundation.sql` — additive migration for the billing foundation.
- `app/tests/unit/billing-schema.test.ts` — focused schema contract test.

### Commands Run & Results

```bash
cd app
npm run test -- tests/unit/billing-schema.test.ts  # 1 file / 4 passed
npx drizzle-kit check                              # passed
npx eslint src/server/validation/env.ts src/server/db/schema.ts tests/unit/billing-schema.test.ts  # passed
```

### Notes

- Implemented through an isolated Kimi worktree, then reviewed and ported only the approved diff back to the main checkout.
- The Drizzle migration was written manually because this repo already has manually maintained migration files beyond the journal snapshot.

## Implementation Review: Stripe Checkout and Portal

Date: 2026-05-19
Status: Completed

### Files Changed

- `app/src/server/billing/plans.ts` — server-side plan key to Stripe price ID mapping.
- `app/src/server/billing/stripe.ts` — Stripe client initialized from env.
- `app/src/server/billing/sessions.ts` — customer reuse/create flow plus Checkout and Portal session creation.
- `app/src/server/repositories/billing.ts` — workspace-scoped billing customer lookup and upsert.
- `app/src/app/api/billing/checkout/route.ts` — authenticated subscription Checkout endpoint.
- `app/src/app/api/billing/portal/route.ts` — authenticated Billing Portal endpoint.
- Focused tests for route behavior and session helper behavior.

### Commands Run & Results

```bash
cd app
npm run test -- src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts  # 3 files / 10 passed
npx eslint src/server/billing/plans.ts src/server/billing/stripe.ts src/server/billing/sessions.ts src/server/billing/sessions.test.ts src/server/repositories/billing.ts src/app/api/billing/checkout/route.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.ts src/app/api/billing/portal/route.test.ts  # passed
```

### Notes

- Checkout creates or reuses a Stripe customer per workspace and attaches workspace/user/plan metadata to the session.
- Portal intentionally requires a previously saved Stripe customer, so users without billing history get a controlled 404 instead of a broken Stripe call.

## Implementation Review: Signed Stripe Webhooks

Date: 2026-05-19
Status: Completed

### Files Changed

- `app/src/app/api/billing/webhook/route.ts` — raw-body webhook route with Stripe signature verification.
- `app/src/server/billing/events.ts` — idempotent event processor for checkout completion and subscription created/updated/deleted.
- `app/src/server/repositories/billing.ts` — subscription upsert, processed-event lookup/recording, and workspace-scoped subscription lookup.
- `app/src/server/billing/plans.ts` — reverse lookup from Stripe price ID to internal plan key.
- Focused webhook/event tests plus type-cleanup in existing billing tests.

### Commands Run & Results

```bash
cd app
npm run test -- src/server/billing/events.test.ts src/app/api/billing/webhook/route.test.ts src/server/billing/sessions.test.ts src/app/api/billing/portal/route.test.ts  # 4 files / 14 passed
npx eslint src/server/billing/events.ts src/server/billing/events.test.ts src/server/billing/plans.ts src/server/billing/sessions.test.ts src/server/repositories/billing.ts src/app/api/billing/webhook/route.ts src/app/api/billing/webhook/route.test.ts src/app/api/billing/portal/route.test.ts  # passed
```

### Notes

- Webhooks now reject missing/invalid Stripe signatures before event processing.
- Subscription state is written only from signed Stripe events; checkout return URLs do not activate plans.
- Paid invoices provision plan credits through `credit_grants` using the invoice ID as the source reference.

## Implementation Review: Credit Entitlement Service

Date: 2026-05-19
Status: Completed

### Files Changed

- `app/src/server/billing/credits.ts` — central `canSpend` and `recordUsage` service with cost map and grant debit logic.
- `app/src/server/repositories/billing.ts` — active subscription lookup, available credit grants, and grant balance updates.
- `app/src/server/repositories/usage.ts` — idempotency-key lookup and usage recording support.
- `app/src/server/db/schema.ts` / `app/drizzle/0013_usage_idempotency.sql` — `usage_events.idempotency_key` for duplicate-safe billing records.
- `app/src/server/billing/credits.test.ts` — focused service tests.

### Commands Run & Results

```bash
cd app
npm run test -- src/server/billing/credits.test.ts  # 1 file / 5 passed
npx drizzle-kit check                              # passed
npx eslint src/server/billing/credits.ts src/server/billing/credits.test.ts src/server/repositories/billing.ts src/server/repositories/usage.ts src/server/db/schema.ts  # passed
```

### Notes

- `recordUsage` returns duplicate results without debiting grants when the same idempotency key is retried.
- Entitlement requires an active/trialing subscription plus enough unexpired credit grant balance.

## Implementation Review: Credit Gates

Date: 2026-05-19
Status: Completed

### Files Changed

- `app/src/server/billing/gates.ts` — shared API helper that records usage or returns a 402 response.
- Expensive route gates added to plan generation, image derivation, restyling, regeneration, delivery package children, and landing page generation.
- Existing route tests updated to mock the billing gate; `app/src/server/billing/gates.test.ts` added for blocked/allowed behavior.

### Commands Run & Results

```bash
cd app
npm run test -- src/server/billing/gates.test.ts src/server/billing/credits.test.ts src/app/api/derivations/[id]/regenerate/route.test.ts src/app/api/derivations/[id]/delivery-package/route.test.ts src/app/api/derivations/[id]/landing-page/route.test.ts  # 5 files / 26 passed
npx eslint src/server/billing/gates.ts src/server/billing/gates.test.ts src/app/api/campaigns/[id]/plan/route.ts src/app/api/campaigns/[id]/derivations/route.ts src/app/api/quick-tools/restyling/route.ts src/app/api/derivations/[id]/regenerate/route.ts src/app/api/derivations/[id]/regenerate/route.test.ts src/app/api/derivations/[id]/delivery-package/route.ts src/app/api/derivations/[id]/delivery-package/route.test.ts src/app/api/derivations/[id]/landing-page/route.ts src/app/api/derivations/[id]/landing-page/route.test.ts  # passed
```

### Notes

- Routes now fail before expensive AI/work enqueue when the workspace has no active subscription or insufficient credits.
- Idempotency keys are stable for retries on campaign/derivation/landing-page surfaces.

## Implementation Review: Billing UI and Final Verification

Date: 2026-05-19
Status: Completed

### Files Changed

- `app/src/app/api/billing/status/route.ts` — authenticated billing summary for Settings.
- `app/src/components/settings/BillingTab.tsx` — shows real plan/status/credit balance and opens the Stripe portal.
- `app/src/components/settings/PlansTab.tsx` — paid plan buttons now start Stripe Checkout.
- `app/src/server/billing/plans.ts` / `events.ts` — plan credit grants aligned with displayed plan credits.

### Commands Run & Results

```bash
cd app
npm run test -- src/server/billing/events.test.ts src/app/api/billing/webhook/route.test.ts src/server/billing/credits.test.ts src/server/billing/gates.test.ts src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts  # 7 files / 25 passed
npx eslint src/server/billing/events.ts src/server/billing/events.test.ts src/server/billing/plans.ts src/server/repositories/billing.ts src/app/api/billing/status/route.ts src/components/settings/BillingTab.tsx src/components/settings/PlansTab.tsx  # passed
npm run build  # passed with dummy env; only Better Auth low-entropy dummy secret warning
```

### Notes

- Settings now has a real checkout/portal path instead of only static pricing simulation.
- Build includes `/api/billing/status`, `/api/billing/checkout`, `/api/billing/portal`, and `/api/billing/webhook`.

## Launch Review

Date: 2026-05-19
Status: Completed

Review doc saved at `docs/plans/2026-05-19-finalizacao-prompt-auth-billing-review.md`.

Final continuation added:

- `app/src/lib/hooks/use-billing.ts`
- `app/src/lib/hooks/use-billing.test.tsx`
- `app/src/components/layout/TopBar.tsx` now reads real billing credits.
- Settings billing/plans now use the shared billing hook.

Final verification:

```bash
cd app
npm run test -- src/lib/hooks/use-billing.test.tsx src/server/billing/events.test.ts src/app/api/billing/webhook/route.test.ts src/server/billing/credits.test.ts src/server/billing/gates.test.ts src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts  # 8 files / 28 passed
npx eslint src/lib/hooks/use-billing.ts src/lib/hooks/use-billing.test.tsx src/components/settings/BillingTab.tsx src/components/settings/PlansTab.tsx src/components/layout/TopBar.tsx  # passed
npm run build  # passed with dummy env; Better Auth low-entropy dummy secret warning only
```

## Launch Setup Review

Date: 2026-05-20
Status: Completed

### Files Changed

- `app/.env.example` — safe local setup template with required database, auth, OpenAI, storage, Inngest and Stripe variables.
- `app/.gitignore` — keeps real `.env*` files ignored while allowing the safe example file to be tracked.
- `app/README.md` — replaced generated starter text with ADScale local setup, Stripe test-mode setup, verification commands and manual smoke checklist.
- `docs/plans/2026-05-19-finalizacao-prompt-auth-billing-review.md` — added final setup/smoke documentation notes.

### Commands Run & Results

```bash
cd app
npm run test -- src/lib/hooks/use-billing.test.tsx src/server/billing/events.test.ts src/app/api/billing/webhook/route.test.ts src/server/billing/credits.test.ts src/server/billing/gates.test.ts src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts  # 8 files / 28 passed
npx eslint src/lib/hooks/use-billing.ts src/lib/hooks/use-billing.test.tsx src/components/settings/BillingTab.tsx src/components/settings/PlansTab.tsx src/components/layout/TopBar.tsx  # passed
npm run build  # passed with local placeholder Stripe env; only middleware/proxy convention warning
```

### Notes

- Ignored local env files were filled with non-secret Stripe placeholders so local build/smoke can run without weakening tracked secrets hygiene.
- Real Stripe test-mode values still need to be configured before a full checkout/webhook browser smoke.

---

# Novas Sugestoes de Melhorias

Date: 2026-05-16
Mode: Brainstorming only

## Checklist

- [x] Revisar contexto do projeto, instrucoes locais e trabalho recente
- [x] Mapear superficies atuais do app e planos existentes
- [x] Propor 2-3 abordagens de melhoria com trade-offs
- [x] Escolher uma direcao com o usuario antes de escrever design doc
- [x] Documentar resultado aprovado em `docs/plans/YYYY-MM-DD-<topic>-design.md`
- [x] Transicionar para plano de implementacao apos aprovacao

## Notes

- Nao implementar nesta etapa. O objetivo e descobrir a proxima melhoria com melhor retorno para o ADScale.

## Review

### Contexto observado

- O fluxo demo-ready atual esta centrado em `art_variation`: briefing, upload, diagnostico criativo, nivel de variacao, galeria, score, regeneracao e export.
- A home ja tem quick tool de restilizacao com modal e API.
- O produto tem scoring/regeneracao assistiva, mas ainda pode melhorar a confianca do usuario na escolha final e no controle do resultado.

### Sugestoes candidatas

1. Creative QA antes de exportar: checklist visual/factual por derivacao aprovada.
2. Comparador de vencedor: ranking explicavel entre as melhores variacoes.
3. Pacote de entrega multi-formato: transformar a melhor peca em adaptacoes finais para export.

### Direcao escolhida

- O usuario escolheu Pacote de entrega multi-formato.
- Contexto tecnico atual: `format_adaptation` ja usa o job de derivacao com `images.edit()` quando ha asset e target format unico; a rota atual de gerar derivacoes cria um job por configuracao de campanha, nao um pacote a partir de uma derivacao vencedora.
- Decisao de UX: sempre mostrar `1:1`, `4:5` e `9:16`, mas permitir desmarcar formatos antes de confirmar a geracao.
- Abordagem aprovada: pacote a partir da derivacao aprovada, com novas derivacoes filhas vinculadas ao vencedor.

### Documentos criados

- `docs/plans/2026-05-16-delivery-package-multiformat-design.md`
- `docs/plans/2026-05-16-delivery-package-multiformat.md`


---

## Implementation Review: Delivery Package Multi-Format

Date: 2026-05-16
Status: Completed

### Files Changed

- `app/src/server/repositories/derivation.ts` — added `getActivePackageChildren` helper
- `app/src/server/repositories/derivation.test.ts` — unit tests for helper with mocked database
- `app/src/app/api/derivations/[id]/delivery-package/route.ts` — new POST endpoint
- `app/src/app/api/derivations/[id]/delivery-package/route.test.ts` — unit tests for endpoint
- `app/src/server/ai/prompt-builder.ts` — added `packageSource` to `DerivationPromptConfig` and prompt text
- `app/src/server/ai/prompt-builder.test.ts` — unit tests for package source prompts
- `app/src/server/jobs/derivation.ts` — parent outputKey used as reference for package children
- `app/src/server/jobs/derivation.test.ts` — unit tests for parent-output reference selection
- `app/src/lib/hooks/use-delivery-package.ts` — new `useCreateDeliveryPackage` hook
- `app/src/lib/hooks/use-delivery-package.test.tsx` — unit tests for hook
- `app/src/components/workspace/DeliveryPackageModal.tsx` — new modal component
- `app/src/components/workspace/DeliveryPackageModal.test.tsx` — unit tests for modal
- `app/src/components/workspace/DerivationCard.tsx` — added package action for approved derivations
- `app/src/components/workspace/DerivationCard.test.tsx` — unit tests for card action
- `app/src/components/workspace/DerivationsStep.tsx` — passed `onCreateDeliveryPackage` prop through
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` — wired modal, hook, and handler
- `app/messages/en.json` — added `deliveryPackage` and `generatePackage` translations
- `app/messages/pt-BR.json` — added Portuguese translations

### Commands Run & Results

```bash
cd app
npm test -- delivery-package/route.test.ts DeliveryPackageModal.test.tsx prompt-builder.test.ts use-delivery-package.test.tsx derivation.test.ts DerivationCard.test.tsx  # 9 files / 48 passed
npm run lint                                       # 0 errors, only pre-existing warnings
npm run test                                       # 30 files / 160 tests passed; pre-existing template env suite blocked
npm run build                                      # Succeeds with env vars; TypeScript clean
```

### Known Blockers

1. **Full repository test suite** still fails on the pre-existing `src/server/repositories/template.test.ts` environment/database setup. The new delivery-package, prompt, job, repository, hook, modal, and card tests pass.
2. **Build without env vars** fails at page-data collection because `env.ts` validates required secrets at module load. Build succeeds with the required environment variables supplied, confirming no type errors in the changed code.

### Acceptance Criteria Coverage

- [x] Approved derivation with `outputKey` can request a delivery package.
- [x] UI shows 1:1, 4:5, 9:16 selected by default and allows unselecting formats.
- [x] Source format is treated as already ready and not regenerated.
- [x] Backend creates child derivations with `parentId`, `generationMode: "format_adaptation"`, selected target formats, source CTA/variant/plan.
- [x] Duplicate queued/processing children for same parent+format are not created.
- [x] Job uses parent `outputKey` as `images.edit` input for package `format_adaptation`.
- [x] Existing manual `format_adaptation` campaigns still use campaign asset (no parent outputKey path).

### Risks to Review

- `getActivePackageChildren` filters by `status in ("queued", "processing")`. If a child fails and the user retries, the old failed row remains; a new child will be created because failed rows are not considered active. This matches the intended behavior.
- The campaign page invalidates `["derivations"]` and `["campaigns"]` on success, which refreshes the gallery and campaign list after the package is queued.


---

# Proxima Feature

Date: 2026-05-16
Mode: Brainstorming only

## Checklist

- [x] Explore project context — check files, docs, recent commits
- [x] Ask clarifying questions — one at a time, understand purpose/constraints/success criteria
- [x] Propose 2-3 approaches — with trade-offs and recommendation
- [x] Present design — get approval section by section
- [x] Write design doc — save to `docs/plans/YYYY-MM-DD-<topic>-design.md` and commit
- [x] Transition to implementation — invoke writing-plans skill

## Notes

- Do not implement during brainstorming.
- Next feature should build on the current demo-ready `art_variation` path unless the user deliberately chooses a new surface.
- Direction chosen: assistive QA for approved pieces before export, not a hard export gate.
- Design approved and documented in `docs/plans/2026-05-16-creative-qa-before-export-design.md`.
- Implementation plan written in `docs/plans/2026-05-16-creative-qa-before-export.md`.


---

## Implementation Review: Creative QA Before Export

Date: 2026-05-16
Status: Completed

### Files Changed

- `app/src/server/db/schema.ts` — added `qaStatus`, `qaChecklist`, `qaIssues`, `qaSuggestions`, `qaAnalyzedAt` to `derivations`
- `app/drizzle/0008_creative_qa.sql` — migration for QA fields
- `app/src/server/ai/creative-qa.ts` — normalizer, prompt builder, and OpenAI analyzer
- `app/src/server/ai/creative-qa.test.ts` — tests for normalizer and prompt builder
- `app/src/server/repositories/derivation.ts` — added `updateDerivationQa` helper
- `app/src/server/repositories/derivation.test.ts` — unit tests for `updateDerivationQa`
- `app/src/app/api/derivations/[id]/qa/route.ts` — POST endpoint for running QA
- `app/src/app/api/derivations/[id]/qa/route.test.ts` — unit tests for endpoint (404, 409, 400, success, error)
- `app/src/lib/hooks/use-creative-qa.ts` — TanStack Query mutation hook
- `app/src/lib/hooks/use-creative-qa.test.tsx` — hook tests for post, error, invalidation
- `app/src/lib/hooks/use-derivations.ts` — extended `Derivation` type with QA fields
- `app/src/lib/mock-data.ts` — extended `Derivation` type with QA fields
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` — wired `useCreativeQa`, handler, and prop mapping
- `app/src/components/workspace/DerivationCard.tsx` — QA button, status chip, issue display
- `app/src/components/workspace/DerivationCard.test.tsx` — tests for QA button visibility, rerun, click
- `app/src/components/workspace/DerivationsStep.tsx` — passed `onRunQa` and `qaAnalyzingId` through
- `app/messages/en.json` — added `runQa`, `rerunQa`, `qaReady`, `qaWarning`, `qaReview`, `creativeQaComplete`, `creativeQaFailed`, error keys
- `app/messages/pt-BR.json` — added Portuguese equivalents
- `tasks/todo.md` — this implementation review

### Commands Run & Results

```bash
cd app
npx drizzle-kit check
# Everything's fine

npx vitest run --config config/vitest.config.ts --passWithNoTests creative-qa.test.ts qa/route.test.ts use-creative-qa.test.tsx DerivationCard.test.tsx derivation.test.ts
# 7 test files / 30 tests passed

npm run lint
# 0 errors, only pre-existing template warnings

npm run test
# 33 test files / 179 tests passed; pre-existing template.test.ts env blocker still fails

DATABASE_URL=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=... OPENAI_API_KEY=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... R2_PUBLIC_BASE_URL=... INNGEST_EVENT_KEY=... INNGEST_SIGNING_KEY=... APP_URL=... npm run build
# Build succeeds; TypeScript clean; Better Auth low-entropy warnings acceptable with dummy env
```

### Known Blockers

1. **Full repository test suite** still fails on the pre-existing `src/server/repositories/template.test.ts` environment/database setup. All new creative-qa tests pass.
2. **Build without env vars** fails at module load because `env.ts` validates required secrets. Build succeeds with dummy env values supplied.

### Acceptance Criteria Coverage

- [x] Approved derivations with images can run QA via POST `/api/derivations/[id]/qa`.
- [x] QA result is normalized, persisted on derivations, exposed to client types, and visible in the gallery/card flow.
- [x] Export remains available regardless of QA status.
- [x] QA evaluates legibility, CTA/offer, briefing fit, format fit, and creative risk.
- [x] Rerun QA overwrites the prior result timestamp/data.
- [x] Focused tests cover AI normalization/prompt, route, repository helper, hook, and card UI.
- [x] `tasks/todo.md` has an implementation review with files, commands, blockers, and acceptance criteria coverage.


---

# Novas Sugestoes de Features

Date: 2026-05-16
Mode: Brainstorming only

## Checklist

- [x] Explore project context — check files, docs, recent commits
- [x] Ask clarifying questions — one at a time, understand purpose/constraints/success criteria
- [x] Propose 2-3 approaches — with trade-offs and recommendation
- [x] Present design — get approval section by section
- [x] Write design doc — save to `docs/plans/YYYY-MM-DD-<topic>-design.md` and commit
- [x] Transition to implementation — invoke writing-plans skill

## Notes

- Do not implement during brainstorming.
- Separate genuinely new product wedges from already-planned refinements.
- Current strongest gap: the codebase has creative plan API/hooks/components, but the live campaign wizard does not use the plan step.
- Candidate directions:
  1. Creative Plan visivel no wizard, connecting briefing, diagnosis, hooks, CTAs, and generation.
  2. Comparador de vencedor, explaining why the best scored outputs are stronger.
  3. Next best action dashboard, surfacing the next operational step per campaign.
- Direction selected by user: Biblioteca de referencias de marca/cliente.


---

# Novas Sugestoes de Features - 2026-05-17

Date: 2026-05-17
Mode: Brainstorming only

## Checklist

- [x] Explore project context — check files, docs, recent commits
- [x] Ask clarifying questions — one at a time, understand purpose/constraints/success criteria
- [x] Propose 2-3 approaches — with trade-offs and recommendation
- [x] Present design — get approval section by section
- [x] Write design doc — save to `docs/plans/YYYY-MM-DD-<topic>-design.md` and commit
- [x] Transition to implementation — invoke writing-plans skill

## Notes

- Do not implement during brainstorming.
- Focus on feature suggestions that are genuinely new relative to delivery package, Creative QA, and client reference library.
- Context checked: recent commits, existing plans, campaign wizard, dashboard, plan API/UI, export service, usage tracking, and current derivation review flow.
- Strong gaps found:
  1. Creative plan API/components exist, but the live campaign workspace currently runs only briefing -> upload -> derivations.
  2. Dashboard credit/usage stats are placeholders even though campaigns, derivations, usage events, and exports already exist.
  3. The gallery can sort by score and inspect cards, but there is no explicit winner comparison or decision rationale flow.
- Correction from user: "novas funcoes" means new product capabilities, not improvements to existing surfaces. Reframe suggestions away from incremental flow polish.
- Direction selected by user:
  1. Gerador de Landing Page Match.
  2. Persona Simulator after Landing Page Match.
- Persona Simulator intent: simulate reactions from different audiences such as skeptical buyer, warm lead, financial decision maker, and beginner user; output what each persona understands, rejects, wants, and would click.
- Landing Page Match scope selected by user: full landing page with multiple sections, more powerful even with larger scope.
- Landing Page Match output selected by user: exportable HTML ready to download/copy into Webflow, Framer, or a website.
- Landing Page Match source selected by user: approved derivation plus campaign briefing, preserving coherence with the winning creative and using offer/CTA/audience from the briefing.

## Approved Design

- First version: direct HTML export from an approved derivation.
- UI entry: "Generate landing page" action on approved derivation cards.
- Backend: `POST /api/derivations/[id]/landing-page`.
- Generation: AI returns structured landing page JSON.
- Rendering: server converts validated JSON to standalone HTML with embedded CSS.
- Storage/export: upload HTML and return a download URL.
- Persona Simulator remains the next function after Landing Page Match.

## Documents

- `docs/plans/2026-05-17-landing-page-match-design.md`
- `docs/plans/2026-05-17-landing-page-match.md`

## Prior Client Reference Notes

- Scope refinement: Hibrido enxuto — lightweight client/brand profile plus reusable visual references.
- Recommended approach accepted: add reusable client references inside the campaign flow, plus a small "save approved image as reference" path after review.
- Design section approved: UX/product flow.
- Design section approved: architecture/data model.
- Design section approved: generation behavior, error handling, and testing.
- Design doc created: `docs/plans/2026-05-17-client-reference-library-design.md`.
- Implementation plan created: `docs/plans/2026-05-17-client-reference-library.md`.


---

## Implementation Review: Client Reference Library

Date: 2026-05-17
Status: Completed

### Files Changed

- `app/src/server/db/schema.ts` — added `clientProfiles` and `clientReferences`; extended campaigns with `clientProfileId` and `selectedReferenceIds`
- `app/drizzle/0009_client_reference_library.sql` — migration for profiles, references, and campaign reference fields
- `app/src/server/repositories/client-reference.ts` — repository helpers for profiles, references, workspace validation, and selected reference lookup
- `app/src/server/repositories/campaign.ts` — persists selected client profile and reference IDs
- `app/src/app/api/client-profiles/*` — profile and reference endpoints
- `app/src/app/api/derivations/[id]/save-reference/route.ts` — saves approved derivation output as a reusable reference
- `app/src/lib/hooks/use-client-profiles.ts` — profile/reference query and mutation hooks
- `app/src/components/workspace/BriefingStep.tsx` — profile select, inline profile creation, and reference checklist
- `app/src/components/workspace/DerivationCard.tsx` / `DerivationsStep.tsx` / campaign page — approved derivation save-as-reference action
- `app/src/server/ai/prompt-builder.ts` and `app/src/server/jobs/derivation.ts` — selected references are appended as auxiliary prompt context
- `app/messages/en.json` and `app/messages/pt-BR.json` — UI translations

### Commands Run & Results

```bash
cd app
npx drizzle-kit check
# Everything's fine

npx vitest run --config config/vitest.config.ts --passWithNoTests src/server/repositories/client-reference.test.ts src/app/api/client-profiles/route.test.ts 'src/app/api/client-profiles/[id]/references/route.test.ts' 'src/app/api/derivations/[id]/save-reference/route.test.ts' src/lib/hooks/use-client-profiles.test.tsx src/components/workspace/BriefingStep.test.tsx src/server/ai/prompt-builder.test.ts src/server/jobs/derivation.test.ts src/components/workspace/DerivationCard.test.tsx
# 9 test files / 45 tests passed

npm run lint
# 0 errors; 3 pre-existing template warnings

DATABASE_URL=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=... OPENAI_API_KEY=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... R2_PUBLIC_BASE_URL=... INNGEST_EVENT_KEY=... INNGEST_SIGNING_KEY=... APP_URL=... npm run build
# Build succeeds; TypeScript clean
```

### Acceptance Criteria Coverage

- [x] Workspace-scoped client/brand profiles and visual references exist in schema and migration.
- [x] Briefing can select a client profile, create a lightweight profile inline, and toggle references.
- [x] Selected references persist on the campaign and reload when the campaign is reopened.
- [x] Derivation job passes selected references into the prompt as auxiliary context only.
- [x] Prompt guardrails preserve CTA, format, generation mode, and campaign constraints over reference context.
- [x] Approved derivations with output can be saved as references for reuse.
- [x] Focused tests cover repository, API routes, hooks, prompt builder, job integration, and briefing UI.

### Known Blockers

- Full suite still has the pre-existing `template.test.ts` environment/database blocker.
- Build without required env vars still fails at env validation; dummy env build succeeds.


---

## Implementation Review: Landing Page Match

Date: 2026-05-17
Status: Completed

### Files Changed

- `app/src/server/db/schema.ts` — added `landingPages` table with workspace, campaign, and derivation foreign keys
- `app/drizzle/0010_landing_pages.sql` — migration for landing_pages table and indexes
- `app/src/server/repositories/landing-page.ts` — repository for create, complete, fail, and list by derivation
- `app/src/server/repositories/landing-page.test.ts` — unit tests for repository with mocked database
- `app/src/server/ai/landing-page.ts` — prompt builder, strict JSON normalizer, and OpenAI generator
- `app/src/server/ai/landing-page.test.ts` — tests for prompt builder, normalizer, and generator mocking
- `app/src/server/services/landing-page-renderer.ts` — server-side standalone HTML renderer with inline responsive CSS
- `app/src/server/services/landing-page-renderer.test.ts` — tests for HTML output, escaping, sections, and image inclusion
- `app/src/app/api/derivations/[id]/landing-page/route.ts` — POST endpoint requiring approved derivation with outputKey
- `app/src/app/api/derivations/[id]/landing-page/route.test.ts` — tests for 404, 409, 400, success, and failure paths
- `app/src/lib/hooks/use-landing-page.ts` — TanStack Query mutation hook with toast and download open
- `app/src/lib/hooks/use-landing-page.test.tsx` — hook tests for post, success window open, and error toast
- `app/src/components/workspace/DerivationCard.tsx` — added "Generate landing page" action for approved derivations with images
- `app/src/components/workspace/DerivationCard.test.tsx` — tests for visibility, approval gating, image gating, click, and loading state
- `app/src/components/workspace/DerivationsStep.tsx` — passed `onGenerateLandingPage` and `landingPageGeneratingId` through
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` — wired `useGenerateLandingPage`, handler, and prop mapping
- `app/messages/en.json` — added `generateLandingPage`, `landingPageReady`, `landingPageFailed`
- `app/messages/pt-BR.json` — added Portuguese equivalents

### Commands Run & Results

```bash
cd app
npx drizzle-kit check
# Everything's fine 🐶🔥

npm run test -- --run src/server/ai/landing-page.test.ts src/app/api/derivations/'[id]'/landing-page/route.test.ts src/lib/hooks/use-landing-page.test.tsx src/server/services/landing-page-renderer.test.ts src/server/repositories/landing-page.test.ts src/components/workspace/DerivationCard.test.tsx
# 6 test files / 39 tests passed

npm run lint
# 0 errors; 3 pre-existing warnings in unrelated template files

DATABASE_URL=postgresql://localhost:5432/test BETTER_AUTH_SECRET=01234567890123456789012345678901 BETTER_AUTH_URL=http://localhost:3000 OPENAI_API_KEY=sk-test1234567890123456789012345678901234567890 OPENAI_TEXT_MODEL=gpt-4o OPENAI_IMAGE_MODEL=gpt-image-1 R2_ACCOUNT_ID=test R2_ACCESS_KEY_ID=test R2_SECRET_ACCESS_KEY=test R2_BUCKET=test R2_PUBLIC_BASE_URL=https://test.example.com INNGEST_EVENT_KEY=test INNGEST_SIGNING_KEY=test APP_URL=http://localhost:3000 npm run build
# Build succeeds; TypeScript clean; Better Auth low-entropy warnings acceptable with dummy env
```

### Acceptance Criteria Coverage

- [x] `landing_pages` schema and migration exist and pass drizzle check.
- [x] Repository can create queued records, complete records, fail records, and list by derivation/workspace.
- [x] AI module builds a prompt from campaign + derivation context, including client, product, notes, offer, CTA, audience, objective, constraints, and approved creative context.
- [x] AI normalizer fills required sections with safe defaults and avoids requiring fake proof.
- [x] Renderer emits complete standalone HTML with inline responsive CSS, escaped user/model copy, and optional approved creative image URL.
- [x] API POST requires workspace access, approved derivation, outputKey, and campaign; on success returns landingPage + downloadUrl + expiresAt; on failure marks landing page failed where a row was created.
- [x] Client hook posts to the endpoint, opens the returned download URL, and uses toast behavior consistent with useExport.
- [x] UI shows Generate landing page only for approved derivations with images, passes through DerivationsStep, and wires campaign page mutation.
- [x] Translations exist in en and pt-BR.
- [x] Focused tests cover the new behavior.

### Known Blockers

- Full suite still has the pre-existing `template.test.ts` environment/database blocker.
- Build without required env vars still fails at env validation; dummy env build succeeds.

### Codex Review Notes

- Codex tightened the worker output before integration so the landing-page prompt includes client, product, and campaign notes, not only objective, audience, offer, tone, constraints, and CTA variants.
- Codex reran the focused tests, drizzle check, lint, and dummy-env build in the active workspace after porting the approved diff.


---

# Security Gap Audit

Date: 2026-05-18
Mode: Read-only audit

## Completion Contract

Objective: Test the ADScale app for concrete security gaps in authentication, authorization, object access, storage/upload, generated HTML, dependency posture, and expensive AI/job endpoints.

Constraints:
- Keep product code read-only during the audit.
- Use the real app code under `app/` as source of truth.
- Use isolated worker context for delegated analysis.
- If a critical/high issue requires a fix, stop and re-plan before implementation; fixes must follow TDD.

Allowed write scope:
- `tasks/todo.md` for plan, evidence, and final review notes.

Out of scope:
- Public internet attack testing.
- Secret rotation or live account changes.
- Committing, pushing, or changing production code.

Verification commands:
- `npm audit --omit=dev --audit-level=moderate`
- route/API focused tests where a suspected gap has an existing or quick test path
- static code review of `app/src/app/api`, `app/src/server/auth`, `app/src/server/repositories`, `app/src/server/storage`, middleware, and generated HTML rendering
- Kimi/subagent read-only reviews in isolated context

Acceptance criteria:
- [ ] Attack surface mapped with reachability.
- [ ] Dependency/security tooling run and results recorded.
- [ ] Auth and workspace/IDOR checks reviewed for protected API routes.
- [ ] Storage/upload and generated HTML paths reviewed.
- [ ] Findings include file:line, exploit scenario, severity, and remediation.
- [ ] Non-findings recorded to avoid duplicate review loops.

Stop conditions:
- A critical/high exploitable gap is confirmed and needs code changes.
- Verification tooling cannot run for an environment reason that blocks confidence.
- Worker output lacks evidence and must be narrowed/re-run.

## Checklist

- [x] Review repo instructions, lessons, and current workspace state.
- [x] Create isolated Kimi worktree for read-only security pass.
- [x] Map route/auth/storage/generated-output attack surface.
- [x] Run dependency and static checks.
- [x] Review delegated findings against source evidence.
- [x] Document final review and remaining risks.

## Review

Status: Completed read-only audit. No product code was changed.

### Commands Run & Results

```bash
cd app
npm audit --omit=dev --audit-level=moderate
# Failed: 19 vulnerabilities (1 low, 10 moderate, 8 high).
# High advisories included next@16.2.4, OpenTelemetry Prometheus exporter chain,
# fast-uri, fast-xml-builder, kysely, and protobufjs.

npm ls next @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-prometheus hono drizzle-kit next-intl fast-uri fast-xml-builder kysely protobufjs --depth=4
# Confirmed vulnerable paths through next@16.2.4, inngest, better-auth/drizzle-orm,
# @aws-sdk/xml-builder, shadcn/@modelcontextprotocol, next-intl, and drizzle-kit.

npx drizzle-kit check
# Passed.

npm run test -- tests/integration/upload-flow.test.ts tests/integration/campaign-crud.test.ts src/server/services/landing-page-renderer.test.ts src/app/api/derivations/'[id]'/landing-page/route.test.ts src/app/api/derivations/'[id]'/delivery-package/route.test.ts src/app/api/derivations/'[id]'/qa/route.test.ts src/app/api/derivations/'[id]'/save-reference/route.test.ts src/app/api/client-profiles/route.test.ts src/app/api/client-profiles/'[id]'/references/route.test.ts
# Passed: 9 files / 49 tests.

npm run lint
# Passed: 0 errors, 3 pre-existing warnings in template files.

DATABASE_URL=postgresql://localhost:5432/test BETTER_AUTH_SECRET=01234567890123456789012345678901 BETTER_AUTH_URL=http://localhost:3000 OPENAI_API_KEY=sk-test1234567890123456789012345678901234567890 OPENAI_TEXT_MODEL=gpt-4o OPENAI_IMAGE_MODEL=gpt-image-1 R2_ACCOUNT_ID=test R2_ACCESS_KEY_ID=test R2_SECRET_ACCESS_KEY=test R2_BUCKET=test R2_PUBLIC_BASE_URL=https://test.example.com INNGEST_EVENT_KEY=test INNGEST_SIGNING_KEY=test APP_URL=http://localhost:3000 npm run build
# Passed. Better Auth emitted expected low-entropy warnings for dummy secret.
```

### Findings

#### HIGH-1: Regeneration can enqueue unlimited expensive image jobs

Location:
- `app/src/app/api/derivations/[id]/regenerate/route.ts:15`
- `app/src/app/api/derivations/[id]/regenerate/route.ts:40`
- `app/src/app/api/derivations/[id]/regenerate/route.ts:54`
- contrast with the active-generation guard in `app/src/app/api/campaigns/[id]/derivations/route.ts:50`

Exploit: Any authenticated user with access to a derivation can loop `POST /api/derivations/:id/regenerate`. The route accepts unbounded optional `feedback`, creates a new queued derivation each time, and immediately sends an Inngest `derivation.generate` event. The campaign generation endpoint has a queued/processing guard; this endpoint does not.

Impact: Authenticated AI-spend and worker-queue DoS.

Remediation: Add a per-source active-child guard, per-workspace/user quota or rate limit, and a max length for `feedback`.

#### HIGH-2: Vulnerable runtime dependencies are present in production graph

Location:
- `app/package.json:34`
- `app/package.json:37`
- `app/package.json:38`
- `app/package-lock.json:26`
- `app/package-lock.json:29`

Exploit: `npm audit` reports high-severity advisories for `next@16.2.4` and transitive production dependencies including the OpenTelemetry Prometheus exporter chain through `inngest`, `fast-uri`, `fast-xml-builder`, `kysely`, and `protobufjs`. The Next advisories include DoS, middleware/proxy bypass, cache poisoning, XSS, and SSRF classes.

Impact: Depends on deployment shape, but the affected packages are in the runtime dependency graph, not only dev tooling.

Remediation: Upgrade Next to the patched compatible release, then update/override vulnerable transitive packages through dependency upgrades or package-manager overrides. Re-run `npm audit --omit=dev --audit-level=moderate` after the bump.

#### MEDIUM-3: Expensive AI endpoints are repeatable without quota, dedupe, or idempotency

Location:
- `app/src/app/api/derivations/[id]/landing-page/route.ts:43`
- `app/src/app/api/derivations/[id]/landing-page/route.ts:50`
- `app/src/app/api/campaigns/[id]/plan/route.ts:67`
- `app/src/app/api/briefing-doctor/analyze/route.ts:116`
- `app/src/app/api/derivations/[id]/qa/route.ts:27`
- `app/src/app/api/campaigns/[id]/diagnosis/route.ts:54`

Exploit: An authenticated user can repeatedly trigger synchronous OpenAI calls, R2 downloads/uploads, or image analysis. Landing-page generation also creates a new DB row and uploads a new HTML object on each request.

Impact: Authenticated cost amplification and request-worker exhaustion.

Remediation: Add per-workspace AI quotas/rate limits, request dedupe for identical approved-derivation actions, and "reuse latest completed result unless force=true" behavior.

#### MEDIUM-4: Presigned uploads allow storage-cost abuse and orphaned objects

Location:
- `app/src/app/api/campaigns/[id]/assets/presign/route.ts:20`
- `app/src/app/api/campaigns/[id]/assets/presign/route.ts:52`
- `app/src/app/api/campaigns/[id]/assets/presign/route.ts:53`
- `app/src/server/storage/r2.ts:21`

Exploit: An authenticated user can repeatedly request presigned PUT URLs, upload up to 50MB per URL, and never call `/complete`. Because metadata is created only after completion, these objects are not tracked by the app and can accumulate in R2.

Impact: Authenticated storage DoS / bill growth.

Remediation: Persist pending upload records, enforce upload quotas, and add scheduled cleanup for uncompleted keys under `campaigns/:id/`.

#### MEDIUM-5: Client reference creation accepts arbitrary storage object keys

Location:
- `app/src/app/api/client-profiles/[id]/references/route.ts:20`
- `app/src/app/api/client-profiles/[id]/references/route.ts:55`
- `app/src/app/api/client-profiles/[id]/references/route.ts:60`
- `app/src/server/repositories/client-reference.ts:65`

Exploit: `POST /api/client-profiles/:id/references` verifies that the profile belongs to the caller's workspace, but accepts `assetKey` directly from the request and persists it. A user who learns another workspace's R2 key can store that key as their own reference. Current generation only passes the key as prompt text, but this becomes direct cross-workspace object confusion if references are later displayed or downloaded by key.

Impact: Tenant-integrity break and future IDOR risk.

Remediation: Create references from owned asset/derivation IDs, or validate `assetKey` against a caller-owned `campaignAssets.key` or `derivations.outputKey` row before insert.

#### MEDIUM-6: Docker build context includes `.env.docker` secrets in builder layer

Location:
- `app/.dockerignore:16`
- `app/Dockerfile:13`
- `app/Dockerfile:14`

Exploit: `.dockerignore` explicitly allows `.env.docker`, and the Dockerfile copies it into `.env.local` during the builder stage. Even if final runtime layers do not copy `.env.local`, CI cache, image build logs, or accidental builder-stage publication can expose DB, OpenAI, R2, auth, and Inngest secrets.

Impact: Build-chain secret disclosure.

Remediation: Use BuildKit secrets or runtime environment injection. Do not include real secrets in Docker context or intermediate image layers.

#### LOW-7: Campaign create/update can persist cross-workspace client profile IDs

Location:
- `app/src/app/api/campaigns/route.ts:26`
- `app/src/app/api/campaigns/route.ts:57`
- `app/src/app/api/campaigns/[id]/route.ts:30`
- `app/src/server/repositories/campaign.ts:222`
- `app/src/server/repositories/campaign.ts:304`
- `app/src/server/db/schema.ts:192`

Exploit: `clientProfileId` is accepted on campaign create/update and written directly. The DB FK proves the profile exists globally, not that it belongs to the campaign workspace. Current later lookups for selected references filter by workspace, so I did not confirm direct disclosure today.

Impact: Tenant-integrity bug and future IDOR footgun.

Remediation: When `clientProfileId` is non-null, validate `getClientProfile(workspace.id, clientProfileId)` before create/update. Normalize `selectedReferenceIds` to owned references as well.

### Non-Findings

- No unauthenticated object-data routes found. `health` is public and returns only service/timestamp.
- Campaign, derivation, asset, template, plan, export, dashboard, QA, and review routes consistently pass `workspace.id` into repository lookups/updates.
- Export paths scope through `getDerivationById(derivationId, workspaceId)` and `getApprovedDerivationsByCampaign(campaignId, workspaceId)`.
- Generated landing-page HTML escapes text and image URL before interpolation; focused renderer tests passed.
- Open redirects were not evident: auth redirects use fixed `/login`, and quick-tool redirects are server-generated relative campaign paths.
- I did not confirm user-controlled SSRF. The only server-side external image fetch found uses the URL returned by OpenAI's image API.

### Stop Condition Triggered

High-severity gaps were confirmed. Do not apply fixes inside this read-only audit. Next step should be a correction plan with TDD-first tests for regeneration limits, quota/idempotency, dependency upgrades, and tenant-owned reference validation.

# Security Gap Fixes

Date: 2026-05-18
Mode: Kimi-orchestrated implementation with Codex review/integration

## Completion Contract

Objective: Fix the concrete security gaps found in the audit without changing unrelated product behavior.

Constraints:
- Codex owns planning, review, integration, and final verification.
- Kimi must work only in an isolated worktree and must not commit, merge, push, or touch secrets.
- Keep the fix simple and local to the affected surfaces.
- Add tests before or alongside fixes for every product-code security behavior changed.
- Do not mask dependency problems by deleting functionality unless the package is unused or clearly misclassified.

Allowed write scope:
- `app/package.json`
- `app/package-lock.json`
- `app/Dockerfile`
- `app/.dockerignore`
- `app/src/app/api/**`
- `app/src/server/**`
- `app/drizzle/**`
- `app/tests/**`
- `app/src/**/*.test.ts`
- `tasks/todo.md`

Out of scope:
- Secret rotation or live infrastructure changes.
- New billing/product quota UI.
- Reworking auth providers.
- Changing public API contracts unless required for safety.
- Commit/push.

Verification commands:
- `cd app && npm audit --omit=dev --audit-level=moderate`
- `cd app && npx drizzle-kit check`
- `cd app && npm run test -- tests/integration/upload-flow.test.ts tests/integration/campaign-crud.test.ts src/server/services/landing-page-renderer.test.ts src/app/api/derivations/'[id]'/landing-page/route.test.ts src/app/api/derivations/'[id]'/delivery-package/route.test.ts src/app/api/derivations/'[id]'/qa/route.test.ts src/app/api/derivations/'[id]'/save-reference/route.test.ts src/app/api/client-profiles/route.test.ts src/app/api/client-profiles/'[id]'/references/route.test.ts`
- `cd app && npm run lint`
- `cd app && DATABASE_URL=postgresql://localhost:5432/test BETTER_AUTH_SECRET=01234567890123456789012345678901 BETTER_AUTH_URL=http://localhost:3000 OPENAI_API_KEY=sk-test1234567890123456789012345678901234567890 OPENAI_TEXT_MODEL=gpt-4o OPENAI_IMAGE_MODEL=gpt-image-1 R2_ACCOUNT_ID=test R2_ACCESS_KEY_ID=test R2_SECRET_ACCESS_KEY=test R2_BUCKET=test R2_PUBLIC_BASE_URL=https://test.example.com INNGEST_EVENT_KEY=test INNGEST_SIGNING_KEY=test APP_URL=http://localhost:3000 npm run build`

Acceptance criteria:
- [x] Regeneration has a tested active-child guard and bounded feedback input.
- [x] Repeatable expensive AI endpoints either reuse existing completed output where appropriate or enforce a tested cheap guard/idempotency check.
- [x] Presigned uploads leave a trackable pending record or otherwise enforce app-owned cleanup/quota behavior with tests.
- [x] Client reference creation validates that stored object keys belong to the current workspace.
- [x] Campaign create/update validates `clientProfileId` belongs to the current workspace.
- [x] Docker build no longer copies `.env.docker` or secrets into image layers/context.
- [x] Production dependency audit is clean at `moderate` or every remaining advisory is explicitly non-runtime/unfixable with evidence.
- [x] Existing focused behavior tests still pass.

Stop conditions:
- Dependency upgrades require a framework migration beyond this security patch.
- Kimi changes unrelated product flows or broad architecture.
- Tests cannot run because of an environmental blocker that prevents confidence.

## Checklist

- [x] Review repo instructions, lessons, current audit findings, and workspace state.
- [x] Write correction contract and allowed scope.
- [x] Create isolated Kimi worktree.
- [x] Delegate implementation with contract and verification commands.
- [x] Audit Kimi diff and evidence.
- [x] Port approved patch to the main workspace.
- [x] Rerun verification in the main workspace.
- [x] Document final review.

## Review

Status: Completed. Kimi was delegated in `/Users/jhonatan/Repos/ADScale_2-kimi-security-fixes`, but produced no file diff after exploration, so Codex applied the controlled patch in the main workspace and verified it locally.

### Changes

- Added an active-child guard and 2000-character feedback cap to derivation regeneration.
- Added idempotency/reuse guards for landing-page generation, creative plans, QA analysis, and creative diagnosis concurrency.
- Added bounded input validation for Briefing Doctor prompt fields.
- Added `pending_uploads` schema/migration plus presign/complete tracking for direct uploads.
- Added workspace ownership checks for arbitrary client reference asset keys.
- Added campaign create/update validation for `clientProfileId` and selected reference ownership.
- Removed `.env.docker` from the Docker build path/context.
- Upgraded runtime security posture: `next` and `eslint-config-next` to `16.2.6`, `next-intl` lockfile update, and package overrides for patched `postcss` and `esbuild`.

### Verification

```bash
cd app
npm audit --omit=dev --audit-level=moderate
# Passed: found 0 vulnerabilities.

npx drizzle-kit check
# Passed: Everything's fine.

npm run test -- tests/integration/upload-flow.test.ts tests/integration/campaign-crud.test.ts src/server/services/landing-page-renderer.test.ts src/app/api/derivations/'[id]'/regenerate/route.test.ts src/app/api/derivations/'[id]'/landing-page/route.test.ts src/app/api/derivations/'[id]'/delivery-package/route.test.ts src/app/api/derivations/'[id]'/qa/route.test.ts src/app/api/derivations/'[id]'/save-reference/route.test.ts src/app/api/client-profiles/route.test.ts src/app/api/client-profiles/'[id]'/references/route.test.ts
# Passed: 10 files / 56 tests.

npm run lint
# Passed: 0 errors, 3 pre-existing warnings in template files.

DATABASE_URL=postgresql://localhost:5432/test BETTER_AUTH_SECRET=01234567890123456789012345678901 BETTER_AUTH_URL=http://localhost:3000 OPENAI_API_KEY=sk-test1234567890123456789012345678901234567890 OPENAI_TEXT_MODEL=gpt-4o OPENAI_IMAGE_MODEL=gpt-image-1 R2_ACCOUNT_ID=test R2_ACCESS_KEY_ID=test R2_SECRET_ACCESS_KEY=test R2_BUCKET=test R2_PUBLIC_BASE_URL=https://test.example.com INNGEST_EVENT_KEY=test INNGEST_SIGNING_KEY=test APP_URL=http://localhost:3000 npm run build
# Passed. Better Auth low-entropy warnings were expected because dummy env vars were used.
```

### Residual Notes

- Upload cleanup is now trackable through `pending_uploads`; actual R2 object deletion for expired pending keys should be scheduled as an operational job if storage churn becomes significant.
- The Kimi worktree remains disposable and contains no useful diff.
