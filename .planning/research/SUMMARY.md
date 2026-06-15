# Project Research Summary

**Project:** ADScale v12.3 Integridade Criativa
**Domain:** Creative derivation pipeline — factual integrity, visual hierarchy, quality gates
**Researched:** 2026-06-15
**Confidence:** HIGH

## Executive Summary

The creative pipeline produces polished but often generic, dense, and factually wrong ads. Audit of 34 exports (58.5/100 avg) shows invented entities, style-reference contamination, and format adaptations that become different campaigns. Root cause is architectural: prompts demand literal preservation of all modules; hierarchy and anti-hallucination constants exist but are not injected; the quality gate treats generic aesthetics as polish, not failure; tests pass without detecting these gaps.

**Recommended approach:** fixtures first → canonical contract → wire prompts → per-mode rules → observable rubric → hardened gate → score/retry → regression → visual validation. No model swap, no UI changes, no rebrand.

## Key Findings

### Stack

Keep TypeScript, Vitest, OpenAI, Inngest, Zod. Extend `quality-fixtures.ts`, prompt section tests, score ceilings. No new runtime dependencies.

### Features (table stakes)

- Corpus fixtures for each failure mode
- Prompt injection of hierarchy + anti-hallucination rules
- Factual entity blocking (people, teams, brands, IP)
- Three-zone visual hierarchy (hook / proof / CTA)
- Per-mode contracts (art_variation, restyling, format_adaptation)
- Hard failures block export; score ceilings
- Restyling retry from factual parent

### Architecture

Modify `prompt-builder`, `creative-diagnosis`, `preflight-analysis`, `creative-quality-gate`, `creative-score`, `creative-qa`, `derivation.ts` in dependency order. Restyling must separate factual base from style reference.

### Watch Out For

1. Declared-but-unwired constants (current bug)
2. Preserve-all-modules vs simplify contradiction
3. Generic = polish not failure
4. Retry from contaminated child
5. Tests that don't assert prompt content

## Implications for Roadmap

| Phase | Focus |
|-------|-------|
| 115 | Corpus fixtures + baseline |
| 116 | Canonical creative contract |
| 117 | Factual vs visual separation |
| 118 | Per-mode prompt rules |
| 119 | Observable rubric |
| 120 | Quality gate hardening |
| 121 | Score ceilings + retry |
| 122 | Regression test suite |
| 123 | Visual validation gate |

---
*Research completed: 2026-06-15*
*Ready for requirements: yes*
