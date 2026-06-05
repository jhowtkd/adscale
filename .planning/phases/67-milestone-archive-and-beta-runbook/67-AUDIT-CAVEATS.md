# v11.6 Audit Caveats — Resolution Register (SHIP-04)

**Audit:** `.planning/v11.6-MILESTONE-AUDIT.md` (`passed_with_caveats`)  
**Updated:** 2026-06-05 (phase 67)

| # | Caveat | Status | Owner | Evidence / next action |
|---|--------|--------|-------|------------------------|
| 1 | CQA-02 operator browser smoke | **OPEN** | Operator | Complete `65-SMOKE-EVIDENCE.md` after deploy; blocks ship |
| 2 | Untracked `62-production-deploy-and-smoke-verification/` scaffold | **CARRIED** | Maintainer | Ignore in commits; delete locally or reconcile in separate chore |
| 3 | Milestone archive not run | **OPEN** | GSD | Run `/gsd-complete-milestone v11.6` after caveat #1 resolved |
| 4 | Full Playwright E2E | **DEFERRED** | Product | Checklist smoke sufficient for beta; E2E in future requirements |
| 5 | Pre-existing test failure (`creative-quality-gate-orchestration`) | **CARRIED** | Engineering | 795/797 pass; fix outside v11.6.1 unless blocking deploy CI |

## SHIP-04 verdict

Caveats **documented with owners**. Ship blocker: **#1 only**. Archive blocker: **#1 and #3**.

## Archive checklist (SHIP-05 — pending smoke)

When SHIP-01 passes:

```bash
# From repo root after operator smoke sign-off
/gsd-complete-milestone v11.6
```

Expected artifacts in `.planning/milestones/`:

- `v11.6-ROADMAP.md`
- `v11.6-REQUIREMENTS.md`
- `v11.6-MILESTONE-AUDIT.md`
- `v11.6-phases/` (61–65 directories)

Preserve release evidence:

- `65-SMOKE-EVIDENCE.md` (signed)
- `66-RELEASE-EVIDENCE.md`
- `67-BETA-RUNBOOK.md`
