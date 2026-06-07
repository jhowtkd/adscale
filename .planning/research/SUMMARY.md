# Research Summary: v11.7.1 Stabilization

## Stack Additions

None. Use the existing Next.js, TypeScript, Drizzle, PostgreSQL, Vitest, and app test/build scripts.

## Key Findings

- Next.js treats TypeScript errors as production build failures by default; v11.7.1 should fix the missing feedback category label instead of bypassing type checks.
- Drizzle and PostgreSQL both support atomic conflict-safe upserts, which is the right fit for progression snapshots recalculated on read.
- Runtime mission insight validation should use the same known mission key set as the mission definitions, not a TypeScript cast.
- CTA resume behavior is part of the progression product promise; `?tab=` links need destination handling or a different route contract.

## Watch Outs

- Do not expand v11.7.1 into new gamification or monetization features.
- Do not call beta ready until build, migration, focused tests, and UAT evidence are all green.
- Keep accepted caveats explicit in release notes.

## Sources

- Next.js TypeScript docs: https://nextjs.org/docs/app/api-reference/config/typescript
- Drizzle insert/upsert docs: https://orm.drizzle.team/docs/insert
- PostgreSQL INSERT docs: https://www.postgresql.org/docs/current/static/sql-insert.html
