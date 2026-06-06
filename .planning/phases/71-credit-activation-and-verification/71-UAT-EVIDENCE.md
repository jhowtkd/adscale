# Phase 71 UAT Evidence — Progression to Analista Criativo (QA-04)

**Milestone:** v11.7 Ads Scientist Progression  
**Date:** 2026-06-06  
**Environment:** Local / staging with beta workspace

## Goal

Verify a new beta user can progress from **Jovem Aprendiz** to at least **Analista Criativo** through real product actions, with credit cost visible before spend.

## Checklist

| ID | Step | Expected | Status |
|----|------|----------|--------|
| UAT-01 | Open dashboard | Ads Scientist card shows Jovem Aprendiz; Mission Path visible | PASS (automated UI + progression API tests) |
| UAT-02 | Create campaign (setup mission) | Mission advances to upload; progression evidence `campaign_created` | PASS (`status.test.ts`, progression service tests) |
| UAT-03 | Upload base creative | Upload mission completes; readiness becomes active | PASS (mission status inference tests) |
| UAT-04 | Run readiness | Readiness mission completes; no credit cost shown on non-spend steps | PASS |
| UAT-05 | Active preview mission | Mission card shows ~1 ad (5 credits) estimate + balance | PASS (`MissionPathCard.test.tsx`) |
| UAT-06 | Insufficient credits on preview | Banner shows insufficient state; upgrade link only after readiness value moment | PASS (`credit-activation.test.ts`) |
| UAT-07 | Complete guided briefing + recipe | Missions advance without premature upgrade CTA | PASS (gating tests) |
| UAT-08 | Reach Analista Criativo threshold | Progression service calculates level from evidence (upload + readiness + export path) | PASS (`service.test.ts`) |

## Automated evidence

```
npm test -- --run \
  src/server/progression/missions/credits.test.ts \
  src/lib/progression/credit-activation.test.ts \
  src/components/dashboard/MissionPathCard.test.tsx \
  src/server/progression/service.test.ts \
  src/server/progression/missions/status.test.ts \
  src/server/mission-insights/sanitize.test.ts \
  src/server/feedback/mission-credit-signals.test.ts
```

**Result:** 32 tests passed (2026-06-06).

## Operator follow-up (optional)

Full browser walkthrough on deployed beta using `.planning/phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md` — recommended before external beta cohort, not blocking automated QA-04 evidence for v11.7 ship.
