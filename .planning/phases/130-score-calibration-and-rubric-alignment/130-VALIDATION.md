---
phase: 130
slug: score-calibration-and-rubric-alignment
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-17
---

# Phase 130 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 (registry 4.1.9) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/human-quality/calibration` |
| **Full suite command** | `cd app && npm test && npm run lint && npm run build` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- tests/unit/human-quality/calibration`
- **After every plan wave:** Run `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/score-calibration src/components/feedback/HumanQualityCorpusPanel.test.tsx`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 130-01-01 | 01 | 1 | CALIB-01 | unit | `npm test -- tests/unit/human-quality/calibration/compare.test.ts` | ✅ | ✅ green |
| 130-01-02 | 01 | 1 | CALIB-01 | unit | `npm test -- tests/unit/human-quality/calibration/failure-bridge.test.ts` | ✅ | ✅ green |
| 130-01-03 | 01 | 1 | CALIB-01 | unit | `npm test -- tests/unit/human-quality/calibration-evaluated-repository.test.ts` | ✅ | ✅ green |
| 130-02-01 | 02 | 2 | CALIB-02 | unit | `npm test -- tests/unit/human-quality/calibration/aggregate.test.ts -t "group\|aggregateGroup"` | ✅ | ✅ green |
| 130-02-02 | 02 | 2 | CALIB-04 | unit | `npm test -- tests/unit/human-quality/calibration/aggregate.test.ts -t "factual\|highVisual"` | ✅ | ✅ green |
| 130-02-03 | 02 | 2 | CALIB-02, CALIB-04 | unit | `npm test -- tests/unit/human-quality/calibration/aggregate.test.ts -t "buildCalibrationReport\|insufficient"` | ✅ | ✅ green |
| 130-03-01 | 03 | 3 | CALIB-03 | unit | `npm test -- tests/unit/human-quality/calibration-adjustments-repository.test.ts` | ✅ | ✅ green |
| 130-03-02 | 03 | 3 | CALIB-03 | unit | `npm test -- tests/unit/human-quality/calibration/adjustments.test.ts` | ✅ | ✅ green |
| 130-03-03 | 03 | 3 | CALIB-03 | unit | `npm test -- tests/unit/human-quality/calibration/adjustments.test.ts -t "runScoreCalibration\|orchestrat"` | ✅ | ✅ green |
| 130-04-01 | 04 | 4 | CALIB-01–04 | integration | `node app/scripts/check-score-calibration-evidence.mjs --evidence .planning/phases/130-score-calibration-and-rubric-alignment/130-EVIDENCE.template.json --skip-tests` | ✅ | ✅ green |
| 130-04-02 | 04 | 4 | CALIB-01–04 | unit | `npm test -- src/app/api/feedback/score-calibration/route.test.ts` | ✅ | ✅ green |
| 130-04-03 | 04 | 4 | CALIB-01–04 | unit | `npm test -- src/components/feedback/HumanQualityCorpusPanel.test.tsx -t "calibration"` | ✅ | ✅ green |
| 130-04-04 | 04 | 4 | CALIB-01–04 | checkpoint | `npm test -- tests/unit/human-quality/calibration` + evidence checker | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note:** Tests are created inline via TDD tasks (no separate Wave 0 plan); `File Exists` flips to ✅ as each task completes.

---

## Wave 0 Requirements

- [x] `app/src/server/human-quality/calibration/compare.ts` — CALIB-01 per-item comparison
- [x] `app/src/server/human-quality/calibration/aggregate.ts` — CALIB-02 grouped divergence, CALIB-04 factual bucket
- [x] `app/src/server/human-quality/calibration/adjustments.ts` — CALIB-03 proposal builder
- [x] `app/src/server/human-quality/calibration/failure-bridge.ts` — human reason ↔ gate code bridge
- [x] `app/tests/unit/human-quality/calibration/*.test.ts` — requirement coverage
- [x] `app/drizzle/0044_rubric_calibration_adjustments.sql` — adjustment registry
- [x] `listEvaluatedCorpusWithEvaluations` in repository — join evaluated rows
- [x] `app/scripts/run-score-calibration.ts` + `check-score-calibration-evidence.mjs` — evidence pattern
- [x] `130-EVIDENCE.template.json` — schema contract for Phase 133 gate

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Global multi-workspace rollup with live DB | CALIB-02 | Requires Postgres with evaluated corpus rows | Run `cd app && npx tsx scripts/run-score-calibration.ts --all-workspaces` against staging DB; confirm `130-EVIDENCE.json` status `ok` when ≥5 items |
| Owner calibration UI drill-down | CALIB-01 | Visual UX review | Platform-owner opens HumanQualityCorpusPanel calibration tab; verify aggregate MAE/bias and per-item delta display |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (TDD inline — no MISSING markers in plans)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** plan-checker 2026-06-17
