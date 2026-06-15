---
phase: 115
slug: corpus-fixtures-and-audit-baseline
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-15
---

# Phase 115 — Validation Strategy

> Corpus fixtures and red baseline tests — no live image generation in CI.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 (`app/config/vitest.config.ts`) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/ai/creative-corpus.test.ts tests/unit/ai/corpus-fixtures.test.ts` |
| **Full suite command** | `cd app && npm test -- tests/unit/ai/creative-corpus.test.ts tests/unit/ai/corpus-fixtures.test.ts tests/unit/ai/corpus-baseline.test.ts tests/unit/ai/quality-fixture-pipeline.test.ts` |
| **Estimated runtime** | ~15 seconds |

## Sampling Rate

- **After every task commit:** Run task-specific automated verify command
- **After wave 1:** Quick run command
- **After wave 2:** Full suite command
- **Before phase verification:** Full suite + `npm run lint` on touched files

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 115-01-01 | 01 | 1 | FIXT-02, FIXT-03 | unit | `cd app && npm test -- tests/unit/ai/creative-corpus.test.ts` | ⬜ pending |
| 115-01-02 | 01 | 1 | FIXT-02 | unit | `cd app && npm test -- tests/unit/ai/creative-corpus.test.ts` | ⬜ pending |
| 115-02-01 | 02 | 1 | FIXT-01 | unit | `cd app && npm test -- tests/unit/ai/corpus-fixtures.test.ts` | ⬜ pending |
| 115-02-02 | 02 | 1 | FIXT-01, FIXT-03 | unit | `cd app && npm test -- tests/unit/ai/corpus-fixtures.test.ts` | ⬜ pending |
| 115-03-01 | 03 | 2 | FIXT-04 | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts` | ⬜ pending |
| 115-03-02 | 03 | 2 | FIXT-04 | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts tests/unit/ai/quality-fixture-pipeline.test.ts` | ⬜ pending |

## Wave 0 Requirements

Existing Vitest infrastructure covers all phase requirements. No Wave 0 stubs needed.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual match to corpus PNG | FIXT-01 | PNGs not in CI | Spot-check fixture labels against `app/exports/render-creatives/` contact sheet |

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 not required
- [x] No watch-mode flags
- [ ] `nyquist_compliant: true` set after execution

**Approval:** pending
