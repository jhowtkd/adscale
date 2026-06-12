# Stack Research

**Domain:** Creative performance learning for an existing AI ad-creation SaaS
**Researched:** 2026-06-12
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Existing Next.js monolith | 16.2.6 | UI, APIs, import preview, recommendations | Keeps workspace auth and campaign workflow in one boundary |
| PostgreSQL + Drizzle | PostgreSQL 18 docs; Drizzle 0.45.2 | Durable raw metrics, hypotheses, snapshots and derived learnings | Existing source of truth; transactions and upserts support idempotent imports |
| Zod | 3.x installed | Validate mapped CSV rows and manual input | Already used at API boundaries; produces field-level errors before persistence |
| Papa Parse | 5.5.3 | Browser-side CSV parsing and preview | Handles headers, delimiters, local files, workers and row-level parse errors |
| Existing Recharts | 3.8.1 | Variant comparisons and learning trends | Already installed; no new visualization layer needed |

### Supporting Patterns

| Pattern | Purpose | When to Use |
|---------|---------|-------------|
| Client parse, server validate | Fast mapping preview without trusting browser output | Every CSV import |
| Drizzle transaction | Persist import batch and rows atomically | Confirmed imports |
| Unique source key + upsert | Make repeated file imports safe | Rows with platform/ad/date identity |
| PostgreSQL `numeric` | Store currency and ratios without floating-point drift | Spend, revenue, CPA, CPC, ROAS |
| Deterministic scoring service | Rank evidence before optional AI explanation | Winner/confidence and next-experiment suggestions |

## Installation

```bash
cd app
npm install papaparse@5.5.3
npm install -D @types/papaparse
```

No additional analytics warehouse, queue, vector database, statistics framework, or chart library is required for v12.1.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Papa Parse in browser | Server-only parser | Imports exceed agreed browser/file limits or must run unattended |
| Normalized Postgres tables | JSONB-only metric blobs | Never for canonical metrics; JSONB is acceptable only for source metadata |
| Deterministic evidence rules | LLM-only ranking | Never for winner/confidence; LLM may explain already-computed evidence |
| Synchronous import under bounded limit | Inngest import job | Add when files exceed interactive request limits or imports become scheduled |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Direct Meta/Google/TikTok APIs in v12.1 | OAuth, versioning and attribution complexity before learning value is proven | Manual entry plus canonical CSV mapping |
| JavaScript `number` as canonical money storage | Binary floating-point drift | PostgreSQL `numeric`, serialized as decimal strings |
| PostgreSQL server-side `COPY FROM` on user files | Render/Neon app cannot safely expose server filesystem paths; row errors are poor UX | Parse and validate in app, then transactional batch insert |
| Mem0 as performance source of truth | Retrieval memory is not an auditable metric ledger | Postgres evidence tables; optionally publish summarized learnings to memory later |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `papaparse@5.5.3` | React 19 / browser File API | Use worker mode only for sufficiently large files; still validate server-side |
| `drizzle-orm@0.45.2` | Existing Neon/Postgres setup | Use transactions and `.onConflictDoUpdate()`/`.onConflictDoNothing()` |
| `zod@3.x` | Existing API validation | Normalize locale decimals before schema validation, never after persistence |

## Sources

- https://www.papaparse.com/docs — local file parsing, headers, workers and row errors
- https://www.npmjs.com/package/papaparse — current package version 5.5.3
- https://orm.drizzle.team/docs/transactions — atomic persistence
- https://orm.drizzle.team/docs/guides/upsert — PostgreSQL upsert pattern
- https://zod.dev/basics — typed validation of untrusted input
- https://www.postgresql.org/docs/current/datatype-numeric.html — exact numeric storage
- ADScale `app/package.json` and `app/src/server/db/schema.ts` — installed stack and integration anchors

---
*Stack research for: v12.1 Memória Criativa e Aprendizado de Performance*
*Researched: 2026-06-12*
