# Release Evidence — v11.6.1 Phase 66

**Captured:** 2026-06-05 (UTC)  
**Milestone:** v11.6.1 Ship Readiness  
**Requirements:** SHIP-02, SHIP-03

## Git reference

| Field | Value |
|-------|-------|
| `origin/main` (last push) | `c217bb2` — SHIP-03 cockpit ship-readiness refactor |
| Local HEAD | `c217bb2` |
| Target deploy ref | `c217bb2` or later deployment containing this commit |

## SHIP-03 — Post-review fixes and tests

| Fix | Status | Evidence |
|-----|--------|----------|
| Recipe selection sync on async readiness | ☑ | Committed `c217bb2` — `use-strategy-recipe.ts` derived selection + `strategyRecipeSession` reset key |
| Preflight force-rerun idempotency | ☑ | Committed `ec2f1a4` — `preflight:{campaign}:{asset}:force:{timestamp}` |
| Handoff credit accuracy | ☑ | Committed `ec2f1a4` — `65-HANDOFF.md` |
| Derivation flow tests (strategy_recipe entry) | ☑ | Committed `c217bb2` — `use-derivation-flow.test.ts` updated |

### Cockpit + review-fix test matrix (2026-06-05)

```bash
cd app
npm test -- \
  src/server/ai/creative-readiness.test.ts \
  src/server/ai/guided-briefing.test.ts \
  src/server/ai/strategy-recipes.test.ts \
  src/server/ai/client-approval-package.test.ts \
  src/server/ai/preview-gate.test.ts \
  src/server/ai/cockpit-path.test.ts \
  src/lib/hooks/use-strategy-recipe.test.tsx \
  src/lib/hooks/use-derivation-flow.test.ts \
  src/app/api/campaigns/\[id\]/assets/\[assetId\]/preflight/route.test.ts \
  src/components/workspace/CreativeReadinessPanel.test.tsx \
  src/components/workspace/GuidedBriefingPanel.test.tsx \
  src/components/workspace/StrategyRecipePanel.test.tsx \
  src/components/workspace/PreviewGatePanel.test.tsx \
  src/components/workspace/ClientApprovalPackagePanel.test.tsx
```

**Result:** 14 files, **69 tests passed**

### Lint and build

```bash
cd app && npm run lint   # 0 errors, 63 warnings (pre-existing)
cd app && npm run build # PASS (2026-06-05)
```

### Full suite note

Full `npm test` reports **1 pre-existing failure** unrelated to cockpit path:

- `tests/unit/ai/creative-quality-gate-orchestration.test.ts` — mock assertion drift on `updateDerivationScore` (795/797 pass). Track separately; not a v11.6.1 ship blocker for cockpit beta.

## SHIP-02 — Deploy verification checklist

| Check | Agent | Operator | Notes |
|-------|-------|----------|-------|
| App URL reachable | ☐ blocked | ☐ pending | DNS failed from agent: `adscale.jhonatansoares.com` |
| `/api/health` 200 | ☐ blocked | ☐ pending | Run after deploy |
| Deployed git SHA matches release | — | ☐ pending | Render dashboard / `git rev-parse` on service |
| Migration `0027_fine_morlun.sql` applied | — | ☐ pending | Run `npm run db:migrate` in Render shell if not auto-applied |
| Required env vars present | — | ☐ pending | OpenAI, storage, DB, Stripe/billing as per existing deploy |
| Post-deploy smoke ref updated | ☑ prep | ☐ pending | `65-SMOKE-EVIDENCE.md` now targets `c217bb2`; confirm deployed SHA after deploy |

## SHIP-01 — Browser smoke

Operator completes 17 steps in `.planning/phases/65-verification-analytics-and-handoff/65-SMOKE-EVIDENCE.md`.

**Status:** pending operator sign-off

## Verdict (automated portion)

| Requirement | Automated status |
|-------------|------------------|
| SHIP-03 | **PASS** (committed and pushed as `c217bb2`) |
| SHIP-02 | **PARTIAL** — checklist ready; live verification blocked from agent |
| SHIP-01 | **PENDING** — operator browser smoke |
