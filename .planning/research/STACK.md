# Technology Stack

**Project:** ADScale v11.8 — Loop de Aprendizado Beta  
**Researched:** 2026-06-07  
**Scope:** Stack **additions/changes only** for beta instrumentation, owner analytics dashboard, cohort funnel, CSV export, and operator session notes. Existing Next.js / Drizzle / TanStack Query / recharts / feedback stack is locked.

## Executive Recommendation

**Add two Postgres tables + server-side event helper. Add zero (or at most one optional) npm packages.**

For 3–5 operator-guided beta sessions, first-party Postgres instrumentation beats third-party product analytics. The app already has the right primitives (`feedback_reports`, `usage_events`, `workspace_progression`, `recharts`, Drizzle aggregations). v11.8 should extend that pattern—not bolt on PostHog, a warehouse, or a CSV framework.

---

## Recommended Stack

### Core (new capabilities — mostly schema, not libraries)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **PostgreSQL (Neon)** | existing | Durable event store + session notes + funnel source of truth | Already deployed; workspace-scoped; operator-scale volume (~hundreds of rows) needs no OLAP |
| **`product_events` table** (new migration) | — | Append-only instrumentation: mission conversion, cockpit stage enter/exit/abandon, credit estimate vs debit, readiness block/override | Explicit events unblock funnel math; inferring only from `workspace_progression` misses abandonment and timing |
| **`beta_sessions` table** (new migration) | — | Operator session record: cohort label, workspace link, per-stage structured notes, start/end timestamps | Runbook requires structured notes per cockpit stage; separates operator evidence from user-submitted feedback |
| **Drizzle ORM** | `^0.45.2` (installed) | Inserts, `count()`, `groupBy()`, `sql` templates for funnel aggregates | Verified Context7: `count()`, `groupBy()`, `sql`…`having` support matches funnel needs; no new query layer |
| **Zod** | `^3.0.0` (installed) | `productEventSchema`, `betaSessionNoteSchema` at API boundaries | Same boundary-validation pattern as mission insights and feedback |
| **`trackProductEvent()` server helper** (new module) | — | Single insert path with idempotency key + workspace guard | Mirrors `trackUsage()` in `repositories/usage.ts`; keeps instrumentation server-side at API routes |

### Supporting (already installed — reuse, do not replace)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **TanStack Query** | `^5.100.1` | Owner dashboard data fetching on `/feedback` | New query keys: `beta-funnel`, `beta-signals`, `beta-sessions` |
| **recharts** | `^3.8.1` | Cohort funnel bar chart, signal counts over time | Reuse `CreditChart.tsx` dynamic-import pattern (`next/dynamic`, `ssr: false`) |
| **date-fns** | `^4.1.0` | Bucket events by day/session for dashboard axes | Already used across app; no `dayjs`/`luxon` addition |
| **feedback_reports** (table) | v11.4+ | Qualitative mission insights, triage, `mission-credit-signals` | Keep `category: "mission"` pipeline; do **not** add `mission_insights` table (explicitly rejected Phase 70/72) |
| **usage_events** (table) | v1.0+ | Credit debit ground truth | Join/compare with `credit_estimate_shown` product events for “surprise” detection |
| **workspace_progression** + mission evidence | v11.7+ | Mission **completion** ground truth | Complement with `mission_abandoned` / `cockpit_stage_abandoned` events for drop-off |
| **@sentry/nextjs** | `^10.53.1` | Trace correlation on feedback only | Debug incidents—not the analytics store |

### CSV Export (no new dependency)

| Approach | Version | Purpose | Why |
|----------|---------|---------|-----|
| **Next.js Route Handler** + native string builder | Next `16.2.6` | `GET /api/feedback/analytics/export.csv` | 3–5 sessions × ~11 mission stages × few events = tiny payload; `Content-Type: text/csv` + `Content-Disposition: attachment` is sufficient |
| **Optional: `escapeCsvCell()` util** (~15 LOC) | in-repo | RFC 4180 escaping for notes/messages | Avoids `papaparse` / `csv-stringify` for write-only, operator-scale export |

---

## Schema Shape (integration contract)

These are **not** npm packages—they define how new code plugs into Drizzle.

### `product_events`

```typescript
// Illustrative — implement in schema.ts + migration
{
  id: uuid,
  workspaceId: uuid,          // FK workspaces
  userId: text,               // FK user
  betaSessionId: uuid | null, // FK beta_sessions
  eventName: text,            // e.g. "cockpit_stage_entered"
  stage: text | null,         // cockpit/mission stage enum
  properties: jsonb,          // { estimateCredits, actualCredits, missionKey, readinessStatus, ... }
  idempotencyKey: text | null,// unique — debounce readiness rerun, preview confirm
  createdAt: timestamp,
}
// Indexes: (workspace_id, created_at), (event_name, created_at), (beta_session_id), (idempotency_key) unique
```

**Event names (minimum set for v11.8 learning questions):**

| Signal | `eventName` values | `stage` / `properties` |
|--------|-------------------|--------------------------|
| Mission conversion | `mission_completed`, `mission_abandoned` | `missionKey`; completion may still mirror progression evidence |
| Cockpit abandonment | `cockpit_stage_entered`, `cockpit_stage_completed`, `cockpit_stage_abandoned` | Align with `MISSION_ORDER` + runbook stages: `readiness`, `guided_briefing`, `strategy_recipe`, `preview`, `batch`, `review`, `approval_package`, `share` |
| Credit surprises | `credit_estimate_shown`, `credit_debited` | `properties.estimateCredits`, `properties.actualCredits`, `properties.action` — correlate with `usage_events` |
| Readiness false positives | `readiness_result`, `readiness_blocked_proceeded` | `properties.status`, `properties.blockingIssues`, `properties.userProceededDespiteBlock` |

Instrument at **server API boundaries** (preflight POST, derivation queue, billing debit, mission insight routes)—not client-only beacons.

### `beta_sessions`

```typescript
{
  id: uuid,
  workspaceId: uuid,
  cohortLabel: text,          // e.g. "beta-wave-1", "session-2026-06-10"
  operatorUserId: text,       // platform owner running the session
  startedAt: timestamp,
  endedAt: timestamp | null,
  stageNotes: jsonb,          // { readiness: { notes, tags, completedAt }, preview: {...}, ... }
  createdAt: timestamp,
}
```

Optional: `workspaces.betaCohort` text column if cohort is stable per workspace—otherwise `cohortLabel` on session is enough for 3–5 runs.

---

## Funnel Aggregation (Drizzle — no new lib)

Owner dashboard queries live in a new `server/analytics/` module:

| Query | Drizzle pattern | Output |
|-------|-----------------|--------|
| Cohort funnel | `count(distinct workspace_id)` grouped by `stage` where `event_name = 'cockpit_stage_completed'`, filtered by `beta_session_id` or `cohortLabel` | Stage → count bar chart (recharts) |
| Mission conversion | Join progression snapshot or `mission_completed` events / total workspaces in cohort | % completing each `missionKey` |
| Credit surprises | Compare `credit_estimate_shown` vs next `credit_debited` or `usage_events` within session window | List of `{ workspace, stage, delta }` |
| Readiness false positives | `readiness_result` where `status=blocked` followed by `readiness_blocked_proceeded` or generation without rerun | Count + link to feedback report |

Use `count()`, `groupBy()`, and `sql` template for thresholds (Context7 `/websites/orm_drizzle_team`, HIGH confidence). No materialized views at this scale.

---

## Owner Dashboard Integration Points

| Surface | Change | Stack touchpoint |
|---------|--------|------------------|
| `/feedback` page | Add cohort funnel chart, signal summary cards, session list, “Export CSV” button | TanStack Query + recharts (existing) |
| `/api/feedback/mission-credit-signals` | Extend or sibling route for readiness/cockpit aggregates | Drizzle queries on `product_events` + existing `feedback_reports` |
| New routes | `POST/GET /api/owner/beta-sessions`, `GET /api/owner/analytics/funnel`, `GET /api/owner/analytics/export` | Owner-only guard (same pattern as feedback 403) |
| Mission insights | Keep writing to `feedback_reports`; optionally emit matching `product_events` for quant funnel | No schema fork |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Event storage | `product_events` (Postgres) | PostHog / Mixpanel / Amplitude | Vendor cost, GDPR/workspace isolation, overkill for 3–5 sessions; duplicates data already in Postgres |
| Event storage | `product_events` | Reuse `activity_events` only | Table exists but is **read-only in practice** (no writers found); lacks `eventName`/session indexes and idempotency |
| Mission insights | `feedback_reports` + events | New `mission_insights` table | Explicitly rejected Phase 70/72 — keep one triage pipeline |
| Funnel compute | Drizzle SQL at request time | ClickHouse / Timescale / Materialize | No time-series volume; adds infra |
| Funnel compute | Drizzle SQL | Inngest scheduled rollups | Extra complexity; 3–5 sessions don't need async aggregation |
| Charts | recharts (installed) | Tremor / Chart.js / Nivo | New bundle + pattern; `CreditChart` already establishes convention |
| CSV export | Native Route Handler | `papaparse`, `csv-stringify`, `fast-csv` | Write-only, tiny datasets; escaping is ~15 lines |
| Session notes | `beta_sessions.stageNotes` JSONB | Notion/Airtable external | Breaks owner dashboard + CSV in one place; operator already works in `/feedback` |
| Client analytics | Server-side `trackProductEvent` | Browser SDK (Segment snippet) | Workspace auth + reliability; matches existing API-first architecture |
| Caching | None | Upstash Redis (`@upstash/redis` installed) | Premature for operator dashboard; query directly |

---

## What NOT to Add

| Anti-pattern | Reason |
|--------------|--------|
| PostHog, Mixpanel, Plausible, GA4 | Third-party analytics stack for 3–5 sessions |
| `@tanstack/react-table` | Feedback page already hand-rolls tables; not required for CSV |
| Warehouse / stream (Kafka, Tinybird, MotherDuck) | Operator-scale Postgres is the warehouse |
| Inngest cron for analytics | Synchronous Drizzle queries are fast enough |
| Separate `mission_insights` table | Conflicts with v11.7 decision |
| Client-side event queue + batch flush | Failure modes; server routes already know workspace context |
| Materialized views / pg_cron | Migration + refresh ops not justified |
| New chart library | recharts sufficient |
| CSV npm package (default) | Only add `csv-stringify` if export bugs appear in UAT |

---

## Installation

**Expected: no new production dependencies.**

```bash
# Schema only — after PLAN approves event taxonomy
cd app && npm run db:generate && npm run db:migrate
```

If CSV edge cases appear in UAT (embedded quotes in Portuguese notes):

```bash
cd app && npm install csv-stringify@^6.5.2
# Use only in export route — still optional
```

---

## Version Verification

| Package | Installed | Verified | Confidence |
|---------|-----------|----------|------------|
| drizzle-orm | `^0.45.2` | Context7 `/websites/orm_drizzle_team` — `count`, `groupBy`, `sql` aggregation | HIGH |
| recharts | `^3.8.1` | In-repo `CreditChart.tsx` + package.json | HIGH |
| @tanstack/react-query | `^5.100.1` | In-repo `/feedback` page patterns | HIGH |
| date-fns | `^4.1.0` | package.json | HIGH |
| Next.js | `16.2.6` | Route Handler CSV response pattern (framework docs) | MEDIUM |
| csv-stringify | not installed | Optional fallback only | LOW — defer |

---

## Sources

- ADScale codebase: `app/package.json`, `app/src/server/db/schema.ts`, `app/src/server/repositories/usage.ts`, `app/src/server/feedback/mission-credit-signals.ts`, `app/src/server/mission-insights/service.ts`, `app/src/app/(dashboard)/feedback/page.tsx`, `app/src/components/dashboard/CreditChart.tsx`, `app/src/server/progression/missions/definitions.ts`
- Phase decisions: `.planning/phases/70-mission-linked-insight-capture/70-CONTEXT.md`, `.planning/phases/72-build-and-data-integrity-hardening/72-CONTEXT.md`, `.planning/phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md`, `.planning/phases/67-milestone-archive-and-beta-runbook/67-LEARNING-QUESTIONS.md`
- Drizzle ORM aggregation: https://orm.drizzle.team/docs/select (count, groupBy) — via Context7 `/websites/orm_drizzle_team`
- Drizzle SQL templates: https://orm.drizzle.team/docs/sql — via Context7
- Next.js Route Handlers (CSV download): https://nextjs.org/docs/app/building-your-application/routing/route-handlers
