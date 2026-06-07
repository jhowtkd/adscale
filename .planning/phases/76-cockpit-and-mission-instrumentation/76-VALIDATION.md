---
phase: 76
slug: cockpit-and-mission-instrumentation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-07
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for instrumentation and integration-test feedback during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 + eslint |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/beta-analytics/record.test.ts` |
| **Phase command** | `cd app && npm test -- src/server/beta-analytics src/app/api/analytics/events src/app/api/campaigns src/app/api/exports src/components/workspace/CreativeReadinessPanel.test.tsx src/components/workspace/GuidedBriefingPanel.test.tsx src/components/workspace/StrategyRecipePanel.test.tsx src/components/workspace/PreviewGatePanel.test.tsx` |
| **Full suite command** | `cd app && npm test && npm run lint` |
| **Estimated runtime** | ~90 seconds (focused), ~3 min (full) |

---

## Sampling Rate

- **After every task commit:** Run the focused test command for files touched by that task.
- **After every plan wave:** Run the phase command.
- **Before Phase 77 operator sessions:** Run phase command plus manual DB smoke (≥1 server + ≥1 client event with session_id).
- **Max feedback latency:** 90 seconds for focused tests.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 76-01-01 | 01 | 1 | INST-02/03 | unit | `cd app && npm test -- src/server/beta-analytics/record.test.ts` | ✅ | ⬜ pending |
| 76-01-02 | 01 | 1 | INST-04 | unit | `cd app && npm test -- src/app/api/analytics/events/route.test.ts` | ✅ | ⬜ pending |
| 76-02-01 | 02 | 2 | INST-02 | route | `cd app && npm test -- src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.test.ts` | ✅ | ⬜ pending |
| 76-02-02 | 02 | 2 | INST-02 | unit | `cd app && npm test -- src/server/billing/credits.test.ts src/server/billing/gates.test.ts` | ✅ | ⬜ pending |
| 76-02-03 | 02 | 2 | INST-02 | route | `cd app && npm test -- src/app/api/exports/route.test.ts src/app/api/share/route.test.ts` | ❌ W0 | ⬜ pending |
| 76-03-01 | 03 | 2 | INST-03 | unit | `cd app && npm test -- src/lib/hooks/use-record-beta-event.test.ts` | ❌ W0 | ⬜ pending |
| 76-03-02 | 03 | 2 | INST-03 | component | `cd app && npm test -- src/components/workspace/GuidedBriefingPanel.test.tsx src/components/workspace/StrategyRecipePanel.test.tsx` | ✅ | ⬜ pending |
| 76-03-03 | 03 | 2 | INST-03 | component | `cd app && npm test -- src/components/workspace/CreativeReadinessPanel.test.tsx src/components/workspace/PreviewGatePanel.test.tsx` | ✅ | ⬜ pending |
| 76-04-01 | 04 | 3 | QA-01 | integration | `cd app && npm test -- src/server/beta-analytics/instrumentation.integration.test.ts` | ❌ W0 | ⬜ pending |
| 76-04-02 | 04 | 3 | INST-04 | integration | `cd app && npm test -- src/server/beta-analytics/instrumentation.integration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/server/beta-analytics/instrumentation.integration.test.ts` — QA-01 readiness + mission completion + session_id smoke
- [ ] `src/lib/hooks/use-record-beta-event.ts` + `.test.ts` — client fire-and-forget hook
- [ ] `src/app/api/exports/route.test.ts` — mission_completed on export success (create if missing)
- [ ] `src/app/api/share/route.test.ts` — mission_completed on share success (create if missing)
- [ ] `PHASE_76_BETA_EVENT_KEYS` closed enum in `types.ts` with `recordBetaAnalyticsEvent` rejection tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Instrumentation smoke before operator session 1 | QA-01 / Success Criterion 5 | Confirms real DB insert path | After phase complete, run one preflight POST in dev; `SELECT event_key, session_id FROM beta_analytics_events ORDER BY created_at DESC LIMIT 5` |
| Client event reaches DB | INST-03 | Browser sessionStorage | Open campaign workspace, open guided briefing panel; confirm `cockpit_stage_entered` row in DB |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing test file references.
- [x] No watch-mode flags.
- [x] Feedback latency target < 90s for focused runs.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** draft — pending execution
