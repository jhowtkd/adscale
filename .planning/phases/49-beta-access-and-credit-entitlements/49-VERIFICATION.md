# Phase 49 Verification

**Verified:** 2026-06-03

## Commands

```bash
cd app
npm test -- src/server/billing/credits.test.ts src/server/billing/access.test.ts src/server/billing/beta.test.ts src/server/billing/gates.test.ts src/app/api/billing/status/route.test.ts src/lib/hooks/use-billing.test.tsx
npm run build
```

## Results

| Check | Result |
|-------|--------|
| Beta allowed spend (unit) | Pass |
| Beta exhausted / no access (unit) | Pass |
| Paid subscription unchanged (unit) | Pass |
| Beta redeem invalid/duplicate (unit) | Pass |
| Billing status returns beta without subscription (unit) | Pass |
| Production build | Pass |

## Manual smoke (owner)

1. Apply migration `app/drizzle/0025_beta_entitlements.sql`
2. Set `BETA_ACCESS_CODES` in env
3. Redeem code in Settings → Billing
4. Confirm status shows beta + 10 ads remaining
5. Generate derivations until 402 `insufficient_credits`

## Residual risks

- Beta codes are env-managed only (no admin UI yet)
- Paid plan copy still uses credits/month; ads-first packaging deferred
