# Phase 49: Beta Access and Credit Entitlements - Research

**Researched:** 2026-06-03
**Status:** Complete

## Research Question

What needs to be true to plan beta access and monetization coherently in the current ADScale codebase?

## Current Implementation Findings

### Credit Gate

- `app/src/server/billing/credits.ts` defines product credit costs.
- `image_derivation`, `regeneration`, `restyling`, and `delivery_package_child` cost 5 credits each.
- `creative_plan` and `creative_qa` cost 1 credit.
- `canSpend` currently requires an active Stripe subscription from `getActiveSubscriptionByWorkspace`.
- `recordUsage` already handles idempotency, debits grants in a transaction, records usage events, and creates credit transactions when `userId` is present.

### Billing Persistence

- `subscriptions` requires non-null unique `stripeSubscriptionId`, non-null `stripeCustomerId`, and non-null `priceId`.
- Because of that schema, beta access should not be modeled as a fake subscription.
- `creditGrants` already supports arbitrary `source`, `sourceId`, `amount`, `remaining`, and `expiresAt`.
- `usageEvents` is already a useful ledger for idempotency and count history.

### Generation Spend Surface

- `app/src/app/api/campaigns/[id]/derivations/route.ts` charges `jobsToCreate.length * 5`.
- That means a beta limit of 10 generated ads maps to 50 internal credits under the current cost table.
- Other generation-like surfaces also call `spendCreditsOrApiError`, so adding beta allowance at the gate preserves broad server-side enforcement.

### Product/UI Surface

- `app/src/components/settings/pricing-model.ts` contains pricing assumptions and plan tiers.
- Current Trial and Starter use 30 credits and describe that as 6 images.
- `BillingTab` exposes forecast inputs labeled as model tokens, which is useful for internal planning but can confuse a user-facing monetization surface.
- `PlansTab` already explains plans and credits, but does not distinguish beta access.

## External Pricing Check

OpenAI's official API pricing page lists GPT-Image-2 pricing by text/image input tokens and image output tokens as of 2026-06-03. This confirms the provider charges are token-based, but it does not imply ADScale should sell or limit user access in raw token units.

Source: https://openai.com/api/pricing/

## Coherence Assessment

The current credit system is directionally coherent as a server-side spend ledger, but incomplete as a monetization/access model:

- Coherent: one shared gate, idempotency, grant debit ordering, 402 failures, Stripe renewal grants.
- Incoherent: "active subscription" is required even when the product needs beta/test access.
- Incoherent: UI and planning language can blur model tokens, credits, images, and ads.
- Incoherent for beta: no owner-controlled path exists to grant 10 generated ads without Stripe.

## Recommended Design

1. Keep provider token/cost calculations internal.
2. Keep credit grants as the debit ledger.
3. Add a separate workspace entitlement layer for non-Stripe access, starting with `beta_tester`.
4. Let `canSpend` allow either active Stripe subscription or active beta entitlement.
5. Grant beta testers 50 internal credits and render that as 10 remaining ads for image-generation actions.
6. Add a practical beta redemption path: invite code or owner/admin seeded code. The code must be server validated and single-use or redemption-limited.
7. Update billing/status API and settings UI to distinguish `access.kind: paid | beta | none`.

## Validation Architecture

- Unit-test `canSpend` and `recordUsage` for beta entitlement allowed/exhausted cases.
- Unit-test beta redemption repository/service for single-use or max-redemption behavior.
- Route-test billing status to verify beta access is returned without Stripe customer/subscription.
- Route-test derivation spend with beta allowance using the existing mocked billing gate pattern.
- Build verification: `npm run build` from `app`.
- Local smoke: create or seed a beta workspace, confirm settings show beta access and derivation generation blocks after 10 outputs or equivalent exhausted balance.

## Planning Risks

- If beta is modeled inside `subscriptions`, Stripe webhook assumptions and unique non-null Stripe fields will become fragile.
- If beta is enforced only in the UI, direct API calls can bypass the 10-ad limit.
- If the product sells "tokens", user expectations will not match generated ad value or provider cost variability.
- If beta credits share the same balance display without access context, testers may see confusing "50 credits" instead of "10 ads".
