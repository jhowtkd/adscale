---
gsd_state_version: 1.0
milestone: v12.4
milestone_name: Aprendizado de Qualidade dos Outputs
status: context_ready
last_updated: "2026-06-16T19:20:00.000Z"
last_activity: 2026-06-16
progress:
  total_phases: 40
  completed_phases: 13
  total_plans: 49
  completed_plans: 62
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-16)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Phase 124 context captured; ready to plan output signal capture.

**Status:** Phase 124 context ready

## Current Position

Phase: 124 — Output Signal Capture
Plan: —
Status: Context gathered
Last activity: 2026-06-16

Progress: 124-CONTEXT.md captured decisions for canonical append-only output evidence; ready for phase planning

## Accumulated Context

### From v12.2 (shipped 2026-06-14)

- Visual foundation contracts, primitives, and release gate (Phases 109–114)
- Interface compacta e responsiva sem alterar regras de negócio dos fluxos

### From creative pipeline audit (2026-06-15)

- Corpus auditado: 34 peças, média 58,5/100
- Falhas críticas: entidades inventadas (Cantona, Manchester United), contaminação de restyling, adaptações de formato que viram outra campanha
- Causa raiz: preservação literal de todos os módulos; regras de hierarquia/anti-alucinação declaradas mas não injetadas no prompt; gate trata genérico como polish
- Testes atuais (152/152) passam sem detectar falhas observadas

### For v12.4 start (2026-06-16)

- Learnings must not live only in vector memory; Postgres remains the canonical layer
- First-class signal for this milestone is human output decision data: approval, rejection, regeneration, save-reference, delivery choice
- First application point is before the next generation, via bounded recommendation/prefill
- Performance-media blending is deferred; this cycle starts with human quality signals only

### v12.3 delivery order

1. Fixtures + baseline red (115)
2. Canonical contract + prompt injection (116)
3. Factual/visual separation (117)
4. Per-mode rules (118)
5. Observable rubric (119)
6. Gate hardening (120)
7. Score ceilings + retry (121)
8. Regression suite (122)
9. Visual validation gate (123)

## Session Continuity

Last activity: 2026-06-16 — Captured Phase 124 context in `.planning/phases/124-output-signal-capture/124-CONTEXT.md`

## Decisions

- art_variation and format_adaptation MODE blocks use tier-aware preservation governed by RULE PRECEDENCE (CONT-03)
- [Phase 117]: invented_factual_entity in CONTAMINATION_FAILURE_CODES and promoted at quality gate (SEP-04)
- [Phase 117]: INPUT SOURCE CLASSIFICATION injected after integrity block, before MODE-specific rules
- [Phase 117]: RESTYLING FACTUAL-SOURCE RULE injects unconditionally; visualTokenBrief blocked for restyling
- [Phase 117]: VISUAL REFERENCE TRANSFER RULE injected after classification with SEP-02 allowlist/denylist
- [Phase 117]: invented_factual_entity promoted to hard failure via INVENTED_ENTITY_PATTERN on briefMatch/creativeRisk
- [Phase 117]: ALLOWED ENTITIES block injected from CANONICAL_CAMPAIGNS when campaign slug matches
- [Phase 117]: assertParentFactualLineage blocks format_adaptation parent download when qualityVerdict invalid or hardFailures include contamination codes (SEP-03)
- [Phase 119]: Observable rubric maps defects to existing criteria (creativeRisk, legibility, briefMatch) — no new checklist keys
- [Phase 119]: Score rubric extends QA core lines with SCORE VISUAL QUALITY CAPS block
- [Phase 119]: QA prompt injects observable rubric after styleFidelity/allowedEntities; export-softening removed
- [Phase 119]: Score prompt uses buildObservableScoreRubricSection + allowedEntities block matching QA pattern
- [Phase 119]: Corpus archetype integration tests verify rubric parity without gate promotion; BASELINE_GAP_COUNT remains 4 until Phase 120
- [Phase 120]: GATE-01 taxonomy patterns and extended CreativeHardFailureCode union established without classifier promotion (Plan 02)
- [Phase 120]: normalizeHardFailureCode maps copied_style_reference_facts, format_campaign_drift, restyling_factual_contamination to canonical GATE-01 codes
- [Phase 120]: hasCampaignIdentityDrift: 'not a faithful' overrides safe-pattern false negative on formatFit drift notes
- [Phase 120]: Gate classifiers emit style_reference_contamination; decorative_only_variation gated to art_variation
- [Phase 120]: CORPUS_POSITIVE_FIXTURES holds faithful c2c12774; CORPUS_ARCHETYPE_FIXTURES stays five negatives with BASELINE_GAP_COUNT=0
- [Phase 120]: Format drift corpus expects campaign_identity_drift only (not dual wrong_brand)
- [Phase 120]: Faithful NR1 4:5 adaptation improvable with creativeRisk warning; assertDerivationApprovable ok
- [Phase 121]: Brief builder is sole injection point for RESTYLING FACTUAL-SOURCE RULE on correction retry
- [Phase 121]: FAILURE_CORRECTION_DIRECTIVES prepends per-code imperatives before hard-failure trace list (SCR-05)
- [Phase 121]: Separate creative-score-ceilings.ts module applies SCR-02 ceilings before gate verdict and DB persist
- [Phase 121]: computeQualityGateFromAnalysis returns capped qualityScore; breakdown clamping when scoreBreakdown provided
- [Phase 121]: Mode-aware shouldAutoRetryDerivation with per-mode code sets; restyling uses base+style asset keys never outputKey
- [Phase 121]: Restyling auto-retry calls images.edit with [base-image, style-reference] matching first-pass order
- [Phase 123]: CREATIVE_VALIDATION_MATRIX is six-cell single source for operator capture and release gate (QA-18)
- [Phase 123]: beforeCorpusRefId validated at module load via isCorpusRefIdKnown; CREATIVE_VALIDATION_SEED_SUPPORTED=false
- [Phase 123]: FIDELITY_HARD_FAILURE_CODES frozen to seven production gate codes; after-stage fidelity failures are warnings until plan 04 final
- [Phase 123]: check-creative-validation-evidence.mjs loads matrix keys via tsx from creative-validation-matrix.ts
- [Phase 123]: run-creative-validation.ts dry-run resolves six before captures from corpus manifest; live capture requires operator OPENAI_API_KEY
- [Phase 123]: Base assets committed under app/tests/fixtures/creative-corpus/base-assets/ for matrix regeneration inputs
- [Phase 123]: Operator evidence 123-EVIDENCE.json committed with 6 paired before/after captures; fidelity warnings deferred to plan 04 final gate
- [Phase 123]: check-creative-validation-evidence.mjs tsx subprocess cwd set to appDir for correct module resolution
- [Phase 123]: --stage final enforces thresholds, fidelity hard failures, prompt hash; writes 123-BASELINE.md + 123-VERIFICATION.md
- [Phase 123]: run-creative-release-gate.mjs mirrors Phase 114 (test/lint/build + final evidence); QA-21 infrastructure complete
- [Phase 123]: Committed evidence gaps_found — meanQualityScore=70.17 (<75); factualFidelityRate=1.000 (6/6); QA-19 blocked on mean quality only
- [Phase 123]: Final evidence gate documents gaps_found when committed captures below QA-19/20 thresholds

## Next Steps

Proceed to Phase 124 planning. The planner should start from `.planning/phases/124-output-signal-capture/124-CONTEXT.md` and keep scope limited to canonical signal capture.
