---
phase: 99-in-product-conversion-surfaces
verified: 2026-06-11T17:55:00Z
status: human_needed
score: 4/4
overrides_applied: 0
human_verification:
  - test: "As a beta user with insufficient credits on a campaign preview gate, open the generate tab and confirm the footer shows a localized trial/upgrade CTA and the approve-batch button stays disabled."
    expected: "Reason copy from billing.conversion appears; CTA label is PT 'Começar trial grátis' or EN 'Start free trial'; approve batch cannot be clicked."
    why_human: "Localized rendering and disabled-state UX cannot be verified from static code alone."
  - test: "From the preview gate CTA, start checkout and complete or cancel Stripe; confirm you return to `/campaigns/:id?tab=generate&mode=preview`."
    expected: "Stripe success/cancel URLs include returnPath query param; browser lands back on the same campaign generate preview context."
    why_human: "Requires live Stripe redirect and post-checkout navigation."
  - test: "As a beta-exhausted user (0 ads remaining), trigger the mission credit upgrade banner on the dashboard and click the conversion CTA."
    expected: "Checkout opens with starter plan; campaign/workspace context is preserved via returnPath on the current route."
    why_human: "Beta exhaustion end-to-end depends on billing status fixtures and external checkout."
  - test: "As a paid subscriber with insufficient credits, trigger the preview gate or mission upgrade moment and click the CTA."
    expected: "User is routed to `/settings?tab=billing` (with returnPath when present), not Stripe checkout."
    why_human: "Paid vs beta routing is policy-driven and needs account-state verification in the running app."
---

# Phase 99: In-Product Conversion Surfaces Verification Report

**Phase Goal:** Turn credit and entitlement blocks into clear trial or upgrade actions without losing campaign context.
**Verified:** 2026-06-11T17:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Spend-related 402 responses use a shared structured payload with reason and recommended destination/plan | ✓ VERIFIED | `spendCreditsOrApiError` in `gates.ts` calls `buildConversionErrorPayloadForWorkspace` and returns `apiError(payload.reason, 402, payload)` with `reason`, `recommendedAction`, `suggestedPlan`, `analytics`. `gates.test.ts` asserts `body.details` shape. |
| 2 | Preview and batch gates render localized trial/upgrade actions from the conversion contract | ✓ VERIFIED | Campaign page builds `previewConversionPayload` via `resolveConversionGateFromBilling` (not error-string matching). `DerivationPreviewGateFooter` renders `ConversionCta` and localized `billing.conversion` reason copy; approve is disabled when insufficient. Tests in `DerivationPreviewGateFooter.test.tsx`. |
| 3 | Exhausted beta users can start checkout while preserving workspace and campaign context | ✓ VERIFIED | `conversion-gate.ts` maps `beta_exhausted` → `recommendedAction: "checkout"`. Campaign page sets `returnPath: /campaigns/${id}?tab=generate&mode=preview`. `ConversionCta` passes `returnPath` to checkout; `sessions.ts` forwards it to Stripe success/cancel URLs. `conversion-gate.test.ts` covers beta exhaustion mapping. |
| 4 | Progression and credit activation upgrade moments route to checkout or Billing settings | ✓ VERIFIED | `MissionCreditBanner` resolves gate from `useBillingStatus` and renders `ConversionCta`; paid insufficient credits map to `billing`, beta to `checkout`, past_due to `portal`. `MissionPathCard.test.tsx` asserts conversion CTA presence on upgrade prompt. |

**Score:** 4/4 truths verified (automated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/lib/billing/conversion-contract.ts` | Shared 402 payload types and parser | ✓ VERIFIED | 77 lines; exports `ConversionErrorPayload`, `parseConversionErrorPayload`, reason union |
| `app/src/lib/billing/conversion-gate.ts` | Reason-to-action mapping | ✓ VERIFIED | 173 lines; `buildConversionErrorPayload`, `resolveConversionGate` |
| `app/src/lib/billing/conversion-client.ts` | Client bridge from billing status / 402 | ✓ VERIFIED | `resolveConversionGateFromBilling` wired; `parseConversionErrorResponse` exists but unused (see anti-patterns) |
| `app/src/server/billing/conversion.ts` | Server workspace payload builder | ✓ VERIFIED | Loads `getWorkspaceBillingAccess`, delegates to shared gate |
| `app/src/components/billing/ConversionCta.tsx` | Reusable checkout/billing/portal button | ✓ VERIFIED | Uses `useStartCheckout`, `useBillingPortal`, i18n action labels |
| `app/src/server/billing/gates.ts` | Emits conversion payload on blocked spend | ✓ VERIFIED | All spend routes funnel through `spendCreditsOrApiError` |
| `app/src/components/workspace/DerivationPreviewGateFooter.tsx` | Preview/batch gate CTA surface | ✓ VERIFIED | Accepts `conversionPayload`, renders `ConversionCta` |
| `app/src/components/dashboard/MissionCreditBanner.tsx` | Value-moment upgrade surface | ✓ VERIFIED | Proactive gate + `ConversionCta` on `showUpgradePrompt` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `gates.ts` | `conversion.ts` | `buildConversionErrorPayloadForWorkspace` | ✓ WIRED | Import + call on blocked spend |
| `conversion.ts` | `conversion-gate.ts` | `buildConversionErrorPayload` | ✓ WIRED | Shared mapping logic |
| `campaigns/[id]/page.tsx` | `DerivationPreviewGateFooter` | `previewConversionPayload` prop | ✓ WIRED | `useMemo` + `DerivationGrid.previewGate` |
| `DerivationPreviewGateFooter` | `ConversionCta` | `payload` prop | ✓ WIRED | Rendered when `conversionPayload` set |
| `MissionCreditBanner` | `ConversionCta` | `resolveConversionGateFromBilling` | ✓ WIRED | Uses `useBillingStatus` data |
| `ConversionCta` | `/api/billing/checkout` | `useStartCheckout` mutation | ✓ WIRED | POST with `planKey` + `returnPath` |
| `checkout/route.ts` | `createCheckoutSession` | `returnPath` forward | ✓ WIRED | Test asserts forwarding |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `DerivationPreviewGateFooter` | `conversionPayload` | `useBillingStatus` → `resolveConversionGateFromBilling` | Yes — `/api/billing/status` query | ✓ FLOWING |
| `MissionCreditBanner` | `conversionPayload` | `useBillingStatus` + mission credit context | Yes — billing status API | ✓ FLOWING |
| `spendCreditsOrApiError` | 402 `details` | `getWorkspaceBillingAccess(workspaceId)` | Yes — DB-backed access | ✓ FLOWING |
| `ConversionCta` | checkout redirect | `POST /api/billing/checkout` → Stripe session URL | Yes — Stripe API (runtime) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Conversion gate mapping tests | `npm test -- conversion-gate.test.ts conversion-contract.test.ts` | 8 tests passed | ✓ PASS |
| Gates 402 payload shape | `npm test -- gates.test.ts` | 3 tests passed | ✓ PASS |
| Checkout returnPath forwarding | `npm test -- checkout/route.test.ts sessions.test.ts` | passed | ✓ PASS |
| Preview gate + mission CTA wiring | `npm test -- DerivationPreviewGateFooter.test.tsx MissionPathCard.test.tsx` | passed | ✓ PASS |
| Full phase 99 suite (8 files) | SUMMARY verification command | 34 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CONV-01 | 99-01 | 402 spend responses include structured checkout payload (`reason`, suggested plan) | ✓ SATISFIED | `gates.ts` + `conversion-contract.ts` + `gates.test.ts` |
| CONV-02 | 99-01 | Preview/batch gate shows trial/upgrade CTA | ✓ SATISFIED | `DerivationPreviewGateFooter` + proactive gate on campaign page |
| CONV-03 | 99-01 | Beta exhausted shows subscription CTA preserving workspace/campaigns | ✓ SATISFIED | `beta_exhausted` → checkout + campaign `returnPath` |
| CONV-04 | 99-01 | v11.7 upgrade moments route to checkout or billing | ✓ SATISFIED | `MissionCreditBanner` + `ConversionCta` action routing |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `conversion-client.ts` | 25–37 | `parseConversionErrorResponse` exported but never imported | ℹ️ Info | Reactive 402→CTA path not wired; primary surfaces use proactive gate before spend. `use-derivations.ts` still throws generic error on 402. Mitigated by disabled approve when gate detects insufficient credits. |
| `derivations/route.ts` | 165–180 | `spendCreditsOrApiError` call omits `returnPath` | ℹ️ Info | 402 API responses lack campaign returnPath; UI proactive payload includes it. Low impact for in-scope surfaces. |

### Human Verification Required

### 1. Preview gate localized CTA and disabled approve

**Test:** Beta user with insufficient credits on campaign generate preview tab.
**Expected:** Localized reason + trial CTA; approve batch disabled.
**Why human:** i18n rendering and interaction states require browser.

### 2. Checkout return to campaign context

**Test:** Click preview-gate CTA → Stripe checkout → complete or cancel.
**Expected:** Return to `/campaigns/:id?tab=generate&mode=preview`.
**Why human:** Stripe redirect chain is external.

### 3. Beta-exhausted mission upgrade

**Test:** Dashboard mission banner with `showUpgradePrompt` for exhausted beta.
**Expected:** Checkout with starter plan; returnPath preserves current route.
**Why human:** Requires billing fixture state and live navigation.

### 4. Paid insufficient credits → billing settings

**Test:** Paid user with low balance at preview gate or mission moment.
**Expected:** CTA routes to `/settings?tab=billing`, not Stripe.
**Why human:** Access-kind routing depends on live billing status.

### Gaps Summary

No blocking implementation gaps found. All four roadmap success criteria and CONV-01–CONV-04 have substantive, wired code with passing focused tests (34/34). Status is `human_needed` because checkout redirects, localized CTA presentation, and account-state routing require manual UAT in the running app.

---

_Verified: 2026-06-11T17:55:00Z_
_Verifier: Claude (gsd-verifier)_
