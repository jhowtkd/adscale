---
phase: 75-event-schema-and-ingest-foundation
plan: 02
subsystem: api
tags: [zod, sanitization, beta-analytics, pii, allowlist]

requires: []
provides:
  - ALLOWED_PROPERTY_KEYS global union for beta event properties
  - sanitizeBetaEventProperties with reject-unknown strictObject semantics
  - createBetaEventBodySchema for HTTP ingest body validation
affects:
  - 75-03 (recordBetaAnalyticsEvent ingest path)
  - Phase 76 instrumentation hooks

tech-stack:
  added: []
  patterns:
    - "z.strictObject allowlist-only property validation (reject unknown keys)"
    - "DENIED_KEY_NAMES belt-and-suspenders PII key rejection"
    - "32KB JSON properties size cap mirroring feedback MAX_DIAGNOSTIC_BYTES"

key-files:
  created:
    - app/src/server/beta-analytics/types.ts
    - app/src/server/beta-analytics/sanitize.ts
    - app/src/server/beta-analytics/sanitize.test.ts
  modified: []

key-decisions:
  - "Global ALLOWED_PROPERTY_KEYS union for Phase 75; per-event_key families deferred to Phase 76"
  - "Unknown keys rejected via z.strictObject, not silently stripped (stricter than feedback blocklist)"
  - "Denied PII key names checked before strictObject parse for explicit error semantics"

patterns-established:
  - "BetaEventPropertiesValidationError with code validation_error for upstream 400 mapping"
  - "Scalar-only property values (string | number | boolean | null)"

requirements-completed: [INST-05, INST-06]

duration: 3min
completed: 2026-06-07
---

# Phase 75 Plan 02: PII-Safe Property Sanitization Summary

**Allowlist-only beta analytics property validation with z.strictObject reject-unknown semantics, denied PII keys, and 32KB payload cap.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-07T13:00:00Z
- **Completed:** 2026-06-07T13:01:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Exported `ALLOWED_PROPERTY_KEYS`, `BetaEventSource`, and `createBetaEventBodySchema` for ingest contracts
- Implemented `sanitizeBetaEventProperties` using `z.strictObject` with explicit `DENIED_KEY_NAMES` check
- Added 15 unit tests covering INST-05/06 sanitization behaviors (all green)

## Task Commits

1. **Task 1: Define beta analytics types and global property allowlist schema** - `8da3b4d4` (feat)
2. **Task 2: Comprehensive sanitization unit tests** - `4e898b69` (test)

## Files Created/Modified

- `app/src/server/beta-analytics/types.ts` - Event key schema and property key allowlist
- `app/src/server/beta-analytics/sanitize.ts` - strictObject sanitization, size enforcement, validation error type
- `app/src/server/beta-analytics/sanitize.test.ts` - INST-05/06 coverage (15 tests)

## Decisions Made

- Global property allowlist for Phase 75; Phase 76 may extend per `event_key` family
- Reject-unknown semantics (not feedback-style silent strip) per D-06 / INST-05
- Denied keys checked before Zod parse so PII key names always fail with `deniedKeys` details

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: app/src/server/beta-analytics/types.ts
- FOUND: app/src/server/beta-analytics/sanitize.ts
- FOUND: app/src/server/beta-analytics/sanitize.test.ts
- FOUND: 8da3b4d4
- FOUND: 4e898b69
