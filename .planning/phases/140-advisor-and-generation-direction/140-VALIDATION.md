---
phase: 140
slug: advisor-and-generation-direction
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-19
validated: 2026-06-19T12:25:00Z
---

# Phase 140 - Validation Strategy

> Validation contract for rewriting advisor/generation direction around Olhar ADScale.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest via `app/config/vitest.config.ts` |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/ai/olhar/base-reading.test.ts src/server/ai/olhar/olhar-qa.test.ts src/server/ai/olhar/generation-direction.test.ts src/server/ai/prompt-builder.test.ts` |
| **Full suite command** | `cd app && npm test && npm run build` |
| **Estimated runtime** | ~120 seconds focused, longer for full suite |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 140-01-01 | 01 | 1 | ADVISOR-01 | unit/prompt | `cd app && npm test -- src/server/ai/olhar/base-reading.test.ts` | exists | passed |
| 140-01-02 | 01 | 1 | ADVISOR-02 | unit/prompt | `cd app && npm test -- src/server/ai/olhar/olhar-qa.test.ts src/server/ai/creative-qa.test.ts` | exists | passed |
| 140-02-01 | 02 | 2 | ADVISOR-03 | unit/prompt | `cd app && npm test -- src/server/ai/olhar/generation-direction.test.ts src/server/ai/prompt-builder.test.ts` | exists | passed |
| 140-02-02 | 02 | 2 | ADVISOR-04 | unit/types | `cd app && npm test -- src/server/ai/creative-score.test.ts src/lib/hooks/use-derivations.test.tsx` | exists | passed |

## Wave 0 Requirements

- [x] `app/src/server/ai/olhar/base-reading.ts`
- [x] `app/src/server/ai/olhar/base-reading.test.ts`
- [x] `app/src/server/ai/olhar/olhar-qa.ts`
- [x] `app/src/server/ai/olhar/olhar-qa.test.ts`
- [x] `app/src/server/ai/olhar/generation-direction.ts`
- [x] `app/src/server/ai/olhar/generation-direction.test.ts`
- [x] preflight prompt says `Leitura do base` and caps risks at 2.
- [x] QA/score prompt says `Passagem Olhar` and produces direction notes.
- [x] prompt-builder injects generation direction without overriding hard export rules.
- [x] numeric score remains present but is no longer the primary server contract.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cenbrap voice injection approval | ADVISOR-03 | `138-VOICE-REVIEW.md` is still pending Jhonatan review | Do not require active Cenbrap voice injection unless review status becomes `approved` |

## Observed Verification

| Check | Evidence | Result |
|-------|----------|--------|
| Phase 140 focused test suite | `140-VERIFICATION.md` reports `111 tests passed (6 files)` | passed |
| ADVISOR-01..04 coverage | `140-VERIFICATION.md` score `4/4` | passed |
| Deferred UI score demotion | Explicitly deferred to Phase 141 | accepted scope |
| Cenbrap live voice injection | Held by `138-VOICE-REVIEW.md` pending review | accepted manual gate |

## Validation Sign-Off

- [x] All tasks have automated verification or explicit manual gate.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** passed via `140-VERIFICATION.md`
