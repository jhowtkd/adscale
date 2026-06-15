---
phase: 120
slug: quality-gate-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 120 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts tests/unit/ai/corpus-baseline.test.ts` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~15 seconds (gate + corpus subset) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts tests/unit/ai/corpus-baseline.test.ts`
- **After every plan wave:** Run `cd app && npm test -- tests/unit/ai/`
- **Before `$gsd-verify-work`:** Full suite must be green (`cd app && npm test && npm run lint && npm run build`)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 120-01-01 | 01 | 1 | GATE-01 | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "pattern"` | ❌ W0 | ⬜ pending |
| 120-01-02 | 01 | 1 | GATE-01 | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts` | ✅ | ⬜ pending |
| 120-02-01 | 02 | 2 | GATE-02, GATE-03 | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "high qualityScore"` | ✅ | ⬜ pending |
| 120-02-02 | 02 | 2 | GATE-03 | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "generic"` | ✅ | ⬜ pending |
| 120-03-01 | 03 | 3 | GATE-04 | unit | `cd app && npm test -- tests/unit/ai/corpus-fixtures.test.ts` | ✅ | ⬜ pending |
| 120-03-02 | 03 | 3 | GATE-04, GATE-05 | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts tests/unit/ai/creative-quality-gate.test.ts -t "faithful|baseline gap|primary audit"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `DECORATIVE_ONLY_PATTERN`, `REPLACED_SOURCE_SUBJECT_PATTERN`, `CAMPAIGN_IDENTITY_DRIFT_PATTERN` in `creative-quality-taxonomy.ts`
- [ ] `CreativeHardFailureCode` union extended; `normalizeHardFailureCode` for legacy alias
- [ ] Classifier refactor in `classifyCreativeRiskFailed` / `classifyBriefMatchFailed`
- [ ] `corpus-faithful-format-adaptation` fixture (`c2c12774`) in `CORPUS_POSITIVE_FIXTURES` (separate from `CORPUS_ARCHETYPE_FIXTURES`)
- [ ] `corpus-fixtures.ts` expected code renames + `f420bcb2` ref + `baselineVerdict` updates
- [ ] `corpus-baseline.test.ts` `BASELINE_GAP_COUNT = 0`, remove `it.fails`
- [ ] i18n `hardFailureCodes` for all GATE-01 codes including `invented_factual_entity`
- [ ] Update `creative-quality-gate.test.ts` severe vs mild generic cases

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UI hard-failure labels | GATE-01 | i18n keys need visual check in settings/review UI | Spot-check en + pt-BR labels for new codes in review drawer |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
