---
phase: 140-advisor-and-generation-direction
plan: "02"
subsystem: api
tags: [olhar, generation-direction, prompt-builder, creative-score, dual-verdict, voice-gate]

requires:
  - phase: 140-01
    provides: BaseCreativeReading and Passagem Olhar helper
provides:
  - Generation direction section injected into derivation prompts
  - Conservative Cenbrap voice review gate for prompt injection
  - Direction-first creative score prompt with backward-compatible qualityScore
  - Frontend derivation types carrying olharVerdict and exportStatus
affects:
  - 141 workspace UI reprioritization

tech-stack:
  added: []
  patterns:
    - "DIRECAO DE ARTE PARA GERACAO sits after factual contract blocks and before MODE"
    - "Client voice injection gated on CENBRAP_VOICE_REVIEW_STATUS until manual approval"
    - "Score prompt primary output is directionNote/olharVerdict; qualityScore is secondary analytics"

key-files:
  created:
    - app/src/server/ai/olhar/generation-direction.ts
    - app/src/server/ai/olhar/generation-direction.test.ts
    - app/src/server/ai/voices/voice-review-gate.ts
  modified:
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/ai/prompt-builder.test.ts
    - app/src/server/ai/creative-score.ts
    - app/tests/unit/ai/creative-score.test.ts
    - app/src/lib/hooks/use-derivations.ts
    - app/src/lib/hooks/use-derivations.test.tsx
    - app/src/lib/mock-data.ts

key-decisions:
  - "Keep Cenbrap voice injection disabled while 138-VOICE-REVIEW is pending_review"
  - "Generation direction summarizes sacred facts, variation range, and Olhar anti-patterns before flexible strategy"
  - "Score normalization keeps legacy score-only payloads; direction fields are optional"

patterns-established:
  - "buildGenerationDirectionSection accepts optional baseReading from preflight"
  - "ScoreResult exposes olharVerdict/whatWorks/whatBlocks/directionNote without breaking numeric score storage"

requirements-completed: [ADVISOR-03, ADVISOR-04]

duration: 5min
completed: 2026-06-19
---

# Phase 140 Plan 02: Generation Direction and Score Demotion Summary

**Derivation prompts now carry a concise DIRECAO DE ARTE block before flexible strategy, and creative scoring treats olharVerdict/direction as primary while qualityScore remains for analytics compatibility.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-19T12:15:00Z
- **Completed:** 2026-06-19T12:20:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added `buildGenerationDirectionSection` with sacred facts, allowed variation, Olhar anti-patterns, and export second-pass reminder
- Wired generation direction into `buildDerivationPrompt` after factual contract blocks and before MODE rules
- Gated Cenbrap client voice on `pending_review` with explicit `allowClientVoice` override for tests
- Reframed `buildCreativeScorePrompt` as direction-first with secondary/internal `qualityScore`
- Extended `ScoreResult`, `use-derivations`, and mock derivation types with `olharVerdict` and `exportStatus`

## Task Commits

Each task was committed atomically:

1. **Task 140-02-01: Inject generation direction into prompt-builder** - `f9cc40cc` (feat)
2. **Task 140-02-02: Demote numeric score to compatibility/detail** - `28091d87` (feat)

## Files Created/Modified

- `app/src/server/ai/olhar/generation-direction.ts` - Art-direction paragraph builder for generation prompts
- `app/src/server/ai/olhar/generation-direction.test.ts` - Sacred facts, anti-patterns, voice gate tests
- `app/src/server/ai/voices/voice-review-gate.ts` - Cenbrap review status gate for voice injection
- `app/src/server/ai/prompt-builder.ts` - Injects direction section; extractor stops before direction block
- `app/src/server/ai/creative-score.ts` - Direction-first score prompt and optional direction fields on ScoreResult
- `app/src/lib/hooks/use-derivations.ts` - Derivation type carries dual-verdict payloads
- `app/src/lib/mock-data.ts` - Mock derivation type parity for dual verdict fields

## Decisions Made

- Cenbrap voice stays out of live prompts until `CENBRAP_VOICE_REVIEW_STATUS` is set to `approved`
- Generation direction uses preflight `baseReading` when available for gestalt preservation
- Legacy score-only API responses continue to normalize without direction fields

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restyling factual-source extractor included generation direction**
- **Found during:** Task 140-02-01 verification
- **Issue:** `extractPromptRestylingFactualSourceSection` captured the new direction block because it ended at MODE
- **Fix:** Stop extraction at `DIRECAO DE ARTE PARA GERACAO` marker before MODE
- **Files modified:** `app/src/server/ai/prompt-builder.ts`
- **Committed in:** `f9cc40cc`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Extraction helper fix required for existing snapshot tests; no scope change.

## Issues Encountered

None beyond the extractor boundary fix above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 141 can surface `olharVerdict`, `directionNote`, and `exportStatus` in workspace UI without further server contract work
- Approve Cenbrap voice in `138-VOICE-REVIEW.md` and set `CENBRAP_VOICE_REVIEW_STATUS` to `approved` before enabling live client voice injection

---
*Phase: 140-advisor-and-generation-direction*
*Completed: 2026-06-19*

## Self-Check: PASSED

- FOUND: .planning/phases/140-advisor-and-generation-direction/140-02-SUMMARY.md
- FOUND: app/src/server/ai/olhar/generation-direction.ts
- FOUND: app/src/server/ai/voices/voice-review-gate.ts
- FOUND: commit f9cc40cc
- FOUND: commit 28091d87
