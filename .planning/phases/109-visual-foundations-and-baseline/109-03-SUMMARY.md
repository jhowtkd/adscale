---
phase: 109-visual-foundations-and-baseline
plan: "03"
subsystem: ui-foundations
tags: [css, design-tokens, oklch, tailwind, static-analysis, vitest]
requires:
  - phase: 109-02
    provides: Immutable before-change CSS evidence and authenticated visual debt baseline
provides:
  - Canonical light/dark semantic color and state roles with one-way compatibility aliases
  - Shared geometry, density, typography, radius, motion, shell, width, and layer contracts
  - Deterministic static enforcement that freezes existing visual dialect debt
affects: [109-04, 109-05, 109-06, 110, 111, 112, 113, 114]
tech-stack:
  added: []
  patterns: [canonical semantic CSS roles, one-way compatibility aliases, exact per-file debt allowlists]
key-files:
  created:
    - app/scripts/check-visual-contract.mjs
    - app/scripts/check-visual-contract.test.mjs
    - app/src/components/ui/visual-foundations.test.tsx
  modified:
    - app/src/app/globals.css
key-decisions:
  - "Canonical semantic roles own all theme values; live legacy names are one-way aliases only."
  - "Existing visual debt is frozen by exact file and rule counts while later owner phases migrate consumers."
patterns-established:
  - "Foundation contracts are additive and opt-in; route composition and public behavior remain unchanged."
  - "Global layers are numeric, strictly ordered, and exposed through variable-backed utility hooks."
requirements-completed: [FOUND-01, FOUND-02, FOUND-03, FOUND-04]
duration: 8 min
completed: 2026-06-13
---

# Phase 109 Plan 03: Canonical Foundation Contract Summary

**OKLCH semantic themes, compact product geometry, ordered global layers, and debt-aware static enforcement without route migration**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-13T13:38:18Z
- **Completed:** 2026-06-13T13:46:15Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Made canonical canvas, surface, content, border, focus, accent, and five semantic state families authoritative in both themes while retaining compatibility aliases.
- Added shared spacing, density, typography, radius, motion, shell geometry, responsive gutter, content-width, shadow, and layer contracts with small opt-in utilities.
- Added a section-filtered visual contract checker, node self-tests, and real-stylesheet Vitest specifications that reject new undefined variables and visual dialect debt.

## Task Commits

1. **Create Wave 0 contract tests and debt-aware static enforcement** - `e2934b7b` (test)
2. **Implement canonical colors, semantic states, and additive aliases** - `a125e564` (feat)
3. **Implement geometry, density, typography, radius, motion, and content-width contracts** - `27810aec` (feat)
4. **Implement the single global layer contract and close foundation checks** - `c5c2af5f` (feat)

## Files Created/Modified

- `app/scripts/check-visual-contract.mjs` - Parses CSS contracts and authenticated class usage with stable diagnostics and exact debt allowlists.
- `app/scripts/check-visual-contract.test.mjs` - Covers valid fixtures, missing tokens, undefined variables, reverse aliases, raw layers, malformed CSS, and import failures.
- `app/src/app/globals.css` - Defines canonical semantic, geometry, density, motion, width, and layer contracts plus compatibility aliases.
- `app/src/components/ui/visual-foundations.test.tsx` - Proves the real stylesheet contract and ordered layer scale.

## Decisions Made

- Canonical roles are the only source of theme values; deprecated hue and historical public names remain callers-only aliases until their owner phases migrate them.
- Visual debt enforcement uses exact pre-change counts per file and rule, preventing growth without forcing broad route edits in the foundation phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected selector parsing and section boundaries in the checker**
- **Found during:** Task 2 token verification
- **Issue:** The first selector lookup could match incidental `:root` text, and the token filter incorrectly required geometry and layer contracts scheduled for later tasks.
- **Fix:** Anchored selector parsing to CSS blocks and made token, geometry, and layer completeness checks honor their named sections.
- **Files modified:** `app/scripts/check-visual-contract.mjs`
- **Verification:** Checker self-tests and all four section/full CLI invocations pass.
- **Committed in:** `a125e564`, refined in `27810aec`

---

**Total deviations:** 1 auto-fixed bug.
**Impact on plan:** The correction made the planned staged verification reliable; no scope or behavior expansion.

## Issues Encountered

- Lint completed with zero errors and 69 pre-existing warnings outside this plan's implementation scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 109-04 can consume canonical roles in shared primitives without inventing new route-local values.
- Protected billing and preview-fix files remain exactly at their captured dirty state and were never staged.

## Self-Check: PASSED

- All four planned files exist and all four task commits are present.
- Full visual contract, focused Vitest, lint, protected-state, immutable scope, and diff checks pass.

---
*Phase: 109-visual-foundations-and-baseline*
*Completed: 2026-06-13*
