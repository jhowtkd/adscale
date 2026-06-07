# Architecture Patterns

**Domain:** Beta learning loop — instrumentation, owner analytics, friction-fix workflow  
**Project:** ADScale v11.8 Loop de Aprendizado Beta  
**Researched:** 2026-06-07  
**Overall confidence:** HIGH (grounded in shipped v11.4–v11.7 code; event-store shape is a recommendation, not yet implemented)

## Executive Summary

v11.8 should **instrument existing flows**, not rewrite the cockpit or progression stack. The codebase already has three durable learning surfaces: `feedback_reports` (user/operator qualitative signals), `workspace_progression` (level snapshot), and domain-table inference for mission completion (`inferMissionCompletions`, `inferWorkspaceEvidence`). Mission insights already write into `feedback_reports` with `category: "mission"` and `diagnosticContext.source = "mission_insight"`. Owner triage at `/feedback` plus `GET /api/feedback/mission-credit-signals` proves the owner-dashboard pattern.

What's missing for v11.8 is a **quantitative event layer** (stage enters/completes/abandons, credit blocks, readiness blocks) and **operator session notes** tied to cockpit stages. Aggregation and CSV export should read from events + existing inference, surfaced on owner-only routes extending `/feedback`.

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Beta user (workspace-scoped)                     │
├─────────────────────────────────────────────────────────────────────────┤
│  Campaign workspace (cockpit stages)                                     │
│    CreativeReadiness → GuidedBriefing → StrategyRecipe → PreviewGate    │
│    → Batch → Review → ClientApprovalPackage                              │
│         │              │                    │                            │
│         ▼              ▼                    ▼                            │
│  MissionInsightProvider (qualitative prompts)                            │
│  useCampaignWorkspace / panels (stage UI state)                          │
└────────────┬───────────────────────────────┬────────────────────────────┘
             │ client events (abandon, dismiss) │ server events (authoritative)
             ▼                                  ▼
┌────────────────────────────┐    ┌──────────────────────────────────────┐
│ POST /api/workspace/       │    │ API route boundaries                  │
│   beta-events              │    │  preflight POST, derivations POST,    │
│ (thin, validated, async)   │    │  billing gates, plan approval         │
└────────────┬───────────────┘    └──────────────────┬───────────────────┘
             │                                        │
             ▼                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  beta_analytics_events (NEW)          feedback_reports (EXISTING)        │
│  — high-volume funnel telemetry       — mission insights, user feedback │
│  — workspace_id, user_id, stage,    — owner triage, Sentry correlation │
│    event_type, payload JSONB          — mission-credit-signals aggregate  │
├─────────────────────────────────────────────────────────────────────────┤
│  beta_sessions + beta_session_notes (NEW, operator-only)                 │
└─────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Owner layer (requirePlatformOwner)                                      │
│  GET /api/feedback/analytics/funnel                                      │
│  GET /api/feedback/analytics/cohort                                      │
│  GET /api/feedback/analytics/export.csv                                    │
│  POST /api/feedback/beta-sessions (+ notes)                              │
│  /feedback dashboard (extend existing triage UI)                           │
└─────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Friction-fix workflow (phases 5+)                                       │
│  Rank by frequency × impact → patch cockpit/progression → regression   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Cockpit panels** (`CreativeReadinessPanel`, `GuidedBriefingPanel`, `StrategyRecipePanel`, `PreviewGatePanel`, `ClientApprovalPackagePanel`) | Render stage UX; emit client-side abandon/dismiss events | `MissionInsightProvider`, `POST /api/workspace/beta-events` |
| **`useCampaignWorkspace`** | Orchestrates derivation/preview/batch/credit errors | Mission insights on success/error; beta-events on credit friction |
| **`MissionInsightProvider`** | Non-blocking qualitative capture (prompt once per moment) | `POST /api/workspace/mission-insights` → `feedback_reports` |
| **`recordMissionInsight`** | Sanitize + persist insight as feedback row | `createFeedbackReport`, `sanitizeMissionInsightInput` |
| **`inferWorkspaceEvidence` / `inferMissionCompletions`** | Derive progression + mission completion from domain tables | campaigns, assets, plans, derivations, exports, share_links |
| **`getWorkspaceMissions` / `getWorkspaceProgression`** | Serve activation ladder to dashboard | Evidence inference, billing grants |
| **`beta_analytics_events` repository (NEW)** | Append-only funnel telemetry | Drizzle, workspace-scoped inserts |
| **`beta-analytics/service` (NEW)** | Validate event taxonomy, dedupe idempotency keys | Zod schemas aligned to `MISSION_ORDER` / cockpit stages |
| **`beta-analytics/aggregate` (NEW)** | Funnel, cohort, readiness-false-positive, credit-surprise queries | events table + cross-check with inference |
| **`/feedback` page (MODIFIED)** | Owner triage + funnel cards + session notes + CSV export | Owner analytics APIs, existing reports list |
| **`summarizeMissionCreditSignals` (EXISTING)** | Credit/mission frustration rollup | `feedback_reports` where `category = mission` |

### Cockpit Stage ↔ Mission Key Mapping

Single source of truth for funnel dimensions — reuse `MISSION_ORDER` from `app/src/server/progression/missions/definitions.ts`:

| Cockpit stage (runbook) | `MissionKey` | Primary instrumentation hook |
|-------------------------|--------------|------------------------------|
| Creative Readiness | `readiness` | `preflight` POST success/block; panel open/close |
| Guided Briefing | `guided_briefing` | Campaign PATCH with guided answers; panel skip |
| Strategy Recipe | `strategy_recipe` | Plan create/approve; `StrategyRecipePanel` selection |
| Preview Gate | `preview` | `createDerivations({ preview: true })`; credit estimate shown |
| Batch | `batch` | `createDerivations()` full batch; billing gate failure |
| Review | `review` | Approve/reject derivation |
| Regeneration | `regeneration` | Regenerate with feedback |
| Export | `export` | Export flow completion |
| Client Approval / Share | `share` | Delivery package + share link |

### Data Flow

**Qualitative path (already shipped):**

1. User hits milestone moment → `maybePromptMissionInsight` or explicit `recordMissionSignal`.
2. `POST /api/workspace/mission-insights` validates workspace, sanitizes payload.
3. `recordMissionInsight` → `createFeedbackReport` with `category: "mission"`, structured `diagnosticContext`.
4. Owner views in `/feedback`; `summarizeMissionCreditSignals` classifies healthy vs frustration.

**Quantitative path (v11.8 addition):**

1. **Server-authoritative events** at API boundaries (readiness debit, derivation queue, credit gate rejection) — cannot be spoofed, captures credit/readiness truth.
2. **Client events** for abandonment (modal closed without complete, tab navigated away mid-stage) — best-effort, tagged `source: "client"`.
3. Events land in `beta_analytics_events` with: `workspaceId`, `userId`, `campaignId?`, `stage` (mission key), `eventType`, `payload` (JSONB, sanitized), `sessionId?` (operator beta session), `createdAt`.
4. Owner aggregation joins events by `workspaceId` cohort (beta flag or date range), computes stage conversion and drop-off.
5. Cross-check: mission completion from `inferMissionCompletions` should correlate with `stage_completed` events; divergence flags instrumentation gaps.

**Operator session notes path:**

1. Operator starts `beta_session` (workspace, operator user, runbook version).
2. Per-stage structured notes (tags from runbook BETA-02 mapping) via `beta_session_notes`.
3. Notes link to `feedback_reports` IDs and event IDs when relevant.
4. Feeds friction prioritization alongside automated aggregates.

## New vs Modified

### New Components

| Item | Location (suggested) | Purpose |
|------|---------------------|---------|
| `beta_analytics_events` table | `app/drizzle/0033_beta_analytics.sql` | Append-only telemetry |
| `beta_sessions`, `beta_session_notes` tables | same migration | Operator session workflow |
| `recordBetaEvent` service | `app/src/server/beta-analytics/service.ts` | Validated event writes |
| Event taxonomy + Zod schemas | `app/src/lib/beta-analytics/types.ts` | `stage_entered`, `stage_completed`, `stage_abandoned`, `credit_blocked`, `readiness_blocked`, `readiness_overridden` |
| Repository | `app/src/server/repositories/beta-analytics.ts` | Insert + aggregate queries |
| `POST /api/workspace/beta-events` | workspace-scoped | Client + shared write path |
| Owner analytics routes | `app/src/app/api/feedback/analytics/*` | Funnel, cohort, CSV (platform owner) |
| `POST/GET /api/feedback/beta-sessions` | operator-only | Session + notes CRUD |
| Aggregation module | `app/src/server/beta-analytics/aggregate.ts` | Funnel math, learning-question helpers |
| `useRecordBetaEvent` hook | `app/src/lib/hooks/use-beta-event.ts` | Fire-and-forget client calls |

### Modified Components (minimal touch)

| Item | Change |
|------|--------|
| `preflight/route.ts` POST | Emit `stage_completed` / `readiness_blocked` with blocking issue count |
| `campaigns/[id]/derivations/route.ts` | Emit preview vs batch events + credit cost in payload |
| `spendCreditsOrApiError` / billing gates | Emit `credit_blocked` with operation + estimate |
| `CreativeReadinessPanel`, `GuidedBriefingPanel`, `StrategyRecipePanel`, `PreviewGatePanel` | `stage_entered` on mount/open; `stage_abandoned` on close without complete |
| `useCampaignWorkspace` | Reuse existing credit-friction insight; add parallel `recordBetaEvent` |
| `MissionPathCard` | Emit `mission_skipped` event alongside existing insight prompt |
| `/feedback/page.tsx` | Add funnel summary, cohort filter, session notes panel, CSV button |
| `mission-credit-signals.ts` | Keep; optionally join with event-based credit_blocked counts |

### Explicitly NOT Modified

- Cockpit business logic (`buildCreativeReadiness`, `rankRecipesForContext`, `shouldShowPreviewGate`, etc.)
- Progression level calculation (`calculateLevel`, `buildNextAction`)
- Mission definition order or prerequisite graph
- Inngest derivation job internals (instrument at API entry, not job handler, unless batch correlation needed)
- User-facing dashboard analytics (`/api/dashboard/stats`) — workspace-scoped product metrics, separate from owner beta funnel

## Patterns to Follow

### Pattern 1: Server-Authoritative Instrumentation

**What:** Record beta events inside API routes after validation and before response.  
**When:** Credit debits, readiness results, derivation queue, plan approval.  
**Why:** Client events miss failures and can be blocked; server captures ground truth for learning questions Q1–Q9.

```typescript
// After successful readiness POST in preflight/route.ts
await recordBetaEvent({
  workspaceId: workspace.id,
  userId: user.id,
  campaignId,
  stage: "readiness",
  eventType: readiness.blockingIssues.length > 0 ? "readiness_blocked" : "stage_completed",
  payload: {
    blockingCount: readiness.blockingIssues.length,
    overallScore: readiness.overallScore,
    forceRerun,
  },
});
```

### Pattern 2: Non-Blocking Client Telemetry

**What:** Mirror `MissionInsightProvider` — never block UX on analytics failure.  
**When:** Modal abandon, navigation away, dismiss without submit.  
**Example:** `useRecordBetaEvent` swallows errors; uses `navigator.sendBeacon` or `mutate` with no await in UI handlers.

### Pattern 3: Reuse Feedback Row for Qualitative, Events for Quantitative

**What:** Keep mission insights in `feedback_reports`; do not overload with high-volume stage_entered events.  
**When:** User sentiment, operator triage, Sentry-linked bugs stay on feedback path.  
**Why:** Existing owner UI, filters, and `mission-credit-signals` already work; event table keeps aggregates fast.

### Pattern 4: Owner-Only Aggregation Behind Existing Auth

**What:** All analytics/export routes use `requirePlatformOwner` (same as `GET /api/feedback/reports`).  
**When:** Any cross-workspace cohort view.  
**Why:** Matches v11.4 security model; beta funnel is platform-owner concern, not workspace member.

### Pattern 5: Cohort via Workspace + Time Window

**What:** Filter beta cohort by `workspace.createdAt` range or explicit `beta_session` membership — not a new billing flag unless needed.  
**When:** Funnel denominators for "first 3–5 sessions".  
**Why:** Avoids scope creep into beta entitlements admin (explicitly out of scope in v11.2).

## Anti-Patterns to Avoid

### Anti-Pattern 1: Rewriting Cockpit State Machine

**What:** Replacing `useCampaignWorkspace` workspace states with a new progression-driven router.  
**Why bad:** v11.7.1 just stabilized resume CTAs; rewrite risks regression and delays learning.  
**Instead:** Append events at existing hooks; keep `WorkspaceState` as-is.

### Anti-Pattern 2: Storing Funnel Only in `feedback_reports`

**What:** Creating a feedback row per stage_entered.  
**Why bad:** Pollutes triage queue, breaks `mission-credit-signals` semantics, poor query performance.  
**Instead:** Dedicated `beta_analytics_events` table with indexes on `(stage, event_type, created_at)`.

### Anti-Pattern 3: Third-Party Analytics SDK for Beta

**What:** Adding Mixpanel/Amplitude for v11.8.  
**Why bad:** Cookie consent, PII boundaries, and workspace isolation already solved in-app; adds compliance surface.  
**Instead:** First-party Postgres aggregates; CSV export for offline analysis.

### Anti-Pattern 4: Friction Fixes Before Instrumentation

**What:** Patching UX based on operator memory from 1–2 sessions.  
**Why bad:** Violates "learn before build" decision; cannot answer `67-LEARNING-QUESTIONS.md` with data.  
**Instead:** Instrument → run 3–5 sessions → rank frictions by automated frequency + operator notes → fix top 5.

### Anti-Pattern 5: Public Analytics Routes

**What:** Workspace members viewing funnel data.  
**Why bad:** Cross-user leakage risk in cohort views; not a product requirement.  
**Instead:** Owner-only `/feedback` extensions.

## Suggested Build Order

Dependencies flow: **schema → server events → client events → session notes → aggregates → dashboard → sessions → fixes**.

| Order | Phase focus | Delivers | Depends on |
|-------|-------------|----------|------------|
| **1** | Event schema + service | Migration, `recordBetaEvent`, types, unit tests | — |
| **2** | Server instrumentation | preflight, derivations, billing gate events | 1 |
| **3** | Client instrumentation | Panel enter/abandon; mission skip events | 1 |
| **4** | Operator session notes | `beta_sessions` API + minimal operator UI | 1 |
| **5** | Aggregation queries | Funnel, cohort, readiness-false-positive, credit-surprise rollups | 1–3 |
| **6** | Owner dashboard | Extend `/feedback` with funnel cards, filters, CSV export | 5 |
| **7** | Beta sessions (operator) | Run 3–5 sessions per `67-BETA-RUNBOOK.md` | 4, 6 |
| **8** | Friction-fix workflow | Triage ranked issues → up to 5 targeted patches + regression tests | 5–7 |

**Rationale:**

- **Instrument before dashboard:** Aggregates without events produce empty or misleading funnels; server events (phase 2) alone already answer credit/readiness questions.
- **Dashboard before friction fixes:** Owner needs cohort funnel + CSV to prioritize fixes by frequency/impact, not intuition.
- **Session notes parallel to client events (4 ∥ 3):** Operator notes don't block telemetry; can ship after schema.
- **Qualitative path needs no rebuild:** Mission insights and `/feedback` triage already work; extend UI, don't replace.

### Learning Questions → Data Sources

| Question area | Primary source | Secondary |
|---------------|----------------|-----------|
| Q1–Q3 Readiness/briefing | `readiness_blocked` events, blocking payload; insight `moment: readiness_first` | `inferMissionCompletions` rerun patterns |
| Q4–Q6 Recipes/preview | `stage_completed` on `strategy_recipe`/`preview`; recipe id in payload | Mission insights `preview_first`, `cost_concern` |
| Q7–Q9 Delivery/credits | `credit_blocked`, `summarizeMissionCreditSignals` | Billing gate payloads, export/share completion |
| Q10 Time to share | Event timestamps: first `setup` → `share` `stage_completed` | `workspace_progression.completed` timestamps |

## Scalability Considerations

| Concern | At 5 beta workspaces | At 50 workspaces | At 1K+ workspaces |
|---------|-------------------|------------------|-------------------|
| Event volume | Single table, no partition | Index `(workspace_id, created_at)` | Archive events >90d; materialized funnel view |
| Aggregation | Inline SQL in API route | Cached 5-min owner query (TanStack `staleTime`) | Background Inngest rollup job |
| CSV export | Stream response | Paginate by date range | Async export to R2 signed URL |
| Session notes | JSONB per session | Full-text search on notes | Keep operator-only, low volume |

Beta scale (3–5 sessions) is tiny; optimize for **correctness and query clarity**, not throughput.

## Integration with Existing Modules

### Feedback (`feedback_reports`)

- **Keep** as qualitative + triage store.
- Mission insights continue via `recordMissionInsight` — no migration.
- Owner dashboard links event drill-down to related `feedback_reports` by `workspaceId` + time proximity + `campaignId`.
- Friction-fix workflow promotes high-frequency event patterns to `feedback_reports.status = reviewing` with `resolutionSummary`.

### Progression (`workspace_progression`)

- **Read-only** for analytics: `completed[]` timestamps provide cross-check for funnel completion.
- Do not write progression from analytics events — progression stays evidence-driven from domain tables.
- Dashboard can show "progression level at time of event" via snapshot `levelKey` in event payload (optional denormalization).

### Missions (`getWorkspaceMissions`)

- Mission `status: completed | active | blocked` informs cohort denominators.
- `creditContext.insufficientCredits` on active mission explains drop-off without new instrumentation.
- Mission skip already flows through `MissionPathCard` → insight; add `stage_abandoned` event with `skippedMissionKey`.

### Cockpit stages

- Instrument at **panel boundaries**, not inside pure AI functions (`cockpit-path.test.ts` stays unit-test only).
- `WorkspaceState` (`piloto`, `acoes`, `derivando`, `gerando`) maps loosely to stages — prefer explicit `stage` = mission key for analytics consistency.

### Inngest / Sentry

- **Inngest:** No change required for v11.8 MVP; derivation success/failure already reflected in derivation status (inference picks up completion).
- **Sentry:** Keep on feedback submission; optionally add `sentryCorrelation` to `credit_blocked` events when error object present.

## Friction-Fix Workflow Architecture

```
Events + session notes + feedback triage
        │
        ▼
  aggregate.rankFrictions()
  (frequency × severity × learning-q weight)
        │
        ▼
  Owner selects ≤5 items
        │
        ▼
  Patch existing component/API (no new features)
        │
        ▼
  Regression: cockpit-path tests + targeted unit + operator re-run
```

Each fix should cite evidence IDs (event count, example report IDs) in PR/commit message — not new tooling.

## Sources

- `.planning/PROJECT.md` — v11.8 milestone scope
- `.planning/phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md` — stage mapping (BETA-02)
- `.planning/phases/67-milestone-archive-and-beta-runbook/67-LEARNING-QUESTIONS.md` — decision gate
- `app/src/server/db/schema.ts` — `feedback_reports`, `workspace_progression`
- `app/src/server/mission-insights/service.ts` — insight → feedback pipeline
- `app/src/server/feedback/mission-credit-signals.ts` — owner aggregate pattern
- `app/src/server/progression/missions/definitions.ts` — `MISSION_ORDER`
- `app/src/app/(dashboard)/feedback/page.tsx` — owner triage UI
- `app/src/server/auth/platform-owner.ts` — owner gate

**Confidence notes:**

- Existing integration points: **HIGH** (verified in codebase).
- `beta_analytics_events` table shape: **MEDIUM** (recommended; not yet in repo — validate in phase plan).
- Cohort filter mechanism (session-based vs date-based): **MEDIUM** (operator workflow preference).
