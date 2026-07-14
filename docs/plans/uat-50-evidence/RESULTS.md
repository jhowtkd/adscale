# Phase 6 Item 50 UAT Results

Generated: 2026-07-14T11:53:21.765Z
Account: `dev-admin@adscale.local`

> Honest status: scenarios are only **pass** when the full path was executed and hard gates (console/network) are clean. Opening a screen is not a pass.

## Environment (test configuration)

- Server: optimized local standalone build with `E2E_DISABLE_RATE_LIMIT=true` — **test-only** rate-limit bypass so UAT can drive rapid navigations without 429 noise.
- Provider: `E2E_CONTROLLED_PROVIDER=true` — deterministic text/image responses; billing, persistence, Inngest, quality policy and storage remain real. The seam only enables on localhost.
- This is **not** production behavior validation. Production must keep rate limits enabled.
- Inngest: local `inngest-cli dev` for provider lifecycle (S03 generate dispatch).
- Account: dev-admin may have unlimited billing bypass (balance may not drop; ledger still records).

| ID | Status | Title | Notes |
|----|--------|-------|-------|
| S05 | **pass** | Trabalhos i18n + canonical states | h1="49 trabalhos" |
| S02 | **pass** | New campaign create + redirect + list | campaignId=151b799c-d6fe-4eb2-9ad0-44fb8cb6f077 name=UAT S02 1784029978070 |
| S04 | **pass** | Continue campaign + post workId | post workId wizard ok; continueHref=/campaigns/ba30f260-d37c-4e77-a66f-3eafea2ea080 landed=http://localhost:3000/campaigns/ba30f260-d37c-4e77-a66f-3eafea2ea080 |
| S06 | **pass** | Workspace stages + deep links | nestedExport=0 distinctY=true campaign=ba30f260-d37c-4e77-a66f-3eafea2ea080 |
| S10 | **pass** | Template materialize UI | templateId=4e9e4dbf-a85f-483f-8255-d6e7603abd81 campaignId=86af7981-0040-4673-ae1b-df946dcb207e name=UAT S10 1784029981171 materializePosts=1 |
| S12 | **pass** | Empty / loading / error / retry | {"empty":true,"loading":true,"error":true,"retry":true,"homeContinue":true} |
| S03 | **pass** | Create post generate + list | workId=b4d66642-b02c-49d2-9d14-c0f706238ea4 name=UAT S03 1784029992298 gen=202 listed=true before=19869 after=19852 kind=paid |
| S07 | **pass** | Preview auto-approved (quality ok) | auto=true gateOff=true gateUi=false verdict=acceptable previewId=db87b011-96e2-4171-bf93-df4dc9737052 batchEst=5 |
| S08 | **pass** | Preview blocked by quality gate | showGate=true noAuto=true invalid=true activePreviewId=637b9483-2bd3-45c6-81bc-9e534764c436 derivation=637b9483-2bd3-45c6-81bc-9e534764c436 |
| S09 | **pass** | Credits UI vs resolve + billing | apiPreview=5 apiBatch=5 netPreview=5 netBatch=5 uiPreview=5 uiBatch=5 match=true before=19852 after=19852 kind=paid history=200 (open does not charge) |
| S11 | **pass** | Save post to library | libraryWorkId=5ad512cf-bad7-4700-929e-9791158f9e69 outputId=a7a79bea-a3ff-4f24-87ef-b72f23d0ab78 usedApi=true libOk=true reloadOk=true |
| S01 | **pass** | Home intent picker | intent: campaign + create-post + assistant |
| S13 | **pass** | Mobile navigation + campaign/post key paths | legacyLabels=false configPrimaryish=false visited=/,/campaigns,/library,/brand-kit,/quick-tools/create-post?workId=…,/campaigns/:id,/templates |
| S14 | **pass** | Assistant intent mode | opened /assistant without workId |

Pass: 14 · Fail: 0 · Blocked: 0 · Not executed: 0

## Gate 6
Ready for approval (S01–S14 all pass).
