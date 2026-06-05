# Phase 57: Creative Contract and Prompt Provenance - Research

**Researched:** 2026-06-05
**Phase:** 57 - Creative Contract and Prompt Provenance
**Question:** What do we need to know to plan persisted creative contracts, prompt provenance, and prompt regressions for all derivation modes?

## Summary

Phase 57 should extend the existing derivation pipeline rather than create a parallel debug system. The repo already has the core pieces:

- `CreativeContract` and CTA semantics in `app/src/server/ai/creative-contract.ts`.
- Mode-specific prompt building in `app/src/server/ai/prompt-builder.ts`.
- Contract creation, prompt persistence, image generation, scoring, and quality gate orchestration in `app/src/server/jobs/derivation.ts`.
- Derivation storage in `app/src/server/db/schema.ts` and `app/src/server/repositories/derivation.ts`.
- Existing prompt, repository, and derivation job tests.

The planning gap is that the effective contract is currently transient. `derivation.ts` builds a `CreativeContract`, passes it to prompt/scoring/quality gate, stores `inputPrompt`, and stores the OpenAI `revised_prompt` in `prompt`, but it does not persist the structured contract or a normalized provenance object. `baseAssetId` is also initialized as `null` and only mutated later in the restyling path, so the stored/debuggable intent can be incomplete.

## Current Implementation Findings

### Creative contract

`app/src/server/ai/creative-contract.ts` currently defines:

- `CtaSemantics`: `explicit`, `inherited`, `absent`.
- `CreativeContract`: `generationMode`, `targetFormat`, `ctaSemantics`, `baseAssetId`, `styleAssetId`, `client`, `product`, `offer`, `constraints`.
- `resolveCtaSemantics`, which treats missing/empty CTA as inherited.

This type is the correct anchor. Phase 57 should not introduce another competing contract shape. It should extend this module with serializable provenance-supporting types if needed, for example source-package and factual-source descriptors.

### Derivation schema

The `derivations` table already has useful AI/debug fields:

- `prompt` - currently receives `result.revised_prompt || derivation.prompt || ""`.
- `inputPrompt` - built prompt persisted before image generation.
- `generationMode`, `format`, `ctaText`, `styleAssetId`.
- score/QA/gate fields from prior phases.

It does not have a structured `creative_contract`, `prompt_provenance`, or equivalent JSONB field. Phase 57 needs a migration and Drizzle schema update.

The last app migration is `0026_feedback_reports.sql`. There is historical migration duplication around `0018/0019 input_prompt`, so the next migration should be named explicitly and avoid reusing previous numbers or columns.

### Derivation job

`app/src/server/jobs/derivation.ts` currently resolves:

- `effectiveGenerationMode`
- `targetFormat`
- `effectiveCtaText`
- transient `contract`
- `usesParentOutput`
- `openaiSize`

Then it:

1. Builds `prompt`.
2. Persists `inputPrompt`.
3. Calls OpenAI image edit/generate.
4. Returns `outputKey`, `revisedPrompt`, `targetFormat`, `effectiveGenerationMode`.
5. Marks the derivation completed with `prompt: generated.revisedPrompt`.
6. Passes the same in-memory `contract` to scoring and quality gate.

Planning implications:

- Contract/provenance persistence should happen before generation or in the same update as `inputPrompt`, so failed outputs can still be debugged.
- `baseAssetId` and source package should be resolved before `buildDerivationPrompt`.
- The generated return payload should include the provenance details that are only known after the OpenAI call, such as returned revised prompt, request size, output key, and image edit/generation path.
- Avoid relying on mutable object updates such as `contract.baseAssetId = baseAsset.id` inside a later branch.

### Prompt builder

`app/src/server/ai/prompt-builder.ts` already has strong branches for:

- `art_variation`: preservation, anti-cropping, creative level, fallback preservation.
- `format_adaptation`: native layout rebuild, module preservation, no bands, no poster, 4:5/9:16 layout guidance.
- `restyling`: base image factual source vs style reference visual language.

Existing prompt tests assert many invariant phrases. Phase 57 should add:

- compact snapshots for the non-negotiable hard-rules/contract sections,
- invariant tests that prove flexible guidance cannot override CTA, format, source package, brand/product/offer, or factual-source rules,
- coverage for all three modes using comparable fixtures.

Do not convert the full long prompt into one giant brittle snapshot.

### Repository tests

`app/src/server/repositories/derivation.ts` already has typed update helpers for score, QA, and quality gate. Adding a repository helper for contract/provenance persistence will make this behavior easier to unit test than embedding more direct DB updates inside the job.

Existing repository tests under `app/src/server/repositories/derivation.test.ts` mock DB updates and can be extended to cover the new helper.

### Job tests

`app/src/server/jobs/derivation.test.ts` already verifies package format adaptation, OpenAI requests, quality gate calls, and prompt behavior indirectly. The DB mock currently returns chainable update/set/where calls; Phase 57 should either:

- assert the new repository helper is called with contract/provenance data, or
- improve DB mock capture enough to inspect `creativeContract` and `promptProvenance` updates.

The repository-helper path is lower risk and aligns with existing patterns.

## Planning Recommendations

### Data shape

Prefer two JSONB fields on `derivations`:

- `creativeContract`: durable resolved contract used by generation.
- `promptProvenance`: debug metadata around how the prompt/image request was produced.

This keeps the contract independently consumable by later scoring/QA/regeneration phases while allowing provenance to evolve.

Suggested persisted contract fields:

- `generationMode`
- `targetFormat`
- `ctaSemantics`
- `baseAssetId`
- `styleAssetId`
- `client`
- `product`
- `offer`
- `constraints`
- `sourcePackage`
- `factualSourceRules`

Suggested provenance fields:

- `schemaVersion` or `promptBuilderVersion`
- `inputPrompt`
- `revisedPrompt`
- `model`
- `requestedSize`
- `outputKey`
- `sourcePackage`
- `source` descriptor with campaign asset or approved derivation IDs/keys
- `imageOperation`: `edit`, `generation_fallback`, or `generate`
- `createdAt`/`updatedAt` where useful

Do not store raw image blobs or feedback diagnostic payloads here.

### Plan split

Use two executable plans:

1. Persist contract/provenance in schema, repository, and derivation job.
2. Normalize prompt tests with invariants plus compact snapshots and run focused validation.

Plan 2 should depend on Plan 1 because prompt tests can use the finalized contract/source-package shape.

## Validation Architecture

Phase 57 should validate at three levels:

1. Contract and persistence validation
   - Unit tests for contract/provenance type helpers if created.
   - Repository tests prove new JSONB fields are persisted through workspace-scoped updates.
   - Job tests prove completed derivations record a structured contract and provenance for campaign assets and approved-derivation package adaptation.

2. Prompt contract validation
   - Invariant tests for all three modes:
     - art variation preserves required information and respects selected creative level,
     - format adaptation rejects padding/cropped poster/letterboxing behavior,
     - restyling treats base image as factual source and style reference as visual language only.
   - Compact snapshots for hard-rules/source-package prompt sections.
   - Tests prove literal CTA, inherited CTA, target format, brand/product/offer, and source-package instructions are earlier/stronger than flexible strategy, feedback, references, and brand memory.

3. Build/schema validation
   - `cd app && npm test -- src/server/repositories/derivation.test.ts src/server/jobs/derivation.test.ts src/server/ai/prompt-builder.test.ts tests/unit/prompt-builder.test.ts`
   - `cd app && npm run build`
   - If migration generation/check tooling is available during execution, run the repo's Drizzle check/generate flow without applying production migrations.

## Risks

- Incomplete `baseAssetId`: the current contract starts with `baseAssetId: null`. If the plan only persists the current object, restyling/debug records stay incomplete.
- Duplicate debug truth: storing contract-like data in both `creativeContract` and `promptProvenance` can drift. Keep contract authoritative and let provenance reference or embed the same object intentionally.
- Prompt snapshot brittleness: full prompt snapshots will churn frequently. Snapshot only compact sections and keep invariants for non-negotiable behavior.
- Privacy leakage: full prompts are internal diagnostics and should not be copied into feedback reports or beta-user UI.
- Migration numbering: the repo has prior migration numbering collisions. Use the next explicit migration number and verify file names before writing.

## Sources

- Phase context: `.planning/phases/57-creative-contract-and-prompt-provenance/57-CONTEXT.md`
- Requirements: `.planning/REQUIREMENTS.md`
- Roadmap: `.planning/ROADMAP.md`
- Project state: `.planning/STATE.md`
- Existing contract: `app/src/server/ai/creative-contract.ts`
- Prompt builder/tests: `app/src/server/ai/prompt-builder.ts`, `app/src/server/ai/prompt-builder.test.ts`, `app/tests/unit/prompt-builder.test.ts`
- Derivation job/tests: `app/src/server/jobs/derivation.ts`, `app/src/server/jobs/derivation.test.ts`, `app/tests/integration/derivation-job.test.ts`
- Persistence: `app/src/server/db/schema.ts`, `app/src/server/repositories/derivation.ts`, `app/src/server/repositories/derivation.test.ts`, `app/drizzle/`

## RESEARCH COMPLETE

Research is complete and ready for planning.

---

*Research complete: 2026-06-05*
