# Architecture Research

**Domain:** AI ad creative generation quality and format adaptation
**Researched:** 2026-06-01
**Confidence:** HIGH for repo integration points; MEDIUM for final model behavior.

## Standard Architecture

```text
Campaign Workspace UI
  -> mode config hooks/modals
  -> API routes create configured derivations
  -> Inngest derivation job resolves contract and assets
  -> OpenAI image edit/generate at target size
  -> post-processing metadata/final dimensions
  -> scoring + QA gate
  -> gallery UI displays output + hard failures + actions
```

## Component Responsibilities

| Component | Responsibility | Current Integration |
|-----------|----------------|---------------------|
| Mode config UI | Capture target format, CTA, style refs, mode intent | `useDerivationFlow`, config modals, `useCampaignWorkspace`. |
| Campaign API routes | Validate payload, create derivation rows, enqueue jobs | `campaigns/[id]/derivations`, `campaigns/[id]/restyle`, `delivery-package`. |
| Creative contract resolver | Derive effective CTA/source/style/brand/offer/target-format rules | New/internal helper recommended. |
| Prompt builder | Convert contract into non-negotiable generation instructions | `app/src/server/ai/prompt-builder.ts`. |
| Derivation job | Download inputs, call OpenAI, normalize, persist output, score | `app/src/server/jobs/derivation.ts`. |
| Scoring/QA | Separate hard failures from polish suggestions | `creative-score.ts`, `creative-qa.ts`, QA route. |
| Gallery/workspace UI | Surface generated output, status, score, QA, regeneration path | `DerivationCard`, `DerivationGrid`, campaign page hooks. |

## Recommended Project Structure

```text
app/src/server/ai/
├── prompt-builder.ts          # consumes contract, writes generation instructions
├── creative-score.ts          # model/heuristic score
├── creative-qa.ts             # checklist QA
└── creative-contract.ts       # recommended: effective per-mode contract

app/src/server/jobs/
└── derivation.ts              # generation orchestration and post-processing

app/src/app/api/campaigns/[id]/
├── derivations/route.ts       # art/format derivation creation
└── restyle/route.ts           # selected style refs + restyling derivation creation

app/src/components/workspace/
├── DerivationCard.tsx         # hard failures, QA, actions
└── DerivationGrid.tsx         # filtered output review
```

## Architectural Patterns

### Pattern 1: Effective Creative Contract

**What:** Build one object that captures generation mode, target format, effective CTA, base asset, style asset(s), brand/product/offer facts, and hard constraints.

**When to use:** Before prompt building, scoring, QA, regeneration, and UI display.

**Trade-offs:** Adds a small abstraction, but removes inconsistent interpretations of `ctaText=null`, style references, and campaign fields.

### Pattern 2: Native Target-Size Generation

**What:** Ask the model for the closest supported target aspect (`1024x1536` for portrait, `1536x1024` for landscape, `1024x1024` for square), then use `sharp` only to final project dimensions.

**When to use:** Every `format_adaptation` job.

**Trade-offs:** May crop if model still outputs poor layout, but avoids decorative blurred bars. QA/UAT must catch crop failures.

### Pattern 3: Hard Failures vs Polish Suggestions

**What:** Store and display hard-rule failures separately from subjective quality issues.

**When to use:** After every generation.

**Trade-offs:** More UI and data modeling, but prevents high visual scores from hiding invalid ad content.

## Data Flow

### Format Adaptation

```text
User selects target format(s)
  -> API creates derivation(s)
  -> contract resolver sets source asset, target format, exact content preservation
  -> prompt builder requests native layout zones
  -> OpenAI edit returns portrait/square/landscape image
  -> sharp finalizes target dimensions without blurred padding
  -> QA checks dimensions, bands, crowding, CTA/logo/text preservation
  -> UI shows output plus hard failures/regenerate action
```

### Restyling

```text
User selects base creative + style reference(s)
  -> API validates and persists/passes selected style refs
  -> contract resolver marks base as factual source, style as design source
  -> prompt forbids copying style-reference facts
  -> OpenAI edit uses base + selected style image(s)
  -> QA checks copied reference claims, CTA/brand/offer drift, text legibility
```

## Integration Points

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI -> API | Request payload | Must include selected style refs and target formats intentionally, not rely on asset ordering. |
| API -> Job | Inngest event + derivation row | Include or persist enough metadata to resolve exact contract. |
| Job -> OpenAI | Image edit/generate | Use target size; multiple input images are supported for GPT Image edits. |
| Job -> QA/scoring | Image buffer + contract | QA should compare output against the same contract used for generation. |
| QA/scoring -> UI | Derivation fields | Hard failures should be visible and drive regeneration. |

## Anti-Patterns

### Anti-Pattern 1: Asset Ordering as Business Logic

**What people do:** Pick `assets[0]` or first `style_reference`.
**Why it's wrong:** User-selected style/base can be ignored.
**Do this instead:** Persist/resolve explicit asset roles and selected IDs.

### Anti-Pattern 2: Post-Process a Bad Layout Into Correct Dimensions

**What people do:** Add blurred background and center the source.
**Why it's wrong:** Correct pixels, wrong ad.
**Do this instead:** Generate/edit natively for the target aspect, then validate.

### Anti-Pattern 3: Scoring Against a Different Contract Than Generation

**What people do:** Prompt says preserve base CTA, scorer says CTA must be none.
**Why it's wrong:** Generates false failures and misses real failures.
**Do this instead:** Score against the resolved effective creative contract.

## Sources

- OpenAI Image generation guide: https://platform.openai.com/docs/guides/image-generation/
- OpenAI Images API reference: https://platform.openai.com/docs/api-reference/images/generate
- Local repo architecture: `.planning/PROJECT.md`, `app/src/server/jobs/derivation.ts`, `app/src/app/api/campaigns/[id]/derivations/route.ts`.

---
*Architecture research for: v11.1 Qualidade de Geração e Contratos Criativos*
*Researched: 2026-06-01*
