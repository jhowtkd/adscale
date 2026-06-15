---
gsd_state_version: 1.0
milestone: v12.3
milestone_name: Integridade Criativa
status: planning
last_updated: "2026-06-15T18:50:29.882Z"
last_activity: 2026-06-15
progress:
  total_phases: 35
  completed_phases: 10
  total_plans: 34
  completed_plans: 48
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v12.3 Integridade Criativa — factual fidelity, creative direction, and quality gate hardening for the derivation pipeline.

**Status:** Ready to plan

## Current Position

Phase: 119 — Observable Rubric
Plan: 4 of 04 complete (119-03 done)
Status: Ready to execute
Last activity: 2026-06-15

Progress: [██████░░░░] 3/4 plans in phase 119

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

Last activity: 2026-06-15 — completed 119-03-PLAN.md (extract buildCreativeScorePrompt with observable rubric)

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

## Next Steps

Execute 119-04-PLAN.md — complete observable rubric phase
