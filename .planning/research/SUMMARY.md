# Project Research Summary

**Project:** ADScale
**Domain:** AI ad creative generation quality and format adaptation
**Researched:** 2026-06-01
**Confidence:** HIGH for architecture and UAT findings; MEDIUM for final model compliance until regenerated outputs are inspected.

## Executive Summary

v11.1 should not add a new generation mode. It should make the existing modes trustworthy. The core failure from UAT is that generated outputs can look superficially polished while violating the user's intent: format adaptation created blurred bands and crowded centered layouts; restyling copied factual claims from style references; CTA/brand assumptions diverged across prompts and scoring; and the campaign workspace did not make loading/access issues clear enough to inspect outputs.

The recommended approach is to introduce an effective creative contract before prompt building, generation, scoring, QA, regeneration, and UI display. Format adaptation must generate/edit natively for the target aspect ratio and stop using blur-fill as a fallback. Restyling must explicitly separate base factual content from style-reference visual language. QA should flag hard-rule failures separately from aesthetic suggestions.

## Key Findings

### Recommended Stack

No new package is required. Use the existing Next.js, Inngest, OpenAI Image API, Drizzle, TanStack Query, and sharp stack.

**Core technologies:**
- OpenAI Image API: generate/edit outputs at supported square, portrait, and landscape sizes.
- Inngest: keep durable generation orchestration and post-generation checks.
- sharp: final dimension normalization and lightweight image metadata checks, not decorative blur-fill for format adaptation.
- Drizzle/Postgres: persist contract metadata and hard QA/scoring failures if needed.

### Expected Features

**Must have:**
- Native format adaptation without blurred side/top/bottom bands.
- Clear source contract: base image facts vs style reference visual language.
- Effective CTA/brand/offer/product contract shared by prompt, scoring, QA, and regeneration.
- Hard-failure quality gate before approve/export.
- More diagnostic campaign workspace error states.

**Should have:**
- Structured regeneration suggestions from hard-failure reasons.
- Visible source/target contract on output cards or detail views.
- UAT fixtures for 1:1 -> 4:5/9:16 and restyling with unrelated style-reference offers.

**Defer:**
- Full visual diff/source-output comparison panel.
- Platform-specific safe-area overlays.
- Multi-turn image repair via Responses API unless single-shot edits remain unreliable.

### Architecture Approach

Build v11.1 around a `creative contract` boundary. The UI/API should capture user intent and selected assets, the job should resolve the effective contract, the prompt builder should consume it, and scoring/QA should evaluate against that same contract. This prevents mode-specific drift like `ctaText=null` being interpreted differently by generation and scoring.

**Major components:**
1. Contract resolver — source asset, style refs, target format, effective CTA, brand/product/offer facts.
2. Native format adaptation pipeline — target-size image edit plus no-blur final normalization.
3. QA/scoring gate — hard failures separated from polish suggestions.
4. Workspace/UI feedback — actionable error and output-quality visibility.

### Critical Pitfalls

1. **Correct dimensions but wrong creative** — avoid by generating at target aspect and banning blur-fill/letterboxing.
2. **Style reference factual leakage** — avoid by using style refs as visual-only and checking copied claims.
3. **CTA contract drift** — avoid by resolving one effective CTA contract per generation mode.
4. **Hard failures hidden by score** — avoid by separating blocking failures from advisory polish issues.
5. **Generic UI errors** — avoid by distinguishing auth/workspace/not-found/network/load failures.

## Implications for Roadmap

### Phase 44: Native Format Adaptation
**Rationale:** This is the most visible user complaint: `Variar tamanho` produced bands and cramped layouts.
**Delivers:** Prompt/post-processing/test/UAT changes for 9:16 and 4:5 native layouts.
**Avoids:** Correct dimensions but wrong creative.

### Phase 45: Creative Contract Resolver
**Rationale:** CTA, brand, source asset, style asset, and factual-content rules must be resolved once before all downstream systems.
**Delivers:** Shared contract semantics for generation, restyling, scoring, QA, and regeneration.
**Avoids:** CTA drift and style-reference factual leakage.

### Phase 46: Hard Quality Gate
**Rationale:** Users need to know whether an output is invalid, not just imperfect.
**Delivers:** Hard-failure classification, auto QA/scoring on completed outputs, and actionable regeneration guidance.
**Avoids:** High visual score hiding invalid ad content.

### Phase 47: Workspace Error and Review Feedback
**Rationale:** The reviewed campaign could not be inspected through the UI because the page showed a generic campaign-load error.
**Delivers:** More diagnostic campaign/derivation loading errors and visible quality status on outputs.
**Avoids:** UI state being confused with output quality.

### Phase 48: End-to-End UAT Fixtures
**Rationale:** Model behavior cannot be fully validated by unit tests.
**Delivers:** Repeatable campaign fixtures, generated output checks, browser review, and documentation of accepted failure thresholds.
**Avoids:** Shipping prompt changes without visual evidence.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack covers the milestone; official OpenAI docs verify target size/edit support. |
| Features | HIGH | Directly derived from UAT and observed local code/data. |
| Architecture | HIGH | Integration points are already present in the repo. |
| Pitfalls | MEDIUM/HIGH | Failures were observed, but prevention effectiveness requires regeneration UAT. |

**Overall confidence:** HIGH for roadmap direction; MEDIUM for exact output quality until visual re-test.

## Sources

### Primary
- OpenAI Image generation guide: https://platform.openai.com/docs/guides/image-generation/
- OpenAI Images API reference: https://platform.openai.com/docs/api-reference/images/generate
- Local repo files: `app/src/server/jobs/derivation.ts`, `app/src/server/ai/prompt-builder.ts`, `app/src/server/ai/creative-score.ts`, `.planning/PROJECT.md`.

### UAT Evidence
- Campaign `fd018597-f2c8-49f5-86d9-7ca82267605c` output review on 2026-06-01.

---
*Research completed: 2026-06-01*
*Ready for roadmap: yes*
