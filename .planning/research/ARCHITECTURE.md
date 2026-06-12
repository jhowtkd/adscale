# Architecture Research

**Domain:** Performance learning inside the existing ADScale Next.js monolith
**Researched:** 2026-06-12
**Confidence:** HIGH

## System Overview

```text
Campaign Workspace / Client Memory
  |-- manual result form
  |-- CSV mapping + preview
  |-- variant comparison
  `-- next experiment action
                 |
                 v
Performance API boundary (workspace scoped)
  |-- Zod canonical row validation
  |-- import batch validation/idempotency
  |-- comparison eligibility rules
  `-- evidence packet builder
                 |
                 v
PostgreSQL / Drizzle
  |-- creative_hypotheses
  |-- performance_import_batches
  |-- creative_performance_snapshots
  `-- client_performance_learnings
                 |
                 v
Existing campaign + derivation + client profile + recipe flows
```

## Component Responsibilities

| Component | Responsibility | Integration |
|-----------|----------------|-------------|
| Hypothesis service | Store primary variable, expected direction and primary metric before launch | Campaign and selected derivations |
| Import mapper | Convert arbitrary headers/locales into canonical row candidates | New client component using Papa Parse |
| Performance repository | Persist immutable/replaceable snapshots with source lineage | New repository beside campaign/derivation repositories |
| Comparison service | Determine comparability, derived metrics, winner state and confidence band | Pure server module with fixture tests |
| Learning service | Aggregate repeated evidence by client/CTA/format/recipe/style | Client profile and existing campaign memory |
| Recommendation service | Produce evidence packet and next experiment config | Existing strategy recipes and campaign creation flow |

## Recommended Data Model

### `creative_hypotheses`

- `workspace_id`, `campaign_id`, optional `client_profile_id`
- `primary_variable` (`cta`, `format`, `recipe`, `style`, `hook`, `other`)
- `primary_metric` (`ctr`, `cpc`, `conversions`, `cpa`, `roas`)
- `expected_direction`, rationale, status, timestamps

### `performance_import_batches`

- source type, filename, file hash, mapping JSON, row counts, actor, timestamps
- unique `(workspace_id, file_hash)` warning; explicit re-import path

### `creative_performance_snapshots`

- workspace/client/campaign/derivation IDs
- platform, external campaign/ad identifiers, date window, currency
- raw `impressions`, `clicks`, `spend`, `conversions`, `conversion_value`
- source row key, import batch, source metadata, created/updated timestamps
- unique source identity to support attribution-window updates without duplicates

### `client_performance_learnings`

- pattern key/type, statement, evidence summary, confidence level
- supporting and contradicting snapshot IDs, sample counts, generated-at/version
- derived and replaceable, never the only copy of evidence

## Architectural Patterns

### Raw Facts Before Ratios

Store raw counts/currency and calculate CTR/CPC/CPA/ROAS consistently. Imported ratio columns may be shown during mapping but are not canonical.

### Staged Import

1. Parse local file in browser.
2. Map headers and normalize locale syntax.
3. Preview valid/invalid rows without writing.
4. POST canonical candidates.
5. Revalidate IDs, workspace ownership, ranges and arithmetic server-side.
6. Persist batch + rows in one transaction.

### Evidence Packet Before Recommendation

The recommendation engine consumes a typed packet containing comparable observations, support/contradiction counts, sample size, metric direction and confidence level. AI text generation, if later enabled, may only summarize this packet.

### Derived Learning Versioning

Learning rows include an algorithm version and can be regenerated from snapshots. Do not mutate raw evidence when recommendation rules change.

## Key Data Flows

### Result Import

```text
CSV/manual -> map -> preview -> server validation -> transaction -> snapshots -> recompute affected client learnings
```

### Next Experiment

```text
client history + current campaign context -> comparable cohort -> evidence packet
-> recommendation with confidence -> user accepts/edits -> existing recipe/campaign flow
```

## Integration Points

| Existing boundary | v12.1 use |
|-------------------|-----------|
| `campaigns.clientProfileId` | Primary client-memory partition |
| `derivations` contract/CTA/format/mode | Creative features attached to outcomes |
| `campaigns.campaignMemory` | Keep brief-level memory separate; link performance summary only |
| `/api/client-profiles/[id]/memory` | Extend UI to include auditable performance learnings; do not store canonical metrics in Mem0 |
| Strategy recipes | Target for next-experiment prefill |
| Campaign workspace | Primary surface for hypothesis, results and next action |
| First-party analytics | Instrument import completion, learning viewed and recommendation accepted |

## Recommended Build Order

1. Data contracts, migrations, repositories and workspace isolation.
2. Manual entry plus CSV mapping/preview and idempotent persistence.
3. Hypothesis and comparable variant results.
4. Client learning aggregation with evidence/confidence.
5. Next experiment action integrated with existing cockpit.
6. Regression, migration verification and real operator UAT.

## Scaling Considerations

| Scale | Adjustment |
|-------|------------|
| Current beta | Synchronous bounded imports and on-demand aggregates are sufficient |
| Tens of thousands of snapshots/workspace | Add composite indexes and cached/materialized learning summaries |
| Large scheduled imports | Move confirmed import/recompute to Inngest without changing canonical schema |

## Sources

- ADScale `app/src/server/db/schema.ts` — client/campaign/derivation anchors
- ADScale `app/src/server/memory/*` — current brand-memory boundary
- https://orm.drizzle.team/docs/transactions — atomic import batches
- https://orm.drizzle.team/docs/guides/upsert — idempotent source updates
- https://www.postgresql.org/docs/current/datatype-numeric.html — exact metric types
- https://support.google.com/google-ads/answer/16259414 — contextual limits of asset metrics

---
*Architecture research for: v12.1 Memória Criativa e Aprendizado de Performance*
*Researched: 2026-06-12*
