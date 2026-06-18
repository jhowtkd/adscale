---
phase: 136
slug: quality-trend-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-18
---

# Phase 136 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 (registry 4.1.9) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/human-quality/trend/ -x` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- tests/unit/human-quality/trend/ -x`
- **After every plan wave:** Run `cd app && npm test`
- **Before `$gsd-verify-work`:** Full suite must be green + `cd app && npm run build`
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 136-01-01 | 01 | 1 | TREND-01 | unit | `cd app && npm test -- tests/unit/human-quality/trend/bucket.test.ts -x` | ❌ W0 | ⬜ pending |
| 136-01-02 | 01 | 1 | TREND-01 | unit | `cd app && npm test -- tests/unit/human-quality/trend/aggregate.test.ts -x` | ❌ W0 | ⬜ pending |
| 136-01-03 | 01 | 1 | TREND-01 | unit | `cd app && npm test -- tests/unit/human-quality/trend/report.test.ts -x` | ❌ W0 | ⬜ pending |
| 136-02-01 | 02 | 2 | TREND-02 | unit + route | `cd app && npm test -- tests/unit/human-quality/trend/aggregate.test.ts src/app/api/feedback/quality-trend/route.test.ts -x` | ❌ W0 | ⬜ pending |
| 136-02-02 | 02 | 2 | TREND-03 | unit | `cd app && npm test -- tests/unit/human-quality/trend/report.test.ts -x` | ❌ W0 | ⬜ pending |
| 136-02-03 | 02 | 2 | TREND-03, TREND-04 | unit + checker | `cd app && npm test -- tests/unit/human-quality/sampling/coverage.test.ts -x && node scripts/check-quality-trend-evidence.mjs --evidence ../.planning/phases/136-quality-trend-dashboard/136-EVIDENCE.template.json --skip-tests` | ❌ W0 | ⬜ pending |
| 136-03-01 | 03 | 3 | TREND-01..04 | component | `cd app && npm test -- src/components/feedback/HumanQualityCorpusPanel.test.tsx -x` | ✅ extend | ⬜ pending |
| 136-03-02 | 03 | 3 | TREND-03 | component | `cd app && npm test -- src/components/feedback/HumanQualityCorpusPanel.test.tsx -x` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/tests/unit/human-quality/trend/bucket.test.ts` — ISO week assignment edge cases
- [ ] `app/tests/unit/human-quality/trend/aggregate.test.ts` — per-bucket metrics + regression detection
- [ ] `app/tests/unit/human-quality/trend/report.test.ts` — status gates, flags, evidence cap
- [ ] `app/src/app/api/feedback/quality-trend/route.test.ts` — auth + zod validation
- [ ] Extend `HumanQualityCorpusPanel.test.tsx` — Trend tab, sixth 403 gate, filter controls
- [ ] Extend `coverage.test.ts` — real `trend_global` status from trend report via orchestrator
- [ ] `.planning/phases/136-quality-trend-dashboard/136-EVIDENCE.template.json` — checker fixture
- [ ] `app/scripts/check-quality-trend-evidence.mjs` — honesty checker for Phase 137

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Trend chart with live evaluated corpus | TREND-01 | Requires real corpus data | After operator evaluates items across ≥2 weeks, open Trend tab and confirm series populate |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
