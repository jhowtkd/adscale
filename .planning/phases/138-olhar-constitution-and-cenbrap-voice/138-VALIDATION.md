---
phase: 138
slug: olhar-constitution-and-cenbrap-voice
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-19
validated: 2026-06-19
---

# Phase 138 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest via `app/config/vitest.config.ts` + Node script checks |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/ai/olhar/ src/server/ai/voices/ && cd .. && node app/scripts/check-olhar-vocabulary.mjs` |
| **Full suite command** | `cd app && npm test && npm run build` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific automated command.
- **After every plan wave:** Run `cd app && npm test -- src/server/ai/olhar/ src/server/ai/voices/ && cd .. && node app/scripts/check-olhar-vocabulary.mjs`.
- **Before `$gsd-verify-work`:** Full suite must be green where touched: focused tests, vocabulary audit, and `cd app && npm run build`.
- **Max feedback latency:** 120 seconds for focused checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 138-01-01 | 01 | 1 | OLHAR-01 | unit | `cd app && npm test -- src/server/ai/olhar/constitution.test.ts` | ✅ | ✅ green |
| 138-01-02 | 01 | 1 | OLHAR-03 | script + focused tests | `node app/scripts/check-olhar-vocabulary.mjs && cd app && npm test -- src/server/ai/prompt-builder.test.ts src/server/ai/creative-qa.test.ts src/server/ai/creative-score.test.ts` | ✅ | ✅ green |
| 138-02-01 | 02 | 2 | OLHAR-02 | unit | `cd app && npm test -- src/server/ai/voices/client-voice.test.ts` | ✅ | ✅ green |
| 138-02-02 | 02 | 2 | OLHAR-04 | unit | `cd app && npm test -- src/server/ai/olhar/art-direction-verdict.test.ts` | ✅ | ✅ green |
| 138-02-03 | 02 | 2 | OLHAR-02 | manual artifact | `test -f .planning/phases/138-olhar-constitution-and-cenbrap-voice/138-VOICE-REVIEW.md && rg -n "status: pending_review|status: approved|status: changes_requested" .planning/phases/138-olhar-constitution-and-cenbrap-voice/138-VOICE-REVIEW.md` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `app/src/server/ai/olhar/constitution.ts` — Olhar principles, axes, prompt section.
- [x] `app/src/server/ai/olhar/constitution.test.ts` — contract and forbidden-term tests.
- [x] `app/src/server/ai/olhar/vocabulary.ts` — forbidden UI-first vocabulary and replacements.
- [x] `app/scripts/check-olhar-vocabulary.mjs` — prompt/rubric vocabulary audit.
- [x] `app/src/server/ai/voices/client-voice.ts` — voice resolver.
- [x] `app/src/server/ai/voices/cenbrap.ts` — first Cenbrap voice overlay.
- [x] `app/src/server/ai/voices/client-voice.test.ts` — Cenbrap matching and fallback behavior.
- [x] `app/src/server/ai/olhar/art-direction-verdict.ts` — visual failure to creative verdict mapping.
- [x] `app/src/server/ai/olhar/art-direction-verdict.test.ts` — mapping coverage.
- [x] `138-VOICE-REVIEW.md` — owner review checkpoint for Cenbrap voice.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cenbrap voice feels like Jhonatan's design eye | OLHAR-02 | Taste and brand nuance require product/creative director review | Review `app/src/server/ai/voices/cenbrap.ts` and `138-VOICE-REVIEW.md`; mark approved or changes requested |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency < 120s for focused checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** passed

## Validation Audit 2026-06-19

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 5 |
| Escalated | 0 |

Commands rerun:

- `cd app && npm test -- src/server/ai/olhar/ src/server/ai/voices/` — 3 files, 28 tests passed.
- `node app/scripts/check-olhar-vocabulary.mjs` — passed; Node emitted only the existing typeless-package warning.
- `cd app && npm run build` — passed; emitted existing in-memory rate-limiter warnings when Redis env vars are absent.
