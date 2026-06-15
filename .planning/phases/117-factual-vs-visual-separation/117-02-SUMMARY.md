---
phase: 117-factual-vs-visual-separation
plan: "02"
subsystem: api
tags: [prompt-builder, factual-visual-separation, restyling, vitest, SEP-02]

requires:
  - phase: 117-factual-vs-visual-separation
    plan: "01"
    provides: INPUT SOURCE CLASSIFICATION block and factual-visual-separation module
provides:
  - VISUAL REFERENCE TRANSFER RULE prompt section with SEP-02 allowlist/denylist
  - Restyling visualTokenBrief guard (no Extracted Visual Token Brief injection)
  - Unconditional RESTYLING FACTUAL-SOURCE RULE for all restyling jobs
affects:
  - 117-03-PLAN (lineage firewall)
  - 117-04-PLAN (invented_factual_entity gate)

tech-stack:
  added: []
  patterns:
    - "Restyling injection order: integrity → classification → visual transfer → factual-source → MODE"
    - "visualTokenBrief excluded for restyling; format_adaptation and art_variation behavior unchanged"

key-files:
  created: []
  modified:
    - app/src/server/ai/factual-visual-separation.ts
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/ai/prompt-builder.test.ts
    - app/tests/unit/ai/quality-prompt-regression.test.ts

key-decisions:
  - "RESTYLING FACTUAL-SOURCE RULE no longer gated on styleAssetId at prompt-build time"
  - "visualTokenBrief only applies to modes other than art_variation, format_adaptation, and restyling"

patterns-established:
  - "VISUAL REFERENCE TRANSFER RULE lists abstract allowlist (ritmo, textura, cromia, tipografia, iluminação, lógica compositiva) and factual denylist before MODE"

requirements-completed: [SEP-02]

duration: 15min
completed: 2026-06-15
---

# Phase 117 Plan 02: Visual Reference Transfer Allowlist Summary

**SEP-02 visual reference transfer rule with allowlist/denylist, restyling visualTokenBrief guard, and unconditional factual-source rule in derivation prompts**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `buildVisualReferenceTransferRuleSection` and `extractPromptVisualReferenceTransferSection` with SEP-02 allowlist/denylist terms
- Injected VISUAL REFERENCE TRANSFER RULE after INPUT SOURCE CLASSIFICATION for all restyling prompts
- Blocked `Extracted Visual Token Brief` injection for restyling to prevent factual leak via style reference tokens
- Made RESTYLING FACTUAL-SOURCE RULE unconditional on `styleAssetId` presence at prompt-build time
- Extended unit and regression tests for injection order and restyling invariants

## Task Commits

1. **Task 1: Add VISUAL REFERENCE TRANSFER RULE builder and extractor** — `13b087c8` (test), `9b11442b` (feat)
2. **Task 2: Guard visualTokenBrief and unconditional restyling factual-source rule** — `d38b40e2` (test), `f2cd0900` (feat)

## Files Created/Modified

- `app/src/server/ai/factual-visual-separation.ts` — Transfer rule builder, extractor, classification boundary fix
- `app/src/server/ai/prompt-builder.ts` — Restyling injection order, visualTokenBrief guard, unconditional factual rule
- `app/src/server/ai/prompt-builder.test.ts` — Visual reference transfer and restyling guard tests
- `app/tests/unit/ai/quality-prompt-regression.test.ts` — Restyling regression asserts for SEP-02 terms and no visualTokenBrief

## Decisions Made

- Client library `style` references add a visual-only clarification line in the transfer section when present
- `visualTokenBrief` remains excluded for art_variation and format_adaptation (unchanged); restyling now also excluded

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SEP-02 complete; Plan 03 can build lineage firewall on contamination codes
- Plan 04 can extend gate with `invented_factual_entity`

## Self-Check: PASSED

- FOUND: app/src/server/ai/factual-visual-separation.ts
- FOUND: .planning/phases/117-factual-vs-visual-separation/117-02-SUMMARY.md
- FOUND: commit 13b087c8
- FOUND: commit 9b11442b
- FOUND: commit d38b40e2
- FOUND: commit f2cd0900

---
*Phase: 117-factual-vs-visual-separation*
*Completed: 2026-06-15*
