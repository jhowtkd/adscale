# Phase 122: Regression Test Suite - Research

**Researched:** 2026-06-15
**Domain:** Vitest regression suite — prompt/QA wiring, gate matrix, mode×format, thumbnail legibility
**Confidence:** HIGH

## Summary

Phases 115–121 shipped corpus fixtures, prompt injection, gate hardening, and score ceilings. Scattered tests exist (`quality-prompt-regression.test.ts`, `creative-quality-gate.test.ts`, `quality-rubric-regression.test.ts`) but REQUIREMENTS TEST-01–04 demand **explicit, requirement-mapped** suites that fail when declared rules are unwired.

**Primary recommendation:** Add four focused test modules (no production behavior changes unless TEST-04 needs a small sharp-based helper). Consolidate requirement traceability; add mode×format matrix and pixel thumbnail downscale check deferred from Phase 119.

## Phase Requirements → Deliverables

| ID | Requirement | Gap | Deliverable |
|----|-------------|-----|-------------|
| TEST-01 | Prompt tests: dominant idea, three zones, secondary CTA, forbidden entities, factual/visual separation, simplification | Rules spread across `prompt-builder.test.ts` / `quality-prompt-regression.test.ts` | `regression-prompt-contract.test.ts` + QA parity |
| TEST-02 | Gate: Cantona/MU, replaced person, unauthorized logo, campaign drift, generic, overload, decorative | Covered piecemeal in `creative-quality-gate.test.ts` | `gate-failure-matrix.test.ts` table-driven TEST-02 map |
| TEST-03 | Per-mode suite, same inputs, multiple formats | Missing | `mode-format-regression.test.ts` |
| TEST-04 | Thumbnail hook legibility at mobile scale | Rubric text only (Phase 119) | `thumbnail-hook-legibility.ts` + sharp downscale tests |

## Standard Stack

Vitest ^4.1.5, sharp ^0.33.0, existing prompt extractors and gate classifiers — no new dependencies.

## Out of Scope

- Live OpenAI image generation in CI (Phase 123)
- Changing gate/prompt production logic
