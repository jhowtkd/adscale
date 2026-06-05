---
phase: 57
slug: creative-contract-and-prompt-provenance
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
---

# Phase 57 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + Next.js build |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/repositories/derivation.test.ts src/server/jobs/derivation.test.ts src/server/ai/prompt-builder.test.ts tests/unit/prompt-builder.test.ts` |
| **Full suite command** | `cd app && npm run build` |
| **Estimated runtime** | ~60-180 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-specific focused test listed below.
- **After every plan wave:** Run `cd app && npm test -- src/server/repositories/derivation.test.ts src/server/jobs/derivation.test.ts src/server/ai/prompt-builder.test.ts tests/unit/prompt-builder.test.ts`.
- **Before `$gsd-verify-work`:** `cd app && npm run build` must pass.
- **Max feedback latency:** 180 seconds for automated checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | AIC-01, AIC-05 | schema/static | `rg -n "creativeContract|promptProvenance|creative_contract|prompt_provenance" app/src/server/db/schema.ts app/drizzle` | W0 | pending |
| 57-01-02 | 01 | 1 | AIC-01, AIC-05 | unit | `cd app && npm test -- src/server/repositories/derivation.test.ts` | W0 | pending |
| 57-01-03 | 01 | 1 | AIC-01, AIC-05 | unit/job | `cd app && npm test -- src/server/jobs/derivation.test.ts` | W0 | pending |
| 57-01-04 | 01 | 1 | AIC-01, AIC-05 | focused | `cd app && npm test -- src/server/repositories/derivation.test.ts src/server/jobs/derivation.test.ts` | W0 | pending |
| 57-02-01 | 02 | 2 | AIC-02, AIC-03, AIC-04 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/prompt-builder.test.ts` | W0 | pending |
| 57-02-02 | 02 | 2 | AIC-01..AIC-05 | focused | `cd app && npm test -- src/server/repositories/derivation.test.ts src/server/jobs/derivation.test.ts src/server/ai/prompt-builder.test.ts tests/unit/prompt-builder.test.ts` | W0 | pending |
| 57-02-03 | 02 | 2 | AIC-01..AIC-05 | build | `cd app && npm run build` | W0 | pending |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework is needed.

---

## Manual-Only Verifications

All Phase 57 behaviors have automated verification. Full visual quality review belongs to Phase 60.

---

## Validation Sign-Off

- [x] All tasks have automated verify or documented manual verification.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency < 180s for automated checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
