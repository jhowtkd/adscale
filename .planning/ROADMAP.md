# Roadmap: ADScale

## Milestones

- 🎯 **v11.8 Loop de Aprendizado Beta** - Phases 75-79 (planning)
- ✅ **v11.7.1 Stabilization** - Phases 72-74 (shipped 2026-06-07)
- ✅ **v11.7 Ads Scientist Progression** - Phases 68-71 (shipped 2026-06-06)
- ✅ **v11.6.1 Ship Readiness and Beta Activation** - Phases 66-67 (shipped 2026-06-06)
- ✅ **v11.6 Creative Strategy Cockpit** - Phases 61-65 (shipped 2026-06-06)
- ✅ **v11.5 Qualidade IA Orientada por Feedback** - Phases 57-60 (shipped 2026-06-05)
- ✅ **v11.4 Beta Feedback Capture** - Phases 53-56 (shipped 2026-06-05)
- ✅ **v11.3 Site de Apresentação Separado** - Phases 50-52 (shipped 2026-06-03)
- ✅ **v11.2 Beta Access and Credit Entitlements** - Phase 49 (shipped 2026-06-03)
- ✅ **v11.1 Qualidade de Geração e Contratos Criativos** - Phases 44-48 (shipped 2026-06-01)
- ✅ **v11.0 Fluxos de Derivação Coerentes** - Phases 40-43 (shipped 2026-06-01)

## Phases

### 🎯 v11.8 Loop de Aprendizado Beta (Phases 75-79)

**v11.8 Beta Learning Loop** — operator-run sessions, full instrumentation, owner funnel analytics, and evidence-driven friction fixes.

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 75 | Event Schema and Ingest Foundation | 3/3 | Complete   | 2026-06-07 |
| 76 | Cockpit and Mission Instrumentation | 2/4 | In Progress|  |
| 77 | Operator Beta Sessions | Runbook-guided sessions with structured operator notes | SESS-01, SESS-02, SESS-03, SESS-04 | 5 |
| 78 | Owner Analytics Dashboard and CSV | Funnel views, credit/readiness signals, export | DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, LEARN-01, LEARN-02, QA-02 | 6 |
| 79 | Evidence-Driven Friction Fixes | Ship ≤5 proven fixes and finalize learning gate | FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, LEARN-03, QA-03 | 5 |

**26 requirements** | **5 phases** | Learn before build — no speculative features

### ✅ v11.7.1 Stabilization (Phases 72-74) — SHIPPED 2026-06-07

**v11.7.1 Stabilization** — beta-readiness hardening for the v11.7 progression loop.

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 72 | Build and Data Integrity Hardening | Restore production build and make progression/insight persistence conflict-safe | STAB-01, STAB-02, DATA-01, DATA-02, DATA-03 | 5 ✅ |
| 73 | Mission Resume UX | Make mission/progression CTAs resume into the intended campaign workflow surface | UX-01, UX-02 | 4 ✅ |
| 74 | Migration, UAT, and Beta Handoff | Apply/verify progression migration and complete beta UAT evidence | STAB-03, STAB-04, UAT-01, UAT-02, UAT-03 | 5 ✅ |

**12 requirements** | **3 phases** | Stabilization-only scope before beta

## Phase Details

### Phase 75: Event Schema and Ingest Foundation

**Goal:** Create the durable event layer for beta learning without third-party analytics.

**Requirements:** INST-01, INST-05, INST-06

**Plans:** 3 plans

Plans:
- [x] 75-01-PLAN.md — Schema, migration, and beta-analytics repository
- [x] 75-02-PLAN.md — Allowlist-only property sanitization (PII-safe)
- [x] 75-03-PLAN.md — recordBetaAnalyticsEvent + POST /api/analytics/events

**Success Criteria:**
1. `beta_analytics_events` and `beta_sessions` tables exist with Drizzle migration applied.
2. `POST /api/analytics/events` validates workspace membership and sanitizes property allowlist.
3. Disallowed properties (prompts, emails, free-text) are rejected with tests.
4. Events are queryable by `workspace_id`, `session_id`, `event_key`, and timestamp.

**Depends on:** v11.7.1 stabilization shipped; existing feedback sanitization patterns.

### Phase 76: Cockpit and Mission Instrumentation

**Goal:** Emit authoritative funnel signals across cockpit stages, missions, and credit boundaries.

**Requirements:** INST-02, INST-03, INST-04, QA-01

**Plans:** 4 plans

Plans:
- [x] 76-01-PLAN.md — Event taxonomy, enum validation, and session ID plumbing
- [ ] 76-02-PLAN.md — Server instrumentation (readiness, credits, mission_completed)
- [x] 76-03-PLAN.md — Client cockpit panel stage events via useRecordBetaEvent
- [ ] 76-04-PLAN.md — Integration tests and beta_session session_id smoke (QA-01)

**Success Criteria:**
1. Server records events on readiness block, credit spend, and mission completion.
2. Client records briefing, recipe, and preview gate complete/abandon transitions.
3. Events can be grouped under an active `beta_session` for the target workspace.
4. Integration tests prove events on readiness block and mission completion paths.
5. Instrumentation smoke shows events in DB before operator session 1.

**Depends on:** Phase 75.

### Phase 77: Operator Beta Sessions

**Goal:** Execute 3–5 operator-guided beta sessions with structured evidence per runbook stage.

**Requirements:** SESS-01, SESS-02, SESS-03, SESS-04

**Success Criteria:**
1. Operator can start/end sessions and attach per-stage notes tied to `67-BETA-RUNBOOK.md`.
2. At least 3 complete happy-path sessions are documented with workspace and session IDs.
3. Session artifacts capture blockers, stage completion, and links to feedback reports where filed.
4. Sessions run only after Phase 76 instrumentation smoke passes.
5. Session summary artifact exists for dashboard and learning phases.

**Depends on:** Phase 76.

### Phase 78: Owner Analytics Dashboard and CSV

**Goal:** Give the platform owner actionable funnel views and export without a BI stack.

**Requirements:** DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, LEARN-01, LEARN-02, QA-02

**Success Criteria:**
1. Owner sees mission conversion funnel and cockpit stage funnel on `/feedback` analytics surface.
2. Credit surprise and readiness override signals are visible with session context.
3. CSV export matches on-screen funnel totals for the selected date/session filter.
4. Non-platform-owner users receive 403 on analytics and export routes.
5. Draft learning-answers document addresses all 10 questions with data citations from sessions.
6. Owner can correlate frustration signals with existing feedback triage list.

**Depends on:** Phases 75–77 (events and sessions must exist).

### Phase 79: Evidence-Driven Friction Fixes

**Goal:** Ship up to 5 surgical fixes ranked by session evidence and close the v11.8 learning gate.

**Requirements:** FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, LEARN-03, QA-03

**Success Criteria:**
1. Ranked friction backlog exists with frequency/impact scores from session data.
2. Up to 5 fixes ship, each citing session/event evidence — no new AI models or cockpit modules.
3. Each fix has regression test or verification artifact.
4. Deferred issues are captured in v11.9 backlog document.
5. Learning-answers doc finalizes v11.9 direction per `67-LEARNING-QUESTIONS.md` decision gate.

**Depends on:** Phases 77–78.

### Phase 72: Build and Data Integrity Hardening

**Goal:** Restore a clean production build and harden the v11.7 data boundaries found in review.

**Requirements:** STAB-01, STAB-02, DATA-01, DATA-02, DATA-03

**Success Criteria:**
1. `npm run build` passes without disabling Next.js TypeScript checks.
2. The missing `mission` feedback category handling is fixed where exhaustive category maps are used.
3. Mission insight sanitization rejects invalid `missionKey` values before recording feedback.
4. Progression snapshot persistence uses an atomic upsert or conflict-safe equivalent.
5. Focused tests cover invalid mission keys, progression persistence conflict behavior, and existing progression/missions/insights behavior.

**Depends on:** v11.7 review findings and current feedback/progression infrastructure.

### Phase 73: Mission Resume UX

**Goal:** Make activation CTAs keep their promise by landing users on the right workflow context.

**Requirements:** UX-01, UX-02

**Success Criteria:**
1. Campaign workspace consumes mission/progression resume targets or uses a route contract it already supports.
2. CTAs for assets, readiness, review, export, and share open the intended surface or state.
3. Default campaign workspace behavior is unchanged when no resume target is present.
4. Focused tests or browser smoke evidence prove the resume path for at least two representative mission CTAs.

**Depends on:** Phase 72 build health.

### Phase 74: Migration, UAT, and Beta Handoff

**Goal:** Prove the stabilized v11.7 loop is beta-ready in the target environment.

**Requirements:** STAB-03, STAB-04, UAT-01, UAT-02, UAT-03

**Success Criteria:**
1. Migration `0032_workspace_progression.sql` is applied and verified in the target environment.
2. UAT follows `.planning/phases/71-credit-activation-and-verification/71-UAT-EVIDENCE.md` from a fresh workspace.
3. Evidence covers build, migration, mission progress, insight capture, credit display, and owner triage.
4. Remaining caveats are documented explicitly as fixed, accepted, or deferred.
5. Handoff states whether v11.7.1 is beta-ready and what the next operator action is.

**Depends on:** Phases 72-73.

## Completed Milestone Context

<details>
<summary>✅ v11.7 Ads Scientist Progression (Phases 68-71) - SHIPPED 2026-06-06</summary>

- [x] Phase 68: Progression Foundation (2/2 plans)
- [x] Phase 69: Guided Mission Experience (2/2 plans)
- [x] Phase 70: Mission-Linked Insight Capture (2/2 plans)
- [x] Phase 71: Credit Activation and Verification (2/2 plans)

Archive context: phases 68-71 in `.planning/phases/`. Verification: `71-VERIFICATION.md`; UAT: `71-UAT-EVIDENCE.md`.

</details>

<details>
<summary>✅ v11.6.1 Ship Readiness and Beta Activation (Phases 66-67) - SHIPPED 2026-06-06</summary>

- [x] Phase 66: Production Smoke and Release Evidence (2/2 plans)
- [x] Phase 67: Milestone Archive and Beta Runbook (1/1 plans)

Archive context: `.planning/phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md` and `.planning/phases/67-milestone-archive-and-beta-runbook/67-LEARNING-QUESTIONS.md`.

</details>

<details>
<summary>✅ v11.6 Creative Strategy Cockpit (Phases 61-65) - SHIPPED 2026-06-06</summary>

- [x] Phase 61: Creative Readiness Foundation (2/2 plans)
- [x] Phase 62: Guided Briefing Cockpit (2/2 plans)
- [x] Phase 63: Strategy Recipes and Preview Gate (2/2 plans)
- [x] Phase 64: Client Approval Package (2/2 plans)
- [x] Phase 65: Verification, Analytics, and Handoff (2/2 plans)

Archive: [v11.6-ROADMAP.md](milestones/v11.6-ROADMAP.md) · [v11.6-REQUIREMENTS.md](milestones/v11.6-REQUIREMENTS.md) · [v11.6-MILESTONE-AUDIT.md](milestones/v11.6-MILESTONE-AUDIT.md) · [v11.6-phases/](milestones/v11.6-phases/)

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
| 75 | v11.8 | 0/0 | Not started | — |
| 76 | v11.8 | 0/0 | Not started | — |
| 77 | v11.8 | 0/0 | Not started | — |
| 78 | v11.8 | 0/0 | Not started | — |
| 79 | v11.8 | 0/0 | Not started | — |
| 72 | v11.7.1 | 2/2 | Complete | 2026-06-07 |
| 73 | v11.7.1 | 1/1 | Complete | 2026-06-07 |
| 74 | v11.7.1 | 1/1 | Complete | 2026-06-07 |
| 68 | v11.7 | 2/2 | Complete | 2026-06-06 |
| 69 | v11.7 | 2/2 | Complete | 2026-06-06 |
| 70 | v11.7 | 2/2 | Complete | 2026-06-06 |
| 71 | v11.7 | 2/2 | Complete | 2026-06-06 |
| 66 | v11.6.1 | 2/2 | Complete | 2026-06-06 |
| 67 | v11.6.1 | 1/1 | Complete | 2026-06-06 |
| 61 | v11.6 | 2/2 | Complete | 2026-06-05 |
| 62 | v11.6 | 2/2 | Complete | 2026-06-05 |
| 63 | v11.6 | 2/2 | Complete | 2026-06-05 |
| 64 | v11.6 | 2/2 | Complete | 2026-06-05 |
| 65 | v11.6 | 2/2 | Complete | 2026-06-05 |
| 57 | v11.5 | 2/2 | Complete | 2026-06-05 |
| 58 | v11.5 | 2/2 | Complete | 2026-06-05 |
| 59 | v11.5 | 4/4 | Complete | 2026-06-05 |
| 60 | v11.5 | 4/4 | Complete | 2026-06-05 |

---
*Roadmap updated: 2026-06-07 after v11.8 milestone initialization*
