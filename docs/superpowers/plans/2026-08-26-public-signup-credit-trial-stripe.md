# Public Signup, 500-Credit Trial, and Stripe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the waitlist with public signup, grant one non-expiring 500-credit trial after email verification, migrate the canonical credit unit to 10x, and make paid Stripe subscriptions charge immediately at the existing live prices.

**Architecture:** Keep credits canonical in the database and add a first-class `trial` workspace entitlement. Signup creates the workspace, owner membership, and pending entitlement atomically; email verification activates it and creates one idempotent grant. Existing billing remains the source of paid access, `invoice.paid` remains the source of monthly grants, and the separate landing links directly to `/signup`.

**Tech Stack:** Next.js 16, React 19, Better Auth, Drizzle/PostgreSQL, Vitest, Stripe, Render, Vite/React landing.

**Spec:** `docs/superpowers/specs/2026-08-26-public-signup-credit-trial-stripe-design.md`

## Global Constraints

- Preserve the untracked `docs/manual-do-usuario.html` in `ADScale_2` and the existing local edits to `render.yaml` and `src/components/Navbar.tsx` in `site-adscale`.
- Stage only the explicit paths named by each task. Never use `git add .`, reset, clean, or overwrite unrelated work.
- Work on an isolated feature branch/worktree for `site-adscale`, then reconcile only the CTA lines that overlap the user's `Navbar.tsx` edit.
- Do not deploy, mutate Render/Stripe live configuration, activate a production flag, or complete a real R$ 47 payment without a fresh explicit approval at the production checkpoint.
- Never commit or print Stripe secrets. Use placeholders in commands and paste secret values only into the Render/Stripe dashboards.
- Describe the offer as `500 créditos`, never as a duration. Do not add agency/client framing to touched marketing copy.
- Existing waitlist and beta data remain intact. Only new writes/redemptions close.
- After source edits in `ADScale_2`, run `graphify update .` before the final commit.

---

## Task 1: Establish one canonical 10x credit contract

**Files:**

- Create: `app/src/lib/billing/credit-units.ts`
- Modify: `app/src/server/billing/credits.ts`
- Modify: `app/src/server/generation/canonical/types.ts`
- Modify: `app/src/server/billing/entitlements.ts`
- Modify: `app/src/server/billing/plans.ts`
- Modify: `app/src/components/settings/pricing-model.ts`
- Modify: `app/src/server/billing/credits.test.ts`
- Modify: `app/src/server/billing/events.test.ts`
- Create: `app/src/lib/billing/credit-units.test.ts`

**Interfaces:**

```ts
export const CREDIT_UNIT_VERSION = 2;
export const TRIAL_CREDIT_GRANT = 500;
export const CREDIT_COSTS = {
  creative_plan: 10,
  image_derivation: 50,
  regeneration: 50,
  restyling: 50,
  delivery_package_child: 50,
  landing_page: 100,
  creative_qa: 10,
  copy_generation: 20,
  personaSimulation: 30,
} as const;
export type CreditAction = keyof typeof CREDIT_COSTS;
export const GENERATION_CREDIT_COSTS = {
  singleDerivation: 50,
  creativeWorkOutput: 50,
  triplet: 150,
  goalPackage: 150,
} as const;
export const PLAN_CREDIT_GRANTS = { starter: 300, growth: 1_200, scale: 3_600 } as const;
```

- [ ] Add a failing unit test that imports all shared constants and expects the exact values above, including `TRIAL_CREDIT_GRANT / CREDIT_COSTS.image_derivation === 10`.
- [ ] Run `cd app && npm test -- src/lib/billing/credit-units.test.ts`; expect failure because the module does not exist.
- [ ] Create `credit-units.ts` with only the constants and `CreditAction` type above.
- [ ] Replace the local `CREDIT_COSTS` declaration in `server/billing/credits.ts` with an import and re-export so existing callers keep the same import path.
- [ ] Replace the local generation map in `server/generation/canonical/types.ts` with an import and re-export.
- [ ] Derive `BETA_AD_CREDIT_COST` from `CREDIT_COSTS.image_derivation`; keep the existing allowance of 10, yielding a preserved beta grant of 500 after the unit change.
- [ ] Replace `planCreditGrants` values in `server/billing/plans.ts` with `PLAN_CREDIT_GRANTS` while retaining its current price-ID lookup API.
- [ ] Update `pricing-model.ts` to use trial 500/10 images and paid 300/1,200/3,600 credits for 6/24/72 images. Keep prices R$ 47/R$ 147/R$ 397 and change touched descriptions to in-house marketing-team language.
- [ ] Update billing tests to expect 1,200 for Growth invoice grants and 50 for image derivation; do not bulk-replace unrelated numeric fixtures.
- [ ] Run `cd app && npm test -- src/lib/billing/credit-units.test.ts src/server/billing/credits.test.ts src/server/billing/events.test.ts`; expect all pass.
- [ ] Commit only these paths:

```bash
git add app/src/lib/billing/credit-units.ts app/src/lib/billing/credit-units.test.ts \
  app/src/server/billing/credits.ts app/src/server/generation/canonical/types.ts \
  app/src/server/billing/entitlements.ts app/src/server/billing/plans.ts \
  app/src/components/settings/pricing-model.ts app/src/server/billing/credits.test.ts \
  app/src/server/billing/events.test.ts
git commit -m "feat: scale canonical credits by ten"
```

## Task 2: Add the one-time data migration with selective scaling

**Files:**

- Create: `app/drizzle/0087_credit_unit_v2.sql`
- Modify: `app/drizzle/meta/_journal.json`
- Create: `app/src/server/billing/credit-unit-migration.test.ts`

**Migration contract:**

```sql
UPDATE "adscale_app"."credit_grants"
SET "amount" = "amount" * 10, "remaining" = "remaining" * 10;

UPDATE "adscale_app"."credit_transactions"
SET "amount" = "amount" * 10;

UPDATE "adscale_app"."usage_events"
SET "amount" = "amount" * 10
WHERE "type" IN (
  'creative_plan', 'image_derivation', 'regeneration', 'restyling',
  'delivery_package_child', 'landing_page', 'creative_qa',
  'copy_generation', 'personaSimulation'
);
```

The same SQL file must update `beta_analytics_events.properties` only for `event_key IN ('credit_spend', 'credit_blocked')`: multiply numeric `estimateCredits`, `actualCredits`, and `creditDelta` by 10 when present, preserve all other JSON keys, and set `creditUnitVersion` to `2`.

- [ ] Write a failing Vitest that reads `drizzle/0087_credit_unit_v2.sql` and asserts all nine credit action names are in the `usage_events` allowlist, the three JSON credit fields are handled, `creditUnitVersion` is written, and technical types such as `layerize_quota` and `generation_dispatch_ack` are absent.
- [ ] Run `cd app && npm test -- src/server/billing/credit-unit-migration.test.ts`; expect failure because the migration is absent.
- [ ] Add the SQL above, guarding integer overflow before any update with a PostgreSQL `DO` block that raises when `abs(value) > 214748364` in affected integer columns.
- [ ] Implement analytics JSON updates with `jsonb_set` and `jsonb_typeof(...) = 'number'`; do not cast missing or nonnumeric fields.
- [ ] Add journal entry index 87, version 7, tag `0087_credit_unit_v2`, and a unique millisecond timestamp greater than entry 86.
- [ ] Run the focused test; expect pass.
- [ ] Against the disposable test database only, capture baseline counts/sums, run `npm run db:migrate`, and verify grants, transactions, credit usage, and credit analytics are 10x while a seeded technical usage event remains unchanged.
- [ ] Commit:

```bash
git add app/drizzle/0087_credit_unit_v2.sql app/drizzle/meta/_journal.json \
  app/src/server/billing/credit-unit-migration.test.ts
git commit -m "feat: migrate stored credits to unit v2"
```

## Task 3: Implement the pending and active trial lifecycle

**Files:**

- Modify: `app/src/server/repositories/entitlements.ts`
- Create: `app/src/server/billing/trial.ts`
- Create: `app/src/server/billing/trial.test.ts`

**Interfaces:**

```ts
type WorkspaceEntitlement = typeof workspaceEntitlements.$inferSelect;
type CreditGrant = typeof creditGrants.$inferSelect;

export const TRIAL_ENTITLEMENT_KIND = "trial" as const;
export const ENTITLEMENT_STATUS_PENDING_VERIFICATION = "pending_verification" as const;
export const TRIAL_CREDIT_GRANT_SOURCE = "signup_trial" as const;

export async function createPendingTrialEntitlement(
  input: { workspaceId: string; userId: string },
  tx: DbOrTx,
): Promise<WorkspaceEntitlement>;

export async function activateSignupTrial(input: {
  workspaceId: string;
  userId: string;
}): Promise<
  | { status: "activated" | "already_active"; entitlement: WorkspaceEntitlement; grant: CreditGrant }
  | { status: "not_eligible"; entitlement: null; grant: null }
>;
```

- [ ] Write failing tests for: pending entitlement creation; activation creates a 500 grant with `sourceId = entitlement.id` and no expiry; repeated activation returns the same grant; a concurrent second activation cannot create another grant; missing pending entitlement returns `not_eligible`; a thrown insert rolls the transaction back to pending.
- [ ] Run `cd app && npm test -- src/server/billing/trial.test.ts`; expect module-not-found failure.
- [ ] Add repository helpers to fetch any trial entitlement, create the pending row, and select the trial row `FOR UPDATE` inside a provided transaction.
- [ ] Implement `activateSignupTrial` as one database transaction. Check owner membership for the supplied user/workspace, lock the entitlement, return the existing grant if active, otherwise create the 500-credit grant and then mark the entitlement active.
- [ ] Do not add a second idempotency table or new database column: the existing unique `(workspace_id, kind)` constraint plus row lock is the concurrency boundary.
- [ ] Run the focused tests; expect pass.
- [ ] Commit:

```bash
git add app/src/server/repositories/entitlements.ts app/src/server/billing/trial.ts \
  app/src/server/billing/trial.test.ts
git commit -m "feat: add verified signup trial lifecycle"
```

## Task 4: Wire workspace creation and email verification to trial activation

**Files:**

- Modify: `app/src/server/auth/index.ts`
- Create: `app/src/server/auth/signup-trial.test.ts`

**Behavior:**

```ts
emailVerification: {
  // existing options stay unchanged
  afterEmailVerification: async (user) => {
    await activateSignupTrialForOwner(user.id);
  },
}
```

- [ ] Add a failing auth test proving an ordinary new user creates workspace + owner membership + pending trial in one `db.transaction`, while the dev-admin path creates no trial.
- [ ] Add a failing callback test proving email verification calls the activation service once with the verified user.
- [ ] Run `cd app && npm test -- src/server/auth/signup-trial.test.ts`; expect failures with the current nontransactional hook.
- [ ] Change `databaseHooks.user.create.after` so workspace, membership, and `createPendingTrialEntitlement` share one transaction. Keep existing normalization and dev-admin behavior; skip the pending trial for the dev admin.
- [ ] Add `afterEmailVerification` using Better Auth's configured callback and a minimal `activateSignupTrialForOwner(user.id)` helper that finds the user's owner workspace and delegates to Task 3.
- [ ] Let callback failures propagate so they are logged by the auth boundary and remain recoverable; do not mark the entitlement active outside the transaction.
- [ ] Run the focused test and `cd app && npm typecheck`; expect pass.
- [ ] Commit:

```bash
git add app/src/server/auth/index.ts app/src/server/auth/signup-trial.test.ts \
  app/src/server/billing/trial.ts app/src/server/billing/trial.test.ts
git commit -m "feat: activate trial after email verification"
```

## Task 5: Surface trial access and add authenticated repair

**Files:**

- Modify: `app/src/server/billing/access.ts`
- Modify: `app/src/server/billing/access.test.ts`
- Modify: `app/src/app/api/billing/status/route.ts`
- Modify: `app/src/app/api/billing/status/route.test.ts`
- Create: `app/src/app/api/billing/trial/activate/route.ts`
- Create: `app/src/app/api/billing/trial/activate/route.test.ts`
- Modify: `app/src/lib/hooks/use-billing.ts`
- Modify: `app/src/lib/hooks/use-billing.test.tsx`

**Response contract:**

```ts
type BillingAccessKind = "paid" | "trial" | "beta" | "tester" | "none";

access: {
  kind: BillingAccessKind;
  trial: { status: "pending_verification" | "active" } | null;
  // existing role, label, remainingAds, hasSpendAccess, beta stay present
}
```

- [ ] Add failing access tests: paid subscription wins over trial; active trial with positive balance spends; active trial with zero balance remains `kind: "trial"` and causes `canSpend` to return `insufficient_credits`; pending trial returns no spend access.
- [ ] Add failing status-route tests for pending and active trial response shapes.
- [ ] Add failing activation-route tests for 401 without session, 403 for unverified email/non-owner, 409 `trial_not_eligible`, and 200 for activated/already-active.
- [ ] Add a failing hook test: when status reports pending trial, the query POSTs `/api/billing/trial/activate` once and refetches status; a failed repair surfaces as a temporary billing query error rather than `none` access.
- [ ] Run the four focused suites; expect failures.
- [ ] Add trial lookup to `getWorkspaceBillingAccess`, retaining precedence `dev admin/tester -> paid -> beta -> active trial -> none`; return the trial entitlement on every branch for status reporting.
- [ ] Implement `POST /api/billing/trial/activate` with `requireWorkspaceAccess`, verified-email check, `requireRole(..., ["owner"])`, and the Task 3 service.
- [ ] Split client fetching into `fetchBillingStatusOnce()` plus one pending-repair attempt; never mutate on the GET route itself.
- [ ] Run:

```bash
cd app
npm test -- src/server/billing/access.test.ts src/app/api/billing/status/route.test.ts \
  src/app/api/billing/trial/activate/route.test.ts src/lib/hooks/use-billing.test.tsx
```

Expected: all pass.

- [ ] Commit the explicit files with message `feat: expose and repair signup trial access`.

## Task 6: Replace immediate signup redirect with email-confirmation UX

**Files:**

- Modify: `app/src/app/signup/SignupContent.tsx`
- Create: `app/src/app/signup/SignupContent.test.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

- [ ] Add failing UI tests that submit a valid account and expect `Confirme seu email`, the submitted email, `500 créditos`, a resend button, and no `router.push("/")`.
- [ ] Add a failing resend test expecting `authClient.sendVerificationEmail({ email, callbackURL: "/" })` and an accessible success/error message.
- [ ] Run `cd app && npm test -- src/app/signup/SignupContent.test.tsx`; expect failure.
- [ ] Add `submittedEmail` and resend status to the existing reducer. After a successful signup, render a confirmation state instead of routing.
- [ ] Reuse `authClient` from `@/lib/auth-client`; do not hand-build another auth endpoint wrapper.
- [ ] Add localized confirmation/resend strings. Preserve consent validation and form accessibility.
- [ ] Run the focused test; expect pass.
- [ ] Commit:

```bash
git add app/src/app/signup/SignupContent.tsx app/src/app/signup/SignupContent.test.tsx \
  app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: show email confirmation after signup"
```

## Task 7: Close new waitlist and beta writes while preserving history

**Files:**

- Modify: `app/src/app/api/waitlist/route.ts`
- Modify: `app/src/app/api/waitlist/route.test.ts`
- Modify: `app/src/app/api/billing/beta/redeem/route.ts`
- Create: `app/src/app/api/billing/beta/redeem/route.test.ts`
- Modify: `app/src/app/api/user/onboarding/route.ts`
- Create: `app/src/app/api/user/onboarding/route.test.ts`
- Modify: `app/src/lib/hooks/use-billing.ts`
- Modify: `app/src/components/billing/AccessGatePanel.tsx`
- Modify: `app/src/components/billing/AccessGatePanel.test.tsx`
- Modify: `app/src/components/settings/BillingTab.tsx`
- Modify: `app/src/components/settings/BillingTab.test.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Stable closed responses:**

```json
{ "error": "waitlist_closed" }
{ "error": "beta_closed" }
```

- [ ] Replace waitlist route tests with 410/CORS assertions and proof that rate limit, repository, Resend sync, and email functions are never called. Keep `OPTIONS` at 204.
- [ ] Add beta route tests proving 410 and no auth, redemption, entitlement, or grant call.
- [ ] Update onboarding tests to prove a supplied legacy `betaCode` is ignored and only `onboardingCompletedAt` changes.
- [ ] Update component tests to prove no beta input/button exists and an exhausted/no-access workspace sees only paid upgrade actions.
- [ ] Run focused suites; expect current behavior to fail.
- [ ] Reduce both POST routes to stable 410 responses, preserving marketing CORS on waitlist.
- [ ] Remove beta redemption imports, mutation, local state, and controls from onboarding, hook, `AccessGatePanel`, and `BillingTab`. Do not delete beta tables, services, grants, history labels, or active-beta access logic.
- [ ] Replace 14-day/expiring wording in touched billing messages with credit-only trial and immediate paid-subscription language. Add `signup_trial` to grant-source labels.
- [ ] Run focused suites; expect pass.
- [ ] Commit the explicit files with message `feat: close waitlist and beta enrollment`.

## Task 8: Make paid Stripe billing immediate and align all billing surfaces

**Files:**

- Modify: `app/src/server/billing/sessions.ts`
- Modify: `app/src/server/billing/sessions.test.ts`
- Modify: `app/src/components/settings/BillingTab.tsx`
- Modify: `app/src/components/settings/BillingTab.test.tsx`
- Modify: `app/src/components/settings/PlansTab.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`
- Modify: `app/src/server/beta-analytics/types.ts`
- Create: `app/src/server/beta-analytics/types.test.ts`
- Modify: `app/src/server/billing/credits.ts`
- Modify: `app/src/server/billing/credits.test.ts`

- [ ] Add a failing Stripe session assertion that checkout payload has no `trial_period_days` and still has `mode: "subscription"`, promotion codes, metadata, URLs, and the selected live price ID.
- [ ] Add failing UI assertions for 500/300/1,200/3,600 credits and R$ 47/R$ 147/R$ 397, with buttons saying subscribe/choose plan rather than start free trial.
- [ ] Add a failing telemetry test expecting `creditUnitVersion` in `ALLOWED_PROPERTY_KEYS`, and update credit spend/block tests to expect version 2 on new events.
- [ ] Run focused tests; expect failure.
- [ ] Remove only `trial_period_days: 14` from `createCheckoutSession`; retain subscription metadata and other Stripe options.
- [ ] Make `BillingTab` derive its paid cards from `planTiers.filter(tier => !tier.trial)` instead of maintaining the stale R$ 29/79/199 map. Keep icon/color presentation locally keyed by tier.
- [ ] Update paid/trial copy and telemetry version emission without touching unrelated admin uses of the word beta.
- [ ] Run focused tests and `npm run typecheck`; expect pass.
- [ ] Commit the explicit files with message `feat: charge subscriptions immediately`.

## Task 9: Convert the separate landing from waitlist to signup

**Repository:** `/Users/jhonatan/Repos/site-adscale`

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/config/site.ts`
- Modify: `src/components/Navbar.tsx`
- Modify: `src/components/Hero.tsx`
- Modify: `src/components/Pricing.tsx`
- Modify: `src/components/FAQ.tsx`
- Modify: `src/components/FinalCTA.tsx`
- Delete: `src/context/WaitlistContext.tsx`
- Delete: `src/components/WaitlistModal.tsx`
- Delete: `src/lib/waitlist-sectors.ts`

- [ ] Create an isolated worktree from the site's current upstream default branch. Record the original dirty diff of `Navbar.tsx`; do not alter the original checkout.
- [ ] In the isolated worktree, first run the acceptance scan and confirm it fails:

```bash
rg -n -i "waitlist|lista de espera|código beta|programa beta|14 dias|14-day|30 créditos|120 créditos|360 créditos" src
```

- [ ] Remove `WaitlistProvider`, modal/context/sector files, and `waitlistApiUrl` from site config.
- [ ] Change every primary CTA to `MagneticButton href={siteConfig.signupUrl}` (or semantic `<a href>` where already used) with copy such as `Criar conta grátis`.
- [ ] Update visible offer copy to `500 créditos, sem cartão e sem validade`; set plans to 300/1,200/3,600 credits while preserving prices 47/147/397 and image capacity 6/24/72.
- [ ] Replace touched freelancer/agency/client framing with in-house marketing-team wording.
- [ ] Reconcile the user's existing Navbar change by applying only the signup CTA change on top of it when integrating; preserve all other local lines.
- [ ] Run:

```bash
npm run typecheck
npm run lint
npm run build
rg -n -i "waitlist|lista de espera|código beta|programa beta|14 dias|14-day|30 créditos|120 créditos|360 créditos" src
```

Expected: all commands pass and the final `rg` returns no matches.

- [ ] Commit only the listed paths with message `feat: open public signup from landing`.

## Task 10: Run repository-wide regression and consistency gates

**Files:** No new product files expected; fix only regressions caused by Tasks 1-9.

- [ ] In `ADScale_2/app`, run all focused billing/auth/signup/UI suites changed by this plan.
- [ ] Run `npm run lint`, `npm run typecheck`, and `npm run build`.
- [ ] Run these contract scans and inspect every match rather than blindly replacing:

```bash
rg -n -i "trial_period_days|14 dias|14-day|código beta|beta code|waitlist" app/src app/messages
rg -n "credits: (30|120|360)|amount: (30|120|360)|image_derivation: 5" app/src
```

Expected: only preserved historical/admin beta and waitlist definitions remain; no live enrollment CTA, paid trial duration, or old canonical amounts remain.

- [ ] Run `graphify update .` and then `graphify query "How do public signup, email verification, trial entitlement, credit grant, and Stripe billing connect?"`; inspect that the new service and route appear in the path.
- [ ] Run `git status --short` in both repositories and confirm unrelated WIP remains unchanged and unstaged.
- [ ] Commit only any directly caused test/type fixes as `fix: align signup trial integration`.

## Task 11: Production configuration and app-first cutover checkpoint

**External systems:** Render service `adscale-app`, Stripe live, production PostgreSQL.

This task starts only after the user explicitly approves production mutation/deploy. Approval of this plan is not approval of this checkpoint.

- [ ] Record the current Render deploy ID, app health, Stripe endpoint ID/events, price IDs, and database migration journal entry.
- [ ] Create a logical production backup to an explicit timestamped path outside the repository. Verify the file exists and is nonzero; do not print connection credentials.
- [ ] Capture baseline row counts/sums for `credit_grants`, `credit_transactions`, the nine credit `usage_events` types, noncredit `usage_events`, and credit analytics JSON fields.
- [ ] In Render, set `APP_URL=https://adscale.jhonatansoares.com` and set `STRIPE_WEBHOOK_SECRET` from the current enabled live endpoint. Keep the existing live secret key, three live price IDs, and success/cancel URLs unchanged.
- [ ] In Stripe live Billing Portal, enable payment-method updates, invoice history, end-of-period cancellation, and return URL on the same `APP_URL` origin.
- [ ] Run the existing read-only app preflight before deploy:

```bash
cd app
npm run preflight:stripe
```

- [ ] Deploy the app commit before the landing commit. Wait for migration completion and `/api/health` HTTP 200.
- [ ] Compare post-migration counts/sums to the captured baseline: affected numeric sums are exactly 10x, row counts are identical, and noncredit usage is unchanged. Stop before smoke tests if any invariant differs.
- [ ] With a fresh controlled email, complete signup and verification and confirm exactly one active trial entitlement and one nonexpiring 500-credit `signup_trial` grant. Repeat activation and confirm no new grant.
- [ ] Confirm waitlist and beta POSTs return 410, create a live Checkout Session without completing payment, open/return from Billing Portal with a controlled customer, and observe a signed webhook delivery returning 2xx.
- [ ] Do not complete the R$ 47 checkout unless the user separately authorizes that charge.

## Task 12: Publish the landing and verify the complete public path

**External system:** landing deployment for `/Users/jhonatan/Repos/site-adscale`.

- [ ] After Task 11 passes, request explicit approval to publish the landing.
- [ ] Deploy the tested landing commit without including the user's unrelated `render.yaml` or Navbar changes unless they were intentionally reconciled and committed.
- [ ] Reopen `/hi` on desktop and mobile widths and test Navbar, Hero, Pricing, FAQ, and final CTA links to the production `/signup`.
- [ ] Verify the public path: landing -> signup -> confirmation state -> email verification -> dashboard -> 500 credits.
- [ ] Confirm public copy contains no waitlist, beta enrollment, 14-day trial, or old 30/120/360 denomination.
- [ ] Report these evidence classes separately: local tests/build, app deploy health, data-migration invariants, authenticated signup trial, Stripe checkout creation, Billing Portal, signed webhook, landing deploy, and paid-charge status.

## Final Self-Review

- [ ] Check every acceptance criterion in the approved spec against at least one task and one verification step above.
- [ ] Scan this plan and the implementation diff for unresolved placeholders or example secrets; none may ship.
- [ ] Confirm server `WorkspaceAccessKind`, client `BillingAccessKind`, status JSON, tests, and localized UI all agree on `trial` and its two statuses.
- [ ] Confirm 500/300/1,200/3,600 and every 10x action cost originate from the shared contract in the app.
- [ ] Confirm no real charge, deploy, Render mutation, Stripe mutation, or production database write happened before its explicit checkpoint approval.
