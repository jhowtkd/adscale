---
phase: 119
slug: observable-rubric
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-15
---

# Phase 119 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.9 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/ai/creative-qa.test.ts tests/unit/ai/quality-rubric-regression.test.ts tests/unit/ai/creative-score.test.ts` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- src/server/ai/creative-qa.test.ts tests/unit/ai/quality-rubric-regression.test.ts tests/unit/ai/creative-score.test.ts`
- **After every plan wave:** Run `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts tests/unit/ai/creative-quality-gate.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green (`cd app && npm test && npm run lint && npm run build`)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 119-01-01 | 01 | 1 | RUBR-01 | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts -t "visual overload"` | ❌ W0 | ⬜ pending |
| 119-01-02 | 01 | 1 | RUBR-02 | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts -t "generic template"` | ❌ W0 | ⬜ pending |
| 119-01-03 | 01 | 1 | RUBR-03 | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts -t "observable defect"` | ❌ W0 | ⬜ pending |
| 119-01-04 | 01 | 1 | RUBR-04 | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts -t "thumbnail"` | ❌ W0 | ⬜ pending |
| 119-02-01 | 02 | 2 | RUBR-01–04 | unit | `cd app && npm test -- src/server/ai/creative-qa.test.ts -t "export must remain"` | ✅ | ⬜ pending |
| 119-03-01 | 03 | 3 | RUBR-01–04 | unit | `cd app && npm test -- tests/unit/ai/creative-score.test.ts -t "overload"` | ❌ W0 | ⬜ pending |
| 119-04-01 | 04 | 4 | RUBR-01–04 | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts` | ❌ W0 | ⬜ pending |
| 119-04-02 | 04 | 4 | Regression | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts -t "baseline gap"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/server/ai/observable-rubric.ts` — constants, builders, extractors, note markers for Phase 120
- [ ] Wire `buildObservableQaRubricSection` in `creative-qa.ts`; remove export-softening line
- [ ] Extract `buildCreativeScorePrompt` in `creative-score.ts`; wire score rubric
- [ ] `app/tests/unit/ai/quality-rubric-regression.test.ts` — corpus archetype × rubric presence
- [ ] Extend `creative-qa.test.ts` — no export-softening; observable sections present
- [ ] Extend `creative-score.test.ts` — score prompt rubric parity

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live vision model obeys rubric on real images | RUBR-01–04 | OpenAI vision non-deterministic | Deferred to Phase 123 visual validation gate |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
