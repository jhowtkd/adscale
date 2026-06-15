---
gsd_state_version: 1.0
milestone: v12.3
milestone_name: Integridade Criativa
status: completed
last_updated: "2026-06-15T20:56:18.042Z"
last_activity: 2026-06-15
progress:
  total_phases: 85
  completed_phases: 40
  total_plans: 109
  completed_plans: 123
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v12.3 Integridade Criativa — factual fidelity, creative direction, and quality gate hardening for the derivation pipeline.

**Status:** Phase 123 infrastructure complete; evidence gaps block milestone closure

## Current Position

Phase: 123 — Visual Validation Gate
Plan: 04 complete (4/4 plans)
Status: gaps_found — operator after-capture refresh required
Last activity: 2026-06-15

Progress: Phase 123 plan 4/4 complete — release gate wired; committed evidence below QA-19/QA-20 thresholds

## Accumulated Context

### From v12.2 (shipped 2026-06-14)

- Visual foundation contracts, primitives, and release gate (Phases 109–114)
- Interface compacta e responsiva sem alterar regras de negócio dos fluxos

### From creative pipeline audit (2026-06-15)

- Corpus auditado: 34 peças, média 58,5/100
- Falhas críticas: entidades inventadas (Cantona, Manchester United), contaminação de restyling, adaptações de formato que viram outra campanha
- Causa raiz: preservação literal de todos os módulos; regras de hierarquia/anti-alucinação declaradas mas não injetadas no prompt; gate trata genérico como polish
- Testes atuais (152/152) passam sem detectar falhas observadas

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

Last activity: 2026-06-15 — Completed 121-03 (failure-specific correction directives; SCR-05)

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
- [Phase 123]: Committed evidence gaps_found — meanQualityScore=43.33, factualFidelityRate=0.667; wrong_brand + unsupported_offer on after set
- [Phase 123]: Final evidence gate documents gaps_found when committed captures below QA-19/20 thresholds

## Next Steps

Operator refresh after captures via `npm run validate:creative:live` until `--stage final` passes; then re-run `npm run creative-release-gate` for milestone closure
