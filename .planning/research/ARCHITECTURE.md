# Architecture: v11.10 Fechamento Entrega e Analytics

**Milestone:** v11.10  
**Researched:** 2026-06-07  
**Focus:** Integration points, new vs modified components, data flow changes, build order

---

## Existing Architecture Baseline

### End-to-End Analytics Pipeline (v11.8/v11.9 as-shipped)

```
Cockpit Panel (client)
  └─ useRecordBetaEvent(campaignId)
       └─ fetch POST /api/analytics/events
            └─ requireWorkspaceAccess
            └─ createBetaEventBodySchema.safeParse
            └─ recordBetaAnalyticsEvent (server)
                 ├─ validates eventKey ∈ PHASE_76_BETA_EVENT_KEYS
                 ├─ sanitizeBetaEventProperties (allowlist + strictObject)
                 ├─ validateCampaignOwnership / validateDerivationOwnership
                 └─ insertBetaAnalyticsEvent → DB (beta_analytics_events)

Owner Dashboard (client)
  └─ OwnerAnalyticsPanel
       ├─ GET /api/feedback/analytics/funnel?filters
       │    └─ requirePlatformOwner
       │    └─ listBetaAnalyticsEventsForOwner + listBetaSessions
       │    └─ buildAnalyticsFunnelSummary(events, sessions)
       │         ├─ aggregateMissionFunnel
       │         ├─ aggregateCockpitStageFunnel
       │         ├─ aggregateCreditSurprises + ByOperation
       │         ├─ aggregateSessionStageTimeline
       │         └─ aggregateReadinessOverrides (events + operator notes)
       └─ GET /api/feedback/analytics/credit-signals?filters
```

### Event Key Allowlist (types.ts — PHASE_76_BETA_EVENT_KEYS)

```
readiness_blocked       readiness_completed
credit_spend            credit_blocked
mission_completed
cockpit_stage_entered   cockpit_stage_completed   cockpit_stage_abandoned
```

### Property Key Allowlist (ALLOWED_PROPERTY_KEYS)

```
stage, missionKey, source, blockingCount, estimateCredits, actualCredits,
action, operation, operation_key, creditDelta, format, isPreview,
readinessStatus, durationMs, reasonCode
```

### Cockpit Panels — Current Instrumentation

| Component | stage value | entered | completed | abandoned |
|-----------|-------------|---------|-----------|-----------|
| `CreativeReadinessPanel` | `"readiness"` | ✅ on assetId present | ✅ auto on `ready`/`needs_attention` | ✅ on unmount if not completed |
| `GuidedBriefingPanel` | `"guided_briefing"` | ✅ on mount | ✅ on `finishBriefing` | ✅ on unmount or full-form escape |
| `StrategyRecipePanel` | `"strategy_recipe"` | ✅ on `open=true` | ✅ on `handleGeneratePreview` | ✅ on close or unmount |
| `PreviewGatePanel` | `"preview"` | ✅ on mount | ✅ on `handleApproveBatch` | ✅ on `handleReviseRecipe` (F-06 bug) |

### Readiness Override — Current State

`aggregate.ts::extractOperatorFalsePositiveNotes` reads `beta_sessions.operatorNotes[stage].tags` for any tag containing "false positive". Surfaces in `readinessOverrides` panel on `OwnerAnalyticsPanel`. **No UI affordance** in `CreativeReadinessPanel` for the operator to trigger the override at the time of the block — must be added retroactively via session notes.

### Owner Dashboard — Current Gaps

- `OwnerAnalyticsPanel` accepts `sessionOptions` prop but `feedback/page.tsx` calls `<OwnerAnalyticsPanel />` **without passing it** → session filter dropdown shows "All sessions" only, no individual sessions
- `sessionStageTimeline` is sliced to `slice(0, 24)` in the component (client-side cap)
- No revenue funnel section (credit spend progression across sessions)

---

## v11.10 Integration Points

### 1. `app/src/server/beta-analytics/types.ts` — **MODIFIED**

**What changes:**  
- Add `recipe_selected` and `recipe_tradeoff_viewed` to `PHASE_76_BETA_EVENT_KEYS`  
- Add `recipeId` to `ALLOWED_PROPERTY_KEYS`

**Ripple:** `sanitize.ts` uses `strictObject(ALLOWED_PROPERTY_KEYS)` — adding `recipeId` here automatically permits it in the property schema without touching `sanitize.ts` directly.

```typescript
// Add to PHASE_76_BETA_EVENT_KEYS:
"recipe_selected",
"recipe_tradeoff_viewed",

// Add to ALLOWED_PROPERTY_KEYS:
"recipeId",
```

**Why these additions:**  
- `recipe_selected` (F-09): Tracks which recipe was chosen → enables per-recipe funnel in `aggregate.ts`  
- `recipe_tradeoff_viewed` (F-08): Fires when the recipe panel is first opened → confirms readership of tradeoff copy  
- `recipeId`: Required property to distinguish recipes in analytics

---

### 2. `app/src/components/workspace/StrategyRecipePanel.tsx` — **MODIFIED**

**What changes (F-08, F-09):**

```
useEffect([open=true]) → recordEvent("recipe_tradeoff_viewed", { stage: "strategy_recipe" })
recipe.selectRecipe(id) → recordEvent("recipe_selected", { stage: "strategy_recipe", recipeId: id })
```

Note: `recipe_tradeoff_viewed` should fire once per panel open (same ref guard as `completedRef`). `recipe_selected` fires each time a recipe button is clicked. No state leak — fire-and-forget like all beta events.

---

### 3. `app/src/components/workspace/GuidedBriefingPanel.tsx` — **MODIFIED**

**What changes (F-12):**  
Enrich `cockpit_stage_abandoned` with current step info so owner can see where in the briefing flow abandonment occurs.

```typescript
// Before (existing):
recordEvent("cockpit_stage_abandoned", STAGE_PROPS);

// After (enriched):
recordEvent("cockpit_stage_abandoned", {
  ...STAGE_PROPS,
  stage: guided.currentStep ?? "complete",  // use existing 'stage' property key
});
```

`guided.currentStep` is already available in scope. The `stage` property key is already in `ALLOWED_PROPERTY_KEYS`. No new keys needed — repurpose `stage` to hold the step ID at abandonment time, which naturally composes with the existing `aggregateCockpitStageFunnel` grouping (step IDs like `"productOffer"`, `"objections"`, etc. will show as new stage rows).

---

### 4. `app/src/components/workspace/PreviewGatePanel.tsx` — **MODIFIED**

**What changes (F-06):**  
The bug: `handleReviseRecipe` fires `cockpit_stage_abandoned` even when the operator will return and ultimately approve. The fix is to **not** fire `cockpit_stage_abandoned` on recipe revision — it's an iterative step, not a true abandonment. True abandonment should only happen when the user navigates away from the cockpit entirely.

```typescript
// Remove from handleReviseRecipe:
// recordEvent("cockpit_stage_abandoned", STAGE_PROPS);  // ← remove this

// Keep in handleApproveBatch:
recordEvent("cockpit_stage_completed", STAGE_PROPS);  // ← unchanged

// Abandoned fires only if they leave cockpit without approving
// (currently handled by no cleanup return — add if needed per cockpit orchestrator)
```

**Server-side complement (F-06 full fix):** When operator marks a session runbook stage as completed via `PATCH /api/feedback/sessions/:id/stages`, emit a server-side `cockpit_stage_completed` event. This requires touching the beta session notes merge handler. Assess whether adding server-side emission to the existing `mergeStageNotes` route is in scope or deferred.

---

### 5. `app/src/components/workspace/CreativeReadinessPanel.tsx` — **MODIFIED**

**What changes (F-11 — readiness override):**  
Add an "Override — continue anyway" affordance when `readiness.status === "blocked"`. This:
1. Emits a new analytics event (use existing `readiness_blocked` with `action: "overridden"`, or add `readiness_override` to types.ts)
2. Calls a new callback prop `onOverride?: () => void` that the cockpit orchestrator uses to unlock downstream stages

```typescript
// Recommended: emit readiness_blocked with action property
recordEvent("readiness_blocked", {
  stage: "readiness",
  blockingCount: readiness.blockingIssues.length,
  action: "overridden",        // 'action' already in ALLOWED_PROPERTY_KEYS
  readinessStatus: readiness.status,
});
onOverride?.();
```

This avoids adding a new event key — `action: "overridden"` differentiates overrides from blocks in `extractReadinessBlockedEvents`. The `ReadinessOverrideSignal` interface in `aggregate.ts` and `OwnerAnalyticsPanel` already renders override signals; no schema migration needed.

**Prop addition:**
```typescript
interface CreativeReadinessPanelProps {
  // existing...
  onOverride?: () => void;  // NEW — cockpit unlocks on operator override
}
```

---

### 6. `app/src/server/beta-analytics/aggregate.ts` — **MODIFIED**

**What changes:**

**A. New function — `aggregateRecipeFunnel`**
```typescript
export interface RecipeFunnelRow {
  recipeId: string;
  viewedCount: number;     // recipe_tradeoff_viewed events
  selectedCount: number;   // recipe_selected events
}

export function aggregateRecipeFunnel(events: BetaAnalyticsEvent[]): RecipeFunnelRow[]
```
Groups `recipe_tradeoff_viewed` (total panel opens) and `recipe_selected` by `recipeId` property.

**B. New function — `aggregateCreditRevenueFunnel`**
```typescript
export interface CreditRevenueFunnelRow {
  sessionId: string;
  totalSpent: number;
  operationCount: number;
  firstSpendAt: string;
}

export function aggregateCreditRevenueFunnel(events: BetaAnalyticsEvent[]): CreditRevenueFunnelRow[]
```
Groups `credit_spend` events by `sessionId`, summing `actualCredits`.

**C. Update `AnalyticsFunnelSummary` interface and `buildAnalyticsFunnelSummary`**
```typescript
export interface AnalyticsFunnelSummary {
  // existing fields...
  recipeFunnel: RecipeFunnelRow[];
  creditRevenueFunnel: CreditRevenueFunnelRow[];
}
```

**No changes needed to `aggregateCockpitStageFunnel`** — it already handles new event keys/stages via dynamic grouping. The briefing step IDs will appear as rows naturally.

---

### 7. `app/src/app/api/feedback/analytics/funnel/route.ts` — **MODIFIED (minor)**

Returns `buildAnalyticsFunnelSummary` result already — once `aggregate.ts` adds new fields to `AnalyticsFunnelSummary`, they flow through automatically. No route-level changes needed unless the two new aggregation functions are computationally expensive enough to warrant separate endpoints (unlikely at operator-scale data volumes).

---

### 8. `app/src/components/feedback/OwnerAnalyticsPanel.tsx` — **MODIFIED**

**What changes:**

**A. Remove timeline cap (filtro de sessão polish)**
```typescript
// Remove .slice(0, 24) from:
.filter((row) => !sessionId || row.sessionId === sessionId)
// .slice(0, 24)  ← REMOVE
.map((row) => [...])
```

**B. Add recipe funnel section**
- Add `recipeFunnel: RecipeFunnelRow[]` to `FunnelResponse` type
- Render a new `FunnelTable` with headers `["Recipe", "Viewed", "Selected", "Rate"]`

**C. Add credit revenue funnel section**  
- Add `creditRevenueFunnel: CreditRevenueFunnelRow[]` to `FunnelResponse` type
- Render a new `FunnelTable` with headers `["Session", "Total Credits", "Operations", "First Spend"]`

**D. Session filter options population** (see item 9)

---

### 9. `app/src/app/(dashboard)/feedback/page.tsx` — **MODIFIED**

**What changes (session filter polish):**  
The `OwnerAnalyticsPanel` `sessionOptions` prop is never populated today. Fetch sessions from the existing `/api/feedback/sessions` endpoint and pass them.

```typescript
// Add query in FeedbackTriagePage:
const sessionsQuery = useQuery({
  queryKey: ["beta-sessions-list"],
  queryFn: async () => {
    const res = await apiFetch("/api/feedback/sessions");
    if (!res.ok || res.status === 403) return [];
    const data = await res.json();
    return (data.sessions ?? []) as Array<{ id: string; cohortLabel: string | null; startedAt: string }>;
  },
  retry: false,
});

const sessionOptions = useMemo(
  () =>
    (sessionsQuery.data ?? []).map((s) => ({
      id: s.id,
      label: s.cohortLabel ?? `Session ${s.id.slice(0, 8)}`,
    })),
  [sessionsQuery.data]
);

// Pass to panel:
<OwnerAnalyticsPanel sessionOptions={sessionOptions} />
```

---

## Data Flow Changes

### Before v11.10

```
StrategyRecipePanel → cockpit_stage_entered/completed/abandoned (stage: "strategy_recipe")
GuidedBriefingPanel → cockpit_stage_entered/completed/abandoned (stage: "guided_briefing")
PreviewGatePanel    → cockpit_stage_entered/completed/abandoned* (stage: "preview")
                      *abandoned fires on revise → F-06 false positive

aggregate.ts        → 6 aggregations, no recipe or revenue funnel
OwnerAnalyticsPanel → no recipe funnel, no revenue funnel, timeline capped at 24, no session options
feedback/page.tsx   → sessionOptions=[] always
```

### After v11.10

```
StrategyRecipePanel → +recipe_tradeoff_viewed (on open)
                      +recipe_selected { recipeId } (on each selection)
                      cockpit_stage_* unchanged

GuidedBriefingPanel → cockpit_stage_abandoned enriched with { stage: currentStepId }

PreviewGatePanel    → cockpit_stage_abandoned NOT fired on revise recipe
                      cockpit_stage_completed on batch approve (unchanged)

CreativeReadinessPanel → readiness_blocked { action: "overridden" } on override click
                         +onOverride prop → cockpit orchestrator unlocks

aggregate.ts        → +aggregateRecipeFunnel, +aggregateCreditRevenueFunnel
                      AnalyticsFunnelSummary +recipeFunnel +creditRevenueFunnel

OwnerAnalyticsPanel → renders recipe funnel + credit revenue funnel
                      timeline cap removed
                      sessionOptions populated from sessions API

feedback/page.tsx   → fetches /api/feedback/sessions, passes sessionOptions
```

---

## New vs Modified Components

### New
None — all v11.10 work is additive changes to existing components and modules.

### Modified

| File | Change Type | v11.10 Feature |
|------|-------------|----------------|
| `server/beta-analytics/types.ts` | Extend constants | F-08, F-09 |
| `components/workspace/StrategyRecipePanel.tsx` | Add event calls | F-08, F-09 |
| `components/workspace/GuidedBriefingPanel.tsx` | Enrich abandoned event | F-12 |
| `components/workspace/PreviewGatePanel.tsx` | Remove false abandoned | F-06 |
| `components/workspace/CreativeReadinessPanel.tsx` | Add override button + prop | F-11 |
| `server/beta-analytics/aggregate.ts` | Add 2 new aggregators + interface | Dashboard polish |
| `components/feedback/OwnerAnalyticsPanel.tsx` | Add sections, remove cap | Dashboard polish |
| `app/(dashboard)/feedback/page.tsx` | Populate sessionOptions | Dashboard polish |
| `server/beta-sessions/types.ts` | No change | — |
| `server/beta-analytics/record.ts` | No change | — |
| `app/api/analytics/events/route.ts` | No change | — |
| `app/api/feedback/analytics/funnel/route.ts` | No change (auto) | — |

---

## Suggested Build Order

Dependencies flow left-to-right; each phase can be committed independently.

### Wave 1 — Schema Foundation (no UI deps)
1. **`types.ts`** — add `recipe_selected`, `recipe_tradeoff_viewed` to event key const; add `recipeId` to property allowlist
2. **`aggregate.ts`** — add `aggregateRecipeFunnel`, `aggregateCreditRevenueFunnel`; update `AnalyticsFunnelSummary`

_Tests: update `aggregate.test.ts` with fixture events for new aggregators. Update `sanitize.test.ts` to verify `recipeId` is now accepted._

### Wave 2 — Cockpit Instrumentation (depends on Wave 1 types)
3. **`StrategyRecipePanel.tsx`** — emit `recipe_tradeoff_viewed` on open, `recipe_selected` on selection
4. **`GuidedBriefingPanel.tsx`** — enrich abandoned with `stage: currentStep`
5. **`PreviewGatePanel.tsx`** — remove `cockpit_stage_abandoned` from revise handler

_Tests: update `StrategyRecipePanel.test.tsx` (if it exists) to assert new event calls. Check `PreviewGatePanel.test.tsx` — ensure abandoned assertion is removed/updated._

### Wave 3 — Readiness Override (depends on cockpit arch, independent of Wave 2)
6. **`CreativeReadinessPanel.tsx`** — add override button, emit enriched `readiness_blocked`, call `onOverride()`
7. **Cockpit orchestrator** (workspace page that renders `CreativeReadinessPanel`) — handle `onOverride` prop to allow progression past blocked state

_Tests: `CreativeReadinessPanel.test.tsx` — assert override button appears on blocked status, assert event emission._

### Wave 4 — Owner Dashboard (depends on Wave 1 aggregate, independent of Waves 2/3)
8. **`OwnerAnalyticsPanel.tsx`** — add recipe funnel table, add credit revenue funnel table, remove timeline slice cap; update `FunnelResponse` type
9. **`feedback/page.tsx`** — add sessions query, pass `sessionOptions` to `OwnerAnalyticsPanel`

_Tests: `OwnerAnalyticsPanel.test.tsx` — assert recipe funnel renders, assert timeline is uncapped, assert sessions pass through._

### Wave 5 — Regression + F-14 Fix
10. **F-14 test drift** — align `creative-quality-gate-orchestration` test assertion to current regeneration suggestion behavior
11. **`npm test`, `npm run lint`, `npm run build`** green gate

---

## Pitfalls to Watch

### `sanitize.ts` uses `z.strictObject` — unknown keys throw
Any new event property that isn't in `ALLOWED_PROPERTY_KEYS` will cause a `400 validation_error` from the ingest API. **Always update `types.ts` first** before wiring new properties in components.

### `aggregate.ts` `stageFromEvent` fallback to "unknown"
When `stage` is overloaded with step IDs (GuidedBriefingPanel F-12 fix), the cockpit stage funnel will show briefing step IDs as new rows. This is intentional but should be documented in the `OwnerAnalyticsPanel` UI as "Guided briefing steps" vs "Cockpit stages."

### PreviewGatePanel F-06 — operator session server-side emit
The full F-06 fix (emit `cockpit_stage_completed` when operator marks runbook stage done) requires touching `app/src/app/api/feedback/sessions/[id]/stages/route.ts`. Assess in planning whether this is in scope or deferred — the client-side half (removing false abandoned) delivers value independently.

### `OwnerAnalyticsPanel` FunnelResponse type is local (not shared with aggregate.ts)
`FunnelResponse` type is defined inline in `OwnerAnalyticsPanel.tsx`. When `AnalyticsFunnelSummary` gains new fields in `aggregate.ts`, the client-side `FunnelResponse` type must be updated in parallel to avoid runtime `undefined` rendering.

### Session filter — `/api/feedback/sessions` auth
The sessions API is protected by `requirePlatformOwner`. `feedback/page.tsx` already handles 403 for reports — the sessions query should follow the same null/empty pattern to avoid crashing the page for non-owners.

---

## Component Boundaries Summary

```
types.ts (event key + property allowlist)
  ↓
sanitize.ts (strictObject from allowlist)
  ↓
record.ts (validates key, sanitizes, inserts)
  ↓
/api/analytics/events/route.ts (ingest endpoint)
  ↑
useRecordBetaEvent (client hook, fire-and-forget)
  ↑
Cockpit Panels: CreativeReadinessPanel, GuidedBriefingPanel,
                StrategyRecipePanel, PreviewGatePanel

aggregate.ts (pure functions over BetaAnalyticsEvent[])
  ↓
/api/feedback/analytics/funnel/route.ts (owner-gated, calls aggregate)
  ↓
OwnerAnalyticsPanel (TanStack Query, renders FunnelTable)
  ↑
feedback/page.tsx (platform owner triage surface)
```

---

## Sources

- `/app/src/server/beta-analytics/types.ts` — event key and property allowlist (read directly)
- `/app/src/server/beta-analytics/aggregate.ts` — aggregation logic (read directly)
- `/app/src/server/beta-analytics/sanitize.ts` — property validation strictObject (read directly)
- `/app/src/server/beta-analytics/record.ts` — server-side record function (read directly)
- `/app/src/server/beta-sessions/types.ts` — BETA_RUNBOOK_STAGES (read directly)
- `/app/src/components/workspace/{Strategy,GuidedBriefing,PreviewGate,CreativeReadiness}Panel.tsx` — current instrumentation (read directly)
- `/app/src/components/feedback/OwnerAnalyticsPanel.tsx` — dashboard component (read directly)
- `/app/src/app/(dashboard)/feedback/page.tsx` — page composition (read directly)
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-V11.9-BACKLOG.md` — F-06..F-14 backlog items
- `.planning/PROJECT.md` — v11.10 milestone goal
