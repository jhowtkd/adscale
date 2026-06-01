# Roadmap: ADScale v11.1 Qualidade de Geração e Contratos Criativos

**Created:** 2026-06-01
**Milestone:** v11.1
**Total phases:** 5
**Requirements:** 26/26 mapped
**Starting phase:** 44

## Overview

v11.1 is a reliability milestone for the existing derivation modes. It fixes the gap between "the model generated an image" and "the user can trust this as a usable ad output." The roadmap starts with the most visible user complaint, then centralizes the creative contract, adds quality gates, improves UI diagnosis, and ends with repeatable visual UAT.

| Phase | Name | Goal | Requirements | Success Criteria |
|-------|------|------|--------------|------------------|
| 44 | 1/2 | Complete    | 2026-06-01 | 2026-06-01 |
| 45 | Creative Contract and Restyling | Complete    | 2026-06-01 | 2026-06-01 |
| 46 | Hard Quality Gate | 1/5 | In Progress|  |
| 47 | Workspace Review and Error Feedback | Make campaign/output inspection diagnostic and actionable from the UI. | WUI-01..04 | 4 |
| 48 | End-to-End UAT and Verification | Prove the milestone with repeatable fixtures, tests, build, and browser/manual review. | UAT-01..04 | 5 |

## Phase Details

### Phase 44: Native Format Adaptation

**Goal:** `Variar tamanho` generates real target-format layouts, not resized square posters.

**Requirements:** FMT-01, FMT-02, FMT-03, FMT-04, FMT-05

**Scope:**
- Strengthen format-adaptation prompt instructions around native layout zones, gutters, safe areas, and module separation.
- Ensure image generation/edit requests use the closest native target size for 4:5 and 9:16.
- Remove or prevent post-processing that creates blurred padding, letterboxing, stretched edge filler, or pasted-poster layouts.
- Add focused tests around prompt content and normalization behavior.

**Success criteria:**
1. 9:16 adaptation fills the canvas without blurred side/top/bottom bands or pasted square poster treatment.
2. 4:5 adaptation has portrait-feed spacing and avoids clustered text/photo/CTA/logo elements.
3. Critical source information remains readable and inside safe areas.
4. Unit tests fail if format adaptation uses blur/contain/composite as the primary dimension solution.
5. A local visual check records at least one accepted 9:16 and one accepted 4:5 output or documents model failure evidence.

### Phase 45: Creative Contract and Restyling

**Goal:** Generation, scoring, QA, regeneration, and UI all agree on the same creative contract.

**Requirements:** CNTR-01, CNTR-02, CNTR-03, CNTR-04, REST-01, REST-02, REST-03, REST-04

**Plans:** 5/5 plans complete

Plans:
- [x] 45-01-PLAN.md — Creative contract types (CreativeContract, CtaSemantics, resolveCtaSemantics) + styleAssetId DB schema + route event payload
- [x] 45-02-PLAN.md — Thread contract into prompt-builder (mode-aware CTA + restyling factual-source) and creative-score (inherited CTA scoring + enriched regeneration)
- [x] 45-03-PLAN.md — Add styleFidelity QA criterion to creative-qa for restyling contamination detection
- [x] 45-04-PLAN.md — Derivation job orchestration: resolve contract once, fix restyling asset selection, pass to all pipeline functions
- [x] 45-05-PLAN.md — Tests: CTA semantics (5 cases) + styleFidelity criterion (4 cases)

**Scope:**
- Introduce or formalize an effective creative contract for each derivation.
- Define mode-aware CTA semantics: explicit, inherited, absent, and overridden.
- Resolve base asset and selected style references explicitly instead of relying on asset ordering.
- Ensure restyling treats base image as factual source and style references as visual-only.
- Update prompt, scoring, QA, and regeneration to consume the same contract.

**Success criteria:**
1. Restyling job uses the user-selected style reference instead of silently choosing the first available style asset.
2. Restyling prompts and QA prevent copied factual claims from style references.
3. CTA contract tests cover art variation, format adaptation, and restyling semantics.
4. Scoring no longer treats inherited base CTA as "none" unless the contract explicitly says no CTA.
5. Regeneration suggestion preserves the same mode, target format, and effective CTA/source contract.

### Phase 46: Hard Quality Gate

**Goal:** Users can tell whether an output is invalid or merely needs polish.

**Requirements:** QA-01, QA-02, QA-03, QA-04, QA-05

**Plans:** 1/5 plans executed

Plans:
- [x] 46-01-PLAN.md — TDD: creative-quality-gate classifier (hard vs polish, verdict derivation, fixtures per QA-02 code)
- [ ] 46-02-PLAN.md — DB columns + updateDerivationQualityGate + client types (QA-05 persistence)
- [ ] 46-03-PLAN.md — Inngest quality-gate step after scoring + score prompt alignment (QA-01, QA-03)
- [ ] 46-04-PLAN.md — Hard-failure regeneration suggestion + regenerate default feedback (QA-04)
- [ ] 46-05-PLAN.md — API 409 guards + manual QA classifier + test-creatives (QA-01, QA-05)

**Scope:**
- Add structured hard-failure classification for blocking creative-contract violations.
- Keep advisory polish suggestions separate from approval-blocking failures.
- Run quality analysis after completion or ensure completed outputs surface quality status automatically.
- Make regeneration suggestions structured around hard failures.
- Add fixtures/tests for visually good but contract-invalid outputs.

**Success criteria:**
1. Hard failures cover CTA drift, wrong brand, unsupported offer, copied style facts, cropped critical content, unreadable required text, and invalid format layout.
2. A high visual score cannot hide a blocking hard failure.
3. Output cards or review UI can display "invalid output" separately from "improvement suggested".
4. Regeneration receives specific failure reasons and does not drop target format/mode/CTA contract.
5. Tests verify hard-failure classification for at least one invalid fixture per major failure type.

### Phase 47: Workspace Review and Error Feedback

**Goal:** The campaign workspace makes output inspection and failure diagnosis clear.

**Requirements:** WUI-01, WUI-02, WUI-03, WUI-04

**Scope:**
- Improve campaign and derivation loading errors so auth/session, workspace mismatch, not-found, timeout, and server failures are distinguishable when possible.
- Surface quality status and hard-failure next steps in derivation cards/grid.
- Show relevant source/target contract context for review.
- Carry failure reasons into retry/regeneration actions.

**Success criteria:**
1. Campaign page no longer collapses all failures into one vague "Erro ao carregar campanha" state when the API provides enough signal.
2. Output cards show hard failures and recommended next action without requiring logs.
3. Review UI exposes generation mode, target format, effective CTA, base asset, and style reference when relevant.
4. Regenerate/retry from invalid output preserves failure reasons.

### Phase 48: End-to-End UAT and Verification

**Goal:** Prove v11.1 with repeatable tests and real visual inspection.

**Requirements:** UAT-01, UAT-02, UAT-03, UAT-04

**Scope:**
- Create or document repeatable local fixtures for format adaptation and restyling.
- Run focused tests for prompt contracts, post-processing, creative contract resolution, scoring/QA, and UI error mapping.
- Run `npm run build`.
- Use browser/manual review to inspect at least one real campaign workspace and generated output set.
- Record evidence and accepted residual risks.

**Success criteria:**
1. Fixture verifies 1:1 to 9:16 and 1:1 to 4:5 behavior on a real campaign asset.
2. Fixture verifies restyling does not copy unrelated style-reference factual claims.
3. Focused tests and `npm run build` pass.
4. Browser/manual visual check confirms outputs are inspectable through the campaign workspace.
5. Verification notes clearly separate fixed behavior, remaining model-risk, and follow-up scope.

## Requirement Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FMT-01 | Phase 44 | Pending |
| FMT-02 | Phase 44 | Pending |
| FMT-03 | Phase 44 | Pending |
| FMT-04 | Phase 44 | Pending |
| FMT-05 | Phase 44 | Pending |
| CNTR-01 | Phase 45 | Pending |
| CNTR-02 | Phase 45 | Pending |
| CNTR-03 | Phase 45 | Pending |
| CNTR-04 | Phase 45 | Pending |
| REST-01 | Phase 45 | Pending |
| REST-02 | Phase 45 | Pending |
| REST-03 | Phase 45 | Pending |
| REST-04 | Phase 45 | Pending |
| QA-01 | Phase 46 | Pending |
| QA-02 | Phase 46 | Pending |
| QA-03 | Phase 46 | Pending |
| QA-04 | Phase 46 | Pending |
| QA-05 | Phase 46 | Pending |
| WUI-01 | Phase 47 | Pending |
| WUI-02 | Phase 47 | Pending |
| WUI-03 | Phase 47 | Pending |
| WUI-04 | Phase 47 | Pending |
| UAT-01 | Phase 48 | Pending |
| UAT-02 | Phase 48 | Pending |
| UAT-03 | Phase 48 | Pending |
| UAT-04 | Phase 48 | Pending |

**Coverage:**
- v11.1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

## Build Order Rationale

1. Fix native format adaptation first because it is the most visible user-facing failure and it has a clear implementation boundary.
2. Resolve creative contract before QA, otherwise scoring and regeneration will continue evaluating against inconsistent assumptions.
3. Add hard quality gates after contract semantics are stable.
4. Improve UI feedback once hard-failure outputs exist to display.
5. End with UAT because image model behavior requires visual verification beyond unit tests.

---
*Roadmap created: 2026-06-01*
