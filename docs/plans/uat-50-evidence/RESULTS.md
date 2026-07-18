# Phase 6 Item 50 UAT Results

Generated: 2026-07-17T07:03:01.696Z
Account: `dev-admin@adscale.local`

> Honest status: scenarios are only **pass** when the full path was executed and hard gates (console/network) are clean. Opening a screen is not a pass.

## Environment (test configuration)

- Server: optimized local standalone build with `E2E_DISABLE_RATE_LIMIT=true` — **test-only** rate-limit bypass so UAT can drive rapid navigations without 429 noise.
- Provider: `E2E_CONTROLLED_PROVIDER=true` — deterministic text/image responses; billing, persistence, Inngest, quality policy and storage remain real. The seam only enables on localhost.
- This is **not** production behavior validation. Production must keep rate limits enabled.
- Inngest: local `inngest-cli dev` for provider lifecycle (S03 generate dispatch).
- Account: dev-admin may have unlimited billing bypass (balance may not drop; ledger still records).

| ID | Viewport | Status | Title | Notes |
|----|----------|--------|-------|-------|
| S05 | 1440x900 | **pass** | Trabalhos i18n + canonical states | h1="7 trabalhos" |
| S02 | 1440x900 | **pass** | Works CTA to focused Home composer | Novo trabalho opens the one-step composer with focus |
| S04 | 1440x900 | **pass** | Continue campaign + post workId | post workId composer ok; continueHref=/campaigns/e6936043-013c-411f-9db5-1080e4e8e2d4 landed=http://localhost:3000/campaigns/e6936043-013c-411f-9db5-1080e4e8e2d4 |
| S06 | 1440x900 | **pass** | Workspace stages + deep links | nestedExport=0 distinctY=true campaign=e6936043-013c-411f-9db5-1080e4e8e2d4 |
| S10 | 1440x900 | **pass** | Template to canonical Home draft | templateId=8baf7e68-e793-44a2-996b-79d501fa5769 workId=516bb7ad-5288-470e-b303-f6a170a8e220 materializePosts=0 |
| S12 | 1440x900 | **pass** | Empty / loading / error / retry matrix | {"homeEmpty":true,"homeLoading":true,"homeError":true,"homeRetry":true,"worksEmpty":true,"worksLoading":true,"worksError":true,"worksRetry":true,"workspaceLoading":true,"workspaceError":true,"workspac |
| S03 | 1440x900 | **pass** | Create post generate + list | workId=7d5c4fa1-da12-411b-bd53-db2f3522f146 name=UAT S03 1784271673202 gen=202 listed=true before=9950 after=9935 kind=paid |
| S07 | 1440x900 | **pass** | Pilot approval before batch (quality ok) | previewDispatch=api:201 batchRequest=POST gateUi=true verdict=acceptable expectedCredits=10 chargedCredits=10 |
| S08 | 1440x900 | **pass** | Preview blocked by quality gate | showGate=true noAuto=true invalid=true explicitContinueHttp=201 activePreviewId=2492e10e-1b8b-4869-8446-142c853a1c20 |
| S09 | 1440x900 | **pass** | Credits UI vs resolve + billing | apiPreview=5 apiBatch=5 uiPreview=5 uiBatch=5 uiMatch=true runExpected=10 ledgerCredits=10 billingMatch=true beforeOpen=9920 afterOpen=9920 |
| S11 | 1440x900 | **pass** | Completed post auto-saved in library | libraryWorkId=2ad8b270-e73e-45e4-888a-ce35139cb5ae outputId=28357c0f-b41e-4518-a0fb-910481762231 autoSaved=true assetId=b1f182da-9373-467c-be1d-9feb7b6151a2 proxy=200 reloadImage=true |
| S01 | 1440x900 | **pass** | Operational Home composer | one composer + four optional tool presets; no creation modal |
| S14 | 1440x900 | **pass** | Assistant intent mode | opened /assistant without workId; creativeWorks=9 |

Pass: 13 · Fail: 0 · Blocked: 0 · Not executed: 41

## Follow-up — 2026-07-18

- Unit/integration regression suite: **597 files passed; 3,997 tests passed; 7 skipped**.
- Typecheck, lint (zero errors), production build and convergence gate: **pass**.
- The focused browser suite was updated for the explicit Content/Style/Both choice and lists 4 runnable scenarios.
- A fresh browser execution was attempted against the isolated test database, but Docker did not finish creating `adscale-test-postgres`; no new browser scenario is claimed as pass from this attempt.

## Gate 6
**NOT REQUESTED** — required matrix remains incomplete (13/54 required passes recorded; 41 not executed).
