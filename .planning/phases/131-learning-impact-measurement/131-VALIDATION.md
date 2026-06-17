---
phase: 131
slug: learning-impact-measurement
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 131 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 (registry 4.1.9) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/human-quality/impact` |
| **Full suite command** | `cd app && npm test && npm run lint && npm run build` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- tests/unit/human-quality/impact`
- **After every plan wave:** Run `cd app && npm test && npm run lint`
- **Before `$gsd-verify-work`:** Full suite + `check-learning-impact-evidence.mjs` must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 131-01-01 | 01 | 1 | IMPACT-01 | unit | `cd app && npm test -- tests/unit/human-quality/impact/application-schema.test.ts` | ❌ W0 | ⬜ pending |
| 131-01-02 | 01 | 1 | IMPACT-01 | integration | `cd app && npm test -- src/app/api/campaigns/\[id\]/derivations/route.test.ts -t "outputLearningApplication"` | ❌ W0 | ⬜ pending |
| 131-02-01 | 02 | 2 | IMPACT-01 | integration | `cd app && npm test -- src/app/api/campaigns/\[id\]/derivations/route.test.ts -t "outputLearningApplication"` | ❌ W0 | ⬜ pending |
| 131-02-02 | 02 | 2 | IMPACT-01 | unit | `cd app && npm test -- tests/unit/human-quality/impact/enrich.test.ts` | ❌ W0 | ⬜ pending |
| 131-03-01 | 03 | 3 | IMPACT-02 | unit | `cd app && npm test -- tests/unit/human-quality/impact/enrich.test.ts` | ❌ W0 | ⬜ pending |
| 131-03-02 | 03 | 3 | IMPACT-02, IMPACT-03 | unit | `cd app && npm test -- tests/unit/human-quality/impact/aggregate.test.ts` | ❌ W0 | ⬜ pending |
| 131-03-03 | 03 | 3 | IMPACT-04 | unit | `cd app && npm test -- tests/unit/human-quality/impact/report.test.ts` | ❌ W0 | ⬜ pending |
| 131-04-01 | 04 | 4 | IMPACT-01–04 | integration | `node app/scripts/check-learning-impact-evidence.mjs --evidence .planning/phases/131-learning-impact-measurement/131-EVIDENCE.template.json --skip-tests` | ❌ W0 | ⬜ pending |
| 131-04-02 | 04 | 4 | IMPACT-01–04 | unit | `cd app && npm test -- src/app/api/feedback/learning-impact/route.test.ts` | ❌ W0 | ⬜ pending |
| 131-04-03 | 04 | 4 | IMPACT-01–04 | unit | `cd app && npm test -- src/components/feedback/HumanQualityCorpusPanel.test.tsx -t "impact"` | ❌ W0 | ⬜ pending |
| 131-04-04 | 04 | 4 | IMPACT-01–04 | checkpoint | `cd app && npm test -- tests/unit/human-quality/impact` + evidence checker | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note:** Tests are created inline via TDD tasks (no separate Wave 0 plan); `File Exists` flips to ✅ as each task completes.

---

## Wave 0 Requirements

- [ ] `app/src/server/human-quality/impact/` module (types, enrich, aggregate, report, service)
- [ ] `tests/unit/human-quality/impact/*.test.ts` — requirement coverage
- [ ] `app/drizzle/0045_derivation_output_learning_application.sql` (or equivalent)
- [ ] `app/scripts/run-learning-impact.ts` + `check-learning-impact-evidence.mjs`
- [ ] Extend `human-quality/corpus.ts` + `service.ts` for snapshot copy
- [ ] Thread application payload through output-learning accept → derivations POST
- [ ] `GET /api/feedback/learning-impact` + optional Impact tab on `HumanQualityCorpusPanel`
- [ ] `131-EVIDENCE.template.json` — schema contract for Phase 133 gate

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Global multi-workspace impact rollup with live DB | IMPACT-02 | Requires Postgres with evaluated corpus rows | Run `cd app && npx tsx scripts/run-learning-impact.ts --all-workspaces` against staging DB; confirm `131-EVIDENCE.json` status `ok` when ≥5 items and both arms present |
| Owner impact UI drill-down | IMPACT-03 | Visual UX review | Platform-owner opens HumanQualityCorpusPanel Impact tab; verify learned vs non-learned arm metrics and insufficient-sample state |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (TDD inline — no MISSING markers in plans)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
