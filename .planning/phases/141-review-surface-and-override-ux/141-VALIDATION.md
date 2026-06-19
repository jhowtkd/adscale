---
phase: 141
slug: review-surface-and-override-ux
status: gaps_found
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-19
updated: 2026-06-19T13:26:47Z
---

# Phase 141 - Validation Strategy

> Validation contract for making workspace review Olhar-first and override-aware.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest via `app/config/vitest.config.ts` |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/components/workspace/DerivationCard.test.tsx src/components/workspace/DerivationReviewSheet.test.tsx src/components/workspace/ClientApprovalPackagePanel.test.tsx src/lib/hooks/use-review.test.tsx src/app/api/derivations/[id]/review/route.test.ts src/server/ai/client-approval-package.test.ts tests/unit/output-learning/output-decision-event.test.ts` |
| **Full suite command** | `cd app && npm test && npm run build` |
| **Estimated runtime** | ~120 seconds focused, longer for full suite |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 141-01-01 | 01 | 1 | REVIEW-01 | component/unit | `cd app && npm test -- src/components/workspace/DerivationCard.test.tsx` | W0 | pending |
| 141-01-02 | 01 | 1 | REVIEW-02 | component/unit | `cd app && npm test -- src/components/workspace/DerivationReviewSheet.test.tsx` | W0 | pending |
| 141-01-03 | 01 | 1 | REVIEW-03 | hook/component | `cd app && npm test -- src/lib/hooks/use-review.test.tsx src/components/workspace/DerivationReviewSheet.test.tsx` | W0 | pending |
| 141-02-01 | 02 | 2 | REVIEW-04 | route/unit | `cd app && npm test -- src/app/api/derivations/[id]/review/route.test.ts` | exists | pending |
| 141-02-02 | 02 | 2 | REVIEW-01, REVIEW-04 | package/unit | `cd app && npm test -- src/server/ai/client-approval-package.test.ts` | W0 | pending |
| 141-02-03 | 02 | 2 | REVIEW-04 | evidence/unit | `cd app && npm test -- tests/unit/output-learning/output-decision-event.test.ts src/app/api/derivations/[id]/review/route.test.ts` | exists | pending |
| 141-03-01 | 03 | 3 | REVIEW-04 | component/unit | `cd app && npm test -- src/components/workspace/DerivationReviewSheet.test.tsx` | exists | pending |
| 141-03-02 | 03 | 3 | REVIEW-04 | hook/component | `cd app && npm test -- src/lib/hooks/use-review.test.tsx src/components/workspace/DerivationReviewSheet.test.tsx` | exists | pending |
| 141-03-03 | 03 | 3 | REVIEW-04 | component/unit | `cd app && npm test -- src/components/workspace/ClientApprovalPackagePanel.test.tsx` | exists | pending |

## Wave 0 Requirements

- [ ] Add or update `app/src/components/workspace/DerivationCard.test.tsx`.
- [ ] Add or update `app/src/components/workspace/DerivationReviewSheet.test.tsx`.
- [ ] Add or update `app/src/lib/hooks/use-review.test.tsx`.
- [ ] Add or update `app/src/server/ai/client-approval-package.test.ts`.
- [ ] Add or update `app/src/components/workspace/ClientApprovalPackagePanel.test.tsx`.
- [ ] Confirm `app/src/app/api/derivations/[id]/review/route.test.ts` covers structured decisions and override.
- [ ] UI fixture includes `olharVerdict: pronta`.
- [ ] UI fixture includes `olharVerdict: sem_opiniao`.
- [ ] UI fixture includes `olharVerdict: confusa`.
- [ ] UI fixture includes `exportStatus: bloqueado`.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual hierarchy feels like design review, not checklist QA | REVIEW-01, REVIEW-02 | Automated tests can assert text/order but not taste | Open a campaign workspace with mixed verdicts and verify the first read is Olhar verdict, not numeric score |
| Override friction is adequate | REVIEW-04 | Requires judgment on copy/friction | Try approving a blocked creative; confirm typed reason is mandatory and the weak verdict remains visible |

## Validation Sign-Off

- [x] All tasks have automated verification or explicit manual gate.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers missing test fixtures and new component tests.
- [x] No watch-mode flags.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending — `141-VERIFICATION.md` currently reports `gaps_found`; execute 141-03 before closure.
