# Finalizacao Prompt, Auth e Billing Design

Date: 2026-05-19
Status: Approved direction

## Goal

Finish the ADScale MVP by improving image-generation input quality and adding reliable production-ready authentication, Stripe billing, and credit enforcement without migrating away from the current app architecture.

## Decision

Use the existing Better Auth + Drizzle/Postgres foundation as the production authentication layer. Add Stripe Billing through Checkout, Customer Portal, and signed webhooks. Enforce paid access through an internal credit and entitlement layer that is sourced from Stripe webhook state, not from client-side UI state.

This is the shortest reliable path for the deadline because the app already has Better Auth tables, sessions, workspaces, usage events, pricing UI, and prompt-generation surfaces. The work should harden those existing seams instead of replacing them.

## Current Context

- Runtime app lives in `app/`.
- Root planning and task artifacts live in `tasks/` and `docs/plans/`.
- Auth is already wired in `app/src/server/auth/index.ts` using Better Auth, Drizzle, and Postgres.
- Better Auth tables and workspace membership live in `app/src/server/db/schema.ts`.
- Prompt generation is centered on `app/src/server/ai/prompt-builder.ts` and job execution in `app/src/server/jobs/derivation.ts`.
- Billing screens exist in `app/src/components/settings/BillingTab.tsx` and `app/src/components/settings/PlansTab.tsx`, but Stripe is not installed.
- `usage_events` exists, but there is no production entitlement/credit gate yet.

## Architecture

### Auth

Keep Better Auth self-hosted inside the Next.js app. Production readiness depends on correct environment configuration, strong secrets, HTTPS, trusted origins, email delivery for verification/reset flows, and route-level workspace authorization.

The auth layer should expose a stable server-side contract:

- current user
- current workspace
- membership role
- session validity
- explicit unauthorized/forbidden responses

All private routes should continue to use the server-side workspace guard rather than trusting client-selected workspace IDs.

### Billing

Stripe is the payment source of truth. The app creates Checkout Sessions and Billing Portal Sessions, but final account state is written only from signed Stripe webhooks.

The billing state should be stored on app-owned tables with enough fields to render UI and enforce access:

- Stripe customer ID
- subscription ID
- subscription status
- price ID
- plan key
- current period start/end
- cancel-at-period-end flag
- credit balance or credit grant records

The frontend should never directly activate a plan after returning from Checkout. It should show pending/syncing state until webhook-backed state is present.

### Credits and Entitlements

Credits are the app-level cost-control layer. Stripe answers "is this workspace subscribed?" and the credit service answers "can this workspace spend on this action now?"

Every expensive action should use a central service:

- `canSpend(workspaceId, action, idempotencyKey)`
- `recordUsage(workspaceId, action, amount, idempotencyKey, metadata)`

The service should block before expensive work is queued and should record usage idempotently when the app reaches the billable point. Read-only access and exports of already-created assets should remain available when a subscription is inactive, unless a later product decision says otherwise.

### Prompt Input Prime

The prompt system should become more structured without making the campaign form heavy. The core idea is to convert existing campaign fields, diagnosis, references, and generation mode into a ranked prompt contract:

1. Hard rules: CTA literal, target format, language, no invented logo, no unsupported claims.
2. Mode contract: art variation, format adaptation, restyling, delivery package.
3. Campaign brief: client/product, objective, audience, offer, tone, constraints.
4. Visual source of truth: uploaded asset, approved derivation, client references.
5. Creative guidance: diagnosis, creative level, plan strategy, user feedback.

The final prompt should be saved or reproducible per derivation so failures can be debugged.

## Epics

### Epic 1: Prompt Input Prime

Improve prompt assertiveness and auditability.

Scope:

- Create a prompt input contract per generation mode.
- Normalize campaign and briefing fields before prompt construction.
- Add prompt metadata to derivations or a related table.
- Add an internal prompt preview/debug surface.
- Add prompt tests for CTA literal, language, format, references, diagnosis, and mode boundaries.
- Run a manual validation set with product, service, and restyling campaigns.

Out of scope:

- Replacing the image model.
- Building a fully new campaign wizard.
- Automatic prompt rewriting by a second model unless the first pass shows the structured builder is insufficient.

### Epic 2: Authentication Hardening

Make Better Auth production-safe for real users.

Scope:

- Review production env requirements and trusted origins.
- Add or finish email verification and password reset.
- Confirm session expiration and logout behavior.
- Add tests for unauthenticated, wrong-workspace, and correct-workspace access.
- Ensure workspace creation and membership are idempotent enough for signup edge cases.

Out of scope:

- Migrating to Supabase, Clerk, or Auth0.
- Complex enterprise SSO.
- Multi-workspace switching redesign unless required by authorization bugs.

### Epic 3: Stripe Billing

Add real subscription billing.

Scope:

- Install Stripe SDK.
- Add Stripe environment variables.
- Add billing schema/migration.
- Create Checkout Session endpoint.
- Create Customer Portal endpoint.
- Create signed webhook endpoint.
- Handle core subscription and invoice events.
- Update Settings billing/plans UI to use real billing state.

Out of scope:

- Usage-based metered Stripe billing in v1.
- Coupons, tax automation, invoices UI, or seat billing unless Stripe requires basic fields.

### Epic 4: Credits and Usage Gates

Protect AI spend and connect plans to generation access.

Scope:

- Define credit costs for expensive actions.
- Create central entitlement/credit service.
- Gate plan generation, image derivation, regeneration, restyling, delivery package, QA if model-backed, and landing page generation.
- Record idempotent usage events.
- Show real remaining credits in dashboard/topbar/settings.
- Add 80 percent warning and 100 percent generation block.

Out of scope:

- Complex team-level quotas.
- Real-time streaming balance updates.
- Postpaid negative balances.

### Epic 5: Launch Hardening

Prove the app is ready enough for the deadline.

Scope:

- Run Drizzle check and migrations.
- Run focused prompt/auth/billing/credit tests.
- Run lint and build with full dummy env.
- Smoke test signup, login, campaign creation, generation gate, credit debit, Stripe checkout test, webhook test, and portal.
- Update setup docs for production env and Stripe test mode.
- Produce a go/no-go checklist.

## Data Model Direction

Add narrowly scoped tables or columns:

- `billing_customers`: workspace to Stripe customer mapping.
- `subscriptions`: workspace subscription state mirrored from Stripe.
- `credit_grants`: credits granted by trial or subscription period.
- `usage_events`: keep existing table, but add idempotency/key fields if needed.
- `derivations.promptMetadata` or `derivation_prompt_snapshots`: prompt inputs and generated prompt metadata.

Use one migration series and keep names consistent with current Drizzle conventions.

## Error Handling

- Auth failures return 401.
- Workspace membership failures return 403 or 404 depending on existing route convention.
- Billing required returns a stable machine-readable error such as `billingRequired`.
- Insufficient credits returns `insufficientCredits` with current balance and required amount when safe.
- Stripe webhook signature failures return 400 and do not mutate state.
- Duplicate webhook events must be idempotent.
- Expensive jobs should avoid enqueueing when the user lacks entitlement.

## Verification

Required verification before calling this complete:

- `cd app && npx drizzle-kit check`
- focused auth/workspace tests
- focused prompt-builder tests
- focused billing/webhook tests
- focused credit gate tests
- `cd app && npm run lint`
- `cd app && npm run build` with dummy production-like env vars
- manual Stripe test-mode smoke with Checkout, webhook, and Portal

## Open Questions

- Which production email provider should be used for verification/reset: Resend, Postmark, SMTP, or another provider?
- What exact first paid tiers and credit amounts should ship?
- Should trial users receive free credits automatically, or only after email verification?
- Should failed generations refund credits automatically in v1?

## Approved Assumption

Better Auth remains the authentication system for the MVP. Stripe becomes the billing source of truth. Internal credits become the usage-control layer.
