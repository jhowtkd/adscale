---
phase: 116
slug: canonical-creative-contract
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 116 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/ai/prompt-builder.test.ts` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- src/server/ai/prompt-builder.test.ts`
- **After every plan wave:** Run `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 116-01-01 | 01 | 1 | CONT-01, CONT-02 | unit | `cd app && npm test -- tests/unit/creative-contract.test.ts` | ✅ extend | ⬜ pending |
| 116-01-02 | 01 | 1 | CONT-01, CONT-02 | unit | `cd app && npm test -- tests/unit/creative-contract.test.ts -t canonical` | ❌ W0 | ⬜ pending |
| 116-02-01 | 02 | 2 | CONT-04 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t integrity` | ❌ W0 | ⬜ pending |
| 116-02-02 | 02 | 2 | CONT-01, CONT-04 | unit | `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts` | ✅ extend | ⬜ pending |
| 116-03-01 | 03 | 3 | CONT-03 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t precedence` | ❌ W0 | ⬜ pending |
| 116-03-02 | 03 | 3 | CONT-03 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "no preserve-all"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `extractPromptIntegritySection` + `extractPromptCanonicalContractSection` in `prompt-builder.ts`
- [ ] `buildCanonicalContractPromptSection` + `buildIntegrityPromptSection` modules
- [ ] Tests: integrity present for art_variation, format_adaptation, restyling
- [ ] Tests: prompt must NOT match preserve-all without precedence (CONT-03 negative assert)
- [ ] Extend `quality-prompt-regression.test.ts` with integrity assertions
- [ ] Extend `creative-contract.test.ts` for canonical field defaults

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Model output quality improvement | CONT-01–04 | Requires live OpenAI render | Deferred to Phase 122 corpus validation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
