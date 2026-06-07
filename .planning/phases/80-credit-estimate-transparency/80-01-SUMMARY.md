# 80-01 Summary: Batch credit breakdown + billing wiring

**Status:** Complete  
**Requirements:** CRED-01 (partial — data path)

## Delivered

- `getBatchCreditBreakdown()` and `BatchCreditBreakdown` type in `strategy-recipes.ts`; `estimateCreditCost` delegates batch total to breakdown.
- `use-campaign-workspace` exports `batchCreditBreakdown` with format-mode drift fix (`targetFormats` only for `format_adaptation`).
- Campaign page wires `useBillingStatus()` → `creditBalance` and passes `batchBreakdown` to `PreviewGatePanel`.

## Verification

- `strategy-recipes.test.ts` — breakdown cases (CTA, format, empty formats).
- Build passes.
