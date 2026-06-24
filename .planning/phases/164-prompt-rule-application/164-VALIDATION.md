---
phase: 164
slug: prompt-rule-application
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-24
---

# Phase 164 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (app workspace) |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run tests/unit/brand-taste/ src/server/ai/prompt-builder.test.ts src/server/human-quality/learning/` |
| **Full suite command** | `cd app && npm test -- --run` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run task `<automated>` command from PLAN.md
- **After every plan wave:** Run quick run command scoped to touched modules
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 164-01-01 | 01 | 1 | APPLY-01 | unit | `npm test -- --run tests/unit/brand-taste/taste-application.test.ts` | ✅ | ⬜ pending |
| 164-01-02 | 01 | 1 | APPLY-02 | unit | `npm test -- --run src/server/ai/prompt-builder.test.ts -t "section order"` | ❌ W0 | ⬜ pending |
| 164-01-03 | 01 | 1 | APPLY-03 | unit | `npm test -- --run tests/unit/jobs/derivation-generation-log.test.ts` | ❌ W0 | ⬜ pending |
| 164-02-01 | 02 | 2 | APPLY-04 | unit | `npm test -- --run tests/unit/repositories/calibration-rule-cap.test.ts` | ❌ W0 | ⬜ pending |
| 164-02-02 | 02 | 2 | APPLY-04 | unit | `npm test -- --run tests/unit/human-quality/learning/proposals.test.ts` | ✅ | ⬜ pending |
| 164-03-01 | 03 | 3 | APPLY-05 | unit (mock) | `npm test -- --run tests/unit/ai/prompt-rule-isolation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: APPLY-05 uses repository mocks per RESEARCH fallback; optional integration test behind TEST_DATABASE_URL deferred.*

---

## Wave 0 Requirements

- [ ] `src/server/ai/prompt-builder.test.ts` — section order regression (164-01 Task 2)
- [ ] `tests/unit/jobs/derivation-generation-log.test.ts` — provenance fields (164-01 Task 3)
- [ ] `tests/unit/repositories/calibration-rule-cap.test.ts` — cap deprecation (164-02 Task 1)
- [ ] `tests/unit/ai/prompt-rule-isolation.test.ts` — cross-profile isolation (164-03 Task 1)

*Tests created in-plan via TDD tasks; Wave 0 = first commit per test file.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Staging derivation shows rule sections in prompt order | APPLY-02 | Prompt content not asserted in prod logs | Run one derivation for Cenbrap profile; inspect generation_log applied*Ids |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-24 (post plan-checker reconciliation)
