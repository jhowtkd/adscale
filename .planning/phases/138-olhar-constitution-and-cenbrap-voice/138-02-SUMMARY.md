---
phase: 138-olhar-constitution-and-cenbrap-voice
plan: "02"
subsystem: api
tags: [olhar, cenbrap, client-voice, art-direction-verdict, vitest]

requires:
  - phase: 138-01
    provides: Olhar constitution, axes, verdict vocabulary, and prompt-section patterns
provides:
  - First Cenbrap client voice overlay with principles, anti-references, and prompt builder
  - Client voice resolver with bounded match terms and null fallback for unknown clients
  - Art-direction verdict mapping from existing visual hard failures to sem_opiniao/confusa
  - Owner review checkpoint artifact for Jhonatan sign-off before Phase 140 injection
affects:
  - 139 dual-verdict contracts and olharVerdict persistence
  - 140 advisor/generation prompt rewrites with client voice injection

tech-stack:
  added: []
  patterns:
    - "ClientVoice contract with buildPromptSection() overlay on global Olhar constitution"
    - "resolveClientVoice matches bounded terms with accent-normalized substring checks"
    - "resolveArtDirectionVerdictFromFailures maps visual failures only; export failures return null"
    - "Verdict severity order confusa > sem_opiniao > quase > pronta for multi-failure resolution"

key-files:
  created:
    - app/src/server/ai/voices/cenbrap.ts
    - app/src/server/ai/voices/client-voice.ts
    - app/src/server/ai/voices/client-voice.test.ts
    - app/src/server/ai/olhar/art-direction-verdict.ts
    - app/src/server/ai/olhar/art-direction-verdict.test.ts
    - .planning/phases/138-olhar-constitution-and-cenbrap-voice/138-VOICE-REVIEW.md
  modified: []

key-decisions:
  - "Cenbrap voice uses principles and anti-patterns only — no fixed layout prescription in prompt section"
  - "Art-direction mapping returns null for export-only failures; confusa wins over sem_opiniao when both present"
  - "Voice review artifact defaults to pending_review until Jhonatan approves for Phase 140"

patterns-established:
  - "voices/ module for client-specific creative overlays resolved by campaign/client/product strings"
  - "art-direction-verdict.ts bridges CreativeHardFailureCode to future Olhar verdict language without persistence"

requirements-completed: [OLHAR-02, OLHAR-04]

metrics:
  duration: 5min
  completed: 2026-06-19
---

# Phase 138 Plan 02: Cenbrap Voice and Failure Mapping Summary

**Cenbrap client voice overlay with bounded resolver, visual hard-failure to art-direction verdict mapping, and owner review checkpoint for Phase 140 injection.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-19T09:56:00Z
- **Completed:** 2026-06-19T09:59:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `voices/cenbrap.ts` with editorial principles, positive/negative signals, authority/claims caution, invite rhythm, and correct-but-soulless examples.
- Created `voices/client-voice.ts` with `resolveClientVoice()` and `buildClientVoicePromptSection()` — Cenbrap matches on bounded terms, unknown clients return null.
- Created `olhar/art-direction-verdict.ts` mapping `generic_template_aesthetic` and `decorative_only_variation` to `sem_opiniao`, `missing_dominant_idea` and `visual_overload` to `confusa`.
- Added `138-VOICE-REVIEW.md` with `status: pending_review` for Jhonatan creative-director sign-off.

## Task Commits

Each task was committed atomically:

1. **Task 1: Client voice resolver and Cenbrap voice** — `d4255220` (test RED), `b7dc59b6` (feat GREEN)
2. **Task 2: Art-direction failure mapping** — `850aae34` (test RED), `76e887a9` (feat GREEN)

**Plan metadata:** pending (docs commit follows)

## Files Created/Modified

- `app/src/server/ai/voices/cenbrap.ts` — Cenbrap ClientVoice with prompt section builder
- `app/src/server/ai/voices/client-voice.ts` — Voice resolver and prompt-section export
- `app/src/server/ai/voices/client-voice.test.ts` — Matching, fallback, and section content tests
- `app/src/server/ai/olhar/art-direction-verdict.ts` — Visual failure to verdict mapping
- `app/src/server/ai/olhar/art-direction-verdict.test.ts` — Mapping coverage and export-only null tests
- `.planning/phases/138-olhar-constitution-and-cenbrap-voice/138-VOICE-REVIEW.md` — Owner review checkpoint

## Decisions Made

- Cenbrap voice explicitly states "no fixed layout prescription" while listing anti-template patterns.
- Multi-failure resolution uses deterministic severity: `confusa` beats `sem_opiniao`.
- Export/factual failures (`wrong_brand`, `cta_drift`, etc.) excluded from art-direction classification.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Vitest in this project does not accept `-x` flag; used standard `npm test -- <path>` instead.
- Test for "no fixed layout prescription" initially failed because negation text contained "fixed layout"; refined assertion to check prescriptive patterns only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 139 can implement `olharVerdict` persistence using `resolveArtDirectionVerdictFromFailures`.
- Phase 140 can inject `buildClientVoicePromptSection(resolveClientVoice(...))` after Jhonatan approves voice in `138-VOICE-REVIEW.md`.
- Blocker: voice review remains `pending_review` until manual sign-off.

## Self-Check: PASSED

- FOUND: app/src/server/ai/voices/cenbrap.ts
- FOUND: app/src/server/ai/voices/client-voice.ts
- FOUND: app/src/server/ai/voices/client-voice.test.ts
- FOUND: app/src/server/ai/olhar/art-direction-verdict.ts
- FOUND: app/src/server/ai/olhar/art-direction-verdict.test.ts
- FOUND: .planning/phases/138-olhar-constitution-and-cenbrap-voice/138-VOICE-REVIEW.md
- FOUND: d4255220
- FOUND: b7dc59b6
- FOUND: 850aae34
- FOUND: 76e887a9

---
*Phase: 138-olhar-constitution-and-cenbrap-voice*
*Completed: 2026-06-19*
