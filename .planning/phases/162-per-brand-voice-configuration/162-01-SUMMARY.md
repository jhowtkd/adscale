---
phase: 162-per-brand-voice-configuration
plan: "01"
subsystem: database
tags: [drizzle, postgres, vitest, client-voice, jsonb]

requires: []
provides:
  - client_profile_olhar_config table with review_status and config JSONB
  - Workspace-scoped repository get/upsert for olhar voice config
  - Idempotent Cenbrap seed script from CENBRAP_VOICE
  - buildClientVoiceFromConfig with shared prompt section builder
affects:
  - 162-02-PLAN (generation wiring)
  - 162-03-PLAN (owner read API/UI)

tech-stack:
  added: []
  patterns:
    - "1:1 client_profile_olhar_config keyed by client_profile_id with workspace isolation"
    - "Shared buildClientVoicePromptLines for hardcoded and DB-derived voices"

key-files:
  created:
    - app/drizzle/0053_client_profile_olhar_config.sql
    - app/src/server/repositories/client-profile-olhar-config.ts
    - app/src/server/repositories/client-profile-olhar-config.test.ts
    - app/scripts/seed-cenbrap-voice-config.ts
    - app/src/server/ai/voices/voice-config-parity.test.ts
    - app/src/server/ai/voices/voice-prompt-section.ts
  modified:
    - app/src/server/db/schema.ts
    - app/src/server/ai/voices/client-voice.ts
    - app/src/server/ai/voices/cenbrap.ts

key-decisions:
  - "Extracted voice-prompt-section.ts to share prompt line builder between CENBRAP_VOICE and DB config reconstruction"
  - "Upsert targets client_profile_id PK for idempotent seed semantics"

patterns-established:
  - "Olhar voice config: (workspaceId, clientProfileId) scoped reads; JSONB stores ClientVoice arrays without buildPromptSection"
  - "Seed script dry-run by default with --confirm gate, matching calibration corpus scripts"

requirements-completed: [VOICE-01, VOICE-03]

duration: 12min
completed: 2026-06-23
---

# Phase 162 Plan 01: Olhar Voice Persistence Summary

**Dedicated `client_profile_olhar_config` table with workspace-scoped repository, Cenbrap seed script, and golden parity between DB-shaped config and `CENBRAP_VOICE` prompt output**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-23T21:09:00Z
- **Completed:** 2026-06-23T21:12:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Migration 0053 and Drizzle model for per-profile Olhar voice config with `review_status` and `source` metadata
- Repository with `getOlharVoiceConfigByClientProfileId` and `upsertOlharVoiceConfig` enforcing workspace isolation
- Idempotent `seed-cenbrap-voice-config.ts` upserting approved Cenbrap config from `CENBRAP_VOICE`
- `buildClientVoiceFromConfig` + shared `buildClientVoicePromptLines` with parity golden test

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration, schema, and repository for olhar voice config** - `c99c1acd` (feat)
2. **Task 2: Cenbrap seed script and prompt parity golden test** - `348713d2` (feat)

## Files Created/Modified

- `app/drizzle/0053_client_profile_olhar_config.sql` - Table with JSONB config, review_status check, unique (workspace_id, client_profile_id)
- `app/src/server/db/schema.ts` - `clientProfileOlharConfig` model and `OlharVoiceConfigPayload` type
- `app/src/server/repositories/client-profile-olhar-config.ts` - Get/upsert with workspace filter
- `app/src/server/repositories/client-profile-olhar-config.test.ts` - Insert, null, workspace isolation tests
- `app/scripts/seed-cenbrap-voice-config.ts` - Dry-run/confirm idempotent Cenbrap seed
- `app/src/server/ai/voices/voice-prompt-section.ts` - Shared prompt line builder
- `app/src/server/ai/voices/client-voice.ts` - `buildClientVoiceFromConfig` helper
- `app/src/server/ai/voices/cenbrap.ts` - Delegates `buildPromptSection` to shared builder
- `app/src/server/ai/voices/voice-config-parity.test.ts` - Golden parity vs `CENBRAP_VOICE`

## Decisions Made

- Extracted `voice-prompt-section.ts` to avoid duplicating prompt logic and guarantee parity by construction
- Upsert conflict target is `client_profile_id` (1:1 with profile) per D-01 schema decision

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Shared prompt section builder**
- **Found during:** Task 2 (parity test implementation)
- **Issue:** Duplicating `buildPromptSection` in `buildClientVoiceFromConfig` would risk drift from hardcoded `CENBRAP_VOICE`
- **Fix:** Added `voice-prompt-section.ts`; refactored `cenbrap.ts` to use it
- **Files modified:** `app/src/server/ai/voices/voice-prompt-section.ts`, `app/src/server/ai/voices/cenbrap.ts`
- **Verification:** `voice-config-parity.test.ts` and `client-voice.test.ts` pass
- **Committed in:** `348713d2`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Ensures VOICE-03 parity guarantee; no generation wiring added (deferred to Plan 02).

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. Run seed with `npx tsx scripts/seed-cenbrap-voice-config.ts --confirm` after migration applies.

## Next Phase Readiness

- Persistence and seed ready for Plan 02 to wire `resolveVoiceForClientProfile` into `generation-direction.ts`
- `voice-review-gate.ts` still reads hardcoded status — Plan 02 should generalize to DB `review_status`

---
*Phase: 162-per-brand-voice-configuration*
*Completed: 2026-06-23*

## Self-Check: PASSED

- FOUND: app/drizzle/0053_client_profile_olhar_config.sql
- FOUND: app/src/server/repositories/client-profile-olhar-config.ts
- FOUND: app/scripts/seed-cenbrap-voice-config.ts
- FOUND: app/src/server/ai/voices/voice-config-parity.test.ts
- FOUND: commit c99c1acd
- FOUND: commit 348713d2
