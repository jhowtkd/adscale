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

---

## Phase 18: Formulário Simplificado de Briefing

**Goal:** Replace the multi-step campaign brief wizard with a minimal single-page form. Only campaign name, client, and client profile are required. Key creative upload is optional at creation time.

**Requirements:**
- BRIEF-01: User can create campaign with only name, client, and client profile
- BRIEF-02: Creation form is a single page (no multi-step wizard)
- BRIEF-03: Required fields are campaign name, client, and client profile
- BRIEF-04: Key creative upload is optional at creation time

**Success Criteria:**
1. User sees a single-page campaign creation form with exactly 3 required fields
2. Form validates name, client, and client profile before allowing submission
3. Key creative upload is optional and does not block campaign creation
4. Old multi-step wizard is replaced (routes redirect or are removed)
5. UI uses existing design system (shadcn/ui components, Tailwind, i18n)

---

## Phase 19: Análise Visual e Dedução com IA

**Goal:** When user uploads a key creative, trigger async AI visual analysis to deduce campaign fields (product, objective, target audience, tone, offer, platforms). Present deduced fields in an editable form. Handle failures gracefully.

**Requirements:**
- AI-01: Key creative upload triggers automatic visual analysis via AI
- AI-02: AI deduces campaign fields from image (product, objective, target audience, tone, offer, platforms)
- AI-03: Deduced fields are presented in an editable form
- AI-04: User can edit any auto-filled field before saving
- AI-05: If analysis fails, form loads empty without blocking the flow
- AI-06: Analysis is non-blocking; upload completes independently of analysis
- AI-07: Analysis result is stored in the asset metadata

**Success Criteria:**
1. Uploading a key creative triggers async AI visual analysis automatically
2. AI returns structured deduced fields with confidence indicators
3. Deduced fields appear in editable form alongside the simplified brief fields
4. User can modify any auto-filled value before saving the campaign
5. Analysis failures are handled gracefully — form works without AI data, user sees a non-blocking warning
6. Analysis results persist in campaign asset metadata for future reference
7. Visual analysis completes within 10 seconds for typical images (≤5MB)

---

## Phase 20: Modo de Geração com Configurações Avançadas

**Goal:** Move advanced briefing settings (creativity profile, per-piece CTA, output format, derivation mode) into the generation mode screen. Add AI-powered suggestions for creativity profile and CTAs based on campaign context and visual analysis.

**Requirements:**
- GEN-01: Creativity profile (conservative, balanced, bold) configurable in generation mode
- GEN-02: Per-piece CTA configurable in generation mode with AI suggestions
- GEN-03: Output format (1:1, 4:5, 9:16) configurable in generation mode
- GEN-04: Derivation mode (art variation, format adaptation, restyling) in generation mode
- GEN-05: AI suggestions for creativity profile based on analyzed piece
- GEN-06: AI suggestions for CTAs based on campaign context

**Success Criteria:**
1. Generation mode screen shows creativity profile selector with 3 clear options
2. CTA fields appear per-piece with AI-generated suggestions that can be accepted or edited
3. Output format selector adapts to the chosen derivation mode (e.g., disabled for format adaptation)
4. AI suggests a creativity profile based on visual analysis of the uploaded piece
5. AI suggests CTAs relevant to the deduced campaign context and product
6. All advanced settings are pre-filled with sensible defaults from brief/AI analysis
7. Settings persist when user navigates back from generation mode without losing state

---

## Phase 21: Remoção do Briefing Doctor e Limpeza

**Goal:** Remove Briefing Doctor from the entire codebase — UI components, API routes, hooks, translations, and documentation. Ensure no references remain and build stays clean.

**Requirements:**
- CLEAN-01: Briefing Doctor is removed from the creation flow
- CLEAN-02: Briefing Doctor routes, hooks, and components are removed
- CLEAN-03: Briefing Doctor translations are removed from i18n files
- CLEAN-04: Briefing Doctor references are removed from documentation

**Success Criteria:**
1. No Briefing Doctor UI appears anywhere in the app (creation, edit, or campaign view)
2. All Briefing Doctor components, hooks, and API routes are deleted from the codebase
3. i18n files contain no Briefing Doctor translation keys in PT-BR or EN
4. Documentation (README, inline comments, type definitions) has no Briefing Doctor references
5. No runtime errors from missing Briefing Doctor code or broken imports
6. Build passes without Briefing Doctor imports; lint is clean
7. Existing campaigns that used Briefing Doctor still display correctly (data preserved, UI removed)

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
| BRIEF-01 | 18 | ✓ | Complete    | 2026-05-26 | BRIEF-02 | 18 | ✓ | Planned |
| BRIEF-03 | 18 | ✓ | Planned |
| BRIEF-04 | 18 | ✓ | Planned |
| AI-01 | 19 | ✓ | Complete    | 2026-05-26 |
| AI-02 | 19 | ✓ | Complete    | 2026-05-26 |
| AI-03 | 19 | ✓ | Complete    | 2026-05-26 |
| AI-04 | 19 | ✓ | Complete    | 2026-05-26 |
| AI-05 | 19 | ✓ | Complete    | 2026-05-26 |
| AI-06 | 19 | ✓ | Complete    | 2026-05-26 |
| AI-07 | 19 | ✓ | Complete    | 2026-05-26 |
| GEN-01 | 20 | ✓ | Complete    | 2026-05-26 |
| GEN-02 | 20 | ✓ | Complete    | 2026-05-26 |
| GEN-03 | 20 | ✓ | Complete    | 2026-05-26 |
| GEN-04 | 20 | ✓ | Complete    | 2026-05-26 |
| GEN-05 | 20 | ✓ | Complete    | 2026-05-26 |
| GEN-06 | 20 | ✓ | Complete    | 2026-05-26 |
| CLEAN-01 | 21 | ✓ | Planned |
| CLEAN-02 | 21 | ✓ | Planned |
| CLEAN-03 | 21 | ✓ | Planned |
| CLEAN-04 | 21 | ✓ | Planned |

**Coverage:** 57/57 requirements mapped across 10 phases ✓

---

## Phase Status

| Phase | Status | Tests |
|-------|--------|-------|
| Phase 10 — Contrato de Dados e Migração | ✅ Complete | Unit tests for campaign/derivation repositories |
| Phase 11 — UX de Criação e Briefing | ✅ Complete | Build passes, UI updated |
| Phase 12 — Orquestração de Derivações | ✅ Complete | Integration tests pass |
| Phase 13 — Prompt e Renderização Fiel | ✅ Complete | Prompt string tests + sharp normalization |
| Phase 14 — Galeria, Mensagens e QA Final | ✅ Complete | Build + 67 tests passing |
| Phase 15 — Régua de Criatividade, CTA Exato e Quick Tool de Restilização | ✅ Complete | prompt-builder tests + build clean |
| Phase 18 — Formulário Simplificado de Briefing | ✅ Complete | Build passes, 2/2 plans done |
| Phase 19 — Análise Visual e Dedução com IA | ✅ Complete | 2/2 plans complete |
| Phase 20 — Modo de Geração com Configurações Avançadas | ✅ Complete | 3/3 plans complete |
| Phase 21 — Remoção do Briefing Doctor e Limpeza | 🔄 Planned | — |

**Plans:**
7/7 plans complete
- [x] 18-01-PLAN.md — Backend API Simplification (POST accepts only name/client/clientProfileId)
- [x] 18-02-PLAN.md — Simplified Creation UI
- [x] 19-01-PLAN.md — Backend AI Analysis Infrastructure
- [x] 19-02-PLAN.md — Frontend Upload & AI Deduction UI
- [x] 20-01-PLAN.md — Backend AI Suggestions for Generation Mode
- [x] 20-02-PLAN.md — Frontend Generation Mode Step Component
- [x] 20-03-PLAN.md — Frontend Flow Integration and Translations

---

## Test Plan

- Unitários para normalização de `ctaVariants`, fallback de `generationMode` e mapeamento CTA/formato.
- Integração para criação, edição e geração de derivations nos dois modos.
- Snapshot/string tests do prompt garantindo modo, CTA, formato e regra de logo.
- Worker test garantindo que eventos carregam `generationMode`, `targetFormat`, `variantIndex`, `ctaText`.
- Manual: usar `oficial.jpg`; `Variar arte` deve gerar 3 versões visualmente diferentes no mesmo formato; `Variar formato` deve gerar `1:1`, `4:5`, `9:16` preservando a peça.
