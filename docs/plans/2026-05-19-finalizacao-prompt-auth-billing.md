# Finalizacao Prompt, Auth e Billing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the ADScale MVP with stronger image prompt inputs, production-ready Better Auth, Stripe subscriptions, and credit-based usage gates.

**Architecture:** Keep Better Auth as the self-hosted auth layer, mirror Stripe subscription state through signed webhooks, and enforce app-specific access through a central credit/entitlement service. Improve prompt quality by structuring existing campaign, diagnosis, reference, and mode data into a testable prompt contract instead of adding a large new UI first.

**Tech Stack:** Next.js 16 App Router, React 19, Better Auth, Drizzle/Postgres, Stripe Billing, Inngest, Vitest, ESLint.

---

### Task 1: Confirm Production Auth Baseline

**Files:**
- Modify: `app/src/server/auth/index.ts`
- Modify: `app/src/server/validation/env.ts`
- Test: `app/tests/integration/auth-workspace-access.test.ts`
- Docs: `docs/plans/2026-05-19-finalizacao-prompt-auth-billing-design.md`

**Step 1: Write failing auth/workspace access tests**

Create tests that cover:

- no session cannot access a private route helper
- session with no workspace membership is rejected
- session with workspace membership is accepted
- trusted origin/env configuration is required in production-like env

Run:

```bash
cd app
npm run test -- tests/integration/auth-workspace-access.test.ts
```

Expected: fail because the dedicated tests/helpers are not complete yet.

**Step 2: Harden auth configuration**

Review `betterAuth` options and add only production-needed settings supported by the installed version. Keep `emailAndPassword.enabled` and current Drizzle adapter. Confirm `BETTER_AUTH_URL`, `APP_URL`, and trusted origins are all production-safe.

**Step 3: Add or wire email reset/verification contract**

If Better Auth requires an email sender callback, add the smallest interface needed and leave provider-specific env for the next email decision. Do not invent a fake production email provider.

**Step 4: Run focused tests**

```bash
cd app
npm run test -- tests/integration/auth-workspace-access.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add app/src/server/auth/index.ts app/src/server/validation/env.ts app/tests/integration/auth-workspace-access.test.ts
git commit -m "feat: harden auth workspace baseline"
```

### Task 2: Add Billing Schema and Environment

**Files:**
- Modify: `app/package.json`
- Modify: `app/src/server/validation/env.ts`
- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0012_billing.sql`
- Test: `app/tests/unit/billing-schema.test.ts`

**Step 1: Install Stripe**

```bash
cd app
npm install stripe
```

**Step 2: Add failing schema tests**

Test that billing tables/columns exist in schema exports and include workspace IDs, Stripe IDs, subscription status, price ID, plan key, and period dates.

Run:

```bash
cd app
npm run test -- tests/unit/billing-schema.test.ts
```

Expected: fail until schema is added.

**Step 3: Add schema**

Add tables:

- `billingCustomers`
- `subscriptions`
- `creditGrants`

Prefer workspace-scoped indexes and unique Stripe IDs. Keep all names under `adscale_app`.

**Step 4: Generate/check migration**

```bash
cd app
npx drizzle-kit generate
npx drizzle-kit check
```

Expected: generated migration is consistent and check passes. If generated file name differs from `0012_billing.sql`, keep the generated name.

**Step 5: Run schema tests**

```bash
cd app
npm run test -- tests/unit/billing-schema.test.ts
```

Expected: pass.

**Step 6: Commit**

```bash
git add app/package.json app/package-lock.json app/src/server/validation/env.ts app/src/server/db/schema.ts app/drizzle app/tests/unit/billing-schema.test.ts
git commit -m "feat: add billing schema"
```

### Task 3: Implement Stripe Checkout and Portal

**Files:**
- Create: `app/src/server/billing/stripe.ts`
- Create: `app/src/server/repositories/billing.ts`
- Create: `app/src/app/api/billing/checkout/route.ts`
- Create: `app/src/app/api/billing/portal/route.ts`
- Test: `app/src/app/api/billing/checkout/route.test.ts`
- Test: `app/src/app/api/billing/portal/route.test.ts`

**Step 1: Write failing route tests**

Cover:

- unauthenticated request is rejected
- unknown plan is rejected
- checkout creates or reuses Stripe customer
- checkout returns a session URL
- portal requires an existing Stripe customer
- portal returns a portal URL

Run:

```bash
cd app
npm run test -- src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts
```

Expected: fail until routes exist.

**Step 2: Implement Stripe client wrapper**

Create `stripe.ts` that initializes Stripe from env and exposes helpers. Keep plan price IDs in env or a small server-side map.

**Step 3: Implement billing repository**

Add helpers for customer lookup/create and subscription lookup. All lookups are workspace-scoped.

**Step 4: Implement Checkout route**

Use authenticated workspace context. Create Checkout Session for subscription mode. Include workspace ID in metadata. Return `{ url }`.

**Step 5: Implement Portal route**

Use authenticated workspace context. Create Billing Portal Session for existing customer. Return `{ url }`.

**Step 6: Run focused tests**

```bash
cd app
npm run test -- src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts
```

Expected: pass.

**Step 7: Commit**

```bash
git add app/src/server/billing app/src/server/repositories/billing.ts app/src/app/api/billing
git commit -m "feat: add stripe checkout and portal"
```

### Task 4: Implement Signed Stripe Webhooks

**Files:**
- Create: `app/src/app/api/billing/webhook/route.ts`
- Modify: `app/src/server/repositories/billing.ts`
- Create: `app/src/server/billing/events.ts`
- Test: `app/src/app/api/billing/webhook/route.test.ts`
- Test: `app/src/server/billing/events.test.ts`

**Step 1: Write failing webhook tests**

Cover:

- missing signature is rejected
- invalid signature is rejected
- `checkout.session.completed` links customer/subscription to workspace
- `customer.subscription.updated` updates status and period
- `customer.subscription.deleted` marks inactive/canceled
- duplicate event processing is idempotent

Run:

```bash
cd app
npm run test -- src/app/api/billing/webhook/route.test.ts src/server/billing/events.test.ts
```

Expected: fail until webhook and handlers exist.

**Step 2: Implement raw-body webhook route**

Follow Next.js 16 route handler expectations from local Next docs before editing. Verify Stripe signature with `STRIPE_WEBHOOK_SECRET`.

**Step 3: Implement event handlers**

Write app state only from webhook events. Do not activate plans from the Checkout return URL.

**Step 4: Add idempotency**

Record processed Stripe event IDs or use unique constraints so replayed events do not double-grant credits.

**Step 5: Run focused tests**

```bash
cd app
npm run test -- src/app/api/billing/webhook/route.test.ts src/server/billing/events.test.ts
```

Expected: pass.

**Step 6: Commit**

```bash
git add app/src/app/api/billing/webhook app/src/server/billing app/src/server/repositories/billing.ts
git commit -m "feat: sync stripe webhooks"
```

### Task 5: Build Credit and Entitlement Service

**Files:**
- Create: `app/src/server/billing/credits.ts`
- Modify: `app/src/server/repositories/usage.ts`
- Modify: `app/src/server/db/schema.ts`
- Create or modify: `app/drizzle/*`
- Test: `app/src/server/billing/credits.test.ts`

**Step 1: Write failing credit tests**

Cover:

- active subscription with enough credits can spend
- inactive subscription cannot start expensive work
- insufficient credits returns required/current amounts
- duplicate idempotency key does not double debit
- failed generation refund policy is explicit

Run:

```bash
cd app
npm run test -- src/server/billing/credits.test.ts
```

Expected: fail until service exists.

**Step 2: Implement credit cost map**

Define costs for:

- creative plan
- image derivation
- regeneration
- restyling
- delivery package child
- landing page
- model-backed QA if applicable

**Step 3: Implement `canSpend` and `recordUsage`**

Use workspace ID, action, amount, idempotency key, and metadata. Keep all mutations server-side.

**Step 4: Run focused tests**

```bash
cd app
npm run test -- src/server/billing/credits.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add app/src/server/billing/credits.ts app/src/server/repositories/usage.ts app/src/server/db/schema.ts app/drizzle app/src/server/billing/credits.test.ts
git commit -m "feat: add credit entitlement service"
```

### Task 6: Gate Expensive Routes and Jobs

**Files:**
- Modify: `app/src/app/api/campaigns/[id]/plan/route.ts`
- Modify: `app/src/app/api/campaigns/[id]/derivations/route.ts`
- Modify: `app/src/app/api/quick-tools/restyling/route.ts`
- Modify: `app/src/app/api/derivations/[id]/regenerate/route.ts`
- Modify: `app/src/app/api/derivations/[id]/delivery-package/route.ts`
- Modify: `app/src/app/api/derivations/[id]/landing-page/route.ts`
- Modify: `app/src/server/jobs/derivation.ts`
- Test: focused route/job tests near each changed route

**Step 1: Write failing gate tests**

For each expensive route, test:

- insufficient entitlement blocks before enqueue or model call
- sufficient entitlement allows existing behavior
- duplicate retries do not double debit

Run the focused route tests for changed files.

**Step 2: Add `canSpend` before expensive work**

Do this at route boundaries before creating jobs or calling OpenAI.

**Step 3: Add `recordUsage` at billable points**

For queued jobs, use stable idempotency keys from derivation/job IDs. For synchronous model calls, use request-owned IDs or generated operation IDs.

**Step 4: Run focused tests**

Run the route/job test bundle touched by this task.

**Step 5: Commit**

```bash
git add app/src/app/api app/src/server/jobs/derivation.ts app/src/server/billing app/tests app/src
git commit -m "feat: gate ai usage by credits"
```

### Task 7: Refine Prompt Input Contract

**Files:**
- Modify: `app/src/server/ai/prompt-builder.ts`
- Modify: `app/src/server/jobs/derivation.ts`
- Modify: `app/src/server/db/schema.ts`
- Create or modify: `app/drizzle/*`
- Test: `app/src/server/ai/prompt-builder.test.ts`
- Test: `app/tests/unit/prompt-parser.test.ts`

**Step 1: Write failing prompt contract tests**

Cover:

- hard rules appear before flexible creative guidance
- literal CTA cannot be overridden by plan CTAs
- target format is explicit
- pt-BR visible text rule is preserved
- client references are auxiliary only
- approved derivation package source is preserved
- no-logo rule remains present

Run:

```bash
cd app
npm run test -- src/server/ai/prompt-builder.test.ts tests/unit/prompt-parser.test.ts
```

Expected: fail for new contract expectations.

**Step 2: Refactor prompt sections**

Split prompt builder internally into section helpers without changing external behavior unnecessarily.

**Step 3: Persist prompt metadata**

Store prompt input metadata or a prompt snapshot per derivation so generated outputs are auditable.

**Step 4: Run focused prompt tests**

```bash
cd app
npm run test -- src/server/ai/prompt-builder.test.ts tests/unit/prompt-parser.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add app/src/server/ai/prompt-builder.ts app/src/server/jobs/derivation.ts app/src/server/db/schema.ts app/drizzle app/src/server/ai/prompt-builder.test.ts app/tests/unit/prompt-parser.test.ts
git commit -m "feat: structure image prompt contract"
```

### Task 8: Wire Billing and Credits UI

**Files:**
- Modify: `app/src/components/settings/BillingTab.tsx`
- Modify: `app/src/components/settings/PlansTab.tsx`
- Modify: `app/src/components/layout/TopBar.tsx`
- Modify: `app/src/app/(dashboard)/page.tsx`
- Create: `app/src/lib/hooks/use-billing.ts`
- Create: `app/src/app/api/billing/status/route.ts`
- Test: `app/src/lib/hooks/use-billing.test.tsx`
- Test: component tests for settings/topbar if local patterns exist

**Step 1: Write failing UI/data tests**

Cover:

- billing status hook fetches real status
- plan button calls Checkout route
- manage billing button calls Portal route
- topbar displays real remaining credits
- 80 percent warning and 100 percent block messaging render from server state

**Step 2: Add billing status route**

Return only workspace-scoped billing state safe for UI.

**Step 3: Add hook**

Use existing TanStack Query patterns.

**Step 4: Update Settings and TopBar**

Replace simulator-only state where necessary with real billing state. Keep the pricing simulator if useful, but clearly separate planning estimates from active subscription state.

**Step 5: Run focused UI tests**

Run the hook/component tests added in this task.

**Step 6: Commit**

```bash
git add app/src/components/settings app/src/components/layout/TopBar.tsx app/src/app/'(dashboard)' app/src/lib/hooks/use-billing.ts app/src/app/api/billing/status app/src/lib/hooks/use-billing.test.tsx
git commit -m "feat: show real billing and credits"
```

### Task 9: Launch Verification and Docs

**Files:**
- Create: `docs/plans/2026-05-19-finalizacao-prompt-auth-billing-review.md`
- Modify: production setup docs if present
- Modify: `tasks/todo.md`

**Step 1: Run schema check**

```bash
cd app
npx drizzle-kit check
```

Expected: pass.

**Step 2: Run focused tests**

```bash
cd app
npm run test -- src/server/ai/prompt-builder.test.ts tests/unit/prompt-parser.test.ts src/server/billing/credits.test.ts src/server/billing/events.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts src/app/api/billing/webhook/route.test.ts
```

Expected: pass.

**Step 3: Run lint**

```bash
cd app
npm run lint
```

Expected: pass or only documented pre-existing warnings.

**Step 4: Run build with dummy env**

Use a full dummy env including Better Auth, Stripe, OpenAI, R2, Inngest, and app URLs.

Expected: build passes; any low-entropy dummy-secret warning is documented.

**Step 5: Manual Stripe test-mode smoke**

Verify:

- signup/login
- create campaign
- blocked generation with no credits
- select paid plan
- Stripe Checkout test card
- webhook updates subscription
- credits granted
- generation consumes credits
- Customer Portal opens

**Step 6: Write review doc**

Document commands, results, known caveats, and go/no-go status.

**Step 7: Commit**

```bash
git add docs/plans/2026-05-19-finalizacao-prompt-auth-billing-review.md tasks/todo.md
git commit -m "docs: record launch verification"
```

---

## Execution Notes

- Preserve existing prompt contracts: literal CTA, reference image as source of truth, supported target formats, and regeneration mode/format/CTA.
- Read `app/AGENTS.md` and local Next.js docs before editing App Router route handlers.
- Do not stage unrelated security changes already present in the workspace.
- Prefer focused tests first, then broader lint/build.
- If a Stripe or Better Auth behavior differs from this plan, stop and re-plan before pushing through.
