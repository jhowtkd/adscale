# Roadmap: ADScale

## Milestones

- 🔄 **v11.10 Fechamento Entrega e Analytics** - Phases 85-89 (in progress)
- ✅ **v11.9 UX de Entrega e Créditos** - Phases 80-84 (shipped 2026-06-07)
- ✅ **v11.8 Loop de Aprendizado Beta** - Phases 75-79 (shipped 2026-06-07)
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

### 🔄 v11.10 Fechamento Entrega e Analytics (Phases 85-89) — IN PROGRESS

**Milestone Goal:** Fechar o cluster entrega/créditos/analytics com instrumentação cockpit restante, readiness false-positive override, owner dashboard polish, regressão verde e ≥3 sessões reais de operador com learning answers atualizados.

- [ ] **Phase 85: Cockpit Instrumentation** — Recipe + briefing + preview funnel events
- [ ] **Phase 86: Readiness Override** — False-positive override workflow + analytics
- [ ] **Phase 87: Owner Dashboard Polish** — Timeline cap removal, credit funnel, session filter
- [ ] **Phase 88: Regression Verification** — F-14 test fix + CI green gate
- [ ] **Phase 89: SESS-03 Operator UAT** — ≥3 real sessions + learning answers updated

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 85 | Cockpit Instrumentation | COCK-01, COCK-02, COCK-03, COCK-04, COCK-05 | Not started | - |
| 86 | Readiness Override | READY-06, READY-07 | Not started | - |
| 87 | Owner Dashboard Polish | DASH-04, DASH-05, DASH-06 | Not started | - |
| 88 | Regression Verification | QA-03, QA-04 | Not started | - |
| 89 | SESS-03 Operator UAT | SESS-03, SESS-05 | Not started | - |

### ✅ v11.9 UX de Entrega e Créditos (Phases 80-84) — SHIPPED 2026-06-07

**Milestone Goal:** Users and owners understand credit cost before batch spend; delivery surfaces (approval package, share) are self-serve; owner analytics rank credit surprises and expose session stage gaps.

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 80 | Credit Estimate Transparency | CRED-01, CRED-02, CRED-04 | Complete | 2026-06-07 |
| 81 | Credit Event Instrumentation | CRED-03 | Complete | 2026-06-07 |
| 82 | Delivery and Approval Package UX | DELIV-01, DELIV-02, DELIV-03 | Complete | 2026-06-07 |
| 83 | Owner Credit and Session Analytics | DASH-01, DASH-02, DASH-03 | Complete | 2026-06-07 |
| 84 | Regression Verification | QA-01, QA-02 | Complete | 2026-06-07 |

Archive: [v11.9-ROADMAP.md](milestones/v11.9-ROADMAP.md) · [v11.9-REQUIREMENTS.md](milestones/v11.9-REQUIREMENTS.md) · [v11.9-MILESTONE-AUDIT.md](milestones/v11.9-MILESTONE-AUDIT.md) · [v11.9-phases/](milestones/v11.9-phases/)

### ✅ v11.8 Loop de Aprendizado Beta (Phases 75-79) — SHIPPED 2026-06-07

**v11.8 Beta Learning Loop** — operator-run sessions, full instrumentation, owner funnel analytics, and evidence-driven friction fixes.

| # | Phase | Plans | Status | Completed |
|---|-------|-------|--------|-----------|
| 75 | Event Schema and Ingest Foundation | 3/3 | Complete | 2026-06-07 |
| 76 | Cockpit and Mission Instrumentation | 4/4 | Complete | 2026-06-07 |
| 77 | Operator Beta Sessions | 4/4 | Complete* | 2026-06-07 |
| 78 | Owner Analytics Dashboard and CSV | 4/4 | Complete | 2026-06-07 |
| 79 | Evidence-Driven Friction Fixes | 1/1 | Complete | 2026-06-07 |

\*SESS-03 operator UAT (≥3 real sessions) pending — see [v11.8-MILESTONE-AUDIT.md](milestones/v11.8-MILESTONE-AUDIT.md).

Archive: [v11.8-ROADMAP.md](milestones/v11.8-ROADMAP.md) · [v11.8-REQUIREMENTS.md](milestones/v11.8-REQUIREMENTS.md) · [v11.8-phases/](milestones/v11.8-phases/)

### ✅ v11.7.1 Stabilization (Phases 72-74) — SHIPPED 2026-06-07

**v11.7.1 Stabilization** — beta-readiness hardening for the v11.7 progression loop.

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 72 | Build and Data Integrity Hardening | Restore production build and make progression/insight persistence conflict-safe | STAB-01, STAB-02, DATA-01, DATA-02, DATA-03 | 5 ✅ |
| 73 | Mission Resume UX | Make mission/progression CTAs resume into the intended campaign workflow surface | UX-01, UX-02 | 4 ✅ |
| 74 | Migration, UAT, and Beta Handoff | Apply/verify progression migration and complete beta UAT evidence | STAB-03, STAB-04, UAT-01, UAT-02, UAT-03 | 5 ✅ |

**12 requirements** | **3 phases** | Stabilization-only scope before beta

## Phase Details

### Phase 85: Cockpit Instrumentation

**Goal:** Owner can observe recipe selection, tradeoff engagement, and briefing step abandonment with accurate preview funnel data — no more false abandonment signals on recipe revise.

**Depends on:** Phase 84 (v11.9 regression baseline); v11.8 beta analytics foundation (types.ts allowlist pattern)

**Requirements:** COCK-01, COCK-02, COCK-03, COCK-04, COCK-05

**Success Criteria** (what must be TRUE):
  1. Owner sees `recipe_tradeoff_viewed` event in the analytics dashboard when an operator opens the tradeoff section of a recipe (F-08).
  2. Owner sees `recipe_selected` event carrying `recipeId` when an operator confirms a recipe selection (F-09).
  3. Owner sees a recipe selection funnel aggregated by `recipeId` showing how operators choose between recipes (COCK-03).
  4. Preview funnel no longer records a `cockpit_stage_abandoned` when the operator revises a recipe; `cockpit_stage_completed` only fires on genuine approval (F-06).
  5. Owner sees guided briefing abandonment broken down by `stepId` so per-step drop-off is visible (F-12).

**Plans:** TBD

**UI hint:** yes

---

### Phase 86: Readiness Override

**Goal:** Operators can declare a false-positive readiness block and continue the cockpit flow, with the override action generating an auditable event that owners see without inflated counts.

**Depends on:** Phase 85 (event allowlist extended)

**Requirements:** READY-06, READY-07

**Success Criteria** (what must be TRUE):
  1. Operator sees an override button on a blocked readiness screen and can continue the cockpit flow without resolving the flagged issue (F-11).
  2. The override action emits a `readiness_blocked { action: "overridden" }` event from the server-side preflight route, creating an auditable record.
  3. Owner sees readiness override signals in the analytics dashboard with accurate counts (no double-counting from both operator note and event).
  4. A single false-positive override is counted once; deduplication by `sessionId + stage + time window` prevents inflated metrics.

**Plans:** TBD

---

### Phase 87: Owner Dashboard Polish

**Goal:** Owner dashboard displays an uncapped session stage timeline, a credit consumption funnel by cockpit stage, and a session filter populated from real API data.

**Depends on:** Phase 85 (aggregateRecipeFunnel, aggregateCreditRevenueFunnel functions); Phase 82/83 v11.9 session timeline foundation

**Requirements:** DASH-04, DASH-05, DASH-06

**Success Criteria** (what must be TRUE):
  1. Session stage timeline renders all stages within the default date window with no 24-line hard cap truncation.
  2. Owner sees a "Créditos por Etapa" funnel showing credit spend mapped to cockpit stages (credit → preview → approval) without implying billing events.
  3. Session filter dropdown on the dashboard is populated with real session IDs fetched from `/api/feedback/sessions` — not empty or fixture data.

**Plans:** TBD

**UI hint:** yes

---

### Phase 88: Regression Verification

**Goal:** Test suite assertions match the current code contract and the full CI gate (test + lint + build) passes before SESS-03 operator sessions begin.

**Depends on:** Phases 85–87

**Requirements:** QA-03, QA-04

**Success Criteria** (what must be TRUE):
  1. `creative-quality-gate-orchestration` test assertions are aligned with the current output format — test passes without skips or `test.todo` workarounds (F-14).
  2. `npm test` passes with no failing or unexpectedly skipped tests.
  3. `npm run lint` and `npm run build` pass in `app/` with zero new errors introduced by the milestone.

**Plans:** TBD

---

### Phase 89: SESS-03 Operator UAT

**Goal:** Milestone closes with real operator session evidence — ≥3 documented sessions confirming instrumentation is live in production — and learning answers updated with real session IDs, not fixture UUIDs.

**Depends on:** Phases 85–88 deployed to production; Phase 88 CI green

**Requirements:** SESS-03, SESS-05

**Success Criteria** (what must be TRUE):
  1. Operator completes ≥3 real beta sessions with documented session IDs and runbook-stage artifacts stored in the session evidence file.
  2. Each session smoke-checks that cockpit events (recipe_tradeoff_viewed, recipe_selected, override) appear in the owner dashboard with real data.
  3. Learning answers for Q4 (recipe selection patterns), Q5 (preview funnel accuracy), Q6 (tradeoff readership), and the readiness override signal are updated with citations to real session IDs — no fixture UUIDs (`550e8400-…`) remain in the answers.
  4. Session evidence file records session IDs, event counts observed, and key behavioral findings from each session.

**Plans:** TBD

---

### Phase 80: Credit Estimate Transparency

**Goal:** Users see what credits will cost before batch derivation and understand prior spend at the preview gate.

**Depends on:** v11.8 (F-01 preview credit copy, batch gate foundation)

**Requirements:** CRED-01, CRED-02, CRED-04

**Success Criteria** (what must be TRUE):
  1. User sees an itemized credit estimate breakdown before confirming batch derivation.
  2. Preview gate shows credits already spent and a disclaimer that the estimate may differ from actual spend.
  3. When balance is insufficient for the batch estimate, the gate blocks with explicit estimate vs available balance.
  4. Blocked-state copy explains why the batch cannot proceed without operator intervention.

**Plans:** 2 plans (2 waves)

Plans:
- [x] 80-01-PLAN.md — Batch credit breakdown helper + billing balance wiring
- [x] 80-02-PLAN.md — PreviewGatePanel formula, balance, insufficient block + tests

**UI hint:** yes

### Phase 81: Credit Event Instrumentation

**Goal:** Credit spend and block events carry enough structure for owner surprise analytics.

**Depends on:** Phase 80

**Requirements:** CRED-03

**Success Criteria** (what must be TRUE):
  1. `credit_spend` events include `operation_key` identifying which operation consumed credits.
  2. `credit_blocked` events include `operation_key` and the estimate at block time.
  3. When actual spend differs from estimate, the delta is persisted on the spend event.
  4. Focused tests prove event payloads match the allowlist and include required credit fields.

**Plans:** TBD

### Phase 82: Delivery and Approval Package UX

**Goal:** Operators and clients can complete delivery (approval package, share) without hand-holding when assets are stale.

**Depends on:** v11.8 approval package foundation (Phase 64)

**Requirements:** DELIV-01, DELIV-02, DELIV-03

**Success Criteria** (what must be TRUE):
  1. Approval package displays a visible stale indicator when underlying assets are outdated.
  2. Stale indicator includes tooltip or inline copy with an actionable next step (e.g. refresh).
  3. Share link flow presents self-serve guidance so recipients know what to do without operator steps.
  4. After refresh, the UI communicates that assets were outdated and what was updated.

**Plans:** TBD

**UI hint:** yes

### Phase 83: Owner Credit and Session Analytics

**Goal:** Owner can diagnose credit surprises and post-preview stalls from the analytics dashboard.

**Depends on:** Phase 81 (operation_key on credit events); v11.8 owner dashboard (Phase 78)

**Requirements:** DASH-01, DASH-02, DASH-03

**Success Criteria** (what must be TRUE):
  1. Owner sees credit surprise ranked by operation on `OwnerAnalyticsPanel`.
  2. Owner sees a session timeline showing elapsed gaps between cockpit stages.
  3. CSV export includes per-operation credit surprise columns alongside existing funnel data.
  4. Non-owner users cannot access the new analytics surfaces (403 preserved).

**Plans:** TBD

**UI hint:** yes

### Phase 84: Regression Verification

**Goal:** Milestone ships with regression coverage and a green CI gate.

**Depends on:** Phases 80–83

**Requirements:** QA-01, QA-02

**Success Criteria** (what must be TRUE):
  1. Regression tests cover preview/batch credit copy, batch gate block behavior, and stale approval package states.
  2. `npm test`, `npm run lint`, and `npm run build` pass in `app/`.
  3. Verification artifact documents any accepted caveats from v11.8 post-ship items (SESS-03, migration 0033).

**Plans:** TBD

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
<summary>✅ v11.8 Loop de Aprendizado Beta (Phases 75-79) - SHIPPED 2026-06-07</summary>

- [x] Phase 75: Event Schema and Ingest Foundation (3/3 plans)
- [x] Phase 76: Cockpit and Mission Instrumentation (4/4 plans)
- [x] Phase 77: Operator Beta Sessions (4/4 plans)
- [x] Phase 78: Owner Analytics Dashboard and CSV (4/4 plans)
- [x] Phase 79: Evidence-Driven Friction Fixes (1/1 plans)

Archive: [v11.8-ROADMAP.md](milestones/v11.8-ROADMAP.md) · [v11.8-REQUIREMENTS.md](milestones/v11.8-REQUIREMENTS.md) · [v11.8-MILESTONE-AUDIT.md](milestones/v11.8-MILESTONE-AUDIT.md) · [v11.8-phases/](milestones/v11.8-phases/)

</details>

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
| 85 | v11.10 | 0/TBD | Not started | - |
| 86 | v11.10 | 0/TBD | Not started | - |
| 87 | v11.10 | 0/TBD | Not started | - |
| 88 | v11.10 | 0/TBD | Not started | - |
| 89 | v11.10 | 0/TBD | Not started | - |
| 80 | v11.9 | 0/TBD | Not started | - |
| 81 | v11.9 | 0/TBD | Not started | - |
| 82 | v11.9 | 0/TBD | Not started | - |
| 83 | v11.9 | 0/TBD | Not started | - |
| 84 | v11.9 | 0/TBD | Not started | - |
| 75 | v11.8 | 3/3 | Complete | 2026-06-07 |
| 76 | v11.8 | 4/4 | Complete | 2026-06-07 |
| 77 | v11.8 | 4/4 | Complete* | 2026-06-07 |
| 78 | v11.8 | 4/4 | Complete | 2026-06-07 |
| 79 | v11.8 | 1/1 | Complete | 2026-06-07 |
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
*Roadmap updated: 2026-06-07 — v11.10 phases 85-89 added*
