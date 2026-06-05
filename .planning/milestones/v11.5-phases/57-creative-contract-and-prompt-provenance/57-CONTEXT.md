# Phase 57: Creative Contract and Prompt Provenance - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Make generation contracts explicit, testable, and inspectable across all derivation modes.

This phase delivers:
- One persisted, structured creative contract per generated derivation.
- Prompt provenance sufficient for owner/developer debugging: original built prompt, revised/generated prompt when available, contract, generation mode, target format, model/generation settings, and source package.
- Prompt-builder regression coverage for art variation, format adaptation, and restyling using invariant assertions plus focused snapshots.
- Prompt hard rules that preserve CTA semantics, target format, brand/client, product, offer, source assets, and factual-source boundaries.

This phase does **not** deliver a new full debug dashboard, quality scoring taxonomy changes, hard-failure classification changes, regeneration correction-brief behavior, or known-failure fixture suite. Those belong to phases 58, 59, and 60 unless a tiny helper is required to verify persistence.

</domain>

<decisions>
## Implementation Decisions

### Phase cut
- Locked: use the "persisted contract" cut selected during discussion.
- Phase 57 should persist structured data and tests first; do not build a new owner UI surface in this phase.
- Any inspectability surface should be developer/owner-only by data access, not public or beta-user-facing. A minimal route/helper for verification is acceptable if the planner finds it necessary, but a polished UI accordion or dashboard is deferred.

### Contract persistence
- Persist the effective `CreativeContract` as structured JSON on each derivation when generation starts or before prompt construction, not only as text embedded in the prompt.
- The contract must include at minimum: `generationMode`, `targetFormat`, `ctaSemantics`, `baseAssetId`, `styleAssetId`, `client`, `product`, `offer`, `constraints`, and factual-source rules.
- Extend the contract or adjacent provenance data with the source package:
  - `campaign_asset` when generation uses a campaign asset as the visual source.
  - `approved_derivation` when package format adaptation uses a parent approved output.
- For `approved_derivation`, store enough source identity to inspect later, such as parent derivation ID and output key or a normalized source descriptor.
- Resolve `baseAssetId` before prompt building where possible. Current code creates a contract with `baseAssetId: null` and only mutates it later in the restyling branch; this is not sufficiently inspectable.
- Contract persistence should avoid raw customer assets. Store IDs, keys, source kind, and prompt/provenance metadata; actual images remain in R2.

### Prompt provenance
- Keep existing `inputPrompt` behavior but make provenance structured instead of relying only on prompt text.
- Persist revised/generated prompt returned by OpenAI when available. The current job maps `result.revised_prompt` into `derivations.prompt`; planner may keep that column as the revised prompt or introduce a clearer JSON field, as long as AIC-05 is unambiguous.
- Persist or derive these debug fields: prompt builder version/hash, image model, requested image size, final target format, generation mode, source package, contract JSON, and whether image edit or generation fallback was used.
- Prompt/provenance fields are internal diagnostic data. Do not expose full prompt text to beta users and do not include it in feedback diagnostic payloads.

### Prompt tests
- Locked: use invariant assertions plus small focused snapshots.
- Invariants should assert the hard rules that must never disappear:
  - Art variation preserves important information while creative level changes composition.
  - Format adaptation rejects blurred padding, cropped poster behavior, letterboxing, stretched filler, and crowded modules.
  - Restyling treats the base image as the only factual source and the style reference as visual language only.
  - Literal CTA text, inherited CTA semantics, target format, brand/client, product, offer, and source package guidance cannot be overridden by flexible strategy/feedback.
- Focused snapshots should cover compact prompt sections rather than entire long prompts where possible, so legitimate wording changes do not create excessive churn.
- Existing prompt-builder tests can be extended, but Phase 57 should normalize the fixture style so all three derivation modes have comparable coverage.

### Contract shape normalization
- Do not create a second competing contract type. Build on `app/src/server/ai/creative-contract.ts`.
- If fields are added, keep the contract JSON serializable, stable, and safe to persist.
- CTA semantics remain explicit/inherited/absent. Inherited CTA means "CTA from the source creative is required," not "no CTA required."
- Factual-source rules should be represented in a way that downstream scoring, QA, and regeneration can consume in later phases without parsing prompt text.

### Scope guardrails
- Phase 57 may update prompt text when needed to make contract rules clear, but it should not redesign scoring/QA prompts except where tests need shared contract wording to remain coherent.
- Phase 57 may add migration/repository support for contract/provenance fields, but should not change approval/export policy.
- Phase 57 may add route/API type exposure for owner/developer inspectability if already aligned with existing derivation read patterns, but should not add user-facing debug copy.

### Claude's Discretion
- Exact column names: for example `creativeContract` plus `promptProvenance`, or one `generationProvenance` JSON field if it keeps queries simple.
- Whether prompt builder versioning is a literal version string, hash of prompt sections, or a small schema/version value.
- Exact snapshot granularity and helper names in prompt-builder tests.
- Whether contract persistence happens in `derivation.ts` directly or through a repository helper, as long as workspace-scoped patterns remain intact.

</decisions>

<specifics>
## Specific Ideas

- User selected: "Contrato persistido" for scope.
- User selected: "Invariantes + snapshots" for test strategy.
- Treat this as an auditability foundation for v11.5. Later phases should be able to answer: "Which contract did this image violate?" without reconstructing intent from prompt prose.
- The most important debugging path is for owner/developer analysis of bad beta outputs, not for beta users to read prompts.
- Good inspectability means a generated derivation can show, from stored data, what mode, format, CTA rule, brand/product/offer, source package, and base/style references were used.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/server/ai/creative-contract.ts` already defines `CreativeContract`, `CtaSemantics`, and `resolveCtaSemantics`.
- `app/src/server/ai/prompt-builder.ts` already accepts `contract?: CreativeContract | null` and branches for `art_variation`, `format_adaptation`, and `restyling`.
- `app/src/server/jobs/derivation.ts` currently resolves a transient `contract` before `buildDerivationPrompt`, stores the built prompt in `inputPrompt`, and stores `result.revised_prompt` into `prompt`.
- `app/src/server/db/schema.ts` derivations table already has `styleAssetId`, `qualityVerdict`, `hardFailures`, `polishSuggestions`, and `inputPrompt`, but does not have an explicit persisted creative contract/provenance JSON field.
- Existing tests under `app/src/server/ai/prompt-builder.test.ts` already cover CTA semantics and restyling factual-source language; Phase 57 should broaden and normalize them against AIC-02 through AIC-04.

### Established Patterns
- Derivation creation and updates flow through Drizzle schema plus repository helpers in `app/src/server/repositories/derivation.ts`.
- Generation jobs use Inngest steps and direct DB updates inside `app/src/server/jobs/derivation.ts`.
- Prompt tests are Vitest tests with direct string assertions; keep this style and add focused snapshots rather than introducing a new test framework.
- Feedback diagnostics from v11.4 deliberately strip prompt-like keys; keep prompt/provenance debug data in derivation-owned storage, not feedback payloads.

### Integration Points
- `app/src/server/db/schema.ts`: add persisted contract/provenance field(s) on `derivations`.
- `app/drizzle/*`: add migration for new field(s).
- `app/src/server/repositories/derivation.ts`: add typed update/create helpers where useful.
- `app/src/server/jobs/derivation.ts`: resolve source package and full contract before prompt building; persist contract/provenance as part of generation.
- `app/src/server/ai/prompt-builder.ts`: expose or refactor stable prompt sections if needed for small snapshots.
- `app/src/server/ai/prompt-builder.test.ts` and/or existing unit test mirrors: add comparable mode coverage for art variation, format adaptation, and restyling.

</code_context>

<deferred>
## Deferred Ideas

- Full owner debug dashboard or derivation-card debug accordion.
- Scoring/QA taxonomy changes and hard-failure classification changes; Phase 58 owns this.
- Feedback-informed regeneration correction briefs; Phase 59 owns this.
- Synthetic/sanitized quality fixture suite and full manual verification guide; Phase 60 owns this.
- Model/provider A/B testing, automatic multi-attempt regeneration, or large-scale visual eval harness.

</deferred>

---

*Phase: 57-creative-contract-and-prompt-provenance*
*Context gathered: 2026-06-05*
