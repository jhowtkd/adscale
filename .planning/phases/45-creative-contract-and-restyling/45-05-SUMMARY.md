---
phase: "45"
plan: "05"
subsystem: ai-pipeline
tags: [tests, cta-semantics, style-fidelity, prompt-builder, creative-qa]
one_liner: "9 new tests covering CTA semantics contract and styleFidelity criterion; all 561 tests pass including env/logger mock fix for prompt-builder.test.ts"
dependency_graph:
  requires:
    - 45-02 (buildHardRulesSection mode-aware CTA, restyling factual-source rule)
    - 45-03 (styleFidelity criterion in creative-qa)
  provides:
    - 5 CTA semantics tests in prompt-builder.test.ts
    - 4 styleFidelity tests in creative-qa.test.ts
    - env+logger mocks fixing pre-existing test failure in prompt-builder.test.ts
  affects: []
tech_stack:
  added: []
  patterns:
    - Pure function testing (no API mocks needed for prompt string builders)
key_files:
  created: []
  modified:
    - app/src/server/ai/prompt-builder.test.ts
    - app/src/server/ai/creative-qa.test.ts
decisions:
  - "env+logger mocks added to prompt-builder.test.ts (pre-existing bug fix, Rule 1)"
  - "Inline contract literals in tests for readability — no resolveCtaSemantics import needed"
  - "normalizeCreativeQaResult tests use present/absent styleFidelity in raw model response"
metrics:
  duration_seconds: 200
  tasks_completed: 2
  files_changed: 2
  tests_added: 9
  tests_total: 561
  completed_date: "2026-06-01"
---

# Phase 45 Plan 05: CTA Semantics + styleFidelity Test Coverage Summary

9 new tests covering CTA semantics contract and styleFidelity criterion; all 561 tests pass including env/logger mock fix for prompt-builder.test.ts.

## What Was Built

### Task 1: prompt-builder.test.ts (5 new tests)

Added `describe("CTA semantics contract", ...)` block:

| Test | Scenario | Assertion |
|------|----------|-----------|
| art_variation + null ctaText | inherited semantics | prompt matches `/use the original CTA|preserve.*CTA/i` |
| art_variation + "Comprar agora" | explicit semantics | prompt contains "Comprar agora" after HARD RULES |
| format_adaptation + null ctaText | inherited semantics | prompt matches `/preserve.*CTA|original.*CTA/i` |
| restyling + null ctaText | inherited, no "no CTA" | prompt does NOT contain "no CTA required" |
| restyling + styleAssetId set | factual-source rule | prompt contains "RESTYLING FACTUAL-SOURCE RULE" |

**Deviation (Rule 1 bug fix):** Added `vi.mock("@/server/validation/env", ...)` and `vi.mock("@/lib/logger", ...)` — the file was already importing these transitively through `prompt-builder.ts` → `brand-kit-extractor.ts` and `competitor-analyzer.ts`. Without these mocks, all 17 pre-existing tests were also failing. This was a pre-existing bug.

### Task 2: creative-qa.test.ts (4 new tests)

Added `describe("styleFidelity criterion", ...)` block:

| Test | Scenario | Assertion |
|------|----------|-----------|
| restyling + styleAssetId | buildCreativeQaPrompt | prompt contains "styleFidelity", "style reference", "factual" |
| art_variation + no styleAssetId | buildCreativeQaPrompt | prompt does NOT contain "styleFidelity" |
| normalizeCreativeQaResult + styleFidelity present | normalize | checklist.styleFidelity defined with correct status |
| normalizeCreativeQaResult + styleFidelity absent | normalize | checklist.styleFidelity is undefined (no phantom fallback) |

## Test Run Result

```
Test Files  110 passed (110)
     Tests  561 passed | 1 skipped (562)
```

## Deviations from Plan

**Rule 1 (bug fix):** Added `vi.mock("@/server/validation/env", ...)` and `vi.mock("@/lib/logger", ...)` to `prompt-builder.test.ts`. This fixed a pre-existing silent failure where all 17 tests in that file were unable to run.

## Commits

- `f8f7df4` test(45-05): add CTA semantics and styleFidelity test coverage

## Self-Check: PASSED

- ✅ `app/src/server/ai/prompt-builder.test.ts` contains "CTA semantics contract" describe block with 5 tests
- ✅ `app/src/server/ai/creative-qa.test.ts` contains "styleFidelity criterion" describe block with 4 tests
- ✅ All 5 CTA semantics tests pass
- ✅ All 4 styleFidelity tests pass
- ✅ All 561 tests pass, 1 skipped
