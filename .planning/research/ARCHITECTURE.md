# Architecture: v11.11 Aprendizado → Ação

**Milestone:** v11.11  
**Researched:** 2026-06-08  
**Focus:** Integration points, new vs modified components, data flow changes, build order  
**Predecessor:** v11.10 (Fechamento Entrega e Analytics) — all v11.10 changes are shipped and are the baseline here

---

## Existing Architecture Baseline

### Analytics Pipeline (v11.10 as-shipped)

```
Cockpit Panels (client)
  └─ useRecordBetaEvent(campaignId)
       └─ POST /api/analytics/events
            └─ requireWorkspaceAccess
            └─ createBetaEventBodySchema.safeParse
            └─ recordBetaAnalyticsEvent
                 ├─ validates eventKey ∈ PHASE_76_BETA_EVENT_KEYS
                 ├─ sanitizeBetaEventProperties (ALLOWED_PROPERTY_KEYS strictObject)
                 └─ insertBetaAnalyticsEvent → DB (beta_analytics_events)

/api/campaigns/[id]/assets/[assetId]/preflight (PATCH/POST)
  └─ emitReadinessAnalytics → readiness_blocked/readiness_completed
       └─ properties: { stage, missionKey, blockingCount, readinessStatus, action? }
       ← NOTE: overallScore NOT included yet

/api/share (POST)
  └─ createShareToken → shareLinks (DB)
  └─ recordBetaAnalyticsEvent → mission_completed { missionKey: "share" }

share/[token]/page.tsx (Server Component, public)
  └─ validateShareToken → queries DB directly
  └─ renders GalleryGrid
  ← NOTE: no view tracking; no analytics

Owner Dashboard
  └─ OwnerAnalyticsPanel
       ├─ GET /api/feedback/analytics/funnel
       │    └─ buildAnalyticsFunnelSummary(events, sessions)
       │         → missionFunnel, cockpitStageFunnel, recipeFunnel,
       │            guidedBriefingAbandonByStep, creditSpendByStage,
       │            creditSurprises, creditSurprisesByOperation,
       │            sessionStageTimeline, readinessOverrides, totals
       └─ GET /api/feedback/analytics/credit-signals
```

### Current Event Key Allowlist

```
readiness_blocked, readiness_completed
credit_spend, credit_blocked
mission_completed
cockpit_stage_entered, cockpit_stage_completed, cockpit_stage_abandoned
recipe_selected, recipe_tradeoff_viewed
```

### Current Property Key Allowlist

```
stage, missionKey, source, blockingCount, estimateCredits, actualCredits,
action, operation, operation_key, creditDelta, format, isPreview,
readinessStatus, durationMs, reasonCode, recipeId, stepId
```

### Readiness Thresholds (creative-readiness.ts — hardcoded)

```typescript
const BLOCKING_SCORE_THRESHOLD = 50;   // score < 50 → "blocked"
const READY_SCORE_THRESHOLD = 70;      // score < 70 → "needs_attention"
```

`buildCreativeReadiness` produces `overallScore` from `preflight.overallScore` but the value is **not included** in the emitted analytics event — owner cannot currently see where overrides cluster on the score distribution.

### Share Link Table (shareLinks)

```
id, token, campaignId, workspaceId, derivationIds[], expiresAt, createdAt
```

No `viewCount`. No server-side view tracking. The public `share/[token]` page serves images via `/api/share/[token]/asset/[derivationId]` but neither route emits analytics.

### Post-Preview Gap (F-07 baseline)

`aggregateSessionStageTimeline` computes `gapFromPreviousMs` between completed stages. Fixture data shows ~38-min gap between `cockpit_stage_completed("preview")` and `cockpit_stage_completed("approval_package")`. No UX intervention exists to close this gap.

---

## v11.11 Integration Points

### Three Capability Clusters

| Cluster | Goal | Key Insight |
|---------|------|-------------|
| **Readiness Tuning** | Surface score-at-override data so thresholds can be adjusted with evidence | Thresholds are correct mechanism; missing signal is `overallScore` in events |
| **Post-Preview Stall UX** | Reduce ~38-min gap between preview approval and approval-package creation | Gap is visibility+momentum problem; a post-batch nudge component bridges it |
| **Share Link Analytics** | Track self-serve rate, view counts, time-to-share, assistance correlation | Share page is public; tracking requires a schema column + Server Component update |

---

### 1. `app/src/server/beta-analytics/types.ts` — **MODIFIED**

**What changes:**
```typescript
// Add to ALLOWED_PROPERTY_KEYS:
"overallScore",    // readiness score at time of blocked/override event
"viewCount",       // share link page view count (owner-facing event property)
```

`"overallScore"` is the key unlock for readiness tuning — it lets `aggregateReadinessScoreDistribution` cluster overrides by score bucket. `"viewCount"` is needed if the owner dashboard emits a synthetic share-link-viewed event; alternatively, viewCount lives only in the DB column and doesn't need to be an event property.

**Decision point:** If share view tracking uses a DB column increment only (recommended — public page, no auth), `viewCount` does NOT need to go into ALLOWED_PROPERTY_KEYS. Add `"overallScore"` only.

---

### 2. `app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts` — **MODIFIED**

**What changes (readiness tuning foundation):**

In `emitReadinessAnalytics`, add `overallScore` to the emitted properties:

```typescript
properties: {
  stage: "readiness",
  missionKey: "readiness",
  blockingCount: readiness.blockingIssues.length,
  readinessStatus: readiness.status,
  overallScore: readiness.overallScore,   // ← NEW
  ...(options?.action ? { action: options.action } : {}),
},
```

`readiness.overallScore` is already computed inside `buildCreativeReadiness` (via `preflight.overallScore`). This is a one-line addition to an existing event. No schema change; just add `"overallScore"` to ALLOWED_PROPERTY_KEYS first.

---

### 3. `app/src/server/beta-analytics/aggregate.ts` — **MODIFIED**

**What changes:**

**A. New interface + function — `aggregateReadinessScoreDistribution`**

```typescript
export interface ReadinessScoreBucket {
  bucket: string;           // e.g. "40-49", "50-59"
  totalBlocked: number;
  overridden: number;
  overrideRate: number | null;
}

export function aggregateReadinessScoreDistribution(
  events: BetaAnalyticsEvent[]
): ReadinessScoreBucket[]
```

Logic: filter `readiness_blocked` events; read `overallScore` property; bucket by 10-point range; count total vs those with `action === "overridden"`. Sort by bucket ascending. Owner can visually identify "score 40-49 has 80% override rate → threshold may be too aggressive."

**B. Update `AnalyticsFunnelSummary` interface**

```typescript
export interface AnalyticsFunnelSummary {
  // existing...
  readinessScoreDistribution: ReadinessScoreBucket[];
}
```

**C. Update `buildAnalyticsFunnelSummary`**

```typescript
readinessScoreDistribution: aggregateReadinessScoreDistribution(events),
```

---

### 4. `app/src/server/db/schema.ts` — **MODIFIED (minor)**

**What changes (share link view tracking):**

Add `viewCount` column to `shareLinks`:

```typescript
export const shareLinks = adscaleSchema.table(
  "share_links",
  {
    // existing columns...
    viewCount: integer("view_count").notNull().default(0),  // ← NEW
  },
  // ...
);
```

**DB Migration required:** New migration file `app/drizzle/XXXX_add_share_link_view_count.sql`:
```sql
ALTER TABLE adscale.share_links ADD COLUMN view_count integer NOT NULL DEFAULT 0;
```

---

### 5. `app/src/app/share/[token]/page.tsx` — **MODIFIED**

**What changes (share link view tracking):**

After `validateShareToken` succeeds, fire a non-blocking `viewCount` increment:

```typescript
// After: if (!link) { notFound(); }

// Non-blocking view count increment — fire and forget
db.update(shareLinks)
  .set({ viewCount: sql`${shareLinks.viewCount} + 1` })
  .where(eq(shareLinks.token, token))
  .catch(() => undefined);  // swallow — don't fail page render
```

This runs in the Server Component during RSC render. The increment is intentionally non-blocking (using `.catch()` or `void`) — a failed counter must never break the public gallery.

**Important:** The `sql`` `` `` ` tagged template from Drizzle performs an atomic `viewCount + 1` to avoid read-modify-write races on concurrent page loads.

---

### 6. New function in `app/src/server/beta-analytics/query.ts` — **MODIFIED**

**What changes (share analytics query):**

Add a query that joins `shareLinks` with `beta_analytics_events` for the owner funnel:

```typescript
export async function listShareLinksForOwner(
  filters: { workspaceId?: string; from?: Date; to?: Date }
): Promise<Array<{
  id: string;
  campaignId: string;
  workspaceId: string;
  viewCount: number;
  createdAt: Date;
  expiresAt: Date;
}>>
```

Fetches `shareLinks` rows scoped to optional `workspaceId` and date range. Returns raw rows; aggregation is handled in `aggregate.ts`. Called by the funnel route alongside `listBetaAnalyticsEventsForOwner`.

---

### 7. New function in `app/src/server/beta-analytics/aggregate.ts` — **MODIFIED**

**What changes:**

**New interface + function — `aggregateShareFunnel`**

```typescript
export interface ShareFunnelRow {
  workspaceId: string;
  campaignCount: number;
  totalShareLinks: number;
  totalViews: number;
  medianTimeToShareMs: number | null;
  hadReadinessOverride: boolean;   // "used assistance" flag
}

export interface ShareSummary {
  rows: ShareFunnelRow[];
  selfServeRate: number | null;   // % workspaces with 0 overrides that created ≥1 share link
  overrideAssistedRate: number | null;  // % workspaces with ≥1 override that created ≥1 share link
}

export function aggregateShareFunnel(
  shareLinks: Array<{ workspaceId: string; campaignId: string; viewCount: number; createdAt: Date }>,
  events: BetaAnalyticsEvent[],
  campaigns: Array<{ id: string; workspaceId: string; createdAt: Date }>
): ShareSummary
```

Logic:
- Group `shareLinks` by `workspaceId`
- Compute `timeToShareMs` = `shareLink.createdAt - campaign.createdAt` for each link's campaign
- Determine `hadReadinessOverride` = workspaceId appears in `readiness_blocked { action: "overridden" }` events
- Compute `selfServeRate` = (workspaces with ≥1 share link AND 0 override events) / (total workspaces with ≥1 share link)
- Compute `medianTimeToShareMs` using sorted array median

**Update `AnalyticsFunnelSummary`:**
```typescript
shareFunnel: ShareSummary;
```

---

### 8. `app/src/app/api/feedback/analytics/funnel/route.ts` — **MODIFIED**

**What changes:**

Add `listShareLinksForOwner` and campaign creation dates query to build the share funnel:

```typescript
const [events, sessions, shareLinksData, campaignDates] = await Promise.all([
  listBetaAnalyticsEventsForOwner(filters),
  listBetaSessions(filters),
  listShareLinksForOwner(filters),      // ← NEW
  listCampaignCreationDates(filters),   // ← NEW (simple query: id, workspaceId, createdAt)
]);

const summary = buildAnalyticsFunnelSummary(events, sessions, shareLinksData, campaignDates);
```

`buildAnalyticsFunnelSummary` signature needs a minor update to accept the extra params and call `aggregateShareFunnel`.

---

### 9. NEW — `app/src/components/workspace/PostPreviewNudge.tsx` — **NEW**

**Purpose (F-07 stall intervention):**

A lightweight contextual CTA that appears in the workspace cockpit after the user approves a batch in `PreviewGatePanel` and the batch derivations are all completed (status no longer `"generating"`). Nudges the user toward creating an approval package, reducing the ~38-min drift.

```typescript
interface PostPreviewNudgeProps {
  campaignId: string;
  batchStatus: "generating" | "completed" | "partial" | "idle";
  hasApprovalPackage: boolean;
  className?: string;
}
```

**Render condition:** `batchStatus === "completed" && !hasApprovalPackage`

**Content:** "Your creatives are ready. Create an approval package to share with your client →" (localized). Single CTA that scrolls/navigates to `ClientApprovalPackagePanel`.

**Analytics:** On render (visible), emit `cockpit_stage_entered { stage: "approval_package", source: "nudge" }` via `useRecordBetaEvent`. This event closes the stall detection loop — the owner dashboard will show time between `cockpit_stage_completed("preview")` and this new entered event.

**Why new component vs modifying PreviewGatePanel:** `PreviewGatePanel` doesn't know batch completion status (it fires `onApproveBatch` and exits). The orchestrator (cockpit page) knows both batch status and whether a package exists. The nudge is a separate concern from the gate decision.

---

### 10. Cockpit orchestrator page — **MODIFIED (minor)**

**What changes:**

The workspace cockpit page that renders `PreviewGatePanel` and `ClientApprovalPackagePanel` needs to:
1. Track whether the batch has completed post-approval (available from TanStack Query derivations polling — all derivations in batch have non-`generating` status)
2. Track whether an approval package exists (available from `useApprovalPackage` hook — `data?.shareUrl` truthy or `data?.package.items.length > 0`)
3. Conditionally render `<PostPreviewNudge />` between the gallery and the approval panel

No new API calls needed — both signals are already polled.

---

### 11. `app/src/components/feedback/OwnerAnalyticsPanel.tsx` — **MODIFIED**

**What changes:**

**A. New section — Readiness score distribution**

```typescript
<FunnelTable
  title="Readiness score distribution (blocked events)"
  headers={["Score range", "Total blocked", "Overridden", "Override rate"]}
  rows={(funnel.readinessScoreDistribution ?? []).map((row) => [
    row.bucket,
    String(row.totalBlocked),
    String(row.overridden),
    row.overrideRate !== null ? `${Math.round(row.overrideRate * 100)}%` : "—",
  ])}
/>
```

Owner sees: "score 40-49 had 4 blocks, 3 overridden (75%) → BLOCKING_SCORE_THRESHOLD=50 may be 5 points too high."

**B. New section — Share funnel**

```typescript
<FunnelTable
  title="Share link funnel"
  headers={["Workspace", "Campaigns", "Links created", "Total views", "Median time-to-share", "Assistance"]}
  rows={(funnel.shareFunnel?.rows ?? []).map((row) => [
    row.workspaceId.slice(0, 8) + "…",
    String(row.campaignCount),
    String(row.totalShareLinks),
    String(row.totalViews),
    row.medianTimeToShareMs !== null ? formatGapMs(row.medianTimeToShareMs) : "—",
    row.hadReadinessOverride ? "Assisted" : "Self-serve",
  ])}
/>
```

Plus summary stats: self-serve rate and override-assisted rate at the top.

**C. Update `FunnelResponse` type**

```typescript
type FunnelResponse = {
  // existing...
  readinessScoreDistribution?: ReadinessScoreBucket[];
  shareFunnel?: ShareSummary;
};
```

---

## Data Flow Changes

### Before v11.11

```
preflight PATCH/POST → readiness_blocked { blockingCount, readinessStatus, action? }
                       ← NO overallScore
share/[token] page  → no tracking; viewCount does not exist
shareLinks table    → token, campaignId, workspaceId, derivationIds, expiresAt, createdAt
                       ← NO viewCount
OwnerAnalyticsPanel → no readiness score distribution
                    → no share funnel
                    → no time-to-share
cockpit page        → PreviewGatePanel onApproveBatch → nothing after batch completes
                       ← no nudge toward approval package
```

### After v11.11

```
preflight PATCH/POST → readiness_blocked { blockingCount, readinessStatus, overallScore, action? }
                       ← overallScore now captured

share/[token] page  → Server Component increments shareLinks.viewCount atomically (fire-and-forget)

shareLinks table    → + viewCount integer NOT NULL DEFAULT 0

aggregate.ts        → + aggregateReadinessScoreDistribution(events) → ReadinessScoreBucket[]
                    → + aggregateShareFunnel(shareLinks, events, campaigns) → ShareSummary

/api/feedback/analytics/funnel → also queries shareLinks + campaign dates
                                → AnalyticsFunnelSummary + readinessScoreDistribution + shareFunnel

OwnerAnalyticsPanel → readiness score distribution section
                    → share funnel section with self-serve vs assisted rates
                    → median time-to-share per workspace

cockpit page        → PostPreviewNudge renders when batchStatus=completed && no package yet
                    → emits cockpit_stage_entered { stage: "approval_package", source: "nudge" }
```

---

## New vs Modified Components

### New

| File | Purpose |
|------|---------|
| `components/workspace/PostPreviewNudge.tsx` | Post-batch CTA to close preview→approval-package gap |
| `drizzle/XXXX_add_share_link_view_count.sql` | Migration: add viewCount to share_links |

### Modified

| File | Change Type | v11.11 Cluster |
|------|-------------|----------------|
| `server/beta-analytics/types.ts` | Add `"overallScore"` to ALLOWED_PROPERTY_KEYS | Readiness tuning |
| `app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts` | Emit `overallScore` in readiness analytics | Readiness tuning |
| `server/beta-analytics/aggregate.ts` | `aggregateReadinessScoreDistribution`, `aggregateShareFunnel`, update `AnalyticsFunnelSummary` | Readiness tuning + share analytics |
| `server/beta-analytics/query.ts` | Add `listShareLinksForOwner`, `listCampaignCreationDates` | Share analytics |
| `server/db/schema.ts` | Add `viewCount` to `shareLinks` table | Share analytics |
| `app/share/[token]/page.tsx` | Non-blocking `viewCount` increment on render | Share analytics |
| `app/api/feedback/analytics/funnel/route.ts` | Add shareLinks + campaign queries; pass to summary | Share analytics |
| `components/feedback/OwnerAnalyticsPanel.tsx` | Readiness score distribution + share funnel sections | Both |
| `app/(dashboard)/feedback/page.tsx` | `FunnelResponse` type update (if locally typed) | Both |
| Cockpit orchestrator page (workspace pilot/campaign page) | Render `PostPreviewNudge` conditionally | Post-preview stall UX |

### Unchanged (explicitly)

| File | Why unchanged |
|------|--------------|
| `server/beta-analytics/sanitize.ts` | `strictObject(ALLOWED_PROPERTY_KEYS)` — automatically picks up `overallScore` via types.ts |
| `server/beta-analytics/record.ts` | No change to ingest path |
| `components/workspace/CreativeReadinessPanel.tsx` | Override button and `onOverride` prop already shipped in v11.10 |
| `components/workspace/PreviewGatePanel.tsx` | F-06 fix already shipped in v11.10 |
| `server/ai/creative-readiness.ts` | Thresholds stay hardcoded until score distribution data exists; tuning is a post-data decision, not a v11.11 code change |
| `lib/share-token.ts` | No changes to token validation |
| `app/api/share/[token]/asset/[derivationId]/route.ts` | Asset serving unchanged |

---

## Component Boundaries

```
types.ts (ALLOWED_PROPERTY_KEYS + PHASE_76_BETA_EVENT_KEYS)
  ↓ used by
sanitize.ts (strictObject — auto-accepts overallScore)
  ↓ used by
record.ts → /api/analytics/events (ingest endpoint)
  ↑ called by
preflight/route.ts ← MODIFIED: adds overallScore to readiness_blocked event
useRecordBetaEvent ← called by
PostPreviewNudge.tsx ← NEW: fires cockpit_stage_entered on render

aggregate.ts (pure functions over BetaAnalyticsEvent[] + optional extra inputs)
  ├─ aggregateReadinessScoreDistribution(events) ← NEW
  └─ aggregateShareFunnel(shareLinks, events, campaigns) ← NEW
       ↓ used by
/api/feedback/analytics/funnel/route.ts ← MODIFIED: adds shareLinks + campaign queries
  ↓ consumed by
OwnerAnalyticsPanel ← MODIFIED: new readiness + share sections
  ↑ rendered by
feedback/page.tsx (sessionOptions already wired from v11.10)

shareLinks (DB table) ← MODIFIED: + viewCount column
  ← incremented by
share/[token]/page.tsx ← MODIFIED: non-blocking viewCount++
  ← queried by
listShareLinksForOwner (query.ts) ← NEW function
  ← called by
/api/feedback/analytics/funnel/route.ts
```

---

## Suggested Build Order

Dependencies flow left-to-right; each wave can be committed atomically.

### Wave 1 — Analytics Event Enrichment (no UI, no migration)

1. **`types.ts`** — add `"overallScore"` to `ALLOWED_PROPERTY_KEYS`
2. **`preflight/route.ts`** — emit `overallScore` in `emitReadinessAnalytics` properties
3. **`aggregate.ts`** — add `aggregateReadinessScoreDistribution` and interface `ReadinessScoreBucket`; update `AnalyticsFunnelSummary`

_Tests: `aggregate.test.ts` — add fixture with `overallScore` property on `readiness_blocked` events; assert distribution output. `sanitize.test.ts` — assert `overallScore` now accepted._

### Wave 2 — Share Link View Tracking (requires DB migration)

4. **`schema.ts`** — add `viewCount integer NOT NULL DEFAULT 0` to `shareLinks`
5. **Migration file** — `ALTER TABLE adscale.share_links ADD COLUMN view_count integer NOT NULL DEFAULT 0`
6. **`share/[token]/page.tsx`** — non-blocking `viewCount` increment after token validation

_Tests: `api/share/route.test.ts` — verify share creation still works. Manual: open share URL and verify increment in DB. No unit test for the public page increment needed (RSC, fire-and-forget pattern)._

### Wave 3 — Share Analytics Aggregation (depends on Wave 1 types, Wave 2 schema)

7. **`query.ts`** — add `listShareLinksForOwner`, `listCampaignCreationDates`
8. **`aggregate.ts`** — add `aggregateShareFunnel` function and `ShareFunnelRow`/`ShareSummary` interfaces; update `buildAnalyticsFunnelSummary` signature to accept extra params
9. **`funnel/route.ts`** — call new queries; pass results to `buildAnalyticsFunnelSummary`

_Tests: `aggregate.test.ts` — add fixture share links data; assert `shareFunnel.selfServeRate` and `medianTimeToShareMs`. `funnel/route.test.ts` — assert new shape passes through._

### Wave 4 — Post-Preview Stall UX Intervention (independent of Waves 1-3)

10. **`PostPreviewNudge.tsx`** — new component; renders on `batchStatus === "completed" && !hasApprovalPackage`; emits `cockpit_stage_entered { stage: "approval_package", source: "nudge" }`
11. **Cockpit orchestrator page** — wire `PostPreviewNudge` between gallery and `ClientApprovalPackagePanel`; derive `batchStatus` from derivations query, `hasApprovalPackage` from `useApprovalPackage`

_Tests: `PostPreviewNudge.test.tsx` — assert renders on condition; assert does NOT render when package exists; assert event emission. Cockpit page: assert nudge visible after batch completes._

### Wave 5 — Owner Dashboard New Sections (depends on Waves 1 + 3)

12. **`OwnerAnalyticsPanel.tsx`** — add readiness score distribution `FunnelTable`; add share funnel `FunnelTable` with self-serve/assisted rates; update local `FunnelResponse` type

_Tests: `OwnerAnalyticsPanel.test.tsx` — assert new sections render when data present; assert empty state when no data._

### Wave 6 — Regression + Green Gate

13. **`npm test`, `npm run lint`, `npm run build`** green in `app/`

---

## Pitfalls to Watch

### `sanitize.ts` strictObject — always update types.ts first

Any property not in `ALLOWED_PROPERTY_KEYS` returns `400 validation_error` from the ingest endpoint. **`overallScore` must be added to `types.ts` in Wave 1 before the preflight route change** — otherwise the enriched event silently fails (the route uses `.catch(() => warn)` swallow).

### Share page viewCount — non-blocking is mandatory

The `share/[token]/page.tsx` is a public page. Any DB error in the increment must NOT throw — the `.catch(() => undefined)` swallow pattern is correct. Drizzle's `sql`` `` `` `` atomic increment avoids read-modify-write races under concurrent page loads.

### `buildAnalyticsFunnelSummary` signature change — callers must update

`buildAnalyticsFunnelSummary(events, sessions)` gains two new optional params `shareLinks[]` and `campaigns[]`. Make them optional with empty array defaults to avoid breaking existing callers (tests, etc.).

### `FunnelResponse` type in OwnerAnalyticsPanel is locally duplicated

The `FunnelResponse` type is inline in `OwnerAnalyticsPanel.tsx` (not imported from `aggregate.ts`). When `aggregate.ts` gains `readinessScoreDistribution` and `shareFunnel` fields, the local type must be updated in parallel. Mark new fields as `?` optional to be safe against old API responses in dev.

### Readiness threshold change is NOT in v11.11 scope

The thresholds in `creative-readiness.ts` (`BLOCKING_SCORE_THRESHOLD = 50`, `READY_SCORE_THRESHOLD = 70`) should NOT be changed in v11.11 — this milestone's goal is to surface the data that enables a future evidence-based threshold decision. The score distribution table in `OwnerAnalyticsPanel` is the output; the threshold change is a post-data milestone action.

### `listShareLinksForOwner` — no workspace isolation bypass

The owner analytics funnel is behind `requirePlatformOwner`. `listShareLinksForOwner` should accept an optional `workspaceId` filter (same as existing query functions) to match the existing funnel filter behavior. Without it, the share funnel shows all workspaces, which is the intended owner view.

### Post-preview nudge — do not re-emit on every render

`PostPreviewNudge.tsx` should emit `cockpit_stage_entered` via a `useEffect` with a `once` ref guard (same pattern as `CreativeReadinessPanel`). Without the guard, TanStack Query re-renders will spam the event. Use `const emittedRef = useRef(false)` and set to `true` after first emit.

---

## Sources

- `app/src/server/beta-analytics/types.ts` — ALLOWED_PROPERTY_KEYS and event key allowlist (read directly)
- `app/src/server/beta-analytics/aggregate.ts` — aggregation logic, AnalyticsFunnelSummary interface (read directly)
- `app/src/server/ai/creative-readiness.ts` — BLOCKING/READY thresholds, buildCreativeReadiness output (read directly)
- `app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts` — emitReadinessAnalytics, overallScore gap (read directly)
- `app/src/app/api/share/route.ts` — mission_completed event emission, no view tracking (read directly)
- `app/src/app/share/[token]/page.tsx` — public Server Component, no analytics (read directly)
- `app/src/app/share/[token]/GalleryGrid.tsx` — client component, pure render (read directly)
- `app/src/server/db/schema.ts` — shareLinks table definition, no viewCount (read directly)
- `app/src/components/workspace/CreativeReadinessPanel.tsx` — override button exists (v11.10), onOverride prop (read directly)
- `app/src/components/workspace/PreviewGatePanel.tsx` — F-06 fix already applied, no post-batch nudge (read directly)
- `app/src/components/workspace/ClientApprovalPackagePanel.tsx` — approval package panel, target for nudge (read directly)
- `app/src/components/feedback/OwnerAnalyticsPanel.tsx` — current dashboard sections, FunnelResponse local type (read directly)
- `app/src/lib/hooks/use-preflight.ts` — useReadinessOverride, usePreflightScore (read directly)
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-FRICTION-BACKLOG.md` — F-07 stall, F-13 share rate backlog items
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-V11.9-BACKLOG.md` — deferred items including F-07, F-13
- `.planning/REQUIREMENTS.md` — v11.10 requirements, Future Requirements (tuning after SESS-03)
- `.planning/PROJECT.md` — v11.11 milestone goal: readiness tuning, stall interventions, share analytics
