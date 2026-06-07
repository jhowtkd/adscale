# Phase 77 — Operator Session Artifacts

**Purpose:** Human evidence for SESS-03 (≥3 guided sessions) and SESS-04 (session artifacts with IDs and blockers).  
**Runbook:** `.planning/phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md`

---

## Session log template

Copy one block per operator session. Complete at least **3** happy-path sessions before Phase 78.

### Session N

| Field | Value |
|-------|-------|
| **Date** | YYYY-MM-DD |
| **Workspace ID** | |
| **Session ID** | |
| **Cohort label** | |
| **Assistance level** | hands_on / observe_only |
| **Started at** | |
| **Ended at** | |

#### Stages completed

| Stage | Completed | Notes | Tags | Blockers | Feedback report ID |
|-------|-----------|-------|------|----------|-------------------|
| setup | ☐ | | | | |
| readiness | ☐ | | | | |
| guided_briefing | ☐ | | | | |
| strategy_recipe | ☐ | | | | |
| preview | ☐ | | | | |
| batch | ☐ | | | | |
| review | ☐ | | | | |
| export | ☐ | | | | |
| share | ☐ | | | | |

#### Linked analytics

| Event IDs (sample) | |
|--------------------|---|
| Summary JSON URL | `GET /api/feedback/beta-sessions/{sessionId}/summary` |

#### Session outcome

- **Happy path:** ☐ yes ☐ partial ☐ no  
- **Blockers summary:**  
- **Follow-up actions:**  

---

## Example fixture (automated tests)

See `app/src/server/repositories/beta-sessions.fixture.ts` — `EXAMPLE_BETA_SESSION_FIXTURE` documents one complete happy-path session for test and operator reference.
