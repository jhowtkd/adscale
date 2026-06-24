---
phase: 165
slug: owner-calibration-panel
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-24
updated: 2026-06-24
---

# Phase 165 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (app workspace) |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/app/api/admin/quality/brands/ src/components/admin/ src/components/feedback/LearningProposalsTab` |
| **Full suite command** | `cd app && npm test -- --run` |
| **Estimated runtime** | ~120 seconds |

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
| 165-01-01 | 01 | 1 | PANEL-01, PANEL-05 | route | `cd app && npm test -- --run src/app/api/admin/quality/brands/route.test.ts -x` | no | ⬜ pending |
| 165-01-02 | 01 | 1 | PANEL-01, PANEL-05 | route | `cd app && npm test -- --run src/app/api/admin/quality/brands/[clientProfileId]/profile/route.test.ts -x` | no | ⬜ pending |
| 165-01-03 | 01 | 1 | PANEL-02, PANEL-05 | route | `cd app && npm test -- --run src/app/api/admin/quality/brands/[clientProfileId]/rules/route.test.ts -x` | no | ⬜ pending |
| 165-02-01 | 02 | 2 | PANEL-04 | unit | `cd app && npm test -- --run src/components/admin/calibration-status-copy.test.ts -x` | no | ⬜ pending |
| 165-02-02 | 02 | 2 | PANEL-02 | component | `cd app && npm test -- --run src/components/admin/BrandCalibrationRulesPanel.test.tsx -x` | no | ⬜ pending |
| 165-02-03 | 02 | 2 | PANEL-01, PANEL-04, PANEL-05 | component | `cd app && npm test -- --run src/components/admin/OwnerCalibrationPanel.test.tsx -x` | no | ⬜ pending |
| 165-03-01 | 03 | 3 | PANEL-03, PANEL-04 | component | `cd app && npm test -- --run src/components/feedback/LearningProposalsTab.test.tsx -x` | no | ⬜ pending |
| 165-03-02 | 03 | 3 | PANEL-03 | component | `cd app && npm test -- --run src/components/admin/OwnerCalibrationPanel.test.tsx -x` | no | ⬜ pending |
| 165-03-03 | 03 | 3 | PANEL-01..05 | integration | `cd app && npm test -- --run src/app/api/admin/quality/brands/ src/components/admin/ src/components/feedback/LearningProposalsTab.test.tsx -x` | partial | ⬜ pending |

---

## Wave 0 Requirements

Route and component test scaffolds created by Plan 165-01/02/03 tasks (TDD tasks write tests first). No separate Wave 0 plan.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner panel UX flow end-to-end | PANEL-01..04 | Visual layout + navigation | Select brand → view profile/rules → accept proposal with fixture ack |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner 2026-06-24
