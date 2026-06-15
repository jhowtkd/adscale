---
phase: 123-visual-validation-gate
plan: "03"
subsystem: testing
tags: [creative-validation, qa-18, qa-19, qa-20, operator-capture, openai-images]

requires:
  - phase: 123-01
    provides: CREATIVE_VALIDATION_MATRIX and matrixKeys() for evidence pairing
  - phase: 123-02
    provides: check-creative-validation-evidence.mjs and aggregation module
provides:
  - run-creative-validation.ts operator orchestrator (dry-run + live capture)
  - Sanitized base assets under app/tests/fixtures/creative-corpus/base-assets/
  - 123-EVIDENCE.json with 6 paired before/after captures and aggregate fields
  - validation-after/ PNG subset (6 post-fix regenerated images)
  - package.json validate:creative and validate:creative:live scripts
affects:
  - 123-04-release-gate

tech-stack:
  added: []
  patterns:
    - "Operator-only live capture via OPENAI_API_KEY; evidence committed for CI final gate"
    - "Production scoring path: analyzeCreativeQa + analyzeDerivationCreative + computeQualityGateFromAnalysis"
    - "Evidence check tsx subprocess cwd appDir for repo-relative TypeScript imports"

key-files:
  created:
    - app/scripts/run-creative-validation.ts
    - app/tests/fixtures/creative-corpus/base-assets/nr1-1x1-base.png
    - app/tests/fixtures/creative-corpus/base-assets/educacao-base.png
    - app/tests/fixtures/creative-corpus/base-assets/educacao-style-ref.png
    - app/tests/fixtures/creative-corpus/base-assets/master-nr1-base.png
    - app/tests/fixtures/creative-corpus/base-assets/smoke-base.png
    - .planning/phases/123-visual-validation-gate/123-EVIDENCE.json
    - app/exports/render-creatives/validation-after/*.png
  modified:
    - app/package.json
    - app/scripts/check-creative-validation-evidence.mjs

key-decisions:
  - "Base assets sanitized and committed for matrix regeneration inputs (no full 34-piece corpus)"
  - "seedSupported false with promptProvenanceHash from prompt-builder.ts git hash-object"
  - "After-stage fidelity hard failures logged as warnings until plan 04 --stage final"

patterns-established:
  - "Operator script resolves before captures from corpus manifest; after captures via images.edit + production gate"
  - "CLI flags --dry-run, --skip-regen, --matrix-key for iterative operator workflow"

requirements-completed: [QA-18, QA-19, QA-20]

duration: 45min
completed: 2026-06-15
---

# Phase 123 Plan 03: Operator Capture + Live Evidence Summary

**Operator orchestrator regenerates all six matrix cells post-fix, scores via production gate analyzers, and commits paired before/after evidence with validation-after PNGs**

## Performance

- **Duration:** ~45 min (includes operator live capture checkpoint)
- **Started:** 2026-06-15T20:45:00Z
- **Completed:** 2026-06-15T21:30:00Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Sanitized base assets committed for all matrix `baseAsset` references
- `run-creative-validation.ts` dry-run resolves six before captures; live path regenerates, scores, and writes evidence
- Operator live capture produced `123-EVIDENCE.json` with 6 before + 6 after rows, sha256 hashes, qa/score/gate fields
- Six `validation-after/` PNGs committed; `--stage after` structural check passes (6/6)
- Fidelity warnings on `wrong_brand` (nova-campanha restyling) and `unsupported_offer` (smoke) — expected; aggregate thresholds enforced in plan 04

## Task Commits

Each task was committed atomically:

1. **Task 1: Commit sanitized base assets and package scripts** - `a3a2bf41` (feat)
2. **Task 2: Implement run-creative-validation.ts operator orchestrator** - `6f8afe6d` (feat)
3. **Task 3: Operator live capture with OPENAI_API_KEY** - `fbc34d15` (feat)

**Checkpoint progress doc:** `b897b846` (docs: live-capture checkpoint)

## Files Created/Modified

- `app/scripts/run-creative-validation.ts` — Operator generate + score + evidence writer
- `app/tests/fixtures/creative-corpus/base-assets/*.png` — Matrix regeneration inputs
- `.planning/phases/123-visual-validation-gate/123-EVIDENCE.json` — Committed validation evidence
- `app/exports/render-creatives/validation-after/*.png` — Post-fix regenerated captures
- `app/package.json` — `validate:creative`, `validate:creative:live` scripts
- `app/scripts/check-creative-validation-evidence.mjs` — tsx cwd fix to `appDir`

## Decisions Made

- Followed plan: no custom entity CV; production `hardFailures` are authoritative for QA-20
- Threshold enforcement deferred to plan 04 `--stage final` per staged validation design

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fix check script tsx import paths cwd**
- **Found during:** Task 3 verification (`--stage after`)
- **Issue:** tsx subprocess used `repoRoot` cwd with `./app/scripts/...` imports — module resolution failed from repo root
- **Fix:** Set `appDir` cwd and use `./scripts/...` and `./src/server/...` import paths
- **Files modified:** `app/scripts/check-creative-validation-evidence.mjs`
- **Verification:** `node app/scripts/check-creative-validation-evidence.mjs --stage after` exits 0
- **Committed in:** `fbc34d15`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required for evidence structural validation; no scope creep.

## Authentication Gates

**Task 3 (checkpoint:human-action):** Operator set `OPENAI_API_KEY` in `app/.env.local` and ran `npm run validate:creative:live`. Resume signal: "captured". Outcome: evidence + PNGs committed; `--stage after` passes.

## Issues Encountered

- Two after captures have fidelity-class hard failures (`wrong_brand`, `unsupported_offer`) — logged as warnings at after stage; plan 04 final gate will enforce aggregate thresholds

## User Setup Required

None for CI. Operator live capture requires `OPENAI_API_KEY` in `app/.env.local` (operator machine only — never CI).

## Next Phase Readiness

- Evidence JSON and validation-after PNGs ready for plan 04 release gate orchestrator
- Run `node app/scripts/check-creative-validation-evidence.mjs --stage final` after plan 04 implements threshold enforcement
- Fidelity warnings may require prompt iteration before final gate passes

## Self-Check: PASSED

- FOUND: `.planning/phases/123-visual-validation-gate/123-EVIDENCE.json`
- FOUND: `app/exports/render-creatives/validation-after/` (6 PNGs)
- FOUND: `a3a2bf41`, `6f8afe6d`, `fbc34d15`
- VERIFIED: `--stage after` exits 0

---
*Phase: 123-visual-validation-gate*
*Completed: 2026-06-15*
