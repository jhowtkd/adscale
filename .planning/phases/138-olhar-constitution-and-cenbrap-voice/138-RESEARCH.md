# Phase 138: Olhar Constitution and Cenbrap Voice - Research

**Researched:** 2026-06-19
**Domain:** ADScale creative advisor foundation, art-direction vocabulary, client voice overlay, vocabulary audit
**Confidence:** HIGH

## Summary

Phase 138 should be a foundation slice, not a partial rewrite of the whole advisor. The current code already has useful hardening from v12.3: factual hierarchy, anti-template language, observable defects, score ceilings, and hard-failure promotion. The problem is that these protections still speak in a hybrid vocabulary of UI modules, CTA buttons, zones, checklist criteria and regex-driven compliance. That language keeps pushing generation and review toward interface-like creative layouts.

The clean path is:
1. Introduce a global `Olhar ADScale` constitution as a reusable prompt/rubric section.
2. Introduce a first `Cenbrap` voice overlay as a reusable client voice document.
3. Add a vocabulary audit so UI-first terms cannot silently re-enter core creative prompts.
4. Map existing visual hard failures to future creative verdict semantics without changing approval behavior yet.

This keeps Phase 138 small and sets up Phases 139-140. It should not persist new DB fields, change approval status semantics, or rewrite the whole score pipeline yet.

## Verified Current State

### Preflight still starts from performance/checklist language

`app/src/server/ai/preflight-analysis.ts` asks the model to act as an "expert advertising creative director and performance marketer" and scores seven dimensions:
- `technicalQuality`
- `textLegibility`
- `visualHierarchy`
- `ctaProminence`
- `composition`
- `brandConsistency`
- `platformReadiness`

The prompt explicitly asks if the CTA is "visible, contrasting, and clickable-looking". This is the clearest UI/UX leak.

### Prompt builder still uses module/widget language

`app/src/server/ai/prompt-builder.ts` includes:
- "CTA module placement"
- "supporting shapes"
- "three tiers" as hook/proof/CTA
- "UI modules"
- "dashboard/card-grid layouts"
- "volumetric CTA pills"

Some of this was added for good reasons in v12.3, but the language still instructs the model to compose like it is arranging interface modules.

### Per-mode rules still treat composition as modules

`app/src/server/ai/per-mode-prompt-rules.ts` includes:
- `CTA module architecture`
- `THREE-ZONE VISUAL BUDGET`
- `CTA buttons`
- `offer cards`
- "separate modules: headline, photo/subject, offer or proof, CTA, logo, badges..."

The rules correctly prevent cropping and factual drift, but they should be reframed toward figure, gestalt, invite, rhythm and hierarchy before Phase 140 rewrites generation prompts.

### Observable rubric contains good failure concepts but checklist mapping

`app/src/server/ai/observable-rubric.ts` already names the important visual failures:
- visual overload
- generic template aesthetic
- missing dominant idea
- hook illegible at thumbnail scale

But it maps these into old QA buckets like `creativeRisk`, `briefMatch` and `legibility`, and still cites "CTA button", "card grid" and "button-like modules".

### Hard failure taxonomy already has the right visual failure codes

`app/src/server/ai/creative-quality-gate.ts` and `creative-quality-taxonomy.ts` include:
- `generic_template_aesthetic`
- `visual_overload`
- `missing_dominant_idea`
- `decorative_only_variation`

These should become first-class art-direction verdict inputs:
- `generic_template_aesthetic` -> `sem_opiniao`
- `decorative_only_variation` -> `sem_opiniao`
- `missing_dominant_idea` -> `confusa`
- `visual_overload` -> `confusa`

Phase 138 should create this mapping in code and tests, but not yet change persistence or approval behavior.

### Existing approval route already blocks current invalid states

`app/src/app/api/derivations/[id]/review/route.ts` calls `assertDerivationApprovable()` before approving. Current tests cover invalid rejection. The production audit still found an approved invalid legacy/current-state mismatch, so Phase 139 must harden the new dual-verdict path. Phase 138 should only document the mapping and constraints.

### Client voice does not exist yet

No reusable `app/src/server/ai/voices/` system exists. The closest analog is:
- `creative-corpus.ts`, which has a canonical campaign registry for fixtures and allowed entities.
- `canonical-creative-contract.ts`, which derives dominant idea, tiers and invariant identity.

Phase 138 should add the voice overlay next to AI server modules, not into UI code.

## Recommended Implementation Shape

### New modules

```
app/src/server/ai/olhar/
├── constitution.ts
├── art-direction-verdict.ts
└── vocabulary.ts

app/src/server/ai/voices/
├── client-voice.ts
└── cenbrap.ts
```

Recommended responsibilities:
- `constitution.ts`: exports `OLHAR_ADSCALE_PRINCIPLES`, `OLHAR_AXES`, `buildOlharAdscaleSection()`.
- `vocabulary.ts`: exports forbidden/default-danger terms and safer replacements.
- `art-direction-verdict.ts`: maps existing visual hard failures to future `pronta|quase|sem_opiniao|confusa` semantics.
- `client-voice.ts`: resolves a client voice by campaign/client profile.
- `cenbrap.ts`: exports Cenbrap voice principles in code-facing structure plus prompt text.

### Vocabulary audit

Add `app/scripts/check-olhar-vocabulary.mjs` with a small allowlist. It should scan only core AI prompt/rubric files, not all UI files:
- `app/src/server/ai/prompt-builder.ts`
- `app/src/server/ai/per-mode-prompt-rules.ts`
- `app/src/server/ai/preflight-analysis.ts`
- `app/src/server/ai/observable-rubric.ts`
- `app/src/server/ai/creative-qa.ts`
- `app/src/server/ai/creative-score.ts`

The audit should fail on terms when they appear in prompt text as default creative language:
- `clickable-looking`
- `CTA module`
- `UI modules`
- `CTA button`
- `CTA buttons`
- `button-like modules`
- `card grid`
- `card-grid`
- `three-zone visual budget`
- `THREE-ZONE VISUAL BUDGET`

The audit may allow these terms in:
- the audit script itself
- tests that assert forbidden terms are absent
- docs explaining the migration

### Prompt changes in Phase 138

Only change foundational prompt/rubric sections enough to remove UI-first defaults and inject the new `Olhar` section. Do not change output schemas yet.

Examples:
- `ctaProminence` label can remain in old schema for compatibility, but its prompt description should stop saying "clickable-looking".
- Replace "CTA module placement" with "invite placement and reading path".
- Replace "UI modules" with "information groups".
- Replace "THREE-ZONE VISUAL BUDGET" with a less rigid "READING PATH AND GESTALT BUDGET" while keeping the preservation intent.
- Replace "CTA button" references with "invite" or "call-to-action text" unless the source creative visibly uses a button.

### Cenbrap voice content

The first voice should be opinionated but not overfit. It should include:
- Editorial principles.
- What Cenbrap feels like.
- What is anti-Cenbrap.
- Authority/professor handling.
- MEC/certification/claims caution.
- CTA rhythm.
- Typography/density guidance.
- Anti-template markers.
- "Correct but soulless" examples.

The voice should be referenced by prompt builder only after Phase 140. In Phase 138 it is enough to expose resolver/builders and tests.

## Validation Architecture

### Automated checks

Use Vitest for new TypeScript modules and Node for vocabulary audit.

Recommended commands:
- `cd app && npm test -- src/server/ai/olhar/constitution.test.ts src/server/ai/olhar/art-direction-verdict.test.ts src/server/ai/voices/client-voice.test.ts -x`
- `node app/scripts/check-olhar-vocabulary.mjs`
- `cd app && npm test -- src/server/ai/prompt-builder.test.ts src/server/ai/creative-qa.test.ts src/server/ai/creative-score.test.ts -x`

### Manual checks

Jhonatan must review the first Cenbrap voice before Phase 140 treats it as creative direction. The phase should produce a review artifact:

`.planning/phases/138-olhar-constitution-and-cenbrap-voice/138-VOICE-REVIEW.md`

This artifact should record:
- whether the voice feels like Jhonatan's eye,
- corrections requested,
- whether the voice is approved for Phase 140 prompt injection.

## Risks

| Risk | Mitigation |
|------|------------|
| Phase 138 becomes a full prompt rewrite | Keep output schema changes for Phase 139/140 |
| Vocabulary audit blocks useful literal examples | Allow terms only in docs/tests or clearly quoted forbidden-term comments |
| Cenbrap voice overfits one asset | Use principles and anti-patterns, not fixed layouts |
| Removing "zones" weakens factual preservation | Replace with reading-path/gestalt language while preserving mandatory facts |
| Docs pass but system behavior unchanged | Require actual prompt-section and vocabulary-audit tests |

## Planning Recommendation

Use two plans:

1. **138-01 Olhar constitution and vocabulary inventory**
   - Add global `Olhar` modules.
   - Add vocabulary audit.
   - Replace UI-first prompt/rubric vocabulary in core AI sections.

2. **138-02 Cenbrap voice and failure mapping**
   - Add client voice resolver and Cenbrap voice.
   - Add art-direction failure mapping.
   - Add review artifact for Jhonatan signoff.

This maps all OLHAR-01..04 requirements and leaves Phase 139 free to implement dual verdict contracts.
