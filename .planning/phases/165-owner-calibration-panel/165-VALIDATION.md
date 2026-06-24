---
phase: 165
slug: owner-calibration-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
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
| 165-01-01 | 01 | 1 | PANEL-01, PANEL-05 | route | `npm test -- --run src/app/api/admin/quality/brands/` | partial | ⬜ pending |
| 165-02-01 | 02 | 2 | PANEL-02 | route | `npm test -- --run src/app/api/admin/quality/brands/` | partial | ⬜ pending |
| 165-03-01 | 03 | 3 | PANEL-03, PANEL-04 | component | `npm test -- --run src/components/` | partial | ⬜ pending |

*Detailed task map reconciled after PLAN.md creation.*

---

## Wave 0 Requirements

*To be filled by planner — expect route tests for profile/rules APIs and component tests for OwnerCalibrationPanel.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner panel UX flow end-to-end | PANEL-01..04 | Visual layout + navigation | Select brand → view profile/rules → accept proposal with fixture ack |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
