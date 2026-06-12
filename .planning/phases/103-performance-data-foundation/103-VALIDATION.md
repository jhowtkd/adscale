---
phase: 103
slug: performance-data-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-12
---

# Phase 103 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/performance src/server/repositories/performance` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | Focused <30s; full suite several minutes |

## Sampling Rate

- **After every task commit:** Run the task's focused Vitest target.
- **After every plan wave:** Run all Phase 103 focused tests.
- **Before `$gsd-verify-work`:** Full test, lint and build gates must be green.
- **Max feedback latency:** 30 seconds for focused tests.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 103-01-01 | 01 | 1 | PERF-14 | unit | `cd app && npm test -- src/server/performance/metrics.test.ts` | ❌ W0 | ⬜ pending |
| 103-01-02 | 01 | 1 | PERF-15 | unit | `cd app && npm test -- src/server/performance/source-key.test.ts src/server/performance/placement.test.ts` | ❌ W0 | ⬜ pending |
| 103-01-03 | 01 | 1 | PERF-13 | unit | `cd app && npm test -- src/server/performance/validation.test.ts` | ❌ W0 | ⬜ pending |
| 103-02-01 | 02 | 2 | PERF-13, PERF-15 | schema | `cd app && npm test -- src/server/repositories/performance.test.ts` | ❌ W0 | ⬜ pending |
| 103-02-02 | 02 | 2 | PERF-16 | unit/repository | `cd app && npm test -- src/server/repositories/performance.test.ts` | ❌ W0 | ⬜ pending |
| 103-02-03 | 02 | 2 | PERF-13–16 | migration/static | `cd app && npm run build` | ✅ | ⬜ pending |
| 103-03-01 | 03 | 3 | PERF-16 | route | `cd app && npm test -- 'src/app/api/campaigns/[id]/performance/route.test.ts'` | ❌ W0 | ⬜ pending |
| 103-03-02 | 03 | 3 | PERF-13–15 | service | `cd app && npm test -- src/server/performance/service.test.ts` | ❌ W0 | ⬜ pending |
| 103-03-03 | 03 | 3 | PERF-13–16 | regression | `cd app && npm test && npm run lint && npm run build` | ✅ | ⬜ pending |

## Wave 0 Requirements

- Test files listed as `❌ W0` are created alongside their implementation task before production code is considered complete.
- Existing Vitest configuration, mocks and setup cover the phase; no framework installation is required.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generated migration applies to a configured Postgres database | PERF-13–16 | Requires database credentials/runtime | Run `cd app && npm run db:migrate`, inspect table constraints/indexes, and record evidence for Phase 108 |

## Validation Sign-Off

- [x] All tasks have automated verification or explicit test creation.
- [x] Sampling continuity has no three consecutive tasks without automated verification.
- [x] Existing infrastructure covers the phase.
- [x] No watch-mode flags are used.
- [x] Focused feedback target is under 30 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-12
