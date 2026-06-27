---
phase: 203
slug: artifact-version-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-27
---

# Phase 203 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 plus Next.js production build |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/lib/assistant/artifact-version.test.ts src/server/repositories/artifact-version.test.ts src/server/assistant/artifact-version/service.test.ts` |
| **Full suite command** | `cd app && npm test -- --run src/lib/assistant/artifact-version.test.ts src/server/repositories/artifact-version.test.ts src/server/assistant/artifact-version/service.test.ts 'src/app/api/assistant/threads/[threadId]/artifact-versions/route.test.ts' 'src/app/api/assistant/threads/[threadId]/route.test.ts' && npm run build` |
| **Estimated runtime** | ~90 seconds |

## Sampling Rate

- **After every task commit:** Run the task's focused Vitest file.
- **After every plan wave:** Run all Phase 203 focused tests.
- **Before `$gsd-verify-work`:** Full phase gate including production build must be green.
- **Max feedback latency:** 120 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 203-01-01 | 01 | 1 | VERS-01, SAFE-03 | contract | `cd app && npm test -- --run src/lib/assistant/artifact-version.test.ts` | No - task creates | Pending |
| 203-01-02 | 01 | 1 | VERS-01, VERS-02 | schema | `cd app && npm test -- --run src/server/repositories/artifact-version.test.ts` | No - task creates | Pending |
| 203-01-03 | 01 | 1 | VERS-03, SAFE-01 | repository | `cd app && npm test -- --run src/server/repositories/artifact-version.test.ts` | No - task creates | Pending |
| 203-02-01 | 02 | 2 | VERS-01, VERS-02, SAFE-01 | service | `cd app && npm test -- --run src/server/assistant/artifact-version/service.test.ts` | No - task creates | Pending |
| 203-02-02 | 02 | 2 | VERS-04, SAFE-03 | repository/service | `cd app && npm test -- --run src/server/repositories/artifact-version.test.ts src/server/assistant/artifact-version/service.test.ts` | No - task creates | Pending |
| 203-02-03 | 02 | 2 | VERS-04, SAFE-01 | route | `cd app && npm test -- --run 'src/app/api/assistant/threads/[threadId]/artifact-versions/route.test.ts' 'src/app/api/assistant/threads/[threadId]/route.test.ts'` | Thread test exists; artifact route test created by task | Pending |

## Wave 0 Requirements

Existing Vitest, route-test, mocked-DB, and production-build infrastructure covers the phase. Each implementation task creates its co-located test before the behavior is considered complete.

## Manual-Only Verifications

All Phase 203 behaviors have automated verification. Final visual comparison and approval interaction belongs to Phase 206.

## Validation Sign-Off

- [x] All tasks have automated verification commands.
- [x] Sampling continuity: no three consecutive tasks without automated verification.
- [x] Wave 0 dependencies are already installed.
- [x] No watch-mode flags.
- [x] Feedback latency target is under 120 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-27
