# Smoke Test Evidence — v11.6 Creative Strategy Cockpit

**Operator-owned browser verification (CQA-02)**

## Metadata

| Field | Value |
|-------|-------|
| Milestone | v11.6 Creative Strategy Cockpit |
| Date (UTC) | 2026-06-06 |
| Operator | Codex browser smoke |
| App URL | `https://adscale.jhonatansoares.com` |
| Git ref at test | `04797c9` live Render (`36a7027` readiness id-order fix + `04797c9` preview error recovery) |
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
| SMK-C11 | Generate preview → credit line visible | PARTIAL | Credit line visible (`A prévia usa 5 créditos`); queue attempt failed on `/api/campaigns/:id/derivations` 500. |
| SMK-C12 | Preview gate: approve batch or revise recipe | BLOCKED | Blocked by derivations API 500 before preview gate. |
| SMK-C13 | Batch queued → preview gate hidden | BLOCKED | Blocked by derivations API 500. |
| SMK-C14 | Approve derivations | BLOCKED | Blocked by derivations API 500. |
| SMK-C15 | Create client approval package + share link | BLOCKED | Approval package endpoint also returned 500 during smoke. |
| SMK-C16 | Public share page loads signed assets | BLOCKED | No approval package/share link available. |
| SMK-C17 | Stale badge after rejection → refresh package | BLOCKED | No approval package/share link available. |

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
| Browser CQA-02 | ☒ FAIL — blocked at preview queue |
| Overall | ☐ PASS ☒ FAIL |

## Browser Smoke Notes (2026-06-06)

- Production sign-in succeeded with the dev admin account after cold start.
- Found and fixed a production readiness bug: `usePreflightScore` was called with `campaignId`/`assetId` reversed, causing `/preflight` 404s. Fix deployed in `36a7027`.
- Found and fixed a secondary preview failure-handling bug: missing `common.failedQueuePreview` translation left the UI stuck in generating state on queue failure. Fix deployed in `04797c9`.
- Remaining ship blocker: `/api/campaigns/d3751a4e-7062-4a2e-9cc3-3ced5941a73a/derivations` returns 500 on GET/POST, and `/approval-package` returned 500. Preview gate and handoff/share steps remain blocked until those server errors are fixed.
