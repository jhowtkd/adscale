# Phase 6 Item 50 UAT Results

Generated: 2026-07-14T17:52:01.064Z
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
| S05 | 1440x900 | **pass** | Trabalhos i18n + canonical states | h1="52 trabalhos" |
| S02 | 1440x900 | **pass** | New campaign create + redirect + list | campaignId=639fecd0-fba3-4141-8a5d-f5329223a81b name=UAT S02 1784049128471 |
| S04 | 1440x900 | **pass** | Continue campaign + post workId | post workId wizard ok; continueHref=/campaigns/4c239bf6-b74a-4d8b-b113-beb895aea8e0 landed=http://localhost:3000/campaigns/4c239bf6-b74a-4d8b-b113-beb895aea8e0 |
| S06 | 1440x900 | **pass** | Workspace stages + deep links | nestedExport=0 distinctY=true campaign=4c239bf6-b74a-4d8b-b113-beb895aea8e0 |
| S10 | 1440x900 | **pass** | Template materialize UI | templateId=657d2a7d-6369-458a-af18-50d4c56d3de7 campaignId=c1f74538-2b10-426e-b835-b63f938fc7f3 name=UAT S10 1784049131230 materializePosts=1 |
| S12 | 1440x900 | **pass** | Empty / loading / error / retry matrix | {"homeEmpty":true,"homeLoading":true,"homeError":true,"homeRetry":true,"worksEmpty":true,"worksLoading":true,"worksError":true,"worksRetry":true,"workspaceLoading":true,"workspaceError":true,"workspac |
| S03 | 1440x900 | **pass** | Create post generate + list | workId=f2571a3d-e1ea-4591-8a5f-99eb89a68aea name=UAT S03 1784049360703 gen=202 listed=true before=19706 after=19689 kind=paid |
| S07 | 1440x900 | **pass** | Preview auto-approved (quality ok) | previewDispatch=api:201 batchRequest=POST gateUi=false verdict=acceptable expectedCredits=10 chargedCredits=10 |
| S08 | 1440x900 | **pass** | Preview blocked by quality gate | showGate=true noAuto=true invalid=true explicitContinueHttp=201 activePreviewId=8d033cfb-b3e3-455d-ac90-ff9c46640e7c |
| S09 | 1440x900 | **pass** | Credits UI vs resolve + billing | apiPreview=5 apiBatch=5 uiPreview=5 uiBatch=5 uiMatch=true runExpected=10 runCharged=10 ledgerCredits=10 billingMatch=true beforeOpen=19674 afterOpen=19674 |
| S11 | 1440x900 | **pass** | Save post to library | libraryWorkId=04ef6389-1a88-4512-b112-51cede4085a9 outputId=ec578290-52d2-4d2f-8a39-0bd8c9d2d2d2 uiSave=true assetId=5986b8a0-4d2a-4950-9297-654fd15a5b04 proxy=200 reloadImage=true |
| S01 | 1440x900 | **pass** | Home intent picker | intent: campaign + create-post + assistant |
| S14 | 1440x900 | **pass** | Assistant intent mode | opened /assistant without workId |
| S05 | 1280x800 | **pass** | Trabalhos i18n + canonical states | h1="52 trabalhos" |
| S02 | 1280x800 | **pass** | New campaign create + redirect + list | campaignId=1c307d4f-5aea-4679-a655-10e9318edd59 name=UAT S02 1784049421288 |
| S04 | 1280x800 | **pass** | Continue campaign + post workId | post workId wizard ok; continueHref=/campaigns/1030e86d-4e7d-44f6-b400-d0994a3dc70e landed=http://localhost:3000/campaigns/1030e86d-4e7d-44f6-b400-d0994a3dc70e |
| S06 | 1280x800 | **pass** | Workspace stages + deep links | nestedExport=0 distinctY=true campaign=1030e86d-4e7d-44f6-b400-d0994a3dc70e |
| S10 | 1280x800 | **pass** | Template materialize UI | templateId=e12995d0-6ebc-4fa2-8006-36770af0a155 campaignId=be06a2ef-c56c-4655-9638-a111948a934a name=UAT S10 1784049424068 materializePosts=1 |
| S12 | 1280x800 | **pass** | Empty / loading / error / retry matrix | {"homeEmpty":true,"homeLoading":true,"homeError":true,"homeRetry":true,"worksEmpty":true,"worksLoading":true,"worksError":true,"worksRetry":true,"workspaceLoading":true,"workspaceError":true,"workspac |
| S03 | 1280x800 | **pass** | Create post generate + list | workId=a936a192-d395-47e3-9591-3b4c6727a5a1 name=UAT S03 1784049515751 gen=202 listed=true before=19674 after=19657 kind=paid |
| S07 | 1280x800 | **pass** | Preview auto-approved (quality ok) | previewDispatch=api:201 batchRequest=POST gateUi=false verdict=acceptable expectedCredits=10 chargedCredits=10 |
| S08 | 1280x800 | **pass** | Preview blocked by quality gate | showGate=true noAuto=true invalid=true explicitContinueHttp=201 activePreviewId=9f83acdd-1070-4357-ae64-71c475e8dd40 |
| S09 | 1280x800 | **pass** | Credits UI vs resolve + billing | apiPreview=5 apiBatch=5 uiPreview=5 uiBatch=5 uiMatch=true runExpected=10 runCharged=10 ledgerCredits=10 billingMatch=true beforeOpen=19642 afterOpen=19642 |
| S11 | 1280x800 | **pass** | Save post to library | libraryWorkId=f4c77961-53ad-4ce5-bdf7-cee1a6cb70c6 outputId=842b2ade-f39e-4d81-be9c-7c04028ca23a uiSave=true assetId=aef03c25-3ef7-4449-b0b8-7d95afe633c1 proxy=200 reloadImage=true |
| S01 | 1280x800 | **pass** | Home intent picker | intent: campaign + create-post + assistant |
| S14 | 1280x800 | **pass** | Assistant intent mode | opened /assistant without workId |
| S05 | 390x844 | **pass** | Trabalhos i18n + canonical states | h1="52 trabalhos" |
| S02 | 390x844 | **pass** | New campaign create + redirect + list | campaignId=c8074742-3a18-43a3-a9a3-a9d48fcc1ddd name=UAT S02 1784050894340 |
| S04 | 390x844 | **pass** | Continue campaign + post workId | post workId wizard ok; continueHref=/campaigns/576b5a84-2643-44ed-8027-a0ae54f0edfa landed=http://localhost:3000/campaigns/576b5a84-2643-44ed-8027-a0ae54f0edfa |
| S06 | 390x844 | **pass** | Workspace stages + deep links | nestedExport=0 distinctY=true campaign=576b5a84-2643-44ed-8027-a0ae54f0edfa |
| S10 | 390x844 | **pass** | Template materialize UI | templateId=64aa9644-f1c1-4bcc-937a-c2d8fbd3dd9e campaignId=e4c829f5-88c2-40df-895e-0cda45e5c148 name=UAT S10 1784050897725 materializePosts=1 |
| S12 | 390x844 | **pass** | Empty / loading / error / retry matrix | {"homeEmpty":true,"homeLoading":true,"homeError":true,"homeRetry":true,"worksEmpty":true,"worksLoading":true,"worksError":true,"worksRetry":true,"workspaceLoading":true,"workspaceError":true,"workspac |
| S03 | 390x844 | **pass** | Create post generate + list | workId=0f76ce42-db0b-4735-ba86-2fb2a963e50a name=UAT S03 1784051128408 gen=202 listed=true before=19615 after=19598 kind=paid |
| S07 | 390x844 | **pass** | Preview auto-approved (quality ok) | previewDispatch=api:201 batchRequest=POST gateUi=false verdict=acceptable expectedCredits=10 chargedCredits=10 |
| S08 | 390x844 | **pass** | Preview blocked by quality gate | showGate=true noAuto=true invalid=true explicitContinueHttp=201 activePreviewId=870936a3-80e4-4d02-ac9a-f68e1a582b6d |
| S09 | 390x844 | **pass** | Credits UI vs resolve + billing | apiPreview=5 apiBatch=5 uiPreview=5 uiBatch=5 uiMatch=true runExpected=10 runCharged=10 ledgerCredits=10 billingMatch=true beforeOpen=19583 afterOpen=19583 |
| S11 | 390x844 | **pass** | Save post to library | libraryWorkId=918d7b83-db69-4e60-9d06-903a092f6b5c outputId=d110d6c1-446f-45e7-9df6-a29b9192bd6b uiSave=true assetId=419e1c3f-054b-4195-a2ec-8045673e7f93 proxy=200 reloadImage=true |
| S01 | 390x844 | **pass** | Home intent picker | intent: campaign + create-post + assistant |
| S13 | 390x844 | **pass** | Mobile navigation + campaign/post key paths | legacyLabels=false configPrimaryish=false visited=/,/campaigns,/library,/brand-kit,/settings,/templates,/assistant,/quick-tools/create-post?workId=…,/campaigns/:id,/templates |
| S14 | 390x844 | **pass** | Assistant intent mode | opened /assistant without workId |
| S05 | 360x800 | **pass** | Trabalhos i18n + canonical states | h1="52 trabalhos" |
| S02 | 360x800 | **pass** | New campaign create + redirect + list | campaignId=45b7b8c4-b155-4a79-aa79-c09b7e4540cb name=UAT S02 1784051224057 |
| S04 | 360x800 | **pass** | Continue campaign + post workId | post workId wizard ok; continueHref=/campaigns/f17ef10a-1f32-4dd4-9926-280f74a99209 landed=http://localhost:3000/campaigns/f17ef10a-1f32-4dd4-9926-280f74a99209 |
| S06 | 360x800 | **pass** | Workspace stages + deep links | nestedExport=0 distinctY=true campaign=f17ef10a-1f32-4dd4-9926-280f74a99209 |
| S10 | 360x800 | **pass** | Template materialize UI | templateId=b58af82e-7acd-419d-9322-61225c9ad0c0 campaignId=e6709f9d-a6ff-4db9-b86d-1d91e52ad655 name=UAT S10 1784051226963 materializePosts=1 |
| S12 | 360x800 | **pass** | Empty / loading / error / retry matrix | {"homeEmpty":true,"homeLoading":true,"homeError":true,"homeRetry":true,"worksEmpty":true,"worksLoading":true,"worksError":true,"worksRetry":true,"workspaceLoading":true,"workspaceError":true,"workspac |
| S03 | 360x800 | **pass** | Create post generate + list | workId=42ea003e-ef97-4499-95b1-90d8c1fc82ca name=UAT S03 1784051435038 gen=202 listed=true before=19583 after=19566 kind=paid |
| S07 | 360x800 | **pass** | Preview auto-approved (quality ok) | previewDispatch=api:201 batchRequest=POST gateUi=false verdict=acceptable expectedCredits=10 chargedCredits=10 |
| S08 | 360x800 | **pass** | Preview blocked by quality gate | showGate=true noAuto=true invalid=true explicitContinueHttp=201 activePreviewId=4c875198-1125-474f-8a36-f24a0f4743eb |
| S09 | 360x800 | **pass** | Credits UI vs resolve + billing | apiPreview=5 apiBatch=5 uiPreview=5 uiBatch=5 uiMatch=true runExpected=10 runCharged=10 ledgerCredits=10 billingMatch=true beforeOpen=19551 afterOpen=19551 |
| S11 | 360x800 | **pass** | Save post to library | libraryWorkId=756981e8-61a2-4748-bb63-0002ee6ac52c outputId=c21c8645-a29c-4b02-9e5f-eb7fe823d159 uiSave=true assetId=d1fbc5e6-9a9a-48d7-a8e3-aa8f36898d0f proxy=200 reloadImage=true |
| S01 | 360x800 | **pass** | Home intent picker | intent: campaign + create-post + assistant |
| S13 | 360x800 | **pass** | Mobile navigation + campaign/post key paths | legacyLabels=false configPrimaryish=false visited=/,/campaigns,/library,/brand-kit,/settings,/templates,/assistant,/quick-tools/create-post?workId=…,/campaigns/:id,/templates |
| S14 | 360x800 | **pass** | Assistant intent mode | opened /assistant without workId |

Pass: 54 · Fail: 0 · Blocked: 0 · Not executed: 0

## Gate 6
**APPROVED (2026-07-14)** — 54/54 required scenario/viewport checks pass.
