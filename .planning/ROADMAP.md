# Roadmap: ADScale v11.5 Qualidade IA Orientada por Feedback

**Created:** 2026-06-05
**Milestone:** v11.5
**Total phases:** 4
**Requirements:** 20/20 mapped
**Starting phase:** 57

## Overview

v11.5 improves AI creative quality by aligning the generation contract, visual scoring/QA, and regeneration loop. The goal is not to promise perfect first outputs; it is to make quality failures explicit, actionable, and correctable without violating brand, CTA, offer, product, format, or factual-source constraints.

| Phase | Name | Goal | Requirements | Success Criteria |
|-------|------|------|--------------|------------------|
| 57 | Creative Contract and Prompt Provenance | Complete    | 2026-06-05 | 2026-06-05 |
| 58 | Scoring and QA Alignment | 2/2 | Complete    | 2026-06-05 |
| 59 | Feedback-Informed Regeneration | 4/4 | Complete   | 2026-06-05 |
| 60 | Quality Fixtures and Verification | Add known-failure fixtures, regression tests, and handoff documentation. | FIX-01, FIX-02, FIX-03, FIX-04, FIX-05 | 5 |

## Phase Details

### Phase 57: Creative Contract and Prompt Provenance

**Goal:** Make generation contracts explicit, testable, and inspectable across all derivation modes.

**Requirements:** AIC-01, AIC-02, AIC-03, AIC-04, AIC-05

**Scope:**
- Audit and normalize the creative contract shape used by derivation generation.
- Add prompt-builder snapshot tests for art variation, format adaptation, and restyling.
- Ensure prompts carry non-negotiable preservation rules for CTA, format, brand/client, product, offer, source assets, and factual-source rules.
- Preserve prompt provenance for debugging: input prompt, revised/generated prompt when available, contract, mode, target format, and source package.

**Success criteria:**
1. Every derivation has an inspectable contract object before generation.
2. Prompt snapshot tests cover art variation, format adaptation, and restyling.
3. Restyling prompt tests prove base-image facts cannot be replaced by style-reference facts.
4. Format adaptation prompt tests prove native-layout instructions reject padding/cropped poster behavior.
5. Stored derivation debug fields allow developer/owner to trace prompt and contract provenance.

### Phase 58: Scoring and QA Alignment

**Goal:** Make score, QA, hard failures, and user-facing explanations agree.

**Requirements:** AIQ-01, AIQ-02, AIQ-03, AIQ-04, AIQ-05

**Plans:** 2/2 plans complete

Plans:
- [x] 58-01-PLAN.md — Shared taxonomy + score/QA normalization (AIQ-01, AIQ-02)
- [x] 58-02-PLAN.md — Gate alignment, verdict rules, PT-BR/EN UI copy (AIQ-03, AIQ-04, AIQ-05)

**Scope:**
- Define shared quality taxonomy used by `creative-score`, `creative-qa`, and `creative-quality-gate`.
- Validate and normalize score/QA outputs with explicit schema expectations.
- Limit hard failures to contract-breaking categories.
- Ensure hard failures force invalid verdict regardless of visual polish score.
- Align PT-BR/EN copy for blocking failures vs advisory polish.

**Success criteria:**
1. Score and QA use the same named quality categories.
2. Malformed model outputs cannot silently become high-confidence "good" results.
3. Hard failure classification is covered for CTA, offer/product/brand, format, crop, legibility, and style contamination.
4. High visual quality cannot override a hard contract failure.
5. UI copy clearly distinguishes "must fix" from "could improve".

### Phase 59: Feedback-Informed Regeneration

**Goal:** Turn hard failures, QA, score issues, and beta feedback categories into bounded correction briefs.

**Requirements:** AIR-01, AIR-02, AIR-03, AIR-04, AIR-05

**Plans:** 4/4 plans complete

Plans:
- [x] 59-01-PLAN.md — Unified correction brief builder + gate/score delegation (AIR-01, AIR-02)
- [x] 59-02-PLAN.md — Regenerate route persistence + parent contract inheritance (AIR-02, AIR-04)
- [x] 59-03-PLAN.md — Pre-confirm primary reason UI + derivations API preview (AIR-03)
- [x] 59-04-PLAN.md — Route and brief test coverage for all input paths (AIR-05)

**Scope:**
- Build a regeneration correction-brief builder that merges hard failures, score issues, QA issues, and optional feedback category.
- Treat feedback as issue context only; never as hard instruction.
- Show the primary regeneration reason before user confirmation.
- Persist correction brief on regenerated derivations.
- Extend regeneration route tests to cover explicit feedback, stored suggestions, hard failures, and feedback-informed context.

**Success criteria:**
1. Regeneration correction brief always includes preserved CTA/format/mode/source-of-truth constraints.
2. Raw feedback text cannot override contract rules.
3. User sees what regeneration will try to fix before confirming.
4. Regenerated derivations store the correction brief and parent/source context.
5. Route and helper tests cover all regeneration input paths.

### Phase 60: Quality Fixtures and Verification

**Goal:** Add known-failure fixtures, regression tests, and handoff documentation.

**Requirements:** FIX-01, FIX-02, FIX-03, FIX-04, FIX-05

**Scope:**
- Add synthetic or sanitized fixtures for wrong CTA, cropped text/logo, style-reference factual contamination, poor format adaptation, weak preservation, and low legibility.
- Connect fixtures to prompt, QA normalization, hard failure classification, and regeneration suggestion tests.
- Run full validation: unit tests, lint, build.
- Document manual verification path for one full quality loop.
- Document model-dependent limitations that remain.

**Success criteria:**
1. Fixture set exists and avoids real customer/private creative.
2. Prompt contract snapshots pass for all derivation modes.
3. Score/QA/gate tests cover known failure categories.
4. Handoff explains how to manually evaluate generation -> score -> QA -> regeneration.
5. Residual limitations around text rendering, consistency, and precise composition are explicit.

## Requirement Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AIC-01 | Phase 57 | Planned |
| AIC-02 | Phase 57 | Planned |
| AIC-03 | Phase 57 | Planned |
| AIC-04 | Phase 57 | Planned |
| AIC-05 | Phase 57 | Planned |
| AIQ-01 | Phase 58 | Planned |
| AIQ-02 | Phase 58 | Planned |
| AIQ-03 | Phase 58 | Planned |
| AIQ-04 | Phase 58 | Planned |
| AIQ-05 | Phase 58 | Planned |
| AIR-01 | Phase 59 | Planned |
| AIR-02 | Phase 59 | Planned |
| AIR-03 | Phase 59 | Planned |
| AIR-04 | Phase 59 | Planned |
| AIR-05 | Phase 59 | Planned |
| FIX-01 | Phase 60 | Planned |
| FIX-02 | Phase 60 | Planned |
| FIX-03 | Phase 60 | Planned |
| FIX-04 | Phase 60 | Planned |
| FIX-05 | Phase 60 | Planned |

**Coverage:**
- v11.5 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

## Build Order Rationale

1. Contracts/prompts come first because scoring and regeneration must know what "correct" means.
2. Scoring/QA alignment comes second because regeneration should be driven by reliable failure categories.
3. Regeneration comes third because it consumes contract + quality context.
4. Fixtures/verification finish the cycle so future beta feedback can become repeatable regression coverage.

---
*Roadmap created: 2026-06-05*
