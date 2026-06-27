---
phase: 204
slug: plan-iteration-loop
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-06-27
---

# Phase 204 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 plus Next.js production build |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/server/assistant/plan-iteration/` |
| **Full suite command** | `cd app && npm test -- --run src/server/assistant/plan-iteration/ src/server/assistant/action-execution/handlers/revise-creative-plan.test.ts src/components/assistant/AssistantActionCard.test.tsx 'src/app/api/assistant/threads/[threadId]/plan-revisions/route.test.ts' && npm run build` |
| **Estimated runtime** | ~90 seconds |

## Sampling Rate

- **After every task commit:** Run the task's focused Vitest file.
- **After every plan wave:** Run all Phase 204 focused tests.
- **Before `$gsd-verify-work`:** Full phase gate including production build must be green.
- **Max feedback latency:** 120 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 204-01-01 | 01 | 1 | PLAN-01 | unit | `cd app && npm test -- --run src/server/assistant/plan-iteration/diff.test.ts` | ❌ W0 | ⬜ pending |
| 204-01-02 | 01 | 1 | PLAN-01, PLAN-04 | service | `cd app && npm test -- --run src/server/assistant/plan-iteration/proposal.test.ts` | ❌ W0 | ⬜ pending |
| 204-01-03 | 01 | 1 | PLAN-03, PLAN-04 | handler | `cd app && npm test -- --run src/server/assistant/action-execution/handlers/revise-creative-plan.test.ts` | ❌ W0 | ⬜ pending |
| 204-02-01 | 02 | 2 | PLAN-01, PLAN-02 | service | `cd app && npm test -- --run src/server/assistant/plan-iteration/service.test.ts` | ❌ W0 | ⬜ pending |
| 204-02-02 | 02 | 2 | PLAN-02, PLAN-04 | component | `cd app && npm test -- --run src/components/assistant/AssistantActionCard.test.tsx` | Yes | ⬜ pending |
| 204-02-03 | 02 | 2 | PLAN-01, PLAN-04 | route | `cd app && npm test -- --run 'src/app/api/assistant/threads/[threadId]/plan-revisions/route.test.ts'` | ❌ W0 | ⬜ pending |

## Wave 0 Requirements

Existing Vitest, route-test, mocked-DB, and production-build infrastructure covers the phase. Each implementation task creates its co-located test before the behavior is considered complete.

## Manual-Only Verifications

All Phase 204 behaviors have automated verification. Field-by-field compare UI belongs to Phase 206.

## Validation Sign-Off

- [ ] All tasks have automated verification commands.
- [ ] Sampling continuity: no three consecutive tasks without automated verification.
- [ ] Wave 0 dependencies are already installed.
- [ ] No watch-mode flags.
- [ ] Feedback latency target is under 120 seconds.
- [ ] `nyquist_compliant: true` set in frontmatter after execution.

**Approval:** pending
