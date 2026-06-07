# Phase 74 UAT Evidence — v11.7.1 Stabilization Beta Readiness

**Milestone:** v11.7.1 Stabilization  
**Date:** 2026-06-07  
**Environment:** Local CI / staging (operator apply required for live migration)

## Goal

Verify the stabilized v11.7 progression loop is beta-ready: clean build, data integrity, mission resume UX, and progression-to-Analista path from Phase 71 remain green.

## Stabilization Checklist (v11.7.1)

| ID | Step | Expected | Status |
|----|------|----------|--------|
| S-01 | `npm run build` | Passes with TypeScript checks | PASS |
| S-02 | `npm run lint` | 0 errors | PASS (64 pre-existing warnings) |
| S-03 | Mission insight invalid key rejection | API returns validation failure | PASS (`sanitize.test.ts`) |
| S-04 | Progression atomic upsert | Conflict-safe first access | PASS (`progression.test.ts`) |
| S-05 | Mission CTA href contract | Upload→assets, export→export tab | PASS (`hrefs.test.ts`) |
| S-06 | Campaign deep-link routing | Readiness→pilot, review→actions | PASS (`deep-link-tab.test.ts`) |
| S-07 | Migration artifact | `0032_workspace_progression.sql` in journal + schema aligned | PASS (in-repo) |
| S-08 | Live migration apply | `workspace_progression` table in target DB | OPERATOR (see below) |

## Phase 71 Progression Path (Regression)

| ID | Step | Expected | Status |
|----|------|----------|--------|
| UAT-01 | Dashboard progression card | Jovem Aprendiz visible | PASS (automated) |
| UAT-02 | Setup mission | Campaign created evidence | PASS |
| UAT-03 | Upload mission | Readiness becomes active | PASS |
| UAT-04 | Readiness mission | No credit on non-spend steps | PASS |
| UAT-05 | Preview mission credit estimate | ~1 ad (5 credits) shown | PASS |
| UAT-06 | Insufficient credits banner | Gated upgrade link | PASS |
| UAT-07 | Guided briefing + recipe | Missions advance | PASS |
| UAT-08 | Analista Criativo threshold | Level from evidence | PASS |

## Automated Evidence

```bash
cd app && npm run build
cd app && npm run lint
cd app && npm test -- \
  src/server/progression \
  src/server/repositories/progression \
  src/app/api/workspace/progression \
  src/lib/hooks/use-progression \
  src/components/dashboard/AdsScientistProgressCard \
  src/app/api/workspace/missions \
  src/lib/hooks/use-missions \
  src/components/dashboard/MissionPathCard \
  src/app/api/workspace/mission-insights \
  src/server/mission-insights \
  src/lib/progression \
  src/server/feedback/mission-credit-signals \
  src/lib/campaign/deep-link-tab \
  src/server/progression/missions/hrefs
```

**Result (2026-06-07):**

- Build: passed
- Lint: 0 errors, 64 warnings
- Test files: 16 passed
- Tests: 51 passed

## Operator Follow-up (Required Before External Beta)

1. **Apply migration on Render/staging:**
   ```bash
   cd app && npm run db:migrate
   ```
2. **Verify table exists:**
   ```sql
   SELECT count(*) FROM adscale_app.workspace_progression;
   ```
3. **Optional browser walkthrough:** `.planning/phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md` plus mission resume smoke (click upload + export CTAs, confirm correct workspace surface).

## Accepted Caveats

| Caveat | Status |
|--------|--------|
| 64 lint warnings | Accepted (pre-existing cleanup debt) |
| `creative-quality-gate-orchestration.test.ts` drift (795/797) | Deferred (non-blocking, untouched) |
| Full E2E Ads Scientist path | Deferred to future requirement |
| Live migration apply | Operator-gated |

## Verdict

**v11.7.1 is beta-ready after operator applies migration `0032_workspace_progression.sql` in the target environment.**
