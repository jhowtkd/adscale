---
phase: 132
slug: targeted-creative-quality-improvements
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 132 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 (registry 4.1.9) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/human-quality/improvement` |
| **Full suite command** | `cd app && npm test && npm run lint && npm run build` |
| **Estimated runtime** | ~50 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- tests/unit/human-quality/improvement`
- **After every plan wave:** Run `cd app && npm test -- tests/unit/human-quality tests/unit/ai/gate-failure-matrix.test.ts src/server/output-learning/safety/guards.test.ts`
- **Before `$gsd-verify-work`:** Full suite + `check-creative-validation-evidence.mjs --stage final` + `check-output-learning-evidence.mjs` + `check-quality-improvement-evidence.mjs`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 132-01-01 | 01 | 1 | QUALITY-02 | unit | `cd app && npm test -- tests/unit/human-quality/improvement/accept.test.ts` | ❌ W0 | ⬜ pending |
| 132-01-02 | 01 | 1 | QUALITY-02 | unit | `cd app && npm test -- tests/unit/human-quality/improvement/apply.test.ts` | ❌ W0 | ⬜ pending |
| 132-01-03 | 01 | 1 | QUALITY-02 | unit | `cd app && npm test -- tests/unit/human-quality/improvement/accept.test.ts` | ❌ W0 | ⬜ pending |
| 132-02-00 | 02 | 2 | QUALITY-02 | checkpoint | Operator accept via API; resume with "accepted" | — | ⬜ pending |
| 132-02-01 | 02 | 2 | QUALITY-01, QUALITY-02 | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts` | ❌ W0 | ⬜ pending |
| 132-02-02 | 02 | 2 | QUALITY-01, QUALITY-02 | unit | `cd app && npm test -- tests/unit/ai/gate-failure-matrix.test.ts` | ✅ | ⬜ pending |
| 132-02-03 | 02 | 2 | QUALITY-01 | unit | `cd app && npm test -- tests/unit/ai/corpus-fixtures.test.ts` | ❌ W0 | ⬜ pending |
| 132-03-01 | 03 | 3 | QUALITY-03 | script | `node app/scripts/check-quality-improvement-evidence.mjs --skip-tests` | ❌ W0 | ⬜ pending |
| 132-03-02 | 03 | 3 | QUALITY-03 | script | `cd app && npm run quality-improvement-evidence` | ❌ W0 | ⬜ pending |
| 132-04-01 | 04 | 4 | QUALITY-04 | unit | `cd app && npm test -- tests/unit/human-quality/improvement/reevaluate.test.ts` | ❌ W0 | ⬜ pending |
| 132-04-02 | 04 | 4 | QUALITY-04 | script | `node app/scripts/run-quality-improvement.ts` | ❌ W0 | ⬜ pending |
| 132-04-03 | 04 | 4 | QUALITY-04 | unit | `cd app && npm test -- src/app/api/feedback/quality-improvement/route.test.ts` | ❌ W0 | ⬜ pending |
| 132-04-04 | 04 | 4 | QUALITY-03, QUALITY-04 | checkpoint | Full regression with `--run-regression` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note:** Tests are created inline via TDD tasks (no separate Wave 0 plan); `File Exists` flips to ✅ as each task completes.

---

## Wave 0 Requirements

- [ ] `app/src/server/human-quality/improvement/` module (accept, apply, reevaluate, service)
- [ ] `acceptAdjustment` / `listAcceptedAdjustments` in `rubric-calibration-adjustments.ts`
- [ ] `tests/unit/human-quality/improvement/*.test.ts` — requirement coverage
- [ ] `app/scripts/run-quality-improvement.ts` + `check-quality-improvement-evidence.mjs`
- [ ] `132-EVIDENCE.template.json` — schema contract for Phase 133 gate
- [ ] Optional: 3 `CORPUS_ARCHETYPE_FIXTURES` for weak_hierarchy, illegible_cta, unfocused_composition
- [ ] Schema migration: `accepted_at`, `accepted_by` columns on `rubric_calibration_adjustments` (if not jsonb-metadata)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator after-corpus regeneration | QUALITY-04 | Requires live derivation pipeline + human re-evaluation | Accept adjustments, regenerate outputs for targeted failure slices, enqueue post-change corpus items, re-run `run-quality-improvement.ts` |
| Owner accept workflow | QUALITY-02 | Visual UX review | Platform-owner opens HumanQualityCorpusPanel; accept proposed calibration adjustments before apply wave |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (TDD inline — no MISSING markers in plans)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
