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
