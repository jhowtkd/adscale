# Release Evidence — v11.6.1 Phase 66

**Captured:** 2026-06-05 (UTC)  
**Milestone:** v11.6.1 Ship Readiness  
**Requirements:** SHIP-02, SHIP-03

## Git reference

| Field | Value |
|-------|-------|
| Smoke target (includes SHIP-03) | `c217bb2` (minimum) |
| Docs refresh | `41de146` |
| **Live Render deploy** | `03a9dde` (2026-06-05T23:55 UTC) — superset of above + Render build/migration fixes |

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

## SHIP-02 — Deploy verification checklist (2026-06-05 operator gate)

| Check | Status | Evidence |
|-------|--------|----------|
| Render deploy live | **PASS** | `render deploys list` → `live` at `03a9dde` |
| Deploy includes SHIP-03 | **PASS** | `03a9dde` ancestry includes `c217bb2` + `41de146` |
| App URL reachable (agent) | **BLOCKED** | DNS NXDOMAIN from agent sandbox; Render reports `https://adscale.jhonatansoares.com` live |
| `/api/health` 200 (agent) | **BLOCKED** | Same DNS; operator verify locally |
| Migration `0027` applied | **PENDING** | Live deploy used `npm start` only — run `npm run db:migrate` in [Render Shell](https://dashboard.render.com/web/srv-d8goos77f7vs73f1k5eg) before cockpit smoke |
| Required env vars | **ASSUMED** | Prior live deploy; no missing-env errors in startup logs |
| onrender.com subdomain | **N/A** | `x-render-routing: blocked-render-subdomain` — use custom domain only |

## SHIP-01 — Browser smoke

Operator completes 17 steps in `.planning/phases/65-verification-analytics-and-handoff/65-SMOKE-EVIDENCE.md`.

**Status:** pending operator sign-off

## Verdict (automated portion)

| Requirement | Automated status |
|-------------|------------------|
| SHIP-03 | **PASS** (committed and pushed as `c217bb2`) |
| SHIP-02 | **PARTIAL** — deploy live; health/migration need operator confirmation |
| SHIP-01 | **PENDING** — operator browser smoke |
