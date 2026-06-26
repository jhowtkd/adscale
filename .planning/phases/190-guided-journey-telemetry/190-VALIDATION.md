---
phase: 190
slug: guided-journey-telemetry
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-26
---

# Phase 190 - Validation Strategy

> Per-phase validation contract for safe guided-journey telemetry.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest / Next route tests |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/server/repositories/guided-flow-telemetry.test.ts src/server/assistant/guided-flow-telemetry.test.ts` |
| **Full suite command** | `cd app && npm test -- --run src/server/repositories/guided-flow-telemetry.test.ts src/server/assistant/guided-flow-telemetry.test.ts 'src/app/api/assistant/threads/[threadId]/guided-flow/route.test.ts' 'src/app/api/assistant/threads/[threadId]/guided-flow/select-creative/route.test.ts' 'src/app/api/assistant/threads/[threadId]/guided-flow/from-zero/route.test.ts'` |
| **Estimated runtime** | ~90 seconds |

## Sampling Rate

- **After schema/repository tasks:** Run the quick command.
- **After instrumentation tasks:** Run the full suite command.
- **Before `$gsd-verify-work`:** Run the full suite command plus `cd app && npm run build`.
- **Max feedback latency:** 120 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 190-01-01 | 01 | 1 | TEL-01, TEL-02, TEL-04 | repository | `cd app && npm test -- --run src/server/repositories/guided-flow-telemetry.test.ts` | W0 | pending |
| 190-01-02 | 01 | 1 | TEL-02, TEL-03 | unit | `cd app && npm test -- --run src/server/assistant/guided-flow-telemetry.test.ts` | W0 | pending |
| 190-01-03 | 01 | 1 | TEL-01, TEL-03 | route | `cd app && npm test -- --run 'src/app/api/assistant/threads/[threadId]/guided-flow/route.test.ts' 'src/app/api/assistant/threads/[threadId]/guided-flow/select-creative/route.test.ts' 'src/app/api/assistant/threads/[threadId]/guided-flow/from-zero/route.test.ts'` | existing + W0 | pending |
| 190-01-04 | 01 | 1 | TEL-01, TEL-02, TEL-03, TEL-04 | build | `cd app && npm run build` | existing | pending |

## Wave 0 Requirements

- Existing Vitest and route-test infrastructure covers this phase.
- Add new test files before implementation where missing.
- Do not use watch-mode flags.

## Manual-Only Verifications

All Phase 190 behaviors have automated verification. Staging/live quality checks remain Phase 192 scope.

## Validation Sign-Off

- [x] All tasks have automated verification.
- [x] Sampling continuity: no 3 consecutive tasks without automated verification.
- [x] Wave 0 covers missing test files by requiring tests before implementation.
- [x] No watch-mode flags.
- [x] Feedback latency < 120s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-26
