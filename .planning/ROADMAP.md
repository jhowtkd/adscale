# Roadmap: ADScale

## Milestones

- 📋 **v11.6.1 Ship Readiness and Beta Activation** - Phases 66-67 (partial — v11.6 archived 2026-06-06)
- ✅ **v11.6 Creative Strategy Cockpit** - Phases 61-65 (shipped 2026-06-06)
- ✅ **v11.5 Qualidade IA Orientada por Feedback** - Phases 57-60 (shipped 2026-06-05)
- ✅ **v11.4 Beta Feedback Capture** - Phases 53-56 (shipped 2026-06-05)
- ✅ **v11.3 Site de Apresentação Separado** - Phases 50-52 (shipped 2026-06-03)
- ✅ **v11.2 Beta Access and Credit Entitlements** - Phase 49 (shipped 2026-06-03)
- ✅ **v11.1 Qualidade de Geração e Contratos Criativos** - Phases 44-48 (shipped 2026-06-01)
- ✅ **v11.0 Fluxos de Derivação Coerentes** - Phases 40-43 (shipped 2026-06-01)

## Phases

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

<details>
<summary>✅ v11.5 Qualidade IA Orientada por Feedback (Phases 57-60) - SHIPPED 2026-06-05</summary>

- [x] Phase 57: Creative Contract and Prompt Provenance (2/2 plans)
- [x] Phase 58: Scoring and QA Alignment (2/2 plans)
- [x] Phase 59: Feedback-Informed Regeneration (4/4 plans)
- [x] Phase 60: Quality Fixtures and Verification (4/4 plans)

Archive: [v11.5-ROADMAP.md](milestones/v11.5-ROADMAP.md) · [v11.5-REQUIREMENTS.md](milestones/v11.5-REQUIREMENTS.md) · [v11.5-MILESTONE-AUDIT.md](milestones/v11.5-MILESTONE-AUDIT.md) · [v11.5-phases/](milestones/v11.5-phases/)

</details>

### 📋 Current Milestone

**v11.6.1 Ship Readiness and Beta Activation** starts at Phase 66.

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 66 | Production Smoke and Release Evidence | Prove the deployed cockpit path and release prerequisites | SHIP-01..03 | 5 |
| 67 | Milestone Archive and Beta Runbook | Resolve audit caveats, archive v11.6, and prepare beta operation | SHIP-04..05, BETA-01..03 | 5 |

**8 requirements** | **2 phases** | Release-readiness scope only

## Phase Details

### Phase 66: Production Smoke and Release Evidence

**Goal:** Verify the implemented v11.6 cockpit in a deployed environment and capture enough evidence to decide whether it is beta-shippable.

**Requirements:** SHIP-01, SHIP-02, SHIP-03

**Success Criteria:**
1. Operator runs the full cockpit smoke checklist on staging or production.
2. Evidence records deployed git ref, app URL, operator, date, pass/fail result, and notes for every smoke step.
3. Health, environment inventory, and migration/schema readiness are verified or blocked with exact evidence.
4. Post-review fixes for recipe selection, preflight rerun billing, and handoff accuracy are included in the tested release.
5. Focused tests plus lint/build evidence are attached or refreshed.

**Depends on:** v11.6 implementation through `ec2f1a4` on `origin/main`.

### Phase 67: Milestone Archive and Beta Runbook

**Goal:** Close v11.6 audit caveats, archive the milestone cleanly, and leave the operator ready for first beta sessions.

**Requirements:** SHIP-04, SHIP-05, BETA-01, BETA-02, BETA-03

**Success Criteria:**
1. v11.6 audit caveats are resolved or carried forward with owner and next action.
2. GSD milestone completion/archive flow preserves roadmap, requirements, audit, phase plans, summaries, and smoke evidence.
3. Beta runbook explains setup, credits, privacy boundaries, expected cockpit path, and fallback behavior.
4. Feedback collection maps beta notes to readiness, briefing, recipe, preview, or approval-package stages.
5. Next product learning questions are documented before starting a larger v11.7 build.

**Depends on:** Phase 66 smoke evidence.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
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
*Roadmap updated: 2026-06-06 after v11.6 milestone archive*
