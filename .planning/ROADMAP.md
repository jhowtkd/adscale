# Roadmap: ADScale v3.0 — Modos de Derivação Fiel

## Milestone Overview

**Version:** v3.0  
**Name:** Modos de Derivação Fiel  
**Goal:** Reposition ADScale as a campaign derivation system with two clear modes — art variation and format adaptation — plus per-piece CTAs, visual fidelity rules, and less repetitive generation.  
**Phases:** 5 (10 → 14)  
**Requirements:** 25  
**Previous milestone:** v2.0 ended at phases 6-9  

---

## Phase 10: Contrato de Dados e Migração

**Goal:** Implement new fields in schema, migrations, repositories, hooks, and types. Fallback existing campaigns to `art_variation`.

**Requirements:**
- MODE-05: Existing campaigns fallback to `Variar arte`
- DATA-01: Campaign saves `generationMode`, `ctaVariants`, `targetFormats`
- DATA-02: Derivation saves `generationMode`, `variantIndex`, `ctaText`, `format`
- DATA-03: `POST /api/campaigns` and `PATCH /api/campaigns/[id]` accept new fields
- DATA-05: Client/server types reflect new contracts without abusing `prompt` or `feedback`

**Success Criteria:**
1. Database schema includes all new fields with sensible defaults
2. Existing campaigns continue to work without migration errors
3. API accepts and validates new fields with Zod
4. TypeScript types are updated across client and server
5. Unit tests pass for normalization, fallback, and mapping logic

---

## Phase 11: UX de Criação e Briefing

**Goal:** Replace old objective with mode selection cards. Move CTAs into the brief with 3 fixed fields and mode-specific helper text.

**Requirements:**
- MODE-01: User chooses `Variar arte` or `Variar formato` when creating a campaign
- MODE-04: Chosen mode appears in brief, gallery, and derivation cards
- CTA-01: Brief shows exactly `CTA peça 1`, `CTA peça 2`, `CTA peça 3`
- CTA-02: In `Variar arte`, empty CTA skips that derivation
- CTA-03: In `Variar arte`, all empty CTAs block generation with a clear error
- CTA-04: In `Variar formato`, CTAs are optional and mapped by format: piece 1 `1:1`, piece 2 `4:5`, piece 3 `9:16`
- CTA-05: In `Variar formato`, empty CTA preserves original base creative text

**Success Criteria:**
1. Campaign creation UI shows two clear mode cards
2. Briefing form displays 3 CTA fields with labels adapting to the selected mode
3. Validation rules differ correctly between `art_variation` and `format_adaptation`
4. Old `objective` and `offer` fields are hidden from the main flow but preserved in DB
5. User can switch modes before saving the campaign

---

## Phase 12: Orquestração de Derivações

**Goal:** Remove `count` dependency. Create derivations from non-empty CTAs in art mode and from default formats in format mode. Send complete payload to Inngest.

**Requirements:**
- MODE-02: `Variar arte` generates new versions in the same format as the base creative
- MODE-03: `Variar formato` adapts the creative to `1:1`, `4:5`, and `9:16`
- DATA-04: `POST /api/campaigns/[id]/derivations` creates jobs from campaign config, not `count`

**Success Criteria:**
1. Art variation creates exactly one derivation per non-empty CTA variant
2. Format adaptation creates exactly 3 derivations (1:1, 4:5, 9:16)
3. Each derivation job carries `generationMode`, `variantIndex`, `ctaText`, `format`, and `targetFormat`
4. Inngest event payload is complete and typed
5. Worker can consume the new payload without regressions

---

## Phase 13: Prompt e Renderização Fiel

**Goal:** Update prompt builder, generation job, and sharp normalization. Enforce controlled variety, format adaptation, and logo rule.

**Requirements:**
- AI-01: Prompt clearly differentiates `art_variation` from `format_adaptation`
- AI-02: `Variar arte` demands perceptible variation in background, composition, CTA module, and visual hierarchy
- AI-03: `Variar formato` prioritizes proportion adaptation without reinventing the creative
- AI-04: Prompt includes fixed rule: do not invent logos; preserve only if present in the reference
- AI-05: Generation keeps the current fix of not passing base64 between Inngest steps
- OUT-01: Final outputs normalized with sharp to `1080x1080`, `1080x1350`, `1080x1920`

**Success Criteria:**
1. Prompt strings contain clear mode-specific instructions
2. Art variation prompts require visible differences across variants
3. Format adaptation prompts emphasize layout reflow for the target ratio
4. Logo rule is present in every derivation prompt
5. Sharp resizes and compresses all outputs to exact dimensions
6. Snapshot/string tests confirm prompt content for both modes

---

## Phase 14: Galeria, Mensagens e QA Final

**Goal:** Update labels, cards, filters, visible errors, and `Gerar mais` behavior. Validate manually with `oficial.jpg` and run the full test suite.

**Requirements:**
- OUT-02: Gallery shows labels `Peça 1/2/3` or `1:1 / 4:5 / 9:16`
- OUT-03: Cards show applied CTA when present
- OUT-04: `Gerar mais` button respects the campaign mode without creating generic batches
- OUT-05: Generation errors appear as readable messages, not raw JSON

**Success Criteria:**
1. Gallery labels reflect mode and piece index or format
2. Derivation cards display CTA text when it was explicitly provided
3. `Gerar mais` in art mode offers new CTA fields; in format mode is disabled or shows a clear message
4. Error toasts show human-readable text, not serialized error objects
5. Manual test with `oficial.jpg`:
   - `Variar arte` produces 3 visually different versions in the same format
   - `Variar formato` produces 1:1, 4:5, 9:16 preserving the original creative
6. All existing tests still pass; new tests added for v3 logic
7. Build and lint clean

---

## Phase 15: Régua de Criatividade, CTA Exato e Quick Tool de Restilização

**Goal:** Rewrite creativity templates with operational rules, enforce literal CTA text, and add a quick restyling tool to the home screen.

**Requirements:**
- CR-01: `conservative` template preserves character/product, palette, texture, typography, brand, and visual structure; changes only layout/disposition and texts.
- CR-02: `balanced` template changes layout, hierarchy, spacing, and CTA module; preserves palette, character/product, texture, and brand system.
- CR-03: `bold` template may change texture, character/visual treatment, background, layout, and creative energy; preserves brand, product, offer, and CTA.
- CTA-06: When `ctaText` exists, the prompt must require literal use without synonyms, translation, rewriting, or replacement with plan-recommended CTAs.
- CTA-07: Plan-recommended CTA suggestions become secondary context and never override `ctaText`.
- REST-01: Home screen replaces the disabled reports card with a "Restilização" quick tool.
- REST-02: Restyling modal collects: name, client/brand, objective/offer, exact CTA, notes, base image, and style reference image.
- REST-03: `POST /api/quick-tools/restyling` receives multipart form, creates a campaign, saves both images, and creates a derivation with `generationMode: "restyling"`.
- REST-04: Add `role` field to `campaign_assets`: `base` or `style_reference`, defaulting to `base` for legacy assets.
- REST-05: In generation job, `base` asset provides brand, product, palette, info, offer, and CTA; `style_reference` provides only layout, visual style, and design language.
- REST-06: Use `images.edit` with both images as input (SDK accepts array); result is saved in the campaign and user is directed to the campaign gallery.

**Success Criteria:**
1. Each creativity level contains explicit operational rules in the prompt template.
2. CTA literal enforcement appears as a critical rule in prompt output.
3. Restyling separates base and style reference correctly in job logic.
4. `POST /api/quick-tools/restyling` validates required fields and image types.
5. The route creates a campaign, two assets with correct roles, a derivation, and an Inngest event.
6. `restyling` generation calls `images.edit` with two images; `art_variation` continues using one image; `format_adaptation` continues using visual token generation.
7. Unit tests pass: `prompt-builder.test.ts`, `prompt-parser.test.ts`, `derivation-job.test.ts`, `repositories/campaign.test.ts`.
8. `npm run lint && npm run build` clean; `npx tsc --noEmit --pretty false` passes.

**Assumptions:**
- Restyling generates one image per execution.
- The CTA in the quick tool is always the final visible CTA.
- The campaign created by the quick tool appears in normal app history.
- Base image dominates brand/content; style reference dominates style/layout.

---

## Requirement Coverage

| REQ-ID | Phase | Mapped | Status |
|--------|-------|--------|--------|
| MODE-01 | 11 | ✓ | Implemented |
| MODE-02 | 12 | ✓ | Implemented |
| MODE-03 | 12 | ✓ | Implemented |
| MODE-04 | 11, 14 | ✓ | Implemented |
| MODE-05 | 10 | ✓ | Implemented |
| CTA-01 | 11 | ✓ | Implemented |
| CTA-02 | 11 | ✓ | Implemented |
| CTA-03 | 11 | ✓ | Implemented |
| CTA-04 | 11 | ✓ | Implemented |
| CTA-05 | 11 | ✓ | Implemented |
| DATA-01 | 10 | ✓ | Implemented |
| DATA-02 | 10 | ✓ | Implemented |
| DATA-03 | 10 | ✓ | Implemented |
| DATA-04 | 12 | ✓ | Implemented |
| DATA-05 | 10 | ✓ | Implemented |
| AI-01 | 13 | ✓ | Implemented |
| AI-02 | 13 | ✓ | Implemented |
| AI-03 | 13 | ✓ | Implemented |
| AI-04 | 13 | ✓ | Implemented |
| AI-05 | 13 | ✓ | Implemented |
| OUT-01 | 13 | ✓ | Implemented |
| OUT-02 | 14 | ✓ | Implemented |
| OUT-03 | 14 | ✓ | Implemented |
| OUT-04 | 14 | ✓ | Implemented |
| OUT-05 | 14 | ✓ | Implemented |
| CR-01 | 15 | ✓ | Planned |
| CR-02 | 15 | ✓ | Planned |
| CR-03 | 15 | ✓ | Planned |
| CTA-06 | 15 | ✓ | Planned |
| CTA-07 | 15 | ✓ | Planned |
| REST-01 | 15 | ✓ | Planned |
| REST-02 | 15 | ✓ | Planned |
| REST-03 | 15 | ✓ | Planned |
| REST-04 | 15 | ✓ | Planned |
| REST-05 | 15 | ✓ | Planned |
| REST-06 | 15 | ✓ | Planned |

**Coverage:** 36/36 requirements mapped across 6 phases ✓

---

## Phase Status

| Phase | Status | Tests |
|-------|--------|-------|
| Phase 10 — Contrato de Dados e Migração | ✅ Complete | Unit tests for campaign/derivation repositories |
| Phase 11 — UX de Criação e Briefing | ✅ Complete | Build passes, UI updated |
| Phase 12 — Orquestração de Derivações | ✅ Complete | Integration tests pass |
| Phase 13 — Prompt e Renderização Fiel | ✅ Complete | Prompt string tests + sharp normalization |
| Phase 14 — Galeria, Mensagens e QA Final | ✅ Complete | Build + 67 tests passing |
| Phase 15 — Régua de Criatividade, CTA Exato e Quick Tool de Restilização | ○ Planned | — |

**Plans:**
- [ ] 15-01-PLAN.md — Expand creativity templates + literal CTA + restyling mode + schema role field
- [ ] 15-02-PLAN.md — Restyling home card + API route + two-image derivation job

---

## Test Plan

- Unitários para normalização de `ctaVariants`, fallback de `generationMode` e mapeamento CTA/formato.
- Integração para criação, edição e geração de derivations nos dois modos.
- Snapshot/string tests do prompt garantindo modo, CTA, formato e regra de logo.
- Worker test garantindo que eventos carregam `generationMode`, `targetFormat`, `variantIndex`, `ctaText`.
- Manual: usar `oficial.jpg`; `Variar arte` deve gerar 3 versões visualmente diferentes no mesmo formato; `Variar formato` deve gerar `1:1`, `4:5`, `9:16` preservando a peça.
