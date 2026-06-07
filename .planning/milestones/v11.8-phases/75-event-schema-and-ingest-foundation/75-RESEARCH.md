# Phase 75: Event Schema and Ingest Foundation - Research

**Researched:** 2026-06-07
**Domain:** First-party analytics event storage, PII-safe ingest API, Drizzle/Postgres schema
**Confidence:** HIGH

## Summary

Phase 75 establishes the append-only `beta_analytics_events` table and minimal `beta_sessions` FK target in the existing `adscale_app` Drizzle schema, plus a workspace-authenticated ingest path at `POST /api/analytics/events` and an internal `recordBetaAnalyticsEvent()` for server modules (Phase 76+). The codebase already has strong precedents: `feedback_reports` for workspace-scoped writes with `requireWorkspaceAccess`, `mission-insights/sanitize.ts` for **allowlist-only** property picking (stricter than feedback's blocklist), and `usage_events` for append-only workspace telemetry with repository isolation.

**Naming divergence:** ROADMAP/REQUIREMENTS still say `product_events`; **CONTEXT locks `beta_analytics_events`**. Planner and implementation MUST use `beta_analytics_events`. Update REQUIREMENTS traceability text in a docs-only follow-up if desired — schema code uses the locked name.

**Primary recommendation:** Ship migration `0033_*` with `beta_sessions` + `beta_analytics_events`, mirror mission-insight allowlist sanitization with `z.strictObject()` rejection semantics, expose `POST /api/analytics/events` behind `requireWorkspaceAccess`, and implement `recordBetaAnalyticsEvent()` as the single write path used by both HTTP and server callers.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event schema + migration | Database / Storage | API / Backend | Drizzle tables in `adscale_app`; migration is source of truth |
| PII allowlist sanitization | API / Backend | — | Validation at ingest boundary before jsonb persist; never client-only |
| `POST /api/analytics/events` | API / Backend | Browser / Client | Client fire-and-forget calls authenticated API; workspace from session |
| `recordBetaAnalyticsEvent()` | API / Backend | — | Server-authoritative events (Phase 76) bypass HTTP but share repository |
| Workspace membership gate | API / Backend | — | `requireWorkspaceAccess` resolves user + workspace from session |
| Session FK integrity | API / Backend | Database | Validate `session_id` belongs to same `workspace_id` before insert |
| Event query helpers | API / Backend | Database | Repository filters by `workspace_id`, `session_id`, `event_key`, `created_at` |
| `beta_sessions` DDL only | Database / Storage | — | No CRUD APIs this phase; Phase 77 owns session lifecycle |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Event table naming
- Locked: Primary table name is **`beta_analytics_events`** (not `product_events`).
- Locked: Append-only event store; workspace-scoped; queryable by `workspace_id`, `event_key`, `session_id`, and `created_at`.

#### `beta_sessions` in Phase 75
- Locked: Create **`beta_sessions`** with minimal schema in this phase (migration + Drizzle model only).
- Rationale: User chose nullable `session_id` FK on events; table must exist before ingest accepts `session_id`.
- Minimal columns: `id`, `workspace_id`, `cohort_label` (nullable text), `assistance_level` (enum: `hands_on` | `observe_only`), `started_at`, `ended_at` (nullable), `operator_notes` (jsonb stage-keyed object, optional empty default), timestamps.
- Locked: **No session CRUD APIs in Phase 75** — create/list/end session routes belong to Phase 77. Phase 75 only defines FK target and nullable column on events.

#### Relationship to existing event tables
- Locked: **`activity_events` stays parallel** — no migration, no deprecation, no dual-write in this phase.
- Locked: **`usage_events` stays authoritative for credit debits** — do not duplicate credit spend into `beta_analytics_events` in Phase 75. Credit funnel reads `usage_events` in Phase 78.
- Locked: **`feedback_reports` stays qualitative lane** — no merge into analytics events.

#### Event ↔ session linkage
- Locked: `beta_analytics_events.session_id` is **nullable FK** → `beta_sessions.id`.
- Locked: Events without an active session are valid (pre-session smoke, server-only events before operator starts session 1).

#### PII and sanitization (not discussed — defaults from v11.8 research)
- Locked: **Allowlist-only** `properties` jsonb — reject unknown keys at ingest (stricter than feedback blocklist).
- Locked: No prompts, emails, free-text user content, asset URLs, or auth tokens in properties.
- Locked: Mirror feedback patterns for max payload size and structured logging (IDs only, no property bodies in logs).

#### Ingest API (not discussed — research default)
- Locked: `POST /api/analytics/events` with `requireWorkspaceAccess` for member-authenticated client events.
- Locked: Server modules call internal `recordBetaAnalyticsEvent()` directly (no HTTP) for authoritative events in Phase 76+.
- Locked: Ingest failures on client are non-blocking (fire-and-forget); server paths must not silently drop credit/mission events.

### Claude's Discretion

- Exact allowlist key set and Zod schemas per `event_key` family.
- Migration number under `app/drizzle/`.
- Repository file layout (`server/repositories/beta-analytics.ts` or split).
- Whether `campaign_id` / `derivation_id` optional UUID columns exist on events vs only in properties.
- Index strategy beyond `(workspace_id, created_at)` and `(session_id)`.
- Unit vs integration test split for sanitization vs ingest.

### Deferred Ideas (OUT OF SCOPE)

- Migrating or aliasing `activity_events` → future cleanup, not v11.8.
- Owner funnel queries and CSV export → Phase 78.
- Cockpit/mission instrumentation hooks → Phase 76.
- `readiness_overridden` distinct event type → decide in Phase 76 instrumentation spec.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INST-01 | Developer can persist sanitized product events in a workspace-scoped table via API | `beta_analytics_events` + `POST /api/analytics/events` + `recordBetaAnalyticsEvent()`; workspace_id from auth, not body |
| INST-05 | Event property allowlist excludes PII | Allowlist-only `properties` with `z.strictObject()` / explicit unknown-key rejection; block prompt/email/url/token keys |
| INST-06 | Tests cover sanitization, workspace-scoped insert, rejected disallowed properties | Vitest unit tests (sanitize + route mocks) + repository insert test; mirror `sanitize.test.ts` and `route.test.ts` patterns |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.2 [VERIFIED: npm registry] | Schema + typed inserts/queries | Already used for all app tables in `adscale_app` |
| drizzle-kit | 0.31.10 [VERIFIED: package.json] | Migration generation | `npm run db:generate` / `db:migrate` workflow |
| zod | 3.25.76 [VERIFIED: npm registry] | Request + property validation | Used at every API boundary (`feedback`, `mission-insights`) |
| PostgreSQL (Neon/pg) | — | Append-only event store | Existing production DB; jsonb for `properties` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.5 [VERIFIED: package.json] | Unit/route/repository tests | All INST-06 coverage |
| `@/lib/logger` | — | Structured ingest logs | IDs only on success/failure — mirror feedback route |
| `@/server/feedback/validate-refs` | — | Campaign/derivation ownership | When optional `campaignId`/`derivationId` on ingest body |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `beta_analytics_events` (locked) | `product_events` (ROADMAP name) | CONTEXT overrides ROADMAP; same shape, different name |
| Allowlist-only properties | Feedback blocklist (`sanitize.ts`) | Blocklist still permits unknown keys; INST-05 requires stricter reject-unknown |
| `z.strictObject()` per family | Single global allowlist union | Global union simpler for Phase 75 foundation; per-`event_key` families scale better in Phase 76 |
| pgEnum for `assistance_level` | `text` + Zod enum | **Use text** — no `pgEnum` in current `schema.ts`; matches existing convention |
| Integration DB tests | Mocked repository only | Mocks sufficient for Phase 75; optional `TEST_DATABASE_URL` insert test if CI has DB |

**Installation:** No new packages required.

```bash
# Existing workflow only
cd app && npm run db:generate && npm run db:migrate
```

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────┐     POST /api/analytics/events      ┌─────────────────────────┐
│ Browser      │ ──────────────────────────────────► │ requireWorkspaceAccess  │
│ (Phase 76)   │   { eventKey, sessionId?, props }   │ Zod body parse          │
└──────────────┘                                     └───────────┬─────────────┘
                                                                 │
┌──────────────┐     recordBetaAnalyticsEvent()                  │
│ Server API   │ ───────────────────────────────────────────────►│
│ (Phase 76+)  │   authoritative events                        │
└──────────────┘                                                 ▼
                                                    ┌─────────────────────────┐
                                                    │ sanitizeBetaEventProps  │
                                                    │ (allowlist-only, strict)│
                                                    └───────────┬─────────────┘
                                                                │
                              session_id? ──► validate FK ──────┤
                              campaign/derivation? ──► validate-refs
                                                                ▼
                                                    ┌─────────────────────────┐
                                                    │ beta-analytics repo     │
                                                    │ insert + list filters   │
                                                    └───────────┬─────────────┘
                                                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ PostgreSQL adscale_app                                                       │
│  beta_sessions (DDL only Phase 75) ◄──nullable FK── beta_analytics_events   │
│  workspaces ◄── FK cascade                                                   │
│  Parallel unchanged: usage_events | activity_events | feedback_reports       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
app/
├── drizzle/
│   └── 0033_beta_analytics.sql          # beta_sessions + beta_analytics_events
├── src/server/
│   ├── db/schema.ts                     # Drizzle table definitions + types
│   ├── beta-analytics/
│   │   ├── sanitize.ts                  # Allowlist + payload bounds
│   │   ├── sanitize.test.ts
│   │   ├── types.ts                     # event_key unions, property schemas (discretion)
│   │   └── record.ts                    # recordBetaAnalyticsEvent() — single write path
│   └── repositories/
│       ├── beta-analytics.ts            # insert, listBetaAnalyticsEvents(filters)
│       └── beta-analytics.test.ts
└── src/app/api/analytics/events/
    ├── route.ts                         # POST only
    └── route.test.ts
```

### Pattern 1: Drizzle workspace-scoped append-only table

**What:** New tables in `adscaleSchema` with `workspace_id` FK `onDelete: 'cascade'`, uuid PK, timestamps.  
**When:** Every new domain table in ADScale.  
**Example:**

```typescript
// Pattern from schema.ts: feedback_reports, usage_events [VERIFIED: codebase]
export const betaAnalyticsEvents = adscaleSchema.table(
  "beta_analytics_events",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => betaSessions.id, {
      onDelete: "set null",
    }),
    eventKey: text("event_key").notNull(),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    derivationId: uuid("derivation_id").references(() => derivations.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("beta_analytics_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("beta_analytics_events_session_id_idx").on(table.sessionId),
    index("beta_analytics_events_event_key_idx").on(table.workspaceId, table.eventKey, table.createdAt),
  ]
);
```

**Recommended discretion resolution:** Add `campaign_id` / `derivation_id` as nullable UUID columns (not only in `properties`) — matches `feedback_reports`, enables Phase 78 funnel joins without jsonb extraction. [VERIFIED: codebase pattern]

### Pattern 2: Allowlist-only property sanitization (stricter than feedback)

**What:** Reject unknown property keys at ingest; strip nothing silently.  
**When:** INST-05 — analytics properties must never carry PII.  
**Precedent:** `mission-insights/sanitize.ts` uses `ALLOWED_DIAGNOSTIC_KEYS` Set + pick-only; feedback uses blocklist stripping.  
**Example:**

```typescript
// Source: Zod docs — z.strictObject rejects unknown keys [CITED: github.com/colinhacks/zod]
import { z } from "zod";

const ALLOWED_PROPERTY_KEYS = [
  "stage", "missionKey", "source", "blockingCount", "estimateCredits",
  "actualCredits", "action", "operation", "format", "isPreview",
  "readinessStatus", "durationMs", "reasonCode",
] as const;

const propertiesSchema = z.strictObject(
  Object.fromEntries(
    ALLOWED_PROPERTY_KEYS.map((k) => [k, z.union([z.string(), z.number(), z.boolean(), z.null()])])
  ) as Record<(typeof ALLOWED_PROPERTY_KEYS)[number], z.ZodTypeAny>
);

// Reject: prompt, email, message, url, assetUrl, token, breadcrumbs, diagnosticContext, etc.
```

**Value typing:** Restrict to scalar json-safe types (string | number | boolean | null). No nested objects in Phase 75 — keeps allowlist auditable. Phase 76 can add per-`event_key` strict schemas in discretion area.

### Pattern 3: Single internal write path

**What:** `recordBetaAnalyticsEvent()` validates, sanitizes, inserts; HTTP route is thin wrapper.  
**When:** All event writes (client via POST, server via direct call).  
**Precedent:** `recordMissionInsight()` in `server/mission-insights/service.ts`.  
**Server contract:** Throw on validation/DB failure (caller must handle); HTTP returns 201/400. Client callers in Phase 76 use fire-and-forget fetch — non-blocking by design.

### Pattern 4: Session FK validation at ingest

**What:** If `sessionId` provided, verify row exists and `beta_sessions.workspace_id === workspace.id`.  
**When:** Any ingest with non-null `session_id`.  
**Why:** Prevents cross-workspace session injection. Phase 77 creates sessions; Phase 75 must still validate FK scope on ingest.

### Anti-Patterns to Avoid

- **Writing `workspace_id` from request body:** Always from `requireWorkspaceAccess` session — same as feedback route.
- **Logging full `properties`:** Log `eventId`, `workspaceId`, `userId`, `eventKey`, `requestId` only.
- **Dual-write to `usage_events`:** Credit debits stay in `usage_events` only (CONTEXT locked).
- **Reusing feedback blocklist alone:** Unknown keys would pass; violates INST-05.
- **Session CRUD in Phase 75:** Table DDL only; routes deferred to Phase 77.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL migrations | Raw SQL without Drizzle | `schema.ts` + `drizzle-kit generate` | Snapshot/meta consistency with 35 existing migrations |
| Property validation | Regex-only PII detection | Zod `strictObject` + explicit deny list for key names | False negatives on nested/renamed keys |
| Auth gate | Custom header checks | `requireWorkspaceAccess` | Established workspace membership resolution |
| Campaign/derivation scope | Trust client UUIDs | `validateCampaignOwnership` / `validateDerivationOwnership` | Existing feedback validators |
| Event query layer | Raw SQL strings in routes | Drizzle repository with `eq`/`and`/`gte`/`lte` | Type-safe filters, workspace_id always in WHERE |

**Key insight:** The hard part is PII boundaries and workspace isolation, not insert performance — reuse proven feedback/mission-insight patterns rather than a new analytics SDK.

## Common Pitfalls

### Pitfall 1: ROADMAP vs CONTEXT table name drift

**What goes wrong:** Migration creates `product_events`; tests/docs disagree with implementation.  
**Why it happens:** REQUIREMENTS.md still says `product_events`; CONTEXT locked `beta_analytics_events`.  
**How to avoid:** Use `beta_analytics_events` everywhere in code; note REQUIREMENTS label mismatch in plan.  
**Warning signs:** Grep finds `product_events` in `schema.ts`.

### Pitfall 2: Allowlist that strips instead of rejects

**What goes wrong:** Client sends `prompt` in properties; silent strip looks compliant but caller thinks it was stored.  
**Why it happens:** Copying `sanitizeDiagnosticContext` blocklist behavior.  
**How to avoid:** Return 400 `validation_error` on any unknown property key before insert.  
**Warning signs:** Tests only assert DB row missing key, not HTTP 400.

### Pitfall 3: Nullable session FK without workspace check

**What goes wrong:** User passes another workspace's `session_id`; events attach to wrong cohort.  
**Why it happens:** FK exists but no application-level workspace match.  
**How to avoid:** Repository or `recordBetaAnalyticsEvent` loads session by id+workspaceId.  
**Warning signs:** Insert succeeds with cross-workspace session UUID in tests.

### Pitfall 4: `beta_sessions` scope creep

**What goes wrong:** Phase 75 grows session start/end APIs, blocking Phase 77.  
**Why it happens:** Temptation to test events with real sessions.  
**How to avoid:** Integration tests insert `beta_sessions` rows via repository test helper or direct DB fixture only.  
**Warning signs:** New routes under `/api/feedback/beta-sessions` in Phase 75 PR.

### Pitfall 5: Migration number collision

**What goes wrong:** Two branches both ship `0033`.  
**Why it happens:** Latest is `0032_workspace_progression.sql`.  
**How to avoid:** Generate migration after pulling main; use `0033_beta_analytics.sql` (discretion).  
**Warning signs:** Duplicate numeric prefix in `app/drizzle/`.

## Code Examples

### POST route skeleton (mirror feedback)

```typescript
// Pattern from app/src/app/api/feedback/reports/route.ts [VERIFIED: codebase]
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const parsed = createBetaEventSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }
    const event = await recordBetaAnalyticsEvent({
      workspaceId: workspace.id,
      userId: user.id,
      ...parsed.data,
    });
    logger.child("beta-analytics").info("beta_event.created", {
      eventId: event.id,
      workspaceId: workspace.id,
      userId: user.id,
      eventKey: event.eventKey,
      requestId,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "analytics.events.POST");
  }
}
```

### Repository list filters (INST-01 queryable)

```typescript
// Drizzle and/eq/gte/lte — same as listFeedbackReports [VERIFIED: codebase]
export async function listBetaAnalyticsEvents(filters: {
  workspaceId: string;
  sessionId?: string;
  eventKey?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  const conditions = [eq(betaAnalyticsEvents.workspaceId, filters.workspaceId)];
  if (filters.sessionId) conditions.push(eq(betaAnalyticsEvents.sessionId, filters.sessionId));
  if (filters.eventKey) conditions.push(eq(betaAnalyticsEvents.eventKey, filters.eventKey));
  if (filters.from) conditions.push(gte(betaAnalyticsEvents.createdAt, filters.from));
  if (filters.to) conditions.push(lte(betaAnalyticsEvents.createdAt, filters.to));
  return db.select().from(betaAnalyticsEvents).where(and(...conditions))
    .orderBy(desc(betaAnalyticsEvents.createdAt))
    .limit(filters.limit ?? 100);
}
```

### `beta_sessions` minimal DDL shape

```typescript
// assistance_level: text + Zod enum (no pgEnum in repo) [VERIFIED: schema.ts grep]
export const betaSessions = adscaleSchema.table(
  "beta_sessions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    cohortLabel: text("cohort_label"),
    assistanceLevel: text("assistance_level").notNull(), // 'hands_on' | 'observe_only'
    startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { mode: "date" }),
    operatorNotes: jsonb("operator_notes")
      .$type<Record<string, { notes?: string; tags?: string[]; completedAt?: string }>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("beta_sessions_workspace_id_idx").on(table.workspaceId)]
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `product_events` (v11.8 research) | `beta_analytics_events` (CONTEXT) | 2026-06-07 discuss | Same architecture; rename only |
| Feedback blocklist sanitization | Allowlist-only for analytics | Phase 75 | Reject unknown keys, don't strip |
| `activity_events` for telemetry | Dedicated beta analytics table | v11.8 | `activity_events` has no writers; leave parallel |
| Client-only beacons | Server `recordBetaAnalyticsEvent()` + optional client POST | Phase 75–76 | Server path mandatory for credit/readiness truth |

**Deprecated/outdated:**
- ARCHITECTURE.md suggestion of separate `beta_session_notes` table — CONTEXT consolidates into `operator_notes` jsonb on `beta_sessions`.
- ARCHITECTURE.md route `POST /api/workspace/beta-events` — CONTEXT locks `POST /api/analytics/events`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `user_id` column required on `beta_analytics_events` | Pattern 1 | Omitting it breaks attribution for multi-member workspaces |
| A2 | Scalar-only `properties` values in Phase 75 | Pattern 2 | Phase 76 may need nested tallies — would require schema relax |
| A3 | `idempotency_key` deferred to Phase 76 | Don't Hand-Roll | Duplicate client events if not added before instrumentation |
| A4 | `event_key` accepts any `snake_case` string up to 64 chars in Phase 75 | Pattern 2 | Phase 76 may want closed enum — migration not needed, validation tightens |
| A5 | `npm run db:migrate` applied on Render before operator sessions | Environment | Events lost if migration skipped (see PITFALLS.md) |

## Open Questions (RESOLVED)

1. **Per-`event_key` property schemas vs single global allowlist** — **RESOLVED:** Plan 75-02 ships a **global strict allowlist** via `z.strictObject()` in Phase 75. Per-`event_key` families deferred to Phase 76 `types.ts` extensions before instrumentation lands.

2. **`source` column (`client` | `server`) on events** — **RESOLVED:** Plan 75-01 adds optional `source` text column on `beta_analytics_events` — default `'client'` for POST route, `'server'` for `recordBetaAnalyticsEvent()` in Plan 75-03.

3. **REQUIREMENTS.md INST-01 still says `product_events`** — **RESOLVED:** All plans implement `beta_analytics_events` per CONTEXT lock. ROADMAP success criteria updated to `beta_analytics_events`. REQUIREMENTS.md label update deferred to Phase 75 SUMMARY or docs-only follow-up.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/test | ✓ | v24.3.0 | — |
| drizzle-orm / drizzle-kit | Schema/migration | ✓ | 0.45.2 / 0.31.10 | — |
| zod | Validation | ✓ | 3.25.76 | — |
| vitest | INST-06 tests | ✓ | 4.1.5 | — |
| PostgreSQL (local/docker) | Migration apply | ✗ (pg_isready N/A) | — | Render/staging `DATABASE_URL`; `npm run test:db:setup` when needed |
| TEST_DATABASE_URL | Optional integration insert | ✗ (not set in env) | — | Mocked repository tests (standard in repo) |

**Missing dependencies with no fallback:**
- `DATABASE_URL` for `db:generate`/`db:migrate` during execution (developer/CI must provide).

**Missing dependencies with fallback:**
- Local Postgres — use Docker Compose in `app/docker-compose.yml` or remote Neon URL.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- src/server/beta-analytics/sanitize.test.ts src/app/api/analytics/events/route.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INST-05 | Unknown property keys rejected | unit | `npm test -- src/server/beta-analytics/sanitize.test.ts` | ❌ Wave 0 |
| INST-05 | Prompt/email/url keys rejected | unit | same | ❌ Wave 0 |
| INST-05 | Payload size bounded (≤32KB) | unit | same | ❌ Wave 0 |
| INST-06 | Disallowed properties → HTTP 400 | unit (mocked route) | `npm test -- src/app/api/analytics/events/route.test.ts` | ❌ Wave 0 |
| INST-01 | Workspace-scoped insert | unit (mocked db) | `npm test -- src/server/repositories/beta-analytics.test.ts` | ❌ Wave 0 |
| INST-01 | `requireWorkspaceAccess` enforced | unit (mocked route) | `npm test -- src/app/api/analytics/events/route.test.ts` | ❌ Wave 0 |
| INST-06 | Cross-workspace session_id rejected | unit | `npm test -- src/server/beta-analytics/record.test.ts` or repository test | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- <changed-test-files>`
- **Per wave merge:** `cd app && npm test && npm run lint`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/server/beta-analytics/sanitize.ts` + `sanitize.test.ts` — INST-05
- [ ] `src/server/beta-analytics/record.ts` — shared write path
- [ ] `src/server/repositories/beta-analytics.ts` + `.test.ts` — INST-01 insert + list filters
- [ ] `src/app/api/analytics/events/route.ts` + `route.test.ts` — INST-01/06
- [ ] `app/drizzle/0033_*.sql` — schema migration
- [ ] `schema.ts` exports: `betaSessions`, `betaAnalyticsEvents`, inferred types

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `requireWorkspaceAccess` — session required |
| V3 Session Management | no | Better Auth unchanged; beta_sessions is analytics envelope not auth session |
| V4 Access Control | yes | workspace_id from auth; session/campaign/derivation ownership validation |
| V5 Input Validation | yes | Zod body schema + strict property allowlist + scalar types |
| V6 Cryptography | no | No secrets in events; reject token/key properties |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-workspace event injection | Elevation | workspace_id from session only; never from body |
| PII in jsonb properties | Information disclosure | Allowlist-only + reject unknown keys; no URLs/emails/prompts |
| Session ID guessing | Tampering | Validate session belongs to workspace before FK insert |
| Oversized jsonb payload | DoS | 32KB cap (mirror `MAX_DIAGNOSTIC_BYTES` in feedback sanitize) |
| Log leakage | Information disclosure | Log IDs and event_key only |

## Project Constraints (from .cursor/rules/)

- Use Context7 for library API verification when implementing Drizzle/Zod details [VERIFIED: context7.mdc exists at user rules level].
- No `.cursor/rules/` in repo root — follow `app/AGENTS.md` Next.js breaking-change notice for route handlers.

## Sources

### Primary (HIGH confidence)

- `/websites/orm_drizzle_team` — jsonb columns, indexes on FKs [CITED: orm.drizzle.team via Context7]
- `github.com/colinhacks/zod` — `z.strictObject` unknown-key rejection [CITED: Context7]
- `app/src/server/db/schema.ts` — table/FK/index conventions [VERIFIED: codebase]
- `app/src/server/mission-insights/sanitize.ts` — allowlist pick pattern [VERIFIED: codebase]
- `app/src/app/api/feedback/reports/route.ts` — ingest route pattern [VERIFIED: codebase]
- `.planning/phases/75-event-schema-and-ingest-foundation/75-CONTEXT.md` — locked decisions [VERIFIED: file]

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md`, `ARCHITECTURE.md` — event taxonomy and funnel keys (adapt names to `beta_analytics_events` / `event_key`)
- `.planning/research/PITFALLS.md` — instrumentation-before-sessions warning

### Tertiary (LOW confidence)

- None requiring validation — table shapes not yet in repo; recommendations derived from CONTEXT + existing patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; patterns exist in-repo
- Architecture: HIGH — CONTEXT + codebase alignment verified
- Pitfalls: HIGH — naming drift and allowlist semantics are explicit in CONTEXT

**Research date:** 2026-06-07  
**Valid until:** 2026-07-07 (stable Drizzle/Zod stack)

## RESEARCH COMPLETE

**Phase:** 75 - Event Schema and Ingest Foundation  
**Confidence:** HIGH

### Key Findings

- Implement **`beta_analytics_events`** (not `product_events`) with nullable **`session_id` → `beta_sessions`**; migration **`0033`** after `0032`.
- Use **allowlist-only** property validation with **`z.strictObject()`** — stricter than feedback blocklist; mirror mission-insight Set pattern.
- Single write path: **`recordBetaAnalyticsEvent()`** + thin **`POST /api/analytics/events`** with **`requireWorkspaceAccess`**.
- Leave **`usage_events`**, **`activity_events`**, **`feedback_reports`** untouched — parallel lanes.
- Tests: Vitest unit files for sanitize, route mocks, repository mocks — no new packages.

### File Created

`.planning/phases/75-event-schema-and-ingest-foundation/75-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Existing drizzle/zod/vitest; versions verified |
| Architecture | HIGH | CONTEXT locked; codebase patterns mapped |
| Pitfalls | HIGH | ROADMAP/REQUIREMENTS naming drift documented |

### Open Questions

- Global vs per-`event_key` allowlist in Phase 75 (recommend global union).
- Optional `source` column for client/server attribution.

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
