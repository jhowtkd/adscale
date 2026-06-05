# Summary 49-01: Beta access and credit entitlements

**Completed:** 2026-06-03

## Delivered

- `workspace_entitlements` and `beta_access_redemptions` tables with migration `0025_beta_entitlements.sql`
- `getWorkspaceBillingAccess` resolver (`paid` | `beta` | `none`) and revised `canSpend` gate
- Beta redemption service (`redeemBetaAccess`) using `BETA_ACCESS_CODES` env (comma-separated)
- 50-credit beta grant (`source = beta_tester`) mapped to 10 generated ads in UI
- `POST /api/billing/beta/redeem` and extended `GET /api/billing/status`
- Onboarding `POST` accepts optional `betaCode`
- Billing settings UI: beta redeem form, beta status banner, internal-cost forecast labels

## Verification

- Focused tests: 20 passed (billing access, beta, credits, status route, hooks)
- `npm run build` from `app`: passed

## Ops note

Set `BETA_ACCESS_CODES=YOURCODE` in deployment env before distributing tester codes. Run migration `0025_beta_entitlements.sql` on the database.
