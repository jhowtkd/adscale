---
phase: 205
slug: creative-iteration-loop
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-27
---

# Phase 205 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 + @testing-library/react 16.3.2 (component) + Playwright 1.60.0 (E2E, separate) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `npx vitest run app/src/server/assistant/creative-iteration/ --config app/config/vitest.config.ts` |
| **Full suite command** | `npm test` (runs `vitest run --config config/vitest.config.ts --passWithNoTests`) |
| **Estimated runtime** | ~15 seconds (quick) / ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run app/src/server/assistant/creative-iteration/ app/src/server/billing/credits.test.ts app/src/components/assistant/ --config app/config/vitest.config.ts`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 205-01-01 | 01 | 1 | CREV-01 | unit | `npx vitest run app/src/server/assistant/creative-iteration/intent.test.ts` | ❌ W0 | ⬜ pending |
| 205-01-02 | 01 | 1 | CREV-01, SAFE-02 | unit | `npx vitest run app/src/server/assistant/creative-iteration/draft.test.ts` | ❌ W0 | ⬜ pending |
| 205-01-03 | 01 | 1 | CREV-01, SAFE-02 | unit | `npx vitest run app/src/server/assistant/creative-iteration/proposal.test.ts -t "proposeCreativeRevision"` | ❌ W0 | ⬜ pending |
| 205-02-01 | 02 | 1 | CREV-04, SAFE-02 | unit | `npx vitest run app/src/server/billing/credits.test.ts -t "refundCredits"` | ❌ W0 (extend) | ⬜ pending |
| 205-02-02 | 02 | 1 | CREV-02 | component | `npx vitest run app/src/components/assistant/CreditConfirmModal.test.tsx` | ❌ W0 | ⬜ pending |
| 205-02-03 | 02 | 1 | CREV-02 | component | `npx vitest run app/src/components/assistant/AssistantActionCard.test.tsx -t "creative"` | ❌ W0 (extend) | ⬜ pending |
| 205-03-01 | 03 | 2 | CREV-03 | unit | `npx vitest run app/src/server/assistant/action-execution/handlers/revise-creative.test.ts` | ❌ W0 | ⬜ pending |
| 205-03-02 | 03 | 2 | CREV-03, SAFE-02 | unit | `npx vitest run app/src/server/assistant/action-execution/handlers/revise-creative.test.ts -t "retry"` | ❌ W0 | ⬜ pending |
| 205-03-03 | 03 | 2 | CREV-03, CREV-04, SAFE-02 | integration | `npx vitest run app/src/server/jobs/derivation.test.ts -t "creative revision"` | ❌ W0 (extend) | ⬜ pending |
| 205-04-01 | 04 | 2 | CREV-01, CREV-04, SAFE-02 | unit | `npx vitest run app/src/server/assistant/creative-iteration/service.test.ts app/src/server/assistant/artifact-version/service.test.ts` | ❌ W0 (extend) | ⬜ pending |
| 205-04-02 | 04 | 2 | CREV-01 | unit | `npx vitest run app/src/server/assistant/orchestrator.test.ts -t "creative"` | ❌ W0 (extend) | ⬜ pending |
| 205-04-03 | 04 | 2 | CREV-01 | unit | `npx vitest run app/src/app/api/assistant/threads/[threadId]/creative-revisions/route.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/server/assistant/creative-iteration/proposal.test.ts` — stubs for CREV-01, CREV-04, SAFE-02 (propose, confirm idempotent, cancel, one-active)
- [ ] `app/src/server/assistant/creative-iteration/intent.test.ts` — stubs for CREV-01 (visual vs plan keyword routing)
- [ ] `app/src/server/assistant/creative-iteration/service.test.ts` — stubs for CREV-01 (orchestrator entry, clarify/redirect/ask_target)
- [ ] `app/src/server/assistant/creative-iteration/draft.test.ts` — stubs for draft persistence
- [ ] `app/src/server/assistant/action-execution/handlers/revise-creative.test.ts` — stubs for CREV-03, SAFE-02 (charge, enqueue, idempotent, retry)
- [ ] `app/src/server/billing/credits.test.ts` — extend with `refundCredits` tests (CREV-04, SAFE-02)
- [ ] `app/src/components/assistant/CreditConfirmModal.test.tsx` — stubs for CREV-02 (secondary modal)
- [ ] `app/src/components/assistant/AssistantActionCard.test.tsx` — extend with creative revision display tests (CREV-02)
- [ ] `app/src/server/assistant/orchestrator.test.ts` — extend with unified intent routing tests (CREV-01)
- [ ] `app/src/server/jobs/derivation.test.ts` — extend with creative revision callback + refund-on-failure tests (CREV-03, CREV-04, SAFE-02)
- [ ] `app/src/server/assistant/artifact-version/service.test.ts` — extend with creative lineage reload tests (CREV-04, SAFE-02)
- [ ] DB migration for `assistantCreativeFeedbackDrafts` table (+ optional `planVersionId` storage on proposals)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual preview renders in thread on generation success | CREV-03 | Requires live Inngest job + image rendering | Trigger a creative revision confirm in dev, verify preview thumbnail/message appears when job completes |
| Credit modal displays correct cost before final confirm | CREV-02 | Visual layout verification | Trigger confirm flow, verify secondary modal shows credit cost and confirm button |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
