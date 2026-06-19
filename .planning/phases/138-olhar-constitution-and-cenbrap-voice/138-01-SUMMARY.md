---
phase: 138-olhar-constitution-and-cenbrap-voice
plan: "01"
subsystem: api
tags: [olhar, prompt-builder, vocabulary-audit, art-direction, vitest]

requires: []
provides:
  - Global Olhar ADScale constitution module with axes, verdicts, and prompt section builder
  - Forbidden UI-first vocabulary inventory and deterministic audit script
  - Core prompt/rubric language reframed from widget/module framing to invite and gestalt
affects:
  - 138-02 Cenbrap voice and failure mapping
  - 139 dual-verdict contracts
  - 140 advisor/generation prompt rewrites

tech-stack:
  added: []
  patterns:
    - "Olhar constitution injected before legacy integrity rules in buildIntegrityPromptSection"
    - "READING_PATH_GESTALT_BUDGET replaces THREE_ZONE_VISUAL_BUDGET in art_variation mode rules"
    - "check-olhar-vocabulary.mjs scans core AI prompt/rubric files with line-level failures"

key-files:
  created:
    - app/src/server/ai/olhar/constitution.ts
    - app/src/server/ai/olhar/constitution.test.ts
    - app/src/server/ai/olhar/vocabulary.ts
    - app/scripts/check-olhar-vocabulary.mjs
  modified:
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/ai/per-mode-prompt-rules.ts
    - app/src/server/ai/preflight-analysis.ts
    - app/src/server/ai/observable-rubric.ts
    - app/src/server/ai/prompt-builder.test.ts
    - app/tests/unit/ai/regression-prompt-contract.test.ts
    - app/tests/unit/ai/mode-format-regression.test.ts
    - app/tests/unit/ai/quality-prompt-regression.test.ts

key-decisions:
  - "Inject buildOlharAdscaleSection() before VISUAL HIERARCHY CONTRACT while keeping factual preservation rules intact"
  - "Rename THREE_ZONE_VISUAL_BUDGET to READING_PATH_GESTALT_BUDGET with invite-centric reading-path language"
  - "Allow detection-regex export lines in vocabulary audit via ALLOWED_CONTEXT_PATTERNS"

patterns-established:
  - "Olhar axes (figura, gestalt, voz, convite) as implementation-facing creative judgment vocabulary"
  - "Vocabulary audit as CI gate for core prompt/rubric files only"

requirements-completed: [OLHAR-01, OLHAR-03]

metrics:
  duration: 4min
  completed: 2026-06-19
---

# Phase 138 Plan 01: Olhar Constitution and Vocabulary Inventory Summary

**Global Olhar ADScale constitution with axes/verdicts, prompt injection, and vocabulary audit removing UI-first defaults from core AI prompt/rubric files.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-19T09:50:00Z
- **Completed:** 2026-06-19T09:54:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Created `olhar/constitution.ts` exporting `OLHAR_AXES`, `OLHAR_VERDICTS`, `OLHAR_ADSCALE_PRINCIPLES`, and `buildOlharAdscaleSection()` with export-separation and invite-not-widget framing.
- Injected Olhar section into `buildIntegrityPromptSection()` before legacy factual/anti-hallucination rules.
- Added `olhar/vocabulary.ts` and `check-olhar-vocabulary.mjs` with line-level forbidden-term reporting.
- Replaced UI-first language in `prompt-builder.ts`, `per-mode-prompt-rules.ts`, `preflight-analysis.ts`, and `observable-rubric.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Global Olhar constitution module** — `c379c8a1` (test RED), `9b1735ae` (feat GREEN)
2. **Task 2: Vocabulary audit and prompt language cleanup** — `85359012` (test RED), `07c7f6a5` (feat GREEN)

**Plan metadata:** `3bb6c582` (docs: complete plan)

## Files Created/Modified

- `app/src/server/ai/olhar/constitution.ts` — Olhar principles, axes, verdicts, prompt section builder
- `app/src/server/ai/olhar/vocabulary.ts` — Forbidden terms, replacements, scanned file list, allow patterns
- `app/scripts/check-olhar-vocabulary.mjs` — Deterministic vocabulary audit CLI
- `app/src/server/ai/prompt-builder.ts` — Olhar injection + invite/information-group language
- `app/src/server/ai/per-mode-prompt-rules.ts` — Reading-path gestalt budget replaces three-zone budget
- `app/src/server/ai/preflight-analysis.ts` — CTA prominence described as reading-path clarity
- `app/src/server/ai/observable-rubric.ts` — Art-direction phrasing in rubric examples

## Decisions Made

- Olhar creative judgment is explicitly a first pass; export/compliance remains a second pass in prompt language.
- `READING_PATH_GESTALT_BUDGET` replaces `THREE_ZONE_VISUAL_BUDGET` while preserving no-equal-weight-overload intent.
- Detection regex lines in `observable-rubric.ts` are allowlisted so corpus note matchers are not blocked by the audit.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 138-02 can add Cenbrap voice overlay and art-direction verdict mapping on this foundation.
- Vocabulary audit should be wired into CI/release gate in a future plan if not already invoked by existing scripts.

## Self-Check

```
FOUND: app/src/server/ai/olhar/constitution.ts
FOUND: app/src/server/ai/olhar/vocabulary.ts
FOUND: app/scripts/check-olhar-vocabulary.mjs
FOUND: c379c8a1
FOUND: 9b1735ae
FOUND: 85359012
FOUND: 07c7f6a5
```

## Self-Check: PASSED

---
*Phase: 138-olhar-constitution-and-cenbrap-voice*
*Completed: 2026-06-19*
