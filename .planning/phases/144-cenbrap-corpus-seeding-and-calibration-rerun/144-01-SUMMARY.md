---
phase: 144-cenbrap-corpus-seeding-and-calibration-rerun
plan: 01
subsystem: database
tags: [cenbrap, calibration, corpus, drizzle, tsx, synthetic-fixture]

requires:
  - phase: 143-live-cenbrap-calibration-run
    provides: insufficient_campaigns evidence and live calibration pipeline
provides:
  - Corpus inspection report (144-CORPUS-RUN.md)
  - Idempotent seed script with dry-run default
  - Two synthetic_fixture Cenbrap campaigns with dual verdict
  - Corpus manifest with source labels
affects: [144-02, 145]

tech-stack:
  added: []
  patterns:
    - "Operator seed scripts default to dry-run; --confirm required for writes"
    - "Corpus source labels on every manifest row (synthetic_fixture)"

key-files:
  created:
    - app/scripts/seed-cenbrap-calibration-corpus.ts
    - .planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-RUN.md
    - .planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-MANIFEST.json
  modified: []

key-decisions:
  - "Use synthetic_fixture source label — operational calibration only, not customer evidence"
  - "Target dev@adscale.local workspace for local calibration corpus"
  - "Apply drizzle/0047 migration inline when local DB lacked dual-verdict columns"

patterns-established:
  - "Cenbrap Calibration — campaign prefix for idempotent seed cleanup"
  - "inspectCenbrapCorpus() exported for reuse in seed and inspection flows"

requirements-completed: [CORPUS-01, CORPUS-02]

duration: 25min
completed: 2026-06-19
---

# Phase 144 Plan 01: Corpus Source Inspection and Safe Seeding Path Summary

**Idempotent Cenbrap calibration corpus seed with inspection, dry-run default, and two synthetic_fixture campaigns meeting the conservative matcher**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-19T17:00:00Z
- **Completed:** 2026-06-19T17:15:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Documented target environment (`app/.env.local`) and pre-seed inspection (0 Cenbrap candidates)
- Added `seed-cenbrap-calibration-corpus.ts` with `--inspect-only`, dry-run default, and `--confirm` writes
- Seeded two Cenbrap campaigns with dual verdict, safe output keys, and manifest source labels
- Met campaign minimum gate (≥ 2 matched campaigns); no `operator_data_unavailable` blocker

## Task Commits

1. **Task 1: Target environment and corpus inspection** - `14618e8a` (docs)
2. **Task 2: Idempotent seed/import path** - `0bdd06a2` (feat)
3. **Task 3: Campaign minimum gate** - `c9b0b3cc` (feat)

**Plan metadata:** `1431561a` (docs: complete plan)

## Files Created/Modified

- `app/scripts/seed-cenbrap-calibration-corpus.ts` - Inspect, dry-run, and idempotent seed for Cenbrap calibration corpus
- `.planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-RUN.md` - Environment, inspection, seed, and gate evidence
- `.planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-MANIFEST.json` - Campaign ids, source labels, verdict summary

## Decisions Made

- Labeled all seeded rows `synthetic_fixture` — honest operational calibration, not real customer evidence
- Targeted Dev Admin workspace (`dev@adscale.local`) as first workspace in inspection order
- Applied missing `0047_derivation_dual_verdict` migration on local DB before seed (schema drift)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Applied dual-verdict migration before seed**
- **Found during:** Task 3 (seed --confirm)
- **Issue:** Local DB missing `derivations.olhar_verdict` / `export_status` columns; `createDerivation` failed
- **Fix:** Applied `drizzle/0047_derivation_dual_verdict.sql` via tsx + load-env
- **Files modified:** none (DB migration only)
- **Verification:** Seed --confirm succeeded; post-seed inspection shows 2 dual-verdict campaigns
- **Committed in:** c9b0b3cc (task 3 outcome, migration applied at runtime)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration required for seed to work on drifted local DB. No scope creep.

## Issues Encountered

- First `--confirm` attempt failed on missing DB columns; resolved by applying migration 0047

## User Setup Required

None — uses existing `app/.env.local` database. Operator should confirm synthetic fixtures are acceptable for calibration scope before Phase 145.

## Next Phase Readiness

- **144-02 ready:** Corpus exists; live calibration rerun can proceed
- **Phase 145:** Still blocked until 144-02 confirms `review_ready > 0` on contact sheet
- No `144-BLOCKERS.md` — minimum campaign gate passed

## Self-Check: PASSED

- FOUND: `.planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-RUN.md`
- FOUND: `.planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-MANIFEST.json`
- FOUND: `app/scripts/seed-cenbrap-calibration-corpus.ts`
- FOUND: `14618e8a`, `0bdd06a2`, `c9b0b3cc`

---
*Phase: 144-cenbrap-corpus-seeding-and-calibration-rerun*
*Completed: 2026-06-19*
