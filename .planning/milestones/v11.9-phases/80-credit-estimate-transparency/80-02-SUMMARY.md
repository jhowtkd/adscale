# 80-02 Summary: Preview gate credit transparency UI

**Status:** Complete  
**Requirements:** CRED-01, CRED-02, CRED-04

## Delivered

- `PreviewGatePanel` shows preview spent, balance (`—` while loading), mode-aware formula (`N CTAs/formats × 5 = total`), insufficient-credit block, disclaimer.
- Approve disabled when: generating, approving, `jobCount === 0`, balance loading, or insufficient balance.
- PT-BR + EN i18n keys: `balanceRemaining`, `balanceLoading`, `batchFormulaCta`, `batchFormulaFormat`, `insufficientCredits`.
- `PreviewGatePanel.test.tsx` updated for new props and edge cases.
- Beta `cockpit_stage_*` events unchanged.

## Verification

- 9 PreviewGatePanel tests pass.
- Build passes.
