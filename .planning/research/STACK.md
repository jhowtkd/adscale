# Research: Stack for v11.7.1 Stabilization

## Scope

v11.7.1 does not need new libraries. The relevant stack decision is to use existing Next.js, TypeScript, PostgreSQL, Drizzle ORM, and the current test/build scripts correctly.

## Findings

- Next.js production builds fail when TypeScript errors are present. The build blocker should be fixed in code, not bypassed through `typescript.ignoreBuildErrors`.
- Drizzle supports PostgreSQL upsert through `.onConflictDoUpdate()`.
- PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` provides an atomic insert/update outcome under high concurrency, which matches the progression snapshot first-load race found in review.

## Stack Additions

None.

## Sources

- Next.js TypeScript configuration docs: https://nextjs.org/docs/app/api-reference/config/typescript
- Drizzle insert/upsert docs: https://orm.drizzle.team/docs/insert
- PostgreSQL `INSERT` docs: https://www.postgresql.org/docs/current/static/sql-insert.html
