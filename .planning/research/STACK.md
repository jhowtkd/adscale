# Technology Stack: v11.10 Fechamento Entrega e Analytics

**Project:** ADScale v11.10  
**Researched:** 2026-06-07  
**Scope:** Stack additions and changes needed for NEW v11.10 features only.  
**Baseline:** Next.js 16.2.6 App Router, React 19, TypeScript 5, TanStack Query 5.100, Neon/Drizzle 0.45, Zod 3, first-party beta analytics layer (v11.8).

---

## Verdict: Zero new npm dependencies

All v11.10 capabilities are in-repo TypeScript additions to the existing analytics layer.  
No new libraries. No schema migrations. No new API routes beyond what the existing event ingest and funnel endpoints already provide.

---

## Core Technologies (unchanged)

| Technology | Version (locked) | Role |
|------------|-----------------|------|
| Next.js App Router | 16.2.6 | Framework — no change |
| React | 19.2.4 | UI runtime — no change |
| TypeScript | ^5 | Type system — no change |
| Drizzle ORM + Neon PostgreSQL | ^0.45.2 | Persistence — no change |
| TanStack Query | ^5.100.1 | Server state / panel queries — no change |
| Zod | ^3.0.0 | Schema validation at ingest boundary — no change |
| shadcn/ui + Tailwind | (existing) | Dashboard component shell — no change |

---

## In-Repo Changes Required

### 1. `app/src/server/beta-analytics/types.ts` — Event key allowlist expansion

**Why:** `recordBetaAnalyticsEvent()` hard-validates against `PHASE_76_BETA_EVENT_KEYS`.  
Any new event key not in this const is rejected at the server boundary before DB insert.  
`sanitizeBetaEventProperties()` uses `z.strictObject(ALLOWED_PROPERTY_KEYS)` — any new  
property field (e.g. `recipeKey`, `stepIndex`) must be added to `ALLOWED_PROPERTY_KEYS` or  
the ingest route returns a validation error and the event is silently dropped client-side  
(fire-and-forget in `useRecordBetaEvent`).

**Changes:**

```typescript
// PHASE_76_BETA_EVENT_KEYS — add these four keys:
"recipe_selected",        // F-09: user confirms a strategy recipe
"recipe_tradeoff_viewed", // F-08: user opens/scrolls tradeoff copy within a recipe card
"briefing_abandoned",     // F-12: user dismisses/closes guided briefing mid-flow
"readiness_override",     // F-11: operator explicitly overrides a false-positive readiness block

// ALLOWED_PROPERTY_KEYS — add these two keys:
"recipeKey",   // string — identifies which recipe was selected/viewed (e.g. "bold_single")
"stepIndex",   // number — briefing step index at time of abandon (0-based)
```

No migration needed. `beta_analytics_events.properties` is JSONB; the column already  
accepts any keys. The allowlist is enforced in application code only.

---

### 2. `app/src/server/beta-analytics/aggregate.ts` — New aggregation functions

**Why:** `OwnerAnalyticsPanel` calls `buildAnalyticsFunnelSummary()` which drives all  
table rows. New funnel rows for recipe and briefing require new aggregators.  
`AnalyticsFunnelSummary` interface in `aggregate.ts` must be extended with the new rows.

**New functions to add:**

| Function | Returns | Consumes | Purpose |
|----------|---------|----------|---------|
| `aggregateRecipeFunnel` | `RecipeFunnelRow[]` | `recipe_selected` events | F-09 — recipe pick rate by key |
| `aggregateBriefingAbandonByStep` | `BriefingAbandonRow[]` | `briefing_abandoned` events | F-12 — drop-off by guided briefing step |
| `aggregatePreviewFunnelAlignment` | `PreviewAlignmentRow[]` | `cockpit_stage_completed` + `cockpit_stage_abandoned` on stage=`preview` | F-06 — completed vs abandoned split at preview stage |

All three are pure functions: `(events: BetaAnalyticsEvent[]) => SomeRow[]`.  
No DB call, no async, consistent with existing aggregator contract.

**Interface extensions to `AnalyticsFunnelSummary`:**

```typescript
recipeFunnel: RecipeFunnelRow[];
briefingAbandonByStep: BriefingAbandonRow[];
previewFunnelAlignment: PreviewAlignmentRow;
```

**New row types:**

```typescript
interface RecipeFunnelRow {
  recipeKey: string;
  selectedCount: number;
}

interface BriefingAbandonRow {
  stepIndex: number;
  abandonCount: number;
}

interface PreviewAlignmentRow {
  completed: number;
  abandoned: number;
  approvalRate: number | null; // completed / (completed + abandoned)
}
```

---

### 3. Component instrumentation — three cockpit panels

**Why:** These event calls are missing. `useRecordBetaEvent` already exists and is  
fire-and-forget with no UI blocking. Adding calls is a one-liner per site.

| File | New `recordEvent` calls | Properties |
|------|------------------------|------------|
| `StrategyRecipePanel.tsx` | `recipe_selected` on recipe confirm | `{ recipeKey, stage: "strategy_recipe" }` |
| `StrategyRecipePanel.tsx` | `recipe_tradeoff_viewed` on tradeoff expand/scroll | `{ recipeKey, stage: "strategy_recipe" }` |
| `GuidedBriefingPanel.tsx` | `briefing_abandoned` on modal close | `{ stepIndex, stage: "guided_briefing" }` |
| `CreativeReadinessPanel.tsx` | `readiness_override` on operator override confirm | `{ readinessStatus, stage: "readiness" }` |

`StrategyRecipePanel` and `GuidedBriefingPanel` already import `useRecordBetaEvent` and  
call `recordEvent` for stage enter/complete/abandon — the new calls follow the same pattern.

**F-06 preview funnel alignment:** `PreviewGatePanel.tsx` already emits  
`cockpit_stage_completed` and `cockpit_stage_abandoned` with `stage: "preview"`.  
No new call needed — `aggregatePreviewFunnelAlignment` reads the existing events.  
The mismatch was a gap in the aggregate layer, not in instrumentation.

---

### 4. `app/src/components/feedback/OwnerAnalyticsPanel.tsx` — Dashboard polish

**Why:** Three display issues exist that are purely in-component fixes.

| Issue | Location | Fix |
|-------|----------|-----|
| Session timeline capped at 24 rows | Line 331: `.slice(0, 24)` | Remove slice; add scroll container with `max-h-96 overflow-y-auto` |
| Readiness overrides capped at 8 rows | Line 351: `.slice(0, 8)` | Remove slice; same scroll container pattern |
| Recipe funnel row missing | — | Add `<FunnelTable>` consuming `funnel.recipeFunnel` |
| Briefing abandon row missing | — | Add `<FunnelTable>` consuming `funnel.briefingAbandonByStep` |
| Revenue funnel (preview → batch → export) | — | Add `<FunnelTable>` derived from existing `cockpitStageFunnel` rows for stages `preview`, `batch`, `export` — no new API data |

`sessionOptions` prop and session filter input already exist in the component.  
Verifying the `<select>` is rendered (not just state) is the polish check.  
All data is already fetched via `/api/feedback/analytics/funnel` — only the display layer changes.

---

### 5. Readiness operator override persistence — F-11

**Why:** Override needs to be both persisted (for audit) and emitted as an event  
(for `aggregateReadinessOverrides` to surface in the dashboard).

**Approach:**  
The existing `beta_sessions.operator_notes` JSONB already stores `false positive` tags  
per stage (used in `extractOperatorFalsePositiveNotes`). No schema change is needed.

Two actions on override:
1. PATCH `/api/beta-sessions/:id/notes` with `tags: ["false positive"]` on the `readiness` stage — uses the existing endpoint and schema.
2. Emit `readiness_override` event via `POST /api/analytics/events` — uses the existing ingest endpoint.

`aggregateReadinessOverrides` in `aggregate.ts` already merges both sources  
(`extractReadinessBlockedEvents` + `extractOperatorFalsePositiveNotes`).  
No new API endpoint or Drizzle query is needed.

---

### 6. SESS-03 UAT artifacts

Pure documentation. No code changes. Target: markdown runbook artifact confirming  
≥3 real operator sessions with updated learning answers. Lives in  
`.planning/milestones/v11.10-phases/`.

---

## What NOT to Add

| Candidate | Why Not |
|-----------|---------|
| PostHog, Mixpanel, Segment, or any third-party analytics SDK | Explicitly out of scope per PROJECT.md decision "First-party beta analytics — operator-scale learning without third-party SDK; PII allowlist at ingest" |
| New Drizzle migration / schema change | `beta_analytics_events.properties` is JSONB and accepts any keys already. Allowlist is app-layer only. |
| New API routes for v11.10 analytics | Existing `/api/analytics/events` (ingest) and `/api/feedback/analytics/funnel` (query) cover all new event types. |
| `react-chartjs-2`, `recharts`, or chart library | Existing `FunnelTable` component with plain HTML tables is sufficient for beta-operator audience. |
| Cursor pagination on analytics queries | Beta cohort is small; fetching all events per filter is acceptable. Add if sessions > 50. |
| Server-Sent Events or WebSocket for live updates | TanStack Query polling (or manual refetch) is sufficient for operator dashboard cadence. |
| Additional Zod schemas for new event shapes | The JSONB properties allowlist in `sanitize.ts` handles new keys once added to `ALLOWED_PROPERTY_KEYS`; no separate Zod event-shape schemas needed. |

---

## Integration Points with Existing Beta Analytics Layer

```
useRecordBetaEvent(campaignId)          ← client hook (fire-and-forget)
        │
        ▼
POST /api/analytics/events              ← ingest route (existing)
        │
        ▼
recordBetaAnalyticsEvent()              ← validates eventKey against PHASE_76_BETA_EVENT_KEYS
        │                                  validates properties against ALLOWED_PROPERTY_KEYS
        ▼
insertBetaAnalyticsEvent()              ← Drizzle insert into beta_analytics_events
        │
        ▼
GET /api/feedback/analytics/funnel      ← owner query route (existing)
        │
        ▼
buildAnalyticsFunnelSummary()           ← aggregate.ts (extend with new functions)
        │
        ▼
OwnerAnalyticsPanel                     ← display (add new FunnelTable rows)
```

**The two allowlist arrays in `types.ts` are the single gate.** Extend them first;  
everything downstream (ingest, aggregate, dashboard) follows the existing pattern exactly.

---

## Sources

- `app/src/server/beta-analytics/types.ts` — current allowlists (inspected)
- `app/src/server/beta-analytics/record.ts` — eventKey gate logic (inspected)
- `app/src/server/beta-analytics/sanitize.ts` — `z.strictObject` properties gate (inspected)
- `app/src/server/beta-analytics/aggregate.ts` — existing aggregator contract (inspected)
- `app/src/components/feedback/OwnerAnalyticsPanel.tsx` — display caps at lines 331, 351 (inspected)
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-V11.9-BACKLOG.md` — F-06–F-14 evidence and suggested slices (inspected)
- `.planning/PROJECT.md` — locked stack decisions and v11.10 milestone scope (inspected)
- `app/drizzle/0033_beta_analytics.sql` — schema confirming JSONB properties column (inspected)
