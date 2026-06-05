# Roadmap: ADScale v11.0 — Fluxos de Derivação Coerentes

## Overview

**Milestone goal:** Each option in the "Derivar criativo" modal does what its label promises — manual config, AI-assisted config, single-format resize, or multi-format batch — instead of jumping straight to generation with hardcoded defaults.

**Current gap (baseline):**
- `handleDerivarSelect` in `campaigns/[id]/page.tsx` calls `configureAndGenerate` immediately
- Manual vs auto art variation differs only by `creativeLevel` balanced vs bold
- Single format adaptation hardcodes `["1:1"]`; batch hardcodes all three without user input
- Phase 20 generation-mode UI exists in backend/schema but is not wired to Derivar entry points

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 40 | Roteamento e contratos | Stop silent auto-generate; define flow state machine | DRV-07, DRV-08 | 4 |
| 41 | Variação artística | Manual + AI-assisted config modals before queue | DRV-01..04 | 5 |
| 42 | Adaptação de formato | Single- and multi-format pickers before queue | DRV-05, DRV-06 | 4 |
| 43 | Verificação | Tests and regression guard for Estilizar | DRV-09, DRV-10 | 4 |

**10 requirements** | **4 phases** | All covered ✓

---

## Phase 40: Roteamento e contratos

**Goal:** Replace the immediate `configureAndGenerate` shortcut with an explicit multi-step flow from `DerivarModal` to the correct configuration surface.

**Requirements:** DRV-07, DRV-08

**Success Criteria:**
1. Clicking any Derivar option closes the chooser and opens the next step — never queues generation directly from the 2×2 grid
2. Campaign workspace state tracks which derivation intent was selected (`manual_art`, `auto_art`, `single_format`, `batch_format`)
3. Modal copy in PT-BR and EN matches the four intents; "Variir tamanhos" typo fixed to "Variar tamanhos"
4. Existing `configureAndGenerate` is only invoked from an explicit Confirm action in a config step

**Key files:** `DerivarModal.tsx`, `campaigns/[id]/page.tsx`, `messages/pt-BR.json`, `messages/en.json`

**Depends on:** Phase 39 (v10.0 complete)

---

## Phase 41: Variação artística

**Goal:** Deliver the two art-variation paths — manual configuration and AI-assisted configuration — reusing campaign fields (`creativeLevel`, `ctaVariants`) and existing suggestion APIs where possible.

**Requirements:** DRV-01, DRV-02, DRV-03, DRV-04

**Success Criteria:**
1. "Criar novas variações" opens a config modal/ panel with creativity profile selector and up to 3 CTA inputs
2. User confirms manual config → campaign PATCH includes chosen `creativeLevel` + `ctaVariants` → derivations queue with `generationMode: art_variation`
3. "Gerar novas variações" opens a config step with AI-suggested CTAs and creativity profile pre-filled (from analyze/preflight/plan context)
4. User can edit AI suggestions before confirm; generation uses edited values, not hardcoded fallbacks
5. Art-variation jobs keep base asset format (no aspect-ratio change)

**Key files:** New `ArtVariationConfigModal.tsx` (or extend existing generation UI), `use-campaign-workspace.ts`, preflight/analyze hooks, `api/campaigns/[id]/derivations/route.ts`

**Depends on:** Phase 40

**Reuse:** v5 GEN-01..06 patterns from Phase 20 research; `buildDerivationPrompt` creativity templates already exist

---

## Phase 42: Adaptação de formato

**Goal:** Let users choose target format(s) before format-adaptation generation instead of hardcoded arrays.

**Requirements:** DRV-05, DRV-06

**Success Criteria:**
1. "Variar tamanhos" opens a single-select format picker (1:1, 4:5, 9:16); exactly one format sent in `targetFormats`
2. "Criar derivações de tamanhos" opens multi-select with all three pre-selected; user can deselect before confirm
3. Confirm queues one derivation job per selected format with `generationMode: format_adaptation`
4. API validation remains consistent (`format_adaptation` single-format path accepts 1 item; batch accepts 2–3)

**Key files:** New `FormatAdaptationConfigModal.tsx`, `campaigns/[id]/page.tsx`, `api/campaigns/[id]/route.ts` validation

**Depends on:** Phase 41

---

## Phase 43: Verificação

**Goal:** Lock behavior with tests and ensure Estilizar remains a separate, unaffected workflow.

**Requirements:** DRV-09, DRV-10

**Success Criteria:**
1. Unit/integration tests assert each Derivar path produces correct PATCH payload and triggers derivations queue
2. Regression test: Estilizar modal still opens from ActionCards and submits restyling without Derivar state interference
3. Manual UAT checklist passes for all four Derivar options on a campaign with uploaded base creative
4. All existing tests continue passing; no new ESLint errors in touched files

**Key files:** `DerivarModal` flow tests, `campaigns/[id]/page` handler tests, `EstilizarModal` smoke test

**Depends on:** Phase 42

---

## Phase numbering note

Phases continue from v10.0 (35–39). v11.0 uses **40–43**.

---
*Roadmap created: 2026-06-01*
*Milestone: v11.0 Fluxos de Derivação Coerentes*
