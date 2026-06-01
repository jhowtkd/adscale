---
phase: 44-native-format-adaptation
plan: "01"
subsystem: api
tags: [openai, formats, derivation, prompt-builder, vitest]

requires: []
provides:
  - Target-aspect OpenAI image sizing for 4:5 and 9:16 on gpt-image-2
  - No-blur format_adaptation normalization guardrails in derivation job
  - Native-layout format adaptation prompt contract with focused tests
affects: [44-02, 45, 46]

tech-stack:
  added: []
  patterns:
    - "formatToOpenAIImageSize isolates gpt-image-2 aspect sizes; toOpenAISdkImageSize isolates SDK casts"
    - "format_adaptation uses cover resize only — no blur/contain/composite"

key-files:
  created:
    - app/src/lib/formats.test.ts
  modified:
    - app/src/lib/formats.ts
    - app/src/server/jobs/derivation.ts
    - app/src/server/jobs/derivation.test.ts
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/ai/prompt-builder.test.ts
    - app/tests/unit/prompt-builder.test.ts
    - app/tests/integration/derivation-job.test.ts

key-decisions:
  - "gpt-image-2 uses 1024x1280 (4:5) and 1152x2048 (9:16) at generation time; legacy models keep SDK union sizes"
  - "Preview format adaptation keeps target aspect on gpt-image-2 to avoid square-then-pad regressions"
  - "OpenAI SDK size cast lives in formats.ts via toOpenAISdkImageSize, not scattered in derivation.ts"

patterns-established:
  - "Generation size vs stored dimensions: formatToOpenAIImageSize + getTargetDimensions + normalizeGeneratedImage"

requirements-completed: [FMT-01, FMT-02, FMT-03, FMT-04, FMT-05]

duration: 45min
completed: 2026-06-01
---

# Phase 44 Plan 01 Summary

**Format adaptation now requests native target aspect from OpenAI and blocks blur/letterbox post-processing, with tests guarding prompts, sizing, and normalization.**

## Performance

- **Duration:** ~45 min (including build-fix)
- **Tasks:** 4
- **Files modified:** 7

## Accomplishments

- Added `formatToOpenAIImageSize` with gpt-image-2 portrait sizes; preview no longer forces square for 4:5/9:16.
- Wired sizing through all derivation OpenAI image paths; tests assert edit `size` for 4:5 and 9:16.
- Hardened `format_adaptation` prompt for native zones, safe areas, anti-band, anti-poster rules.
- Fixed TypeScript build via `toOpenAISdkImageSize` cast isolation.

## Task Commits

1. **Task 1: Add target-aspect generation sizing** - `20f241f` (feat)
2. **Task 2: Wire target sizing into derivation generation** - `be0aebd` (feat)
3. **Task 3: Harden native-layout prompt contract** - `993924c` (test)
4. **Task 4: Run focused verification and build** - (this session: build fix + green suite)

## Verification

- `npm test` — 538 passed
- `npm run build` — pass after `toOpenAISdkImageSize` fix

## Deviations

- Build failed on OpenAI SDK `size` union; added `toOpenAISdkImageSize` in `formats.ts` per plan's "isolate cast in helper" intent.

## Self-Check: PASSED
