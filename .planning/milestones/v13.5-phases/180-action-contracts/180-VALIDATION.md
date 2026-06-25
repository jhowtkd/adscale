---
phase: 180
slug: action-contracts
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-25
updated: 2026-06-25
---

# Phase 180 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.5 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/server/assistant/action-contracts/` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run task `<automated>` verify command
- **After every plan wave:** Run `cd app && npm test -- --run src/server/assistant/`
- **Before `$gsd-verify-work`:** Full suite green + `npm run build`
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 180-01-01 | 01 | 1 | ACT-02 | compile | `cd app && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 180-01-02 | 01 | 1 | ACT-02, EXEC-01 | unit | `cd app && npx vitest run src/server/assistant/action-contracts/registry.test.ts src/server/assistant/action-contracts/risk-copy.test.ts -x` | ❌ W0 | ⬜ pending |
| 180-02-01 | 02 | 1 | ACT-01 | unit | `cd app && npx vitest run src/server/assistant/action-contracts/intent-classifier.test.ts -x` | ❌ W0 | ⬜ pending |
| 180-02-02 | 02 | 1 | ACT-01 | unit | `cd app && npx vitest run src/server/assistant/orchestrator.test.ts -x` | ✅ | ⬜ pending |
| 180-03-01 | 03 | 2 | ACT-02, EXEC-01 | unit | `cd app && npx vitest run src/server/assistant/action-contracts/validate.test.ts -x` | ❌ W0 | ⬜ pending |
| 180-03-02 | 03 | 2 | ACT-02, EXEC-01 | unit | `cd app && npx vitest run src/server/assistant/tools/policy.test.ts -x` | ✅ | ⬜ pending |
| 180-04-01 | 04 | 3 | EXEC-01 | unit | `cd app && npx vitest run src/server/assistant/action-contracts/confirm-validation.test.ts -x` | ❌ W0 | ⬜ pending |
| 180-04-02 | 04 | 3 | EXEC-01 | route | `cd app && npx vitest run src/app/api/assistant/actions/\\[actionId\\]/confirm/route.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files and modules created during execution (not pre-existing):

- [ ] `app/src/server/assistant/action-contracts/types.ts` — contract grammar types (task 180-01-01)
- [ ] `app/src/server/assistant/action-contracts/registry.ts` — ACTION_CONTRACT_REGISTRY (task 180-01-01)
- [ ] `app/src/server/assistant/action-contracts/risk-copy.ts` — buildRiskCopyLines (task 180-01-01)
- [ ] `app/src/server/assistant/action-contracts/contracts/quick-restyle.ts` — example contract (task 180-01-02)
- [ ] `app/src/server/assistant/action-contracts/contracts/start-complete-campaign.ts` — example contract (task 180-01-02)
- [ ] `app/src/server/assistant/action-contracts/registry.test.ts` — ACT-02 registry (task 180-01-02)
- [ ] `app/src/server/assistant/action-contracts/risk-copy.test.ts` — optional risk copy (task 180-01-02)
- [ ] `app/src/server/assistant/action-contracts/intent-classifier.ts` — ACT-01 classifier (task 180-02-01)
- [ ] `app/src/server/assistant/action-contracts/intent-classifier.test.ts` — classifier unit tests (task 180-02-01)
- [ ] `app/src/server/assistant/action-contracts/validate.ts` — propose + confirm validation (tasks 180-03-01, 180-04-01)
- [ ] `app/src/server/assistant/action-contracts/validate.test.ts` — propose validation (task 180-03-01)
- [ ] `app/src/server/assistant/action-contracts/confirm-validation.test.ts` — confirm revalidation (task 180-04-01)
- [ ] `app/src/app/api/assistant/actions/[actionId]/confirm/route.test.ts` — confirm route (task 180-04-02)

---

## Requirement Coverage

| Requirement | Tasks | Verification |
|-------------|-------|--------------|
| ACT-01 | 180-02-01, 180-02-02 | intent-classifier + orchestrator tests |
| ACT-02 | 180-01-01, 180-01-02, 180-03-01, 180-03-02 | registry, risk-copy, validate, policy tests |
| EXEC-01 | 180-01-02, 180-03-01, 180-03-02, 180-04-01, 180-04-02 | confirmationPolicy required + confirm revalidation |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end chat → propose → confirm | EXEC-01 | Requires full stack + Phase 181 UI for card UX | Deferred to Phase 181; API-only confirm test covers route |

---

## Validation Sign-Off

- [ ] All Wave 0 test files created
- [ ] All task verify commands green
- [ ] `cd app && npm test` full suite green
- [ ] `cd app && npm run build` succeeds
