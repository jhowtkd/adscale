# Smoke Test Evidence — v11.6 Creative Strategy Cockpit

**Operator-owned browser verification (CQA-02)**

## Metadata

| Field | Value |
|-------|-------|
| Milestone | v11.6 Creative Strategy Cockpit |
| Date (UTC) | 2026-06-06 |
| Operator | Codex browser smoke |
| App URL | `https://adscale.jhonatansoares.com` |
| Git ref at test | `23097b8` live Render (`0030` schema + preview retry fix) |
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
| SMK-C12 | Preview gate: approve batch or revise recipe | BLOCKED | Preview derivation `4e23f9e4-cc88-4665-93ae-3f26084d1780` remained `queued` with `outputKey: null` and no image ~6 minutes after creation (`2026-06-06T18:47:29Z` → `18:53:18Z`). Browser showed `GERANDO` / `Carregando...`. |
| SMK-C13 | Batch queued → preview gate hidden | NOT RUN | Blocked by SMK-C12: preview never completed, so the approval/revise gate did not become actionable. |
| SMK-C14 | Approve derivations | NOT RUN | Blocked by SMK-C12. |
| SMK-C15 | Create client approval package + share link | PASS (API) | Post-`fa0eef1` probe: `GET /approval-package` HTTP 200; `shareUrl` null until package created with derivation IDs. |
| SMK-C16 | Public share page loads signed assets | NOT RUN | Requires SMK-C15 browser flow with share link; browser flow blocked by SMK-C12. |
| SMK-C17 | Stale badge after rejection → refresh package | NOT RUN | Requires SMK-C15–C16 browser flow; browser flow blocked by SMK-C12. |

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
| Browser CQA-02 | ☐ PASS ☒ FAIL — API unblocked through `23097b8`; SMK-C12 browser gate blocked by queued preview with no generated image |
| Overall | ☐ PASS ☒ FAIL |

## Browser Smoke Notes (2026-06-06)

- Production sign-in succeeded with the dev admin account after cold start.
- Found and fixed a production readiness bug: `usePreflightScore` was called with `campaignId`/`assetId` reversed, causing `/preflight` 404s. Fix deployed in `36a7027`.
- Found and fixed a secondary preview failure-handling bug: missing `common.failedQueuePreview` translation left the UI stuck in generating state on queue failure. Fix deployed in `04797c9`.
- **Fixed (2026-06-06):** Migration `0030` (`fa0eef1`) — derivations/approval-package 500s resolved.
- **Fixed (2026-06-06):** Preview retry 429 (`23097b8`) — stale cleanup + delete existing preview before rate limit. Production probe: consecutive preview POSTs both **201**.
- **Blocked (2026-06-06 18:53 UTC):** Browser SMK-C12 did not progress because preview derivation `4e23f9e4-cc88-4665-93ae-3f26084d1780` stayed `queued`, `outputKey: null`, `imageUrl: null`. Render logs from `18:45Z` onward showed deploy/startup only and no `derivation`/`Inngest` execution logs. Render service inventory shows `adscale-app` as a web service; no separate worker service was observed for this project.
- **Remaining:** Diagnose production Inngest/job processing, then rerun browser smoke SMK-C12–C17 (preview gate through share/stale badge).
