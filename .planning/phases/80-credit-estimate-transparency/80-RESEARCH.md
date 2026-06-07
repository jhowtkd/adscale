# Phase 80 Research: Credit Estimate Transparency

**Researched:** 2026-06-07  
**Phase:** 80 — Credit Estimate Transparency

## Summary

Phase 80 extends existing preview-gate credit UI (v11.8 F-01) with mode-aware batch formula, always-visible balance, and client-side insufficient-credit gate. No new APIs required beyond reusing `useBillingStatus` (`/api/billing/status` → `creditBalance`).

## Key Findings

### Credit math (already exists)

- `countDerivationJobs(config)` — CTAs for `art_variation`, formats for `format_adaptation`
- `estimateCreditCost(config)` — `jobCount * IMAGE_DERIVATION_CREDIT_COST` (5)
- `use-campaign-workspace.ts` already builds `RecipeGenerationConfig` from campaign for `batchCreditEstimate`

### Balance source

- `useBillingStatus()` in `app/src/lib/hooks/use-billing.ts` exposes `creditBalance`
- Used on settings `BillingTab`; not yet on campaign workspace page
- Prefer this over full `/api/dashboard/stats` (lighter, same credit number)

### UI surface

- `PreviewGatePanel.tsx` — props: `previewCreditsSpent`, `batchCredits`, beta events unchanged
- Replace `batchCost` line with formula; add `creditBalance` prop
- Block: `creditBalance < batchCredits` → disable approve + show `insufficientCredits` copy

### i18n

- Namespace: `strategyRecipes.previewGate` in `pt-BR.json` / `en.json`
- Add keys for formula (CTA vs format variants), balance, insufficient message
- Keep `creditEstimateNote` muted (CRED-04)

## Recommendations

1. Add `getBatchCreditBreakdown(config)` next to `estimateCreditCost` — returns `{ jobCount, unitCost, totalCredits, generationMode }` for UI + tests.
2. Export breakdown from `use-campaign-workspace` alongside `batchCreditEstimate`.
3. Campaign page: `useBillingStatus()` → pass `creditBalance` to `PreviewGatePanel`.
4. Do not change server billing or analytics events (Phase 81).

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | Vitest + Testing Library |
| Config | `app/vitest.config.ts` |
| Quick run | `cd app && npm test -- src/server/ai/strategy-recipes.test.ts src/components/workspace/PreviewGatePanel.test.tsx` |
| Full suite | `cd app && npm test` |

Per-task: unit tests on breakdown helper + PreviewGatePanel states (formula, balance, disabled approve).

## Risks

| Risk | Mitigation |
|------|------------|
| `batchCredits === 0` when CTAs empty | Keep `batchCostPending` copy when `jobCount === 0` |
| Billing query loading | Disable approve while balance undefined OR treat as 0 with skeleton — prefer loading state on credit box only |
| Beta instrumentation regression | Existing PreviewGatePanel tests assert event keys — extend, do not remove |

## RESEARCH COMPLETE
