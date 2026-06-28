---
phase: 205-creative-iteration-loop
plan: "02"
subsystem: billing, ui
tags: [refund, credits, dialog, react, assistant-action-card, contract-display]

# Dependency graph
requires:
  - phase: 204-plan-iteration-loop
    provides: AssistantActionCard, contract-display, useConfirmAssistantAction, useCancelAssistantAction, Dialog primitives
provides:
  - refundCredits billing function with idempotency (auto-refund on job failure)
  - CreditConfirmModal component (secondary credit confirmation modal)
  - AssistantActionCard creative revision display (intendedChanges, format, references, planVersionLabel, credit impact, retry)
  - contract-display extended for revise_creative fields
affects:
  - 205-03 confirm handler (will call refundCredits on job failure)
  - 205-04 orchestrator (will use revise_creative display fields)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED→GREEN→REFACTOR per task with atomic commits"
    - "Mirrors recordUsage pattern (reversed direction: credit grants back, negative usage, positive refund transaction)"
    - "Secondary confirmation modal between card confirm and mutation"
    - "References fallback: items with thumbnails when available, count when not"

key-files:
  created:
    - app/src/components/assistant/CreditConfirmModal.tsx
    - app/src/components/assistant/CreditConfirmModal.test.tsx
  modified:
    - app/src/server/billing/credits.ts (added refundCredits)
    - app/src/server/billing/credits.test.ts (added refundCredits suite)
    - app/src/components/assistant/AssistantActionCard.tsx (creative revision display)
    - app/src/components/assistant/AssistantActionCard.test.tsx (creative revision tests)
    - app/src/lib/assistant/contract-display.ts (creative fields + shouldShowCreditImpact)
    - app/src/lib/assistant/contract-display.test.ts (creative field parsing)

key-decisions:
  - "refundCredits lives in credits.ts (mirrors recordUsage placement) — not in gates.ts (gates.ts is for API-error returning gates)"
  - "Refund does NOT call canSpend — refund is unconditional reversal, never blocked"
  - "trackUsage logs refund with NEGATIVE amount (reversal) + refund:true metadata"
  - "createCreditTransaction uses POSITIVE amount + type:'refund' (matches ledger semantics)"
  - "Dev-admin workspaces still create refund transaction but skip grant modification (same bypass as recordUsage)"
  - "CreditConfirmModal uses Dialog backdrop close as another way to trigger onCancel"
  - "References render strategy: items list (name + thumbnail) when available, count fallback when not"
  - "Plan version label renders 'Plano: {label}' only for revise_creative (not revise_creative_plan)"
  - "Failed revise_creative shows 'Tentar novamente' button (re-uses confirmMutation — single action record, idempotent retry)"

patterns-established:
  - "Pattern: refundCredits = reverse recordUsage — idempotencyKey check, no canSpend, credit grants back, negative usage log, positive refund transaction"
  - "Pattern: secondary confirmation modal pattern — showCreditModal state, open on card confirm, modal Confirmar triggers mutation"
  - "Pattern: assistant action card retry affordance for failed creative revisions — re-uses confirmMutation with same actionId (idempotent per action record)"

requirements-completed: [CREV-02, CREV-04]

# Metrics
duration: 10min
completed: 2026-06-28
---

# Phase 205 Plan 02: Billing Refund + Creative Revision UI Summary

**refundCredits billing function with idempotency + CreditConfirmModal secondary confirmation + AssistantActionCard creative revision display**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-28T00:26:12Z
- **Completed:** 2026-06-28T00:35:30Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `refundCredits` exports from `credits.ts` — credits grants back via `updateCreditGrantRemaining`, idempotent via `getUsageByIdempotencyKey`, creates positive refund transaction (`type: "refund"`), skips canSpend, skips grant modification for dev-admin workspaces
- `CreditConfirmModal` component — Dialog with credit cost text, Confirmar (with Loader2 spinner when pending) and Cancelar buttons, data-testid for testing, backdrop close triggers cancel
- `AssistantActionCard` creative revision rendering — intendedChanges list, format, references (items with thumbnails OR count fallback), planVersionLabel as "Plano: v2", credit impact row visible for revise_creative (was hidden for revise_creative_plan), retry button on failed status
- `contract-display` extended — ClientActionCardDisplay accepts intendedChanges, format, referenceCount, referenceItems, planVersionLabel; shouldShowCreditImpact returns true for revise_creative

## Task Commits

Each task followed RED→GREEN→REFACTOR with atomic commits:

1. **Task 1: refundCredits** — `d04770d4` (test), `84fc57c2` (feat)
2. **Task 2: CreditConfirmModal** — `dce765e1` (test), `37bc82a5` (feat)
3. **Task 3: contract-display + AssistantActionCard** — `17f91a26` (test), `49eb80b2` (feat)

**Plan metadata:** pending (docs commit after SUMMARY + state updates)

_Note: TDD tasks each had 2 commits (test RED → feat GREEN). No REFACTOR commits needed — implementation was clean on first pass._

## Files Created/Modified

- `app/src/server/billing/credits.ts` — added `refundCredits` function (97 lines, reverse of recordUsage)
- `app/src/server/billing/credits.test.ts` — added `refundCredits` test suite (5 new tests: credit-back, idempotency, dev-admin bypass, no-canSpend, default-cost)
- `app/src/components/assistant/CreditConfirmModal.tsx` — secondary confirmation modal (67 lines)
- `app/src/components/assistant/CreditConfirmModal.test.tsx` — modal test suite (8 tests)
- `app/src/components/assistant/AssistantActionCard.tsx` — added isReviseCreative flag, CreditConfirmModal integration, creative-specific rendering blocks, retry button
- `app/src/components/assistant/AssistantActionCard.test.tsx` — creative revision test suite (6 new tests)
- `app/src/lib/assistant/contract-display.ts` — extended ClientActionCardDisplay with creative fields; shouldShowCreditImpact returns true for revise_creative
- `app/src/lib/assistant/contract-display.test.ts` — added revise_creative parsing + shouldShowCreditImpact tests (2 new tests)

## Decisions Made

- `refundCredits` placement in `credits.ts` (not `gates.ts`) — mirrors `recordUsage`, gates.ts is reserved for API-error returning helpers
- Refund is **unconditional** — no `canSpend` check, no subscription check. Refund always proceeds; it's a reversal
- Refund transaction amount is **positive** (credits back); usage log amount is **negative** (reversal marker)
- Refund idempotency re-uses `getUsageByIdempotencyKey` + `trackUsage` with negative amount — single source of truth for idempotent refund/reversal log
- Dev-admin workspaces still create refund transaction (audit trail) but skip grant modification (no real grant to credit back)
- `CreditConfirmModal` is generic — accepts `creditCost: number` so future credit-gated actions can reuse it
- References render strategy: items with thumbnails when available (more informative), fall back to count text when only IDs known (lighter)
- Retry button reuses `confirmMutation.mutate({ actionId, threadId })` — same action record, idempotent per action record (no duplicate charge risk)
- Plan version label shows **only** for revise_creative (creative is bound to plan; plan revision doesn't reference another plan version)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `refundCredits` ready to be called from job callback (Plan 03 will wire it into `derivationJob.onFailure` for `revise_creative` actions)
- `CreditConfirmModal` ready for integration — Plan 03 confirm handler can pass `isPending={confirmMutation.isPending}` directly
- `AssistantActionCard` creative revision display ready for Plan 04 orchestrator — display payload can include `intendedChanges`, `format`, `referenceIds`, `planVersionLabel`, `creditImpact`
- `contract-display` extended type is forward-compatible — `parseActionCardDisplay` accepts optional fields without breaking existing callers

---

*Phase: 205-creative-iteration-loop*
*Completed: 2026-06-28*

## Self-Check: PASSED

All created files exist on disk. All 6 task commits (3 RED + 3 GREEN) verified in git log. All test suites green (93 tests pass).