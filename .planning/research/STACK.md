# Stack Research

**Domain:** Conversational creative artifact versioning and approval
**Researched:** 2026-06-27
**Confidence:** HIGH

## Recommendation

No new framework. Extend validated stack and boundaries.

| Technology | Version | Purpose | Decision |
|---|---:|---|---|
| PostgreSQL | current managed | Immutable artifact versions, parent links, current-version pointer | New normalized rows; JSONB only for typed snapshots/diffs |
| Drizzle ORM | 0.45.2 | Schema, scoped repositories, transactional approval | Reuse existing workspace-scoped patterns |
| Zod | 3.x | Version payload and command validation | Strict discriminated artifact schemas |
| Next.js | 16.2.6 | APIs and assistant surface | Keep route/repository split |
| React | 19.2.4 | Version compare/review UI | Stable version IDs as component keys |
| TanStack Query | 5.100.1 | Server-state refresh after version commands | Invalidate artifact/thread queries after committed mutations |

## Supporting Choice

- Store full immutable snapshots, not patch chains. Small plan snapshots make reconstruction cheap and reliable.
- Creative versions reference existing `derivations`; do not duplicate image binaries.
- Compute semantic field changes server-side from validated snapshots. Avoid generic JSON diff dependency in v13.9.
- Reuse revision CAS, action binding, role checks, credits, telemetry, and async job recovery from v13.8.

## Avoid

| Avoid | Why | Use instead |
|---|---|---|
| XState/new workflow engine | Existing typed transition engine already owns legal state | Extend typed commands and definitions |
| Mutable `creative_plans` overwrite | Destroys comparison and approval provenance | Append immutable artifact versions |
| Client-generated diffs/current pointers | Scope and stale-state risk | Server computes diff and promotes version transactionally |
| New global state store | Duplicate server truth | TanStack Query + local compare selection |

## Sources

- Repo: `app/src/server/db/schema.ts`, guided flow/action repositories, plan/derivation models.
- PostgreSQL JSON types: https://www.postgresql.org/docs/16/datatype-json.html
- PostgreSQL transaction isolation: https://www.postgresql.org/docs/17/transaction-iso.html
- React state identity: https://react.dev/learn/preserving-and-resetting-state
- TanStack optimistic updates: https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates

---
*No package installation recommended.*
