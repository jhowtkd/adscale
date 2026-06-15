---
phase: 116-canonical-creative-contract
plan: "01"
subsystem: api
tags: [creative-contract, derivation, prompt-builder, vitest, typescript]

requires:
  - phase: 115-corpus-fixtures-and-audit-baseline
    provides: corpus fixtures and audit baseline for downstream prompt tests
provides:
  - CanonicalCreative types with dominant idea, hook, proof zone, invariant identity, content tiers
  - resolveCanonicalCreative() runtime defaults from campaign/contract/diagnosis
  - buildCanonicalContractPromptSection() model-facing prose with RULE PRECEDENCE
  - PRECEDENCE_RULES constant for Phase 120 reuse
  - Job-populated canonicalCreative on every resolvedContract
  - Test fixtures with canonical fields for Plan 02
affects:
  - 116-02-prompt-injection
  - 116-03-mode-conflict-resolution
  - 120-gate-hardening

tech-stack:
  added: []
  patterns:
    - "Optional canonicalCreative on CreativeContract with read-time resolution fallback"
    - "Two-phase contract assembly: baseResolvedContract then canonicalCreative overlay"
    - "withCanonicalCreative helper in test fixtures"

key-files:
  created:
    - app/src/server/ai/canonical-creative-contract.ts
  modified:
    - app/src/server/ai/creative-contract.ts
    - app/src/server/jobs/derivation.ts
    - app/src/server/ai/prompt-builder.test-fixtures.ts
    - app/tests/unit/creative-contract.test.ts

key-decisions:
  - "Extract canonical logic to canonical-creative-contract.ts to keep creative-contract.ts under size limits"
  - "Preserve stored canonicalCreative from child contracts; only resolve when absent"
  - "buildCanonicalContractPromptSection resolves at read time when canonicalCreative is missing"

patterns-established:
  - "Pattern 3 resolution: diagnosis.detectedConcept > campaign.objective > contract.offer > fallback"
  - "PRECEDENCE_RULES as exported constant for cross-phase reuse"

requirements-completed: [CONT-01, CONT-02]

duration: 8min
completed: 2026-06-15
---

# Phase 116 Plan 01: Canonical Contract Types, Resolution, and Job Wiring Summary

**CanonicalCreative spine with tiered content precedence, runtime resolution from campaign/diagnosis, and job-populated canonicalCreative on every derivation contract**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-15T11:01:00Z
- **Completed:** 2026-06-15T11:09:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Extended `CreativeContract` with optional `canonicalCreative` carrying dominant idea, hook, proof zone, invariant identity, and three content tiers
- Implemented `resolveCanonicalCreative()` with diagnosis override and trim/sanitize defaults per threat model T-116-01
- Implemented `buildCanonicalContractPromptSection()` rendering CONT-01/02 labels and facts > hierarchy > decoration precedence
- Wired `canonicalCreative` population in derivation job assembly with child-contract preservation
- Extended prompt-builder test fixtures with `withCanonicalCreative` helper for Plan 02 downstream tests

## Task Commits

Each task was committed atomically:

1. **Task 116-01-01 (RED):** `ed15629d` — test(116-01): add failing tests for canonical creative contract
2. **Task 116-01-01 (GREEN):** `ff369990` — feat(116-01): add canonical creative contract types and prompt builder
3. **Task 116-01-02:** `3ef7d3c2` — feat(116-01): wire canonicalCreative into derivation job and fixtures

## Files Created/Modified

- `app/src/server/ai/canonical-creative-contract.ts` — CanonicalCreative types, PRECEDENCE_RULES, resolver, prompt section builder
- `app/src/server/ai/creative-contract.ts` — optional canonicalCreative field and type re-exports
- `app/src/server/jobs/derivation.ts` — populates canonicalCreative after base contract assembly
- `app/src/server/ai/prompt-builder.test-fixtures.ts` — withCanonicalCreative on all contract fixtures
- `app/tests/unit/creative-contract.test.ts` — canonical resolution and prompt section tests (12 passing)

## Decisions Made

- Used two-step contract assembly (`baseResolvedContract` then overlay) instead of duplicating canonicalCreative in both ternary branches
- Precedence test verifies ordered indices (Factual accuracy → Visual hierarchy → 3. Decoration) rather than a brittle regex

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed precedence order test assertion during GREEN phase**
- **Found during:** Task 116-01-01 (GREEN)
- **Issue:** Test regex `/facts.*hierarchy.*decoration/i` failed because PRECEDENCE_RULES uses "Factual accuracy" not "facts"
- **Fix:** Replaced regex with index-based ordering assertions on numbered precedence lines
- **Files modified:** `app/tests/unit/creative-contract.test.ts`
- **Verification:** `npm test -- tests/unit/creative-contract.test.ts -t "canonical"` passes
- **Committed in:** `ff369990`

---

**Total deviations:** 1 auto-fixed (1 bug in test assertion)
**Impact on plan:** Test-only fix; no production behavior change.

## TDD Gate Compliance

- RED commit present: `ed15629d`
- GREEN commit present: `ff369990`
- REFACTOR commit: not required

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 116-02 can inject `buildCanonicalContractPromptSection()` into `buildDerivationPrompt`
- Fixtures already carry `canonicalCreative` for downstream prompt regression tests
- `PRECEDENCE_RULES` exported for Phase 120 gate reuse

## Self-Check: PASSED

- FOUND: app/src/server/ai/canonical-creative-contract.ts
- FOUND: app/tests/unit/creative-contract.test.ts
- FOUND: ed15629d
- FOUND: ff369990
- FOUND: 3ef7d3c2

---
*Phase: 116-canonical-creative-contract*
*Completed: 2026-06-15*
