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
- [ ] Transition to implementation — invoke writing-plans skill

## Notes

- Do not implement during brainstorming.
- Next feature should build on the current demo-ready `art_variation` path unless the user deliberately chooses a new surface.
- Direction chosen: assistive QA for approved pieces before export, not a hard export gate.
- Design approved and documented in `docs/plans/2026-05-16-creative-qa-before-export-design.md`.
