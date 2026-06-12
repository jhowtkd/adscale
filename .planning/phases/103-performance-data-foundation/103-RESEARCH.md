# Phase 103: Performance Data Foundation - Research

**Researched:** 2026-06-12
**Phase requirements:** PERF-13, PERF-14, PERF-15, PERF-16
**Confidence:** HIGH

## Research Summary

Phase 103 should establish one canonical performance snapshot table plus a small domain/service layer. A snapshot is not a time-series event and is not safe to sum with overlapping snapshots. It represents a source-reported aggregate for one derivation, platform, normalized placement, optional ad account, explicit inclusive date window, source timezone and explicit traffic scope.

The existing ADScale architecture already supplies the required boundaries: workspace authentication, campaign/derivation/client relationships, Drizzle schema and migrations, workspace-scoped repositories, Zod route validation and atomic PostgreSQL upserts. No new dependency is required in this phase.

## Recommended Data Contract

### Canonical snapshot

Create a table such as `creative_performance_snapshots` with these concept groups:

| Group | Fields | Notes |
|-------|--------|-------|
| Ownership | `id`, `workspaceId`, `clientProfileId`, `campaignId`, `derivationId` | All required; validate the relationship chain in the active workspace before insert |
| Delivery | `platform`, `placement`, `placementRaw`, optional `adAccountId` | Platform and normalized placement are bounded strings/enums; raw placement preserves source fidelity |
| Period | `startDate`, `endDate`, `sourceTimezone` | Use PostgreSQL `date` for inclusive commercial dates; timezone is a separate IANA/offset source field |
| Raw metrics | `impressions`, `clicks`, `spend`, `conversions`, `conversionValue`, `currency` | Counts non-negative; money exact `numeric`; conversions may be fractional depending on attribution |
| Source identity | `sourceType`, optional external IDs, `sourceKey`, `sourceScope`, `sourceMetadata` | `sourceKey` is deterministic and supports later manual/CSV upsert |
| Audit | `createdByUserId`, `createdAt`, `updatedAt` | Preserve writer and timestamps; raw payloads do not belong here |

### Types

- `impressions` and `clicks`: `bigint` or exact non-negative numeric count. PostgreSQL `integer` is too narrow for long-lived/high-volume aggregates.
- `conversions`: `numeric`, not integer, because ad platforms may report fractional attributed conversions.
- `spend` and `conversionValue`: PostgreSQL `numeric(20, 6)` or equivalent exact precision. Drizzle returns numeric values as strings by default, which prevents implicit binary floating-point loss.
- `startDate` and `endDate`: PostgreSQL `date`, not timestamp. The source timezone is recorded independently; converting a commercial date to UTC can move it to a different day.
- Derived CTR/CPC/CPA/ROAS are service outputs, not canonical columns. Recompute from raw values to avoid drift and contradictory imports.

## Derived Metrics Contract

Implement pure functions over decimal-safe/string inputs and return explicit nullable values:

| Metric | Formula | Undefined when |
|--------|---------|----------------|
| CTR | clicks / impressions | impressions = 0 |
| CPC | spend / clicks | clicks = 0 |
| CPA | spend / conversions | conversions = 0 |
| ROAS | conversionValue / spend | spend = 0 |

Zero raw values are valid facts. An undefined derived metric is represented as `null`, never `0`, `Infinity`, `NaN` or a fabricated fallback. Formatting as percent/currency belongs to UI phases.

Use a deterministic decimal strategy. For this phase, calculations can be implemented with exact decimal strings and integer scaling/BigInt helpers or PostgreSQL numeric expressions. Do not add a dependency unless planning proves the built-in approach materially unsafe or unreadable.

## Identity and Upsert

Phase 104 needs an atomic persistence primitive that can say created/updated/unchanged. Define a deterministic `sourceKey` at the service boundary and enforce a unique index on `(workspaceId, sourceKey)`.

The key should include or hash the canonical source identity:

- source type/provider
- derivation
- platform and normalized placement
- optional account represented with an explicit sentinel/canonical empty value
- inclusive start/end dates
- explicit source scope and external IDs when present

Do not rely only on a nullable multicolumn unique index: PostgreSQL treats NULL values as distinct by default, allowing duplicates when account/external IDs are absent. A non-null deterministic `sourceKey` avoids driver/version-specific `NULLS NOT DISTINCT` handling and gives Phase 104 a stable upsert target.

Overlapping windows intentionally produce different source keys and coexist. The repository must not offer a generic `sumSnapshots` helper in this phase.

## Database Constraints

Enforce critical invariants in PostgreSQL as well as Zod/service validation:

- `end_date >= start_date`
- impressions/clicks/spend/conversions/conversion value are non-negative
- clicks should not exceed impressions when both are provided as canonical totals
- currency is a normalized uppercase ISO-like code with bounded length
- platform/placement/source/timezone/source key strings are non-empty and bounded
- unique `(workspace_id, source_key)`
- indexes for workspace+campaign, workspace+derivation, workspace+client+period and workspace+platform+placement

CHECK constraints are evaluated immediately by PostgreSQL. Keep cross-row and external-entity validation in the service/repository layer.

## Workspace and Relationship Validation

Create one validation/query path that verifies the derivation belongs to the campaign and workspace, and the campaign's `clientProfileId` matches the provided client profile. The create/upsert service should derive ownership IDs from the validated relationship where possible rather than trusting duplicated client input.

Every repository read/write signature includes `workspaceId`. Routes use `requireWorkspaceAccess`; repository predicates remain the second boundary.

## API Foundation

Phase 103 needs only the minimal authenticated foundation consumed by Phase 104:

- a create/upsert service/repository contract for one canonical snapshot
- a workspace/campaign-scoped read endpoint or repository query for fixtures and future UI consumption
- structured validation/conflict/not-found errors

Do not build CSV, mapping, import batches or an import history API here. Manual and CSV routes in Phase 104 should call the same canonical service.

## Placement Taxonomy

Start with a small stable vocabulary and preserve `placementRaw`:

- `feed`
- `stories_reels`
- `search`
- `display`
- `video`
- `shopping`
- `audience_network`
- `other`

The exact set is planner discretion, but `other` plus raw value is mandatory so new provider labels are not rejected or lost.

## Source Scope

Use structured fields for common identity dimensions and bounded JSONB for additional scope:

- scope kind: `total` or `segment`
- optional external campaign/ad group/ad IDs
- bounded `scopeDimensions`/`sourceMetadata` for country, device or provider-specific filters

The service must never infer a segment is a total. Later comparison code will consume this distinction.

## Existing Patterns to Reuse

- Schema and indexes: `app/src/server/db/schema.ts`
- Workspace relationship validation: `app/src/server/feedback/validate-refs.ts`
- Atomic upsert: `app/src/server/repositories/progression.ts` and `billing.ts`
- Auth/API errors: `requireWorkspaceAccess`, `apiError`, `handleApiError`
- Unit tests: colocated Vitest files and mocked Drizzle chains
- Integration migration setup: `app/scripts/setup-test-db.ts`

## Recommended File Shape

```text
app/src/server/performance/
  types.ts                 # canonical enums/input/output
  metrics.ts               # pure derived metric functions
  source-key.ts            # deterministic identity
  validate-scope.ts        # bounded source scope validation
  service.ts               # relationship validation + repository orchestration
  *.test.ts

app/src/server/repositories/
  performance.ts
  performance.test.ts

app/src/app/api/campaigns/[id]/performance/
  route.ts
  route.test.ts

app/drizzle/
  00xx_creative_performance_foundation.sql
```

The planner may adjust filenames to match nearby conventions, but should preserve a pure domain layer separate from HTTP and persistence.

## Validation Architecture

### Fast feedback

- Pure domain tests for formulas, null semantics, source key stability, placement normalization and scope validation.
- Repository tests for workspace predicates and `onConflictDoUpdate` target.
- Route/service tests for relationship mismatch and cross-workspace rejection.

### Migration validation

- Verify schema and migration stay aligned.
- Run `npm run db:generate` only when appropriate; inspect generated SQL and journal changes.
- `npm run db:migrate` requires a configured database and belongs to execution verification/UAT if unavailable locally.

### Release sampling

- Per task: focused Vitest file(s).
- Per plan: all Phase 103 focused tests.
- Final: `npm test`, `npm run lint`, `npm run build`; live migration apply remains Phase 108's release gate but migration generation/structural validation is Phase 103.

## Planning Risks

1. **Numeric serialization:** Drizzle numeric values are strings; API types must not silently coerce to JS number.
2. **Nullable uniqueness:** avoid duplicate identity when account/external IDs are absent.
3. **Denominator semantics:** zero is a raw fact; null is an unavailable derived metric.
4. **Relationship drift:** derive client/campaign ownership from validated entities.
5. **Overlapping windows:** store safely, never aggregate implicitly.
6. **JSONB sprawl:** source metadata must be bounded and secondary to structured canonical fields.

## Sources

- https://www.postgresql.org/docs/current/datatype-numeric.html — exact numeric/decimal behavior
- https://www.postgresql.org/docs/current/ddl-constraints.html — CHECK and unique constraints
- https://www.postgresql.org/docs/current/indexes-unique.html — NULL behavior in unique indexes
- https://orm.drizzle.team/docs/column-types/pg — PostgreSQL column types
- https://orm.drizzle.team/docs/indexes-constraints — Drizzle constraints/indexes
- https://orm.drizzle.team/docs/guides/upsert — atomic PostgreSQL upsert
- ADScale live schema, repositories and Phase 103 context

---
*Research ready for planning: yes*
