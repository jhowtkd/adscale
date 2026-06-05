# Phase 60: Quality Fixtures and Verification - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Mode:** Auto (recommended defaults from PROJECT.md, REQUIREMENTS.md, Phases 57–59, and existing test patterns)

<domain>
## Phase Boundary

Close the v11.5 quality loop with repeatable verification artifacts: known-failure fixtures, regression tests across prompt → score/QA → gate → regeneration, and handoff documentation for manual evaluation.

This phase delivers:
- A centralized, synthetic quality fixture catalog for six known failure modes (no real customer/private creatives).
- Automated regression tests linking fixtures to prompt contract snapshots, score/QA normalization, hard-failure classification, and regeneration correction briefs.
- A manual verification guide for one complete quality loop (generation prompt → output → score → QA → hard failure → regeneration suggestion → regenerated result).
- Explicit documentation of residual model-dependent limitations (text rendering, visual consistency, precise composition).
- Full automated validation: focused fixture tests, lint, and build.

This phase does **not** deliver provider/model migration, automatic multi-attempt regeneration loops, owner analytics dashboards, large-scale visual eval harness with real customer assets, or new hard-failure taxonomy codes beyond Phase 58.

</domain>

<decisions>
## Implementation Decisions

### Fixture catalog shape (FIX-01)
- **D-01:** Locked: add a single typed fixture catalog module at `app/src/server/ai/quality-fixtures.ts` exporting `QUALITY_FIXTURES` (array) and `QualityFailureMode` union. Fixtures are **structured synthetic data** (contracts, model-output-shaped score/QA JSON, expected gate outcomes) — not committed real customer images.
- **D-02:** Locked: cover exactly six failure modes from REQUIREMENTS, one primary fixture each (additional variants optional if they fit context budget):
  - `wrong_cta` → expected `cta_drift` (explicit or inherited CTA contract)
  - `cropped_text_logo` → expected `cropped_critical_content`
  - `style_reference_contamination` → expected `copied_style_reference_facts` (restyling + style reference)
  - `poor_format_adaptation` → expected `invalid_format_layout` (format_adaptation mode)
  - `weak_preservation` → expected hard failure via `informationPreservation` and/or score-issue promotion (product/offer/brand loss)
  - `low_legibility` → expected `unreadable_required_text`
- **D-03:** Each fixture includes: `id`, `failureMode`, `label`, `contract`, `rawQaModelOutput`, optional `rawScoreModelOutput`, `expectedHardFailureCodes`, `expectedVerdict`, and optional `expectedRegenerationSnippets` (strings that must appear in `buildRegenerationCorrectionBrief` output).
- **D-04:** Fixture contracts reuse fictional brand "Acme Demo" / product "Widget Pro" / offer "Auditoria gratuita" — same style as `prompt-builder.test-fixtures.ts`. No PII, no paths under user Desktop, no imports from `app/scripts/test-creatives.ts` ad directories.

### Prompt regression (FIX-02)
- **D-05:** Locked: extend prompt contract regression using fixture contracts — add `app/tests/unit/ai/quality-prompt-regression.test.ts` that imports `QUALITY_FIXTURES` and asserts mode-appropriate invariants plus compact snapshots (reuse `extractPromptHardRulesSection`, `extractPromptModeSection`, `extractPromptRestylingFactualSourceSection` from `prompt-builder.ts`).
- **D-06:** All three derivation modes (`art_variation`, `format_adaptation`, `restyling`) must have at least one fixture-linked snapshot or invariant block in the new regression file. Do not duplicate entire `prompt-builder.test.ts` — focus on failure-mode contracts and cross-mode matrix coverage.
- **D-07:** Snapshots remain compact section extracts only (Phase 57 pattern); never snapshot full prompts.

### Score/QA/gate/regeneration regression (FIX-03)
- **D-08:** Locked: add `app/tests/unit/ai/quality-fixture-pipeline.test.ts` with parameterized tests over `QUALITY_FIXTURES`:
  1. `normalizeCreativeQaResult(fixture.rawQaModelOutput)` → checklist statuses preserved
  2. `normalizeCreativeScoreResult` when `rawScoreModelOutput` present
  3. `classifyCreativeQualityGate` → `expectedHardFailureCodes` and `expectedVerdict`
  4. `buildRegenerationCorrectionBrief` → includes `expectedRegenerationSnippets` and contract preservation tail
- **D-09:** Pipeline tests import taxonomy/gate/brief modules directly — no OpenAI calls, no image bytes required.
- **D-10:** Existing unit tests (`creative-quality-gate.test.ts`, `creative-score.test.ts`, `creative-qa.test.ts`) stay; new file is the **fixture-linked matrix** proving end-to-end classification per failure mode.

### Manual verification guide (FIX-04)
- **D-11:** Locked: create `.planning/phases/60-quality-fixtures-and-verification/60-HANDOFF.md` following the Phase 56 handoff pattern (`56-HANDOFF.md`).
- **D-12:** Guide must walk through one complete loop with numbered steps: (1) inspect stored `creativeContract` + `promptProvenance` on a derivation, (2) review generated `inputPrompt` / revised prompt, (3) run or inspect score breakdown + `scoreIssues`, (4) run or inspect QA checklist, (5) confirm `qualityVerdict` + `hardFailures` vs polish, (6) read `regenerationSuggestion` / correction brief preview, (7) trigger user-confirmed regeneration and verify child `feedback` + `regenerationCorrectionBrief` + inherited contract.
- **D-13:** Include dev/owner paths only (workspace campaign gallery, derivation review modal, optional `POST /api/derivations/[id]/qa`, regenerate dialog) — not beta-user prompt visibility.
- **D-14:** Reference automated fixture test commands executors can run before manual spot-check.

### Residual limitations (FIX-05)
- **D-15:** Locked: create `.planning/phases/60-quality-fixtures-and-verification/60-LIMITATIONS.md` documenting model-dependent limits that fixtures/tests cannot eliminate:
  - Text rendering accuracy (CTA/headline spelling, kerning, small legal copy)
  - Visual consistency across regenerations and modes
  - Precise composition/layout control (especially format adaptation edge cases)
  - Vision-model scoring/QA variability (why normalization + hard-failure gate exist)
- **D-16:** Link limitations to what automated fixtures **do** catch (contract/prompt regressions, classification wiring) vs what still needs human review.

### Validation and scope guardrails
- **D-17:** Add `60-VALIDATION.md` with per-plan focused test commands and final `npm test` / `npm run lint` / `npm run build` gate (mirror Phase 57 validation style).
- **D-18:** Phase 60 must not add migrations, API surface changes, or UI features unless required to run documented manual steps (prefer documenting existing flows).
- **D-19:** Do not commit binary fixtures copied from production; optional tiny synthetic PNGs only if an E2E step truly needs bytes — default is structured fixtures only.

### Claude's Discretion
- Exact fixture IDs and internal helper names in `quality-fixtures.ts`.
- Whether `weak_preservation` maps to `informationPreservation` hard failure, `wrong_brand`/`unsupported_offer`, or score-issue promotion — must produce at least one hard failure aligned with preservation loss.
- Additional secondary fixtures per mode if context budget allows.
- Whether `60-LIMITATIONS.md` is standalone or merged into `60-HANDOFF.md` — prefer standalone file per FIX-05, with cross-links.

</decisions>

<specifics>
## Specific Ideas

- Auto mode selected recommended defaults: structured TypeScript fixtures + Vitest regression matrix, not a new visual eval framework.
- Phases 57–59 built contracts, taxonomy, normalization, gate, and regeneration briefs — Phase 60 proves they stay aligned for known beta failure categories.
- `prompt-builder.test-fixtures.ts` and scattered gate tests are the pattern to centralize, not replace.
- `app/scripts/test-creatives.ts` uses local Desktop paths — **do not** wire Phase 60 fixtures to that script; keep CI-safe paths only.
- Manual guide audience: platform owner / developer validating a bad beta output, same as Phase 56 feedback handoff.

</specifics>

<canonical_refs>
## Canonical References

### Requirements and milestone
- `.planning/REQUIREMENTS.md` — FIX-01 through FIX-05
- `.planning/ROADMAP.md` — Phase 60 scope and success criteria
- `.planning/PROJECT.md` — v11.5 quality goals and out-of-scope (real customer fixtures)

### Upstream phase contracts
- `.planning/phases/57-creative-contract-and-prompt-provenance/57-CONTEXT.md` — prompt snapshots, contract persistence
- `.planning/phases/58-scoring-and-qa-alignment/58-CONTEXT.md` — taxonomy, normalization, hard-failure codes
- `.planning/phases/59-feedback-informed-regeneration/59-CONTEXT.md` — correction brief builder, regeneration persistence

### Handoff pattern
- `.planning/phases/56-verification-and-privacy-audit/56-HANDOFF.md` — structure for owner/developer verification docs

### Code anchors
- `app/src/server/ai/prompt-builder.test-fixtures.ts` — fictional contract/campaign fixtures
- `app/src/server/ai/creative-quality-taxonomy.ts` — dimension IDs and regex patterns
- `app/src/server/ai/regeneration-correction-brief.ts` — brief assembly for regeneration tests
- `app/tests/unit/ai/creative-quality-gate.test.ts` — existing per-code classification tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `prompt-builder.test-fixtures.ts` — `campaignFixture`, mode contract fixtures, `derivationConfigFromContract`.
- `prompt-builder.test.ts` — compact snapshot helpers (`extractPromptHardRulesSection`, etc.).
- `creative-quality-gate.test.ts` — per-code hard failure mapping (needs fixture-linked matrix).
- `creative-score.test.ts`, `creative-qa.test.ts` — normalization unit tests.
- `regeneration-correction-brief.test.ts` — brief assembly patterns.
- `app/tests/fixtures/base.png`, `style.png` — generic E2E images (unrelated to failure modes; do not repurpose as quality failure exemplars without sanitization).

### Established Patterns
- Vitest unit tests under `app/tests/unit/ai/` and `app/src/server/ai/*.test.ts`.
- Inline snapshots for compact prompt sections only.
- Phase handoff docs in `.planning/phases/{NN}-*/{NN}-HANDOFF.md`.
- Validation docs `{NN}-VALIDATION.md` with focused npm test commands.

### Integration Points
- `app/src/server/ai/quality-fixtures.ts` (new) — exported catalog consumed by regression tests.
- `app/tests/unit/ai/quality-prompt-regression.test.ts` (new) — FIX-02.
- `app/tests/unit/ai/quality-fixture-pipeline.test.ts` (new) — FIX-03.
- `.planning/phases/60-quality-fixtures-and-verification/60-HANDOFF.md` (new) — FIX-04.
- `.planning/phases/60-quality-fixtures-and-verification/60-LIMITATIONS.md` (new) — FIX-05.
- `.planning/phases/60-quality-fixtures-and-verification/60-VALIDATION.md` (new) — phase validation contract.

</code_context>

<deferred>
## Deferred Ideas

- Large-scale visual eval harness with consented real customer creatives (AIF-FUT-03).
- Automated multi-attempt regeneration loop (AIF-FUT-01).
- Model/provider A/B testing (AIF-FUT-02).
- Owner dashboard analytics for quality trends (AIF-FUT-04).
- Fine-tuned custom scoring model (AIF-FUT-05).
- Wiring `app/scripts/test-creatives.ts` to committed fixtures (local-only script stays separate).

</deferred>

---

*Phase: 60-quality-fixtures-and-verification*
*Context gathered: 2026-06-05*
