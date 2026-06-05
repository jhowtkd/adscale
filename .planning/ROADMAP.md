# Roadmap: ADScale

## Milestones

- 📋 **v11.6 Creative Strategy Cockpit** — Phases 61–65 (planned 2026-06-05)
- ✅ **v11.5 Qualidade IA Orientada por Feedback** — Phases 57–60 (shipped 2026-06-05)
- ✅ **v11.4 Beta Feedback Capture** — Phases 53–56 (shipped 2026-06-05)
- ✅ **v11.3 Site de Apresentação Separado** — Phases 50–52 (shipped 2026-06-03)
- ✅ **v11.2 Beta Access and Credit Entitlements** — Phase 49 (shipped 2026-06-03)
- ✅ **v11.1 Qualidade de Geração e Contratos Criativos** — Phases 44–48 (shipped 2026-06-01)
- ✅ **v11.0 Fluxos de Derivação Coerentes** — Phases 40–43 (shipped 2026-06-01)

## Phases

<details>
<summary>✅ v11.5 Qualidade IA Orientada por Feedback (Phases 57–60) — SHIPPED 2026-06-05</summary>

- [x] Phase 57: Creative Contract and Prompt Provenance (2/2 plans) — completed 2026-06-05
- [x] Phase 58: Scoring and QA Alignment (2/2 plans) — completed 2026-06-05
- [x] Phase 59: Feedback-Informed Regeneration (4/4 plans) — completed 2026-06-05
- [x] Phase 60: Quality Fixtures and Verification (4/4 plans) — completed 2026-06-05

Archive: [v11.5-ROADMAP.md](milestones/v11.5-ROADMAP.md) · [v11.5-REQUIREMENTS.md](milestones/v11.5-REQUIREMENTS.md) · [v11.5-phases/](milestones/v11.5-phases/)

</details>

### 📋 Next Milestone (Planned via `/gsd-new-milestone`)

**v11.6 Creative Strategy Cockpit** starts at Phase 61.

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 61 | Creative Readiness Foundation | Score base creative and brief quality before generation | READY-01..05 | 5 |
| 62 | Guided Briefing Cockpit | Help weak briefs become generation-ready one question at a time | GUIDE-01..05 | 5 |
| 63 | Strategy Recipes and Preview Gate | 2/2 | Complete   | 2026-06-05 |
| 64 | Client Approval Package | 2/2 | Complete   | 2026-06-05 |
| 65 | Verification, Analytics, and Handoff | Validate the cockpit path and document beta limitations | CQA-01..03 | 4 |

**26 requirements** | **5 phases** | All covered ✓

## Phase Details

### Phase 61: Creative Readiness Foundation

**Goal:** Add the readiness layer that checks whether the campaign brief and base creative are safe to use before spending credits on generation.

**Requirements:** READY-01, READY-02, READY-03, READY-04, READY-05

**Success Criteria:**
1. User opens a campaign with a base creative and can run Creative Readiness Score before derivation.
2. User sees separate scores for offer clarity, legibility, hierarchy, CTA, brand fit, and platform fit.
3. User sees blocking issues above improvement suggestions.
4. User edits the brief or replaces the base creative and can rerun readiness.
5. Existing brand kit, preflight/QA, and creative contract concepts are reused without adding a provider.

**Depends on:** v11.5 creative quality taxonomy and contract/provenance persistence.

### Phase 62: Guided Briefing Cockpit

**Goal:** Replace empty-form anxiety with a focused question flow that turns weak briefs into usable campaign context.

**Requirements:** GUIDE-01, GUIDE-02, GUIDE-03, GUIDE-04, GUIDE-05

**Success Criteria:**
1. User starts from a weak or empty brief and sees one relevant question at a time.
2. User can answer product/offer, audience, promise, objections, CTA, platforms, and constraints.
3. User can accept, edit, or skip each suggestion.
4. The resulting answers persist into the campaign draft and normal form fields.
5. PT-BR and EN flows preserve the existing generation language behavior.

**Depends on:** Phase 61 readiness findings.

### Phase 63: Strategy Recipes and Preview Gate

**Goal:** Convert readiness and brief context into clear generation strategies and validate with one preview before queueing a full batch.

**Requirements:** RECIPE-01, RECIPE-02, RECIPE-03, RECIPE-04, RECIPE-05, PREVIEW-01, PREVIEW-02, PREVIEW-03, PREVIEW-04

**Success Criteria:**
1. User sees at least three recipe options with plain-language tradeoffs.
2. Each recipe maps to concrete generation configuration before queueing.
3. User can override settings without leaving the flow.
4. User can generate one preview using the same contract and quality gate as full generation.
5. User sees credit impact before approving the full batch.

**Depends on:** Phases 61-62.

### Phase 64: Client Approval Package

**Goal:** Turn approved derivations into a shareable client approval package with formats, notes, status, and downloads.

**Requirements:** DELIVER-01, DELIVER-02, DELIVER-03, DELIVER-04

**Success Criteria:**
1. User can select approved derivations and create a package.
2. Package displays formats, creative notes, statuses, and download actions.
3. Share access uses workspace-safe links and signed asset URLs.
4. Package can be refreshed when approval status or derivations change.

**Depends on:** Phase 63 preview/batch output.

### Phase 65: Verification, Analytics, and Handoff

**Goal:** Prove the full cockpit path works and leave beta-facing limitations explicit.

**Requirements:** CQA-01, CQA-02, CQA-03

**Success Criteria:**
1. Automated tests cover readiness normalization, guided briefing state, recipe mapping, and preview gating.
2. Browser smoke covers campaign draft to readiness to guided briefing to preview to delivery package.
3. Handoff documents credit behavior, privacy boundaries, and AI limitations.
4. ROADMAP, STATE, and REQUIREMENTS are ready for milestone completion audit.

**Depends on:** Phases 61-64.

## Progress

| Phase | Milestone | Plans Complete | Status   | Completed  |
| ----- | --------- | -------------- | -------- | ---------- |
| 61    | v11.6     | 2/2            | Complete | 2026-06-05 |
| 62    | v11.6     | 2/2            | Complete | 2026-06-05 |
| 63    | v11.6     | 2/2            | Complete | 2026-06-05 |
| 64    | v11.6     | 2/2            | Complete | 2026-06-05 |
| 65    | v11.6     | 0/?            | Planned  | —          |
| 57    | v11.5     | 2/2            | Complete | 2026-06-05 |
| 58    | v11.5     | 2/2            | Complete | 2026-06-05 |
| 59    | v11.5     | 4/4            | Complete | 2026-06-05 |
| 60    | v11.5     | 4/4            | Complete | 2026-06-05 |

---
*Roadmap updated: 2026-06-05 after v11.6 milestone initialization*
