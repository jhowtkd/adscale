---
phase: 177
slug: multi-client-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-25
---

# Phase 177 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest, Next.js build, Drizzle Kit |
| **Config file** | `app/vitest.config.ts`, `app/drizzle.config.ts` |
| **Quick run command** | `cd app && npm test -- src/app/api/client-profiles/route.test.ts` |
| **Full suite command** | `cd app && npm test && npm run build && npx drizzle-kit check` |
| **Estimated runtime** | ~120-240 seconds |

## Sampling Rate

- **After every task commit:** Run the task's targeted Vitest command.
- **After every plan wave:** Run `cd app && npm test && npm run build && npx drizzle-kit check`.
- **Before `$gsd-verify-work`:** Full suite must be green or any accepted gap must be documented.
- **Max feedback latency:** 240 seconds for full local validation.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 177-01-01 | 01 | 1 | CLIENT-01 | migration/schema | `cd app && npx drizzle-kit check` | yes | pending |
| 177-01-02 | 01 | 1 | CLIENT-01, CLIENT-03 | repository/unit | `cd app && npm test -- src/server/repositories/client-reference.test.ts src/app/api/client-profiles/route.test.ts` | mixed | pending |
| 177-01-03 | 01 | 1 | CLIENT-02 | repository/route | `cd app && npm test -- src/server/db/repositories/brand-kit.test.ts` | missing | pending |
| 177-01-04 | 01 | 1 | CLIENT-02 | memory/unit | `cd app && npm test -- src/server/memory/brand-memory-context.test.ts src/server/memory/performance-learning-retrieval.test.ts` | mixed | pending |
| 177-01-05 | 01 | 1 | CLIENT-02, CLIENT-03 | integration/build | `cd app && npm test && npm run build && npx drizzle-kit check` | yes | pending |

## Wave 0 Requirements

- Existing Vitest infrastructure covers API, repository, memory, and service tests.
- Missing test files may be added in task execution where no close existing test exists.
- No new test framework is required.

## Manual-Only Verifications

All Phase 177 behaviors should have automated coverage. Manual database inspection is optional if migration validation is inconclusive locally.

## Validation Sign-Off

- [x] All tasks have automated verification or explicit test-file creation.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target documented.

**Approval:** pending execution
