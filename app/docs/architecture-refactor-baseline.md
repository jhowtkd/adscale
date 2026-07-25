# Architecture Refactor — Baseline

> **PR 0 of the [Architecture Refactor Plan](./architecture-refactor-plan.md)**
> Branch: `arch/refactor-2026-q3`
> Date captured: 2026-06-30

This document captures the *objective* state of the repo **before** any architecture-related code changes. Future PRs (1–10) reference the import maps and test status below as their acceptance baseline.

---

## 1. Command status

All commands run from `app/` on a clean checkout of the new branch. **No production files were modified to produce this baseline.**

| Command | Result | Notes |
| --- | --- | --- |
| `npm run lint` | ✅ 0 errors, warnings only | Pre-existing `@typescript-eslint/no-unused-vars`. Not blockers. |
| `npm run typecheck` | ✅ Clean | `tsc --noEmit` exits 0 with no output. |
| `npm test` | ✅ 600 files / 4011 passed / 7 skipped / 0 failed | Duration ~84s. Vitest with `--passWithNoTests`. |

### Test files counted

- Total test files: **600**
- Passing tests: **4011**
- Skipped: **7**
- Failed: **0**

There are no pre-existing failing tests blocking this refactor.

---

## 2. Import map per PR

The seven candidates from the architecture review each have a concrete set of files that reference the to-be-deepened modules. The maps below are the **acceptance checklist** for "no stale imports" in each PR.

### PR 1 — `app/src/server/storage/r2.ts` shim

Files importing `server/storage/r2` (43 total):

```
app/src/app/api/assistant/threads/[threadId]/chat/route.ts
app/src/app/api/assistant/threads/[threadId]/chat/route.test.ts
app/src/app/api/campaigns/[id]/analyze/route.ts
app/src/app/api/campaigns/[id]/analyze/route.test.ts
app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts
app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.test.ts
app/src/app/api/campaigns/[id]/assets/presign/route.ts
app/src/app/api/campaigns/[id]/assets/route.ts
app/src/app/api/campaigns/[id]/assets/upload/route.ts
app/src/app/api/campaigns/[id]/assets/upload/route.test.ts
app/src/app/api/campaigns/[id]/auto-briefing/route.ts
app/src/app/api/campaigns/[id]/auto-briefing/route.test.ts
app/src/app/api/campaigns/[id]/competitors/[competitorId]/route.ts
app/src/app/api/campaigns/[id]/competitors/route.ts
app/src/app/api/campaigns/[id]/derivations/route.ts
app/src/app/api/campaigns/[id]/diagnosis/route.ts
app/src/app/api/campaigns/[id]/diagnosis/regenerate/route.ts
app/src/app/api/campaigns/[id]/restyle/route.ts
app/src/app/api/campaigns/[id]/restyle/route.test.ts
app/src/app/api/campaigns/[id]/smart-resize-preview/route.ts
app/src/app/api/campaigns/[id]/smart-resize-preview/route.test.ts
app/src/app/api/derivations/[id]/landing-page/route.ts
app/src/app/api/derivations/[id]/landing-page/route.test.ts
app/src/app/api/derivations/[id]/qa/route.ts
app/src/app/api/derivations/[id]/qa/route.test.ts
app/src/app/api/export/zip/route.ts
app/src/app/api/feedback/human-quality-corpus/route.test.ts
app/src/app/api/feedback/reports/[id]/route.ts
app/src/app/api/feedback/reports/[id]/route.test.ts
app/src/app/api/quick-tools/restyling/route.ts
app/src/app/api/restyling/route.ts
app/src/app/api/user/profile/avatar/route.ts
app/src/app/api/user/profile/avatar/route.test.ts
app/src/app/api/workspace/assets/[id]/route.ts
app/src/app/api/workspace/assets/[id]/route.test.ts
app/src/app/api/workspace/assets/route.ts
app/src/app/api/workspace/assets/route.test.ts
app/src/app/api/workspace/brand-kit/logo/route.ts
app/src/app/api/workspace/brand-kit/logo/route.test.ts
app/src/app/api/workspace/brand-kit/route.ts
app/src/app/api/workspace/brand-kit/route.test.ts
app/src/server/assistant/guided-paths/existing-creative.ts
app/src/server/assistant/guided-paths/existing-creative.test.ts
app/src/server/jobs/workspace-asset.ts
app/src/server/repositories/dashboard.ts
app/src/server/repositories/dashboard.test.ts
```

**PR 1 acceptance:** `rg "server/storage/r2" app/src` returns **zero** matches before merge.

### PR 2 — Derivation display helpers (5 files → 1)

Files importing the five `derivation-*` helpers:

```
app/src/app/api/derivations/[id]/review/route.ts
app/src/components/campaigns/v6/workspace/map-campaign-workspace-v6.ts
app/src/components/workspace/DerivationAutoRetryBadge.tsx
app/src/components/workspace/DerivationAutoRetryBadge.test.tsx
app/src/components/workspace/DerivationCard.tsx
app/src/components/workspace/DerivationGrid.tsx
app/src/components/workspace/DerivationReviewSheet.tsx
app/src/components/workspace/StrategyRecipePanel.tsx
app/src/lib/derivation-review-display.ts
app/src/lib/derivation-review-display.auto-retry.test.ts
app/src/lib/hooks/use-campaign-workspace.ts
app/src/lib/hooks/use-review.ts
app/src/server/output-learning/recommendation/map-prefill.ts
app/src/server/performance/recommendation/map-prefill.ts
```

**PR 2 acceptance:** `rg "derivation-(auto-retry-badge|formats|quality|regeneration-feedback|review-display)" app/src` returns **only** matches against the new `derivation-display.ts` and its test file.

### PR 3–5 — Derivation pipeline / retry

Files touching `runDerivationAutoRetry` or `promptContext`:

```
app/src/components/mission-insights/MissionInsightProvider.tsx
app/src/server/ai/derivation-auto-retry.ts
app/src/server/ai/derivation-auto-retry.integration.test.ts
app/src/server/jobs/derivation.ts
app/src/server/jobs/derivation.test.ts
```

**PR 3 acceptance (golden/snapshot test):** a new test asserts the `promptContext` shape from `executeGenerationStep()` equals the shape produced by the current `derivation.ts` initial path for a canonical input.

**PR 5 acceptance:** the inline retry block in `derivation.ts` is gone; `executeGenerationStep` is the single seam.

### PR 6–7 — Billing paywall

Files importing `spendCreditsOrApiError`, `SpendCheck`, `conversion-gate`, `conversion-client`, `conversion-contract`, or `buildConversionErrorPayloadForWorkspace`:

```
app/src/app/(dashboard)/campaigns/[id]/page.tsx
app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts
app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.test.ts
app/src/app/api/campaigns/[id]/auto-briefing/route.ts
app/src/app/api/campaigns/[id]/auto-briefing/route.test.ts
app/src/app/api/campaigns/[id]/competitors/analyze/route.ts
app/src/app/api/campaigns/[id]/competitors/strategy/route.ts
app/src/app/api/campaigns/[id]/derivations/route.ts
app/src/app/api/campaigns/[id]/derivations/route.test.ts
app/src/app/api/campaigns/[id]/diagnosis/route.ts
app/src/app/api/campaigns/[id]/diagnosis/regenerate/route.ts
app/src/app/api/campaigns/[id]/plan/route.ts
app/src/app/api/campaigns/[id]/restyle/route.ts
app/src/app/api/campaigns/[id]/restyle/route.test.ts
app/src/app/api/derivations/[id]/copy-variants/route.ts
app/src/app/api/derivations/[id]/copy-variants/route.test.ts
app/src/app/api/derivations/[id]/delivery-package/route.ts
app/src/app/api/derivations/[id]/delivery-package/route.test.ts
app/src/app/api/derivations/[id]/landing-page/route.ts
app/src/app/api/derivations/[id]/landing-page/route.test.ts
app/src/app/api/derivations/[id]/qa/route.ts
app/src/app/api/derivations/[id]/qa/route.test.ts
app/src/app/api/derivations/[id]/regenerate/route.ts
app/src/app/api/derivations/[id]/regenerate/route.test.ts
app/src/app/api/quick-tools/restyling/route.ts
app/src/app/api/restyling/route.ts
app/src/app/api/workspace/brand-kit/extract/route.ts
app/src/components/billing/ConversionCta.tsx
app/src/components/dashboard/MissionCreditBanner.tsx
app/src/components/workspace/DerivationGrid.tsx
app/src/components/workspace/DerivationPreviewGateFooter.tsx
app/src/lib/billing/conversion-client.ts
app/src/lib/billing/conversion-contract.test.ts
app/src/lib/billing/conversion-gate.test.ts
app/src/lib/billing/conversion-gate.ts
app/src/server/assistant/action-execution/handlers/create-creative-plan.ts
app/src/server/assistant/action-execution/handlers/create-creative-plan.test.ts
app/src/server/assistant/action-execution/handlers/quick-derivation-jobs.ts
app/src/server/assistant/action-execution/handlers/quick-regenerate-review.ts
app/src/server/assistant/action-execution/handlers/quick-restyle.ts
app/src/server/assistant/action-execution/handlers/revise-creative.ts
app/src/server/assistant/action-execution/handlers/revise-creative.test.ts
app/src/server/assistant/action-execution/handlers/start-complete-campaign.ts
app/src/server/billing/conversion.ts
app/src/server/billing/credits.ts
app/src/server/billing/gates.ts
app/src/server/billing/gates.test.ts
```

**PR 7 acceptance:** route handlers import `paywall.spend()` instead of `spendCreditsOrApiError` / `canSpend` / `buildConversionErrorPayloadForWorkspace`. Client twins are deletable only after `rg` confirms zero callers.

### PR 8 — Rate limit

Files importing `with-rate-limit` or `api-rate-limit-category`:

```
app/src/app/api/assistant/threads/[threadId]/chat/route.ts
app/src/app/api/assistant/threads/route.ts
app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts
app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.test.ts
app/src/app/api/campaigns/[id]/auto-briefing/route.ts
app/src/app/api/campaigns/[id]/auto-briefing/route.test.ts
app/src/app/api/campaigns/[id]/competitors/analyze/route.ts
app/src/app/api/campaigns/[id]/competitors/strategy/route.ts
app/src/app/api/campaigns/[id]/diagnosis/route.ts
app/src/app/api/campaigns/[id]/diagnosis/regenerate/route.ts
app/src/app/api/campaigns/[id]/plan/route.ts
app/src/app/api/campaigns/[id]/restyle/route.ts
app/src/app/api/campaigns/[id]/suggest-ctas/route.ts
app/src/app/api/creatives/[id]/persona-simulation/route.ts
app/src/app/api/derivations/[id]/copy-variants/route.ts
app/src/app/api/derivations/[id]/landing-page/route.ts
app/src/app/api/derivations/[id]/qa/route.ts
app/src/app/api/derivations/[id]/regenerate/route.ts
app/src/app/api/quick-tools/restyling/route.ts
app/src/app/api/restyling/route.ts
app/src/app/api/share/[token]/asset/[derivationId]/route.ts
app/src/app/api/workspace/brand-kit/extract/route.ts
app/src/lib/api-rate-limit-category.test.ts
app/src/proxy.ts
```

**PR 8 acceptance:** `with-rate-limit` and `api-rate-limit-category` imports are gone; `checkRateLimit(pathname, opts)` is the only entry. Proxy still loads the module in its runtime.

### PR 9 — Progression ↔ missions

Files touching `inferWorkspaceEvidence`, `PROGRESSION_TO_MISSION`, or `mission-credit-signals`:

```
app/src/app/(dashboard)/feedback/page.tsx
app/src/app/api/feedback/analytics/funnel/route.test.ts
app/src/app/api/feedback/mission-credit-signals/route.ts
app/src/server/beta-analytics/credit-signals.ts
app/src/server/feedback/mission-credit-signals.test.ts
app/src/server/progression/evidence.ts
app/src/server/progression/missions/evidence.ts
app/src/server/progression/missions/service.ts
app/src/server/progression/service.ts
```

**PR 9 acceptance (spike deliverable):** `app/docs/progression-missions-spike.md` exists, with canonical i18n shape and en/pt-BR coverage diff documented. No production code changes.

### PR 10 — Sanitizers

Files touching `SENSITIVE_KEY_PATTERN`, `DENIED_KEY_NAMES`, or `sanitize`:

```
app/src/server/beta-analytics/instrumentation.integration.test.ts
app/src/server/beta-analytics/record.ts
app/src/server/beta-analytics/record.test.ts
app/src/server/beta-analytics/sanitize.ts
app/src/server/beta-analytics/sanitize.test.ts
app/src/server/feedback/sanitize.ts
app/src/server/feedback/sanitize.test.ts
app/src/server/mission-insights/sanitize.ts
app/src/server/mission-insights/sanitize.test.ts
app/src/server/mission-insights/service.ts
```

**PR 10 acceptance:** common core exists; per-context policies preserved; regression tests for sensitive keys, arrays, and 32KB cap pass; old sanitizers either thin-wrap the core or are deleted only after `rg` confirms zero external use.

---

## 3. Visual snapshots at risk

PRs 2, 6, and 9 may touch user-visible strings. Components with snapshot tests in the current suite:

- `app/src/components/workspace/DerivationAutoRetryBadge.test.tsx` (PR 2)
- `app/src/components/workspace/DerivationReviewSheet.tsx` (PR 2)

If a snapshot diff appears, the PR description must explain why and link to the corresponding baseline change.

---

## 4. Per-PR acceptance checklist (reusable)

| PR | Acceptance command | Acceptance check |
| --- | --- | --- |
| 0  | — | This document exists; lint/typecheck/test pass on the new branch. |
| 1  | `rg "server/storage/r2" app/src` | Zero matches. |
| 2  | `rg "derivation-(auto-retry-badge\|formats\|quality\|regeneration-feedback\|review-display)" app/src` | Only matches against new `derivation-display.ts` and its test. |
| 3  | `npx vitest run app/src/server/ai/derivation-pipeline.test.ts` | Golden/snapshot test passes. |
| 4  | `npm test -- derivation derivation-pipeline` | All pass; golden test still passes without snapshot update. |
| 5  | `rg "auto-retry-on-text-failure" app/src/server/jobs/derivation.ts` | Inline retry block removed. |
| 6  | `npm test -- billing` | Pass with new paywall module. |
| 7  | `rg "spendCreditsOrApiError\|buildConversionErrorPayloadForWorkspace" app/src` | Zero matches. |
| 8  | `rg "with-rate-limit\|api-rate-limit-category" app/src` | Zero matches; `proxy.ts` still imports `checkRateLimit`. |
| 9  | `ls app/docs/progression-missions-spike.md` | File exists with i18n shape + key diff. |
| 10 | `npm test -- sanitize feedback beta-analytics mission-insights` | All pass. |

---

## 5. Stop conditions (carried over from plan)

If any of the following is hit during a follow-up PR, stop and report — do not "fix" by changing behavior to make tests pass:

1. Refactor requires a behavior change to pass.
2. New interface is larger/more confusing than the modules it absorbs.
3. A critical test has to be deleted instead of adjusted.
4. Public payload changes without an explicit decision.
5. Edge/server runtime gets ambiguous.
6. Client depends on a deleted contract.
7. A "view" candidate turns out to have independent product rules.
8. A deletion doesn't reduce real complexity.

---

*Captured 2026-06-30 by PR 0 of the [Architecture Refactor Plan](./architecture-refactor-plan.md). No production files modified.*