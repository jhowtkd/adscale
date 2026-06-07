# Roadmap: ADScale

## Milestones

- 🔄 **v11.7.1 Stabilization** - Phases 72-74 (active)
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

### 🔄 v11.7.1 Stabilization (Phases 72-74) — ACTIVE

**v11.7.1 Stabilization** — beta-readiness hardening for the v11.7 progression loop.

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 72 | Build and Data Integrity Hardening | Restore production build and make progression/insight persistence conflict-safe | STAB-01, STAB-02, DATA-01, DATA-02, DATA-03 | 5 |
| 73 | Mission Resume UX | Make mission/progression CTAs resume into the intended campaign workflow surface | UX-01, UX-02 | 4 |
| 74 | Migration, UAT, and Beta Handoff | Apply/verify progression migration and complete beta UAT evidence | STAB-03, STAB-04, UAT-01, UAT-02, UAT-03 | 5 |

**12 requirements** | **3 phases** | Stabilization-only scope before beta

## Phase Details

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
| 72 | v11.7.1 | 0/0 | Planned | - |
| 73 | v11.7.1 | 0/0 | Planned | - |
| 74 | v11.7.1 | 0/0 | Planned | - |
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
*Roadmap updated: 2026-06-06 after v11.7.1 milestone initialization*
