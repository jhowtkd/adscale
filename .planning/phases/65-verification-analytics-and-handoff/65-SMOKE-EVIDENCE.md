# Smoke Test Evidence — v11.6 Creative Strategy Cockpit

**Operator-owned browser verification (CQA-02)**

## Metadata

| Field | Value |
|-------|-------|
| Milestone | v11.6 Creative Strategy Cockpit |
| Date (UTC) | 2026-06-06 |
| Operator | Codex browser smoke |
| App URL | `https://adscale.jhonatansoares.com` |
| Git ref at test | `fb409a0` live Render + manual Render startCommand update (`npm run db:migrate && npm run start:prod`) |
| Automated preflight | 69 cockpit + review-fix tests pass locally |

## Cockpit path checklist

| ID | Step | pass/fail | Notes |
|----|------|-----------|-------|
| SMK-C01 | Open campaign draft workspace | PASS | Created/opened `Smoke v11.6 CQA-02` at `/campaigns/d3751a4e-7062-4a2e-9cc3-3ced5941a73a`. |
| SMK-C02 | Upload base creative | PASS | Uploaded synthetic PNG smoke creative; analysis completed after live fix. |
| SMK-C03 | Run Creative Readiness → see 6 dimensions | PASS | Saw 6 dimensions: offer clarity, text legibility, visual hierarchy, CTA prominence, brand fit, platform fit. |
| SMK-C04 | Blocking issues appear above suggestions | PASS | Initial readiness was `BLOQUEADO`; blocking issues appeared before improvements. |
| SMK-C05 | Rerun readiness after brief edit | PASS | After accepting/saving briefing, rerun changed readiness from `BLOQUEADO` 87 to `PRONTO` 79. |
| SMK-C06 | Guided briefing on weak brief (one question at a time) | NOT RUN | Flow advanced through upload analysis suggestions/form; one-question guided weak-brief path not reached in this smoke. |
| SMK-C07 | Accept / edit / skip suggestions → form fields update | PARTIAL | Accepted suggestion and confirmed detected creative form; summary fields populated. Edit/skip variants not separately exercised. |
| SMK-C08 | Derivar opens strategy recipe panel (3 recipes) | PASS | Modal opened with Iteração Segura, Impulso de Performance, Diferenciação Visual. |
| SMK-C09 | Recipe tradeoff copy visible | PASS | Tradeoff/descriptive copy visible for each recipe. |
| SMK-C10 | Override recipe settings | PASS | Selected recipe/config option before preview. |
| SMK-C11 | Generate preview → credit line visible | PASS | Post-`23097b8`: preview POST **201**; retry while queued preview exists also **201** (no 429). |
| SMK-C12 | Preview gate: approve batch or revise recipe | PASS | After manual public `PUT /api/inngest`, preview completed and browser showed “Prévia pronta — aprove antes do lote completo” with “Revisar receita” and “Aprovar e enfileirar lote”. |
| SMK-C13 | Batch queued → preview gate hidden | PASS | Clicking “Aprovar e enfileirar lote” hid the preview gate and showed “Variações criativas enfileiradas para geração”. |
| SMK-C14 | Approve derivations | PASS | Batch derivation `1fd420fe-9bb5-4768-be3d-6a7f12abc196` completed with signed image and was approved in browser (`status: approved`). |
| SMK-C15 | Create client approval package + share link | PASS (API) | `POST /approval-package` returned 200 with selected root `1fd420fe-9bb5-4768-be3d-6a7f12abc196` and share URL `/share/7714f0f9-3f5a-466d-8f69-b9c190fdf28e`. Browser panel did not render despite `GET /approval-package` returning an approved root. |
| SMK-C16 | Public share page loads signed assets | PASS | Public share page loaded “Galeria ADScale”; image endpoint completed with `naturalWidth: 1080`, `naturalHeight: 1080`. |
| SMK-C17 | Stale badge after rejection → refresh package | PARTIAL | Rejected shared derivation via review API; `GET /approval-package` returned `isStale: true` with `unapproved:1fd420fe-9bb5-4768-be3d-6a7f12abc196`. Refresh could not complete: reapproval returned 409 due hard quality failure, and regeneration POST returned 500 (`errorId: 5c8f499f-a331-49ce-bcc9-3589943271e2`). |

## Offline automated evidence (2026-06-05, phase 66 refresh)

```
cd app
npm test -- [cockpit matrix — see 66-RELEASE-EVIDENCE.md]
→ 14 files, 69 tests passed

npm run lint → 0 errors
npm run build → PASS
```

## Sign-off

| | |
|-|-|
| Automated CQA-01 | ☑ PASS |
| Browser CQA-02 | ☐ PASS ☒ FAIL — SMK-C12–C16 pass after Inngest public sync; SMK-C17 remains partial because refresh path is blocked by quality gate/regeneration failure |
| Overall | ☐ PASS ☒ FAIL |

## Browser Smoke Notes (2026-06-06)

- Production sign-in succeeded with the dev admin account after cold start.
- Found and fixed a production readiness bug: `usePreflightScore` was called with `campaignId`/`assetId` reversed, causing `/preflight` 404s. Fix deployed in `36a7027`.
- Found and fixed a secondary preview failure-handling bug: missing `common.failedQueuePreview` translation left the UI stuck in generating state on queue failure. Fix deployed in `04797c9`.
- **Fixed (2026-06-06):** Migration `0030` (`fa0eef1`) — derivations/approval-package 500s resolved.
- **Fixed (2026-06-06):** Preview retry 429 (`23097b8`) — stale cleanup + delete existing preview before rate limit. Production probe: consecutive preview POSTs both **201**.
- **Blocked (2026-06-06 18:53 UTC):** Browser SMK-C12 did not progress because preview derivation `4e23f9e4-cc88-4665-93ae-3f26084d1780` stayed `queued`, `outputKey: null`, `imageUrl: null`. Render logs from `18:45Z` onward showed deploy/startup only and no `derivation`/`Inngest` execution logs. Render service inventory shows `adscale-app` as a web service; no separate worker service was observed for this project.
- **Fixed/confirmed (2026-06-06 19:13 UTC):** Render service start command was updated to `npm run db:migrate && npm run start:prod`; a public `PUT https://adscale.jhonatansoares.com/api/inngest` returned 200 `Successfully registered`, and queued generation completed.
- **Caveat:** `start-with-inngest-sync.mjs` in `fb409a0` attempted local `127.0.0.1` sync, which Inngest rejected in production (`Cannot deploy localhost functions to production`). Follow-up code changes switch startup sync to the public `APP_URL`/`BETTER_AUTH_URL`.
- **Remaining:** Deploy follow-up sync fix, investigate why the approval package panel did not render in browser while the API returned roots, and fix regeneration 500 before calling C17 fully passed.
