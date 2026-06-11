---
phase: 98-past-due-policy-recovery
verified: 2026-06-11T17:50:00Z
status: human_needed
score: 4/4
overrides_applied: 0
human_verification:
  - test: "Open Settings → Billing for a workspace with subscriptionStatus past_due and remaining credits"
    expected: "Amber 'Pagamento pendente' banner appears with remaining credit count, status line shows 'Pagamento pendente' (not 'Sem acesso ativo'), and 'Atualizar pagamento no portal' button is visible"
    why_human: "Visual layout, copy hierarchy, and responsive behavior cannot be verified by grep or unit tests"
  - test: "Click 'Atualizar pagamento no portal' on a past_due workspace with a Stripe customer"
    expected: "Browser redirects to Stripe Customer Portal where payment method can be updated"
    why_human: "Requires live Stripe test-mode session and external redirect — mocked in unit tests only"
  - test: "Send invoice.payment_failed webhook for an active subscription in staging"
    expected: "Local subscription status becomes past_due; invoice.paid does not create new credit grants until status returns to active/trialing"
    why_human: "End-to-end webhook + DB state requires running app with Stripe CLI or staging environment"
---

# Phase 98: Past-Due Policy and Recovery Verification Report

**Phase Goal:** Define and enforce one explicit `past_due` spend policy while giving users a direct path to recover payment.

**Verified:** 2026-06-11T17:50:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | Documented policy for existing credits during past_due | ✓ VERIFIED | `PAST_DUE_SPEND_POLICY = "existing_credits_spendable"` with JSDoc in `access.ts`; mirrored in `98-CONTEXT.md`; exposed via `/api/billing/status` as `pastDue.spendPolicy` |
| 2 | Billing access and spend gates enforce policy consistently | ✓ VERIFIED | `getWorkspaceBillingAccess` sets `hasSpendAccess: hasCredits` for past_due; `canSpend`/`spendCreditsOrApiError` gate on `hasSpendAccess`; `invoice.paid` skips grants when status ≠ active/trialing; 15+ generation routes use `spendCreditsOrApiError` |
| 3 | Billing UI shows specific past_due state and Customer Portal action | ✓ VERIFIED | `BillingTab` renders amber banner with "Pagamento pendente", credit count, and portal CTA; status line shows "Pagamento pendente" instead of generic inactive copy; `useBillingPortal` POSTs to `/api/billing/portal` |
| 4 | Tests cover invoice.payment_failed, access, gates, portal recovery | ✓ VERIFIED | 54 tests pass across 8 files: `events.test.ts` (payment_failed + grant suspension), `access.test.ts`, `credits.test.ts`, `gates.test.ts`, `status/route.test.ts`, `use-billing.test.tsx`, `BillingTab.test.tsx`, `portal/route.test.ts` |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/src/server/billing/access.ts` | Policy constants + past_due access branch | ✓ VERIFIED | 161 lines; `PAST_DUE_SPEND_POLICY`, `PAST_DUE_LABEL`, past_due branch at lines 127–139 |
| `app/src/server/billing/events.ts` | Grant suspension + payment_failed handler | ✓ VERIFIED | `processInvoicePaymentFailed` marks past_due; `processInvoicePaid` returns early for non-active/trialing |
| `app/src/app/api/billing/status/route.ts` | pastDue recovery metadata | ✓ VERIFIED | Returns `pastDue: { recoveryAction: "portal", spendPolicy }` when `subscriptionStatus === "past_due"` |
| `app/src/lib/hooks/use-billing.ts` | Typed pastDue + hasSpendAccess | ✓ VERIFIED | `PastDueRecoveryAction`, `PastDueSpendPolicy` types; `useBillingPortal` mutation |
| `app/src/components/settings/BillingTab.tsx` | past_due banner + portal CTA | ✓ VERIFIED | Banner at lines 98–117; status copy at lines 303–304 |
| `app/src/components/settings/BillingTab.test.tsx` | UI + portal interaction tests | ✓ VERIFIED | 2 tests for banner visibility and portal click |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `access.ts` | `credits.ts` | `getWorkspaceBillingAccess` → `hasSpendAccess` | ✓ WIRED | `canSpend` imports and calls access resolver |
| `credits.ts` | `gates.ts` | `recordUsage` → `canSpend` | ✓ WIRED | `spendCreditsOrApiError` delegates to `recordUsage` |
| `gates.ts` | generation routes | `spendCreditsOrApiError` import | ✓ WIRED | Used in preflight, derivations, plan, auto-briefing, and 10+ other routes |
| `status/route.ts` | `BillingTab.tsx` | `useBillingStatus` hook | ✓ WIRED | Hook fetches `/api/billing/status`; tab reads `subscriptionStatus`, `pastDue`, `access.hasSpendAccess` |
| `BillingTab.tsx` | `/api/billing/portal` | `useBillingPortal().mutate()` | ✓ WIRED | Portal button calls mutation; hook POSTs to portal route |
| `events.ts` | subscription DB | `processInvoicePaymentFailed` → `upsertSubscription` | ✓ WIRED | Sets status `past_due` on first failed payment from active/trialing |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `BillingTab.tsx` | `billingStatus`, `isPastDue` | `useBillingStatus` → `/api/billing/status` → `getWorkspaceBillingAccess` | Yes — DB-backed subscription + grants | ✓ FLOWING |
| `status/route.ts` | `pastDue`, `hasSpendAccess` | `getWorkspaceBillingAccess(workspace.id)` | Yes — derived from latest subscription + credit grants | ✓ FLOWING |
| `credits.ts` | `access.hasSpendAccess` | `getWorkspaceBillingAccess` + `getAvailableCreditGrants` | Yes — credit balance from DB grants | ✓ FLOWING |
| `events.ts` | subscription status | Stripe webhook payload → `upsertSubscription` | Yes — persists to subscription table | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Access tests pass | `npm test -- --run src/server/billing/access.test.ts` | 8 tests passed | ✓ PASS |
| Credits past_due spend | `npm test -- --run src/server/billing/credits.test.ts` | includes "allows past_due workspaces to spend existing credits" | ✓ PASS |
| invoice.payment_failed handler | `npm test -- --run src/server/billing/events.test.ts` | "marks active subscriptions as past_due on payment failure" passed | ✓ PASS |
| Full phase 98 suite (54 tests) | `npm test -- --run` (8 billing files) | 8 files, 54 tests passed | ✓ PASS |
| Phase commits exist | `git log -1 f8935c75 b3e14d17 b8ff55b3` | All 3 commits found | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DUEN-01 | 98-01 | past_due user sees clear status in billing UI (not generic no-access) | ✓ SATISFIED | Label "Pagamento pendente"; banner with specific copy; status route returns distinct metadata |
| DUEN-02 | 98-01 | past_due user can open Customer Portal with one click | ✓ SATISFIED | Portal CTA in banner + "Gerenciar cobrança"; `useBillingPortal` → `/api/billing/portal` |
| DUEN-03 | 98-01 | Spend policy implemented and documented | ✓ SATISFIED | `PAST_DUE_SPEND_POLICY` constant; existing credits spendable; new grants suspended in events.ts |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None found in phase artifacts | — | — |

No TODO/FIXME stubs, placeholder returns, or disconnected hardcoded props detected in phase deliverables.

### Human Verification Required

### 1. Past-due billing UI appearance

**Test:** Open Settings → Billing for a workspace with `subscriptionStatus: past_due` and remaining credits.

**Expected:** Amber "Pagamento pendente" banner with credit count, status line shows "Pagamento pendente" (not "Sem acesso ativo"), portal button visible.

**Why human:** Visual layout, copy hierarchy, and responsive behavior cannot be verified by grep or unit tests.

### 2. Customer Portal recovery redirect

**Test:** Click "Atualizar pagamento no portal" on a past_due workspace with a Stripe customer.

**Expected:** Browser redirects to Stripe Customer Portal where payment method can be updated.

**Why human:** Requires live Stripe test-mode session and external redirect — mocked in unit tests only.

### 3. End-to-end payment failure webhook

**Test:** Send `invoice.payment_failed` webhook for an active subscription in staging.

**Expected:** Local subscription status becomes `past_due`; subsequent `invoice.paid` does not create new credit grants until status returns to active/trialing.

**Why human:** End-to-end webhook + DB state requires running app with Stripe CLI or staging environment.

### Gaps Summary

No implementation gaps found. All four roadmap success criteria are met in code with passing automated tests. Status is `human_needed` because visual UX and live Stripe integration require manual confirmation before production go-live (addressed further in Phases 101–102).

---

_Verified: 2026-06-11T17:50:00Z_
_Verifier: Claude (gsd-verifier)_
