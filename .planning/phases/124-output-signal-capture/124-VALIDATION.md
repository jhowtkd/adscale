---
phase: 124
slug: output-signal-capture
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-16
---

# Phase 124 — Validation Strategy

> Per-phase validation contract for output decision evidence capture.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/output-learning app/src/server/output-learning` |
| **Full suite command** | `cd app && npm test && npm run lint && npm run build` |
| **Estimated runtime** | ~120 seconds focused, full suite varies |

## Sampling Rate

- **After every task commit:** Run the task-specific focused command in the plan.
- **After every plan wave:** Run all focused Phase 124 tests touched so far.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 180 seconds for focused checks.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 124-01-01 | 01 | 1 | SIGNAL-01 | unit | `cd app && npm test -- tests/unit/output-learning/output-decision-event.test.ts` | W0 | pending |
| 124-01-02 | 01 | 1 | SIGNAL-02 | unit/repository | `cd app && npm test -- tests/unit/output-learning/output-decision-repository.test.ts` | W0 | pending |
| 124-01-03 | 01 | 1 | SIGNAL-03 | unit | `cd app && npm test -- tests/unit/output-learning/output-decision-event.test.ts -t "signal strength"` | W0 | pending |
| 124-02-01 | 02 | 2 | SIGNAL-01 | unit/repository | `cd app && npm test -- tests/unit/output-learning/output-decision-recorder.test.ts` | W0 | pending |
| 124-02-02 | 02 | 2 | SIGNAL-04 | unit | `cd app && npm test -- tests/unit/output-learning/output-decision-reasons.test.ts` | W0 | pending |
| 124-03-01 | 03 | 3 | SIGNAL-01, SIGNAL-03 | route | `cd app && npm test -- app/src/app/api/derivations/[id]/review/route.test.ts` | exists | pending |
| 124-03-02 | 03 | 3 | SIGNAL-01, SIGNAL-04 | route | `cd app && npm test -- app/src/app/api/derivations/[id]/regenerate/route.test.ts app/src/app/api/derivations/[id]/save-reference/route.test.ts` | exists | pending |
| 124-03-03 | 03 | 3 | SIGNAL-01 | route | `cd app && npm test -- app/src/app/api/campaigns/[id]/approval-package/route.test.ts` | exists | pending |

## Wave 0 Requirements

- [x] Existing Vitest infrastructure is present.
- [x] Existing route tests cover review/regenerate/save-reference/approval-package and can be extended.
- [ ] New `tests/unit/output-learning/` test files will be introduced test-first in Plan 01/02.

## Manual-Only Verifications

All Phase 124 behaviors have automated verification.

## Validation Sign-Off

- [x] All tasks have automated verification or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers missing references through new test files.
- [x] No watch-mode flags.
- [x] Feedback latency target documented.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-16

