---
phase: 162-per-brand-voice-configuration
plan: "02"
subsystem: ai
tags: [vitest, drizzle, client-voice, generation-direction, prompt-builder]

requires:
  - phase: 162-01
    provides: client_profile_olhar_config repository, buildClientVoiceFromConfig, Cenbrap seed
provides:
  - resolveVoiceForClientProfile(workspaceId, clientProfileId) async resolver
  - Profile-based voice injection in buildGenerationDirectionSection
  - DB review_status-driven voice-review-gate
  - Deprecated resolveClientVoice removed from generation path
affects:
  - 162-03-PLAN (owner inspect API consumes same config rows)

tech-stack:
  added: []
  patterns:
    - "Generation resolves brand voice exclusively by (workspaceId, clientProfileId) — no campaign string fallback"
    - "buildDerivationPrompt async to support DB voice lookup in generation-direction"

key-files:
  created:
    - app/src/server/ai/voices/voice-config-resolver.ts
    - app/src/server/ai/voices/voice-config-resolver.test.ts
  modified:
    - app/src/server/ai/olhar/generation-direction.ts
    - app/src/server/ai/olhar/generation-direction.test.ts
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/ai/voices/voice-review-gate.ts
    - app/src/server/ai/voices/client-voice.ts
    - app/src/server/jobs/derivation.ts

key-decisions:
  - "Made buildDerivationPrompt async so generation-direction can await DB voice lookup"
  - "Review gate uses reviewStatus from config row; legacy CENBRAP_VOICE_REVIEW_STATUS no longer blocks generation path"

patterns-established:
  - "Missing clientProfileId or workspaceId → no voice overlay, no throw"
  - "pending_review config blocked unless allowClientVoice forceApproved override"

requirements-completed: [VOICE-02, VOICE-04]

duration: 12min
completed: 2026-06-23
---

# Phase 162 Plan 02: Profile-Based Generation Voice Wiring Summary

**Generation resolves brand voice by `clientProfileId` with DB `review_status` gate; string-matching `resolveClientVoice` deprecated and removed from the prompt path**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-23T21:09:00Z
- **Completed:** 2026-06-23T21:15:00Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments

- `resolveVoiceForClientProfile` loads olhar config by `(workspaceId, clientProfileId)` and builds `ClientVoice`
- `buildGenerationDirectionSection` injects CLIENT VOICE only when profile resolves and `review_status === approved` (or `allowClientVoice`)
- Campaign name "CENBRAP NR1" without `clientProfileId` no longer injects voice
- `isClientVoiceInjectionAllowed` generalized to DB `reviewStatus`; hardcoded Cenbrap pending block removed from generation path
- `resolveClientVoice` and `REGISTERED_VOICES` marked `@deprecated` for legacy unit tests only

## Task Commits

Each task was committed atomically:

1. **Task 1: Profile-based voice resolver and generation-direction wiring** - `2bb78b67` (feat)
2. **Task 2: Generalize review gate and deprecate string-matching resolver** - `3e026ac0` (feat)

## Files Created/Modified

- `app/src/server/ai/voices/voice-config-resolver.ts` - Async resolver via repository + `buildClientVoiceFromConfig`
- `app/src/server/ai/voices/voice-config-resolver.test.ts` - Approved/missing profile tests
- `app/src/server/ai/olhar/generation-direction.ts` - Profile-based injection; async section builder
- `app/src/server/ai/olhar/generation-direction.test.ts` - Mocks resolver; asserts no string fallback
- `app/src/server/ai/prompt-builder.ts` - `clientProfileId` on Campaign; async `buildDerivationPrompt`
- `app/src/server/ai/voices/voice-review-gate.ts` - `reviewStatus` option; removed cenbrap hardcode path
- `app/src/server/ai/voices/client-voice.ts` - `@deprecated` on legacy string resolver
- `app/src/server/jobs/derivation.ts` - Await async prompt builder

## Decisions Made

- Made `buildDerivationPrompt` async (required for DB lookup in generation-direction) with await propagated to derivation job and test suites
- Review gate trusts `reviewStatus` from config row when provided; no fallback to hardcoded `CENBRAP_VOICE_REVIEW_STATUS` on generation path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed OlharVoiceConfigPayload import path**
- **Found during:** Task 2 (TypeScript verification)
- **Issue:** `client-voice.ts` imported `../db/schema` (wrong relative path from `voices/`)
- **Fix:** Changed to `../../db/schema`
- **Files modified:** `app/src/server/ai/voices/client-voice.ts`
- **Verification:** `tsc --noEmit` no longer reports client-voice schema import error
- **Committed in:** `3e026ac0`

**2. [Rule 3 - Blocking] Propagated async buildDerivationPrompt to callers**
- **Found during:** Task 1 (async generation-direction wiring)
- **Issue:** DB resolver is async; sync prompt builder could not await voice lookup
- **Fix:** `buildDerivationPrompt` async; updated derivation job, auto-retry, scripts, and test files
- **Files modified:** `prompt-builder.ts`, `derivation.ts`, `derivation-auto-retry.ts`, multiple test/script files
- **Verification:** `npm test -- prompt-builder.test.ts` and voice tests pass (76 + 23 tests)
- **Committed in:** `2bb78b67`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Async propagation required for correct profile-based resolution; no scope creep.

## Issues Encountered

- `npm run build` blocked by concurrent Next.js build process; TypeScript check and unit tests used for verification instead

## User Setup Required

None - seed from Plan 01 (`npx tsx scripts/seed-cenbrap-voice-config.ts --confirm`) must be run for production Cenbrap injection when campaigns have `clientProfileId`.

## Next Phase Readiness

- Generation path ready for Plan 03 owner inspect UI/API (reads same `client_profile_olhar_config` rows)
- Cenbrap campaigns need `clientProfileId` set on campaign record for voice injection in production

---
*Phase: 162-per-brand-voice-configuration*
*Completed: 2026-06-23*

## Self-Check: PASSED

- FOUND: app/src/server/ai/voices/voice-config-resolver.ts
- FOUND: app/src/server/ai/olhar/generation-direction.ts
- FOUND: app/src/server/ai/voices/voice-review-gate.ts
- FOUND: commit 2bb78b67
- FOUND: commit 3e026ac0
