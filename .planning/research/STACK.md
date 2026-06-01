# Stack Research

**Domain:** AI ad creative generation quality and format adaptation
**Researched:** 2026-06-01
**Confidence:** HIGH for current stack fit; MEDIUM for model behavior because output quality still requires UAT.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js App Router | 16.2.6 | Campaign workspace and API routes | Existing app framework; keep changes scoped to current route/job boundaries. |
| React | 19.2.4 | Workspace UI, gallery, modals | Existing UI stack; enough for richer error states and output review affordances. |
| Drizzle ORM + PostgreSQL | Existing repo stack | Persist campaigns, assets, derivations, scoring, QA | Existing schema already stores `inputPrompt`, `scoreIssues`, QA fields, and derivation metadata. |
| Inngest | 4.4.0 | Durable generation jobs | Existing derivation pipeline uses jobs, retries, realtime status, and post-generation scoring. |
| OpenAI Image API | `OPENAI_IMAGE_MODEL` env | Image edits/generation | Official docs support GPT Image edits with multiple input images and portrait/landscape/square output sizes. |
| sharp | 0.33.0 | Output dimension normalization and image inspection | Existing dependency; useful for metadata checks and post-processing guardrails. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | Existing | Input contracts | Validate generation-mode payloads, selected style refs, QA payloads, and any future quality-gate options. |
| @tanstack/react-query | Existing | Fetching campaign/derivation state | Keep derivation polling and workspace error state consistent. |
| OpenAI Responses/Image APIs | Current official API | Text/image review and generation | Use Image API for single edit jobs; consider Responses image tool only if multi-turn edits become necessary. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest | Focused unit/integration tests | Cover prompt contracts, post-processing, route payloads, scoring normalization, and hooks. |
| Playwright/browser checks | Visual UAT | Required for campaign workspace loading/error state and generated output review. |
| `npm run build` | Route/type validation | Required because Next route exports and server/client boundaries can fail outside focused tests. |

## Stack Additions

No new package is needed for v11.1. The milestone should improve contracts and orchestration with existing dependencies.

Potential non-package additions:
- A small internal quality-gate module around generation modes, expected CTA behavior, brand/offer preservation, and image-layout red flags.
- A lightweight image metadata/check helper using `sharp` to detect output dimensions and possible blank/blurred border bands.
- Stricter typed metadata for selected style reference IDs if restyling must preserve the exact user-selected style image.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Improve current Image API edit prompts and guards | Switch format adaptation to Responses API image tool | Only if single-shot edits remain unreliable after prompt/post-processing gates. |
| Native layout generation at target OpenAI size | Generate square then adapt with CSS/sharp | Avoid for production creative; this caused pasted posters and blurred bars. |
| Internal QA/scoring gate | Manual user inspection only | Manual review remains useful, but bad outputs should be flagged before approval/export. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Blurred padding/letterbox post-processing for format adaptation | It creates the exact failure users rejected: bands plus center-pasted content. | Generate/edit at portrait/landscape target size and only use post-processing as a hard crop/metadata normalizer. |
| Treating `ctaText=null` as "no CTA" for every mode | Restyling can inherit CTA from the base image; scoring then flags false violations. | Resolve an effective CTA contract per mode before prompt/scoring/QA. |
| First `style_reference` wins | User-selected style files can be ignored if the job reselects from all assets. | Persist or pass selected style asset IDs into the job. |
| One blended quality score | Hides hard-rule failures behind a visually decent score. | Separate hard failures from polish/legibility suggestions. |

## Version Compatibility

| Package/API | Compatible With | Notes |
|-------------|-----------------|-------|
| OpenAI GPT Image models | Sizes `1024x1024`, `1024x1536`, `1536x1024`, `auto` | Official docs list portrait/landscape/square sizes for GPT Image models. |
| OpenAI Images Edits | Multiple images for GPT Image models | Official API reference allows arrays of input images for GPT Image edits; this supports base + style reference workflows. |
| sharp normalization | Generated PNG outputs | Use for metadata and final dimensions, but avoid decorative band generation for format adaptation. |

## Sources

- OpenAI Image generation guide: https://platform.openai.com/docs/guides/image-generation/ — verified Image API vs Responses API, output customization, size options.
- OpenAI Images API reference: https://platform.openai.com/docs/api-reference/images/generate — verified edit endpoint inputs and GPT Image size constraints.
- Local repo: `app/src/server/jobs/derivation.ts`, `app/src/server/ai/prompt-builder.ts`, `app/src/server/ai/creative-score.ts`.

---
*Stack research for: v11.1 Qualidade de Geração e Contratos Criativos*
*Researched: 2026-06-01*
