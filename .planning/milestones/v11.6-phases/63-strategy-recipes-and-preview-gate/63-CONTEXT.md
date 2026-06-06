# Phase 63: Strategy Recipes and Preview Gate - Context

**Gathered:** 2026-06-05
**Status:** Locked for execution
**Source:** v11.6 milestone, Phases 61–62 complete, `--auto` discuss defaults

<domain>

## Phase Boundary

Phase 63 converts readiness and guided-brief context into named generation strategies with plain-language tradeoffs, lets users override mapped settings, validates with one preview derivation, and shows batch credit impact before queueing the full batch.

This phase does not build client approval packages or milestone verification (Phases 64–65).

</domain>

<decisions>

## Implementation Decisions

### Product Direction

- Three strategy recipes: **Safe Iteration**, **Performance Push**, **Visual Differentiation**.
- Each recipe maps to concrete `generationMode`, `creativeLevel`, `ctaVariants`, optional `targetFormats`, and `preservationEmphasis`.
- Recipe ranking uses creative readiness dimensions, brand kit constraints, and campaign brief fields.
- User can override recipe defaults before preview or batch.
- Preview-first flow: one preview derivation (5 credits) using existing `isPreview` path and same contract/quality gate as batch.
- Batch credit cost visible before approving full generation.

### Architecture

- Pure server module `strategy-recipes.ts` for recipe catalog, suggestion ranking, config mapping, and job/credit estimation.
- Client hook `use-strategy-recipe.ts` for selection, overrides, and credit preview.
- `StrategyRecipePanel` replaces derivation chooser as the default entry when user clicks Derivar.
- `PreviewGatePanel` surfaces completed preview, batch credit estimate, approve/revise actions.
- Reuse `configureAndGenerate`, `handleGenerateDerivations({ preview: true })`, existing derivation job pipeline.

### UI

- Recipe cards show tradeoff copy and recommended badge when context ranks a recipe first.
- Override controls: creative level, CTA count/variants, generation mode (art vs format).
- Preview gate shows preview card, quality summary when available, credits for preview spent + batch estimate.
- Advanced link opens legacy `DerivarModal` chooser for power users.

### i18n

- All recipe and preview-gate copy in `strategyRecipes` namespace for `en` and `pt-BR`.

</decisions>

<specifics>

## Specific Ideas

- Existing: `use-campaign-workspace.ts` `configureAndGenerate`, `handleGenerateDerivations`, derivations POST `preview: true`.
- Existing: `creative-readiness.ts`, `guided-briefing.ts`, `use-brand-kit.ts`, `CREDIT_COSTS.image_derivation = 5`.
- Integration: `campaigns/[id]/page.tsx` derivation flow and `acoes` workspace state.

</specifics>

---

*Phase: 63-strategy-recipes-and-preview-gate*
*Context locked: 2026-06-05*
