---
phase: 172
slug: operational-evidence-ui-and-release-gate
status: pending
nyquist_compliant: false
wave_0_complete: true
created: 2026-06-25
---

# Phase 172 — Validation Strategy

> Per-phase validation contract for factual alerts UI and v13.3 release gate.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via `npm test -- --run`) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/components/feedback/FactualAlertsPanel.test.tsx` |
| **Full suite command** | `cd app && npm test -- --run src/components/feedback/FactualAlertsPanel.test.tsx src/components/feedback/HumanQualityCorpusPanel.test.tsx src/components/admin/OwnerCalibrationPanel.test.tsx src/app/api/admin/quality/learning/factual-alerts/route.test.ts tests/unit/human-quality/learning/factual-alerts.test.ts tests/unit/release/v13-3-release-evidence.test.ts` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific `npm test -- --run ...` command from the map below.
- **After every plan wave:** Run all tests for touched paths in that wave.
- **Before `$gsd-verify-work`:** Full suite command must be green.
- **Max feedback latency:** 60 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 172-01-01 | 01 | 1 | ALERT-01, ALERT-03 | component | `cd app && npm test -- --run src/components/feedback/FactualAlertsPanel.test.tsx` | no | pending |
| 172-01-02 | 01 | 1 | ALERT-02, ALERT-03 | component | `cd app && npm test -- --run src/components/feedback/FactualAlertsPanel.test.tsx` | no | pending |
| 172-02-01 | 02 | 2 | ALERT-01 | integration | `cd app && npm test -- --run src/components/feedback/HumanQualityCorpusPanel.test.tsx` | yes | pending |
| 172-02-02 | 02 | 2 | ALERT-01, ALERT-03 | integration | `cd app && npm test -- --run src/components/admin/OwnerCalibrationPanel.test.tsx` | yes | pending |
| 172-03-01 | 03 | 3 | ALERT-04 | unit | `cd app && npm test -- --run tests/unit/release/v13-3-release-evidence.test.ts` | no | pending |
| 172-03-02 | 03 | 3 | ALERT-04 | script | `node app/scripts/check-v13-3-release-evidence.mjs --skip-tests` | no | pending |
| 172-03-03 | 03 | 3 | ALERT-01..04 | manual | See `172-RELEASE-CHECKLIST.md` smoke steps | no | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

Wave 0 satisfied by existing infrastructure — no new scaffolds required before Plan 01:

- [x] `GET /api/admin/quality/learning/factual-alerts` route + route tests exist
- [x] `buildFactualIssueAlerts` / `listFactualIssueAlerts` unit tests exist
- [x] `LearningProposalsTab` query/mutation pattern to mirror
- [x] `HumanQualityCorpusPanel.test.tsx` learning tab describe block exists
- [x] Phase 169 release evidence scripts/tests as v13.3 gate dependencies

Plan 01 creates `FactualAlertsPanel.test.tsx` as part of Task 2 (TDD behavior block in plan).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Learning tab shows factual alerts | ALERT-01 | Visual section ordering | Owner → `/feedback` → Learning tab → alerts above proposals when data exists |
| Brand Propostas scoped alerts | ALERT-01 | Brand selector context | Owner → brand calibration → Propostas → alerts scoped to selected brand |
| Brand link navigation | ALERT-02 | Browser navigation | Click brand link → lands on `/admin/quality/brands/{id}` |
| Proposals still actionable | ALERT-03 | Accept/reject UX | Below alerts, proposals still show Accept/Reject for non-factual items |
| Settings round-trip | ALERT-04 | Multi-page session | Save profile/workspace settings → refresh → values persist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers existing API before UI tests
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` after execution

**Approval:** Pending phase execution
