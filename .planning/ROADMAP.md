# Roadmap: ADScale

## Milestones

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

Production ref: `ba535de`. Smoke evidence: `milestones/v11.6-phases/65-verification-analytics-and-handoff/65-SMOKE-EVIDENCE.md`.

</details>

### ✅ v11.7 Ads Scientist Progression (Phases 68-71) — SHIPPED 2026-06-06

**v11.7 Ads Scientist Progression** — all phases complete.

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 68 | Progression Foundation | Persist and calculate Ads Scientist levels from real workspace actions | PROG-01..05 | 5 ✅ |
| 69 | Guided Mission Experience | Teach the core workflow through resumable missions and contextual learning copy | MISS-01..06 | 5 ✅ |
| 70 | Mission-Linked Insight Capture | Capture structured insight at mission moments | INS-01..05 | 5 ✅ |
| 71 | Credit Activation and Verification | 1/2 | In Progress|  |

**24 requirements** | **4 phases** | Balanced activation, insight, and monetization scope

## Phase Details

### Phase 68: Progression Foundation

**Goal:** Establish the durable status ladder and completion model that the rest of the milestone can build on.

**Requirements:** PROG-01, PROG-02, PROG-03, PROG-04, PROG-05

**Success Criteria:**
1. Workspace has persisted progression state that survives refresh and login/logout.
2. The system can derive progress from real product actions rather than page visits.
3. The user sees a current level and next-level requirements in a visible but non-disruptive place.
4. Level names and thresholds match the v11.7 product language: Jovem Aprendiz, Analista Criativo, Estrategista de Ads, Cientista de Ads.
5. Repository/service tests prove level calculation and workspace isolation.

**Depends on:** Existing user/workspace model and beta access foundation.

### Phase 69: Guided Mission Experience

**Goal:** Turn the existing cockpit and creative workflow into a guided mission path that teaches by doing.

**Requirements:** MISS-01, MISS-02, MISS-03, MISS-04, MISS-05, MISS-06

**Success Criteria:**
1. User can open a mission list and understand the recommended path through ADScale.
2. Mission completion covers setup, upload, readiness, guided briefing, strategy recipe, preview, batch, review, regeneration, export, and share.
3. Mission CTAs resume the user directly into the relevant app surface.
4. Learning copy explains the purpose of each action in practical ad-creation language.
5. Mission UI has polished empty/loading/completed/blocked states and does not break the cockpit flow.

**Depends on:** Phase 68 progression state.

### Phase 70: Mission-Linked Insight Capture

**Goal:** Capture product learning at the moments where beta behavior is most informative.

**Requirements:** INS-01, INS-02, INS-03, INS-04, INS-05

**Success Criteria:**
1. Lightweight prompts appear after key mission moments without blocking the primary workflow.
2. Insight records include stage, mission, sentiment, structured reason, optional text, and safe diagnostic context.
3. Rejection, skip, abandonment, and credit-friction events become owner-visible signals.
4. Owner can review mission-linked insight from the existing feedback/triage path or an adjacent owner view.
5. Sanitization tests prove secrets, raw prompts, and unrelated user content are not captured.

**Depends on:** Phase 69 mission events and existing feedback infrastructure.

### Phase 71: Credit Activation and Verification

**Goal:** Make credit consumption understandable and commercially useful while verifying the full progression loop.

**Requirements:** CRED-01, CRED-02, CRED-03, CRED-04, QA-01, QA-02, QA-03, QA-04

**Success Criteria:**
1. Credit-consuming missions show expected cost and remaining allowance before generation starts.
2. Upgrade/top-up prompts appear only after clear value moments or true insufficiency.
3. Owner can separate healthy credit consumption from frustration using mission and insight data.
4. Automated tests cover progression rules, insight capture, credit display, and insufficient-credit states.
5. Beta UAT evidence proves a new user can reach at least Analista Criativo through real app actions.

**Depends on:** Phases 68-70.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
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
*Roadmap updated: 2026-06-06 after v11.7 milestone initialization*
