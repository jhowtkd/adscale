# Phase 72: Build and Data Integrity Hardening - Research

**Researched:** 2026-06-06
**Status:** Complete

## Question

What do we need to know to plan Phase 72 well?

## Findings

### Build Gate

- Next.js production build runs TypeScript validation and fails when project TypeScript errors exist.
- The correct stabilization behavior is to fix exhaustive type mismatches instead of setting `typescript.ignoreBuildErrors`.
- The concrete failure from review was `FeedbackCategory` adding `"mission"` while `regeneration-correction-brief.ts` used `Record<FeedbackCategory, string>` without a mission label.

### Runtime Validation

- Mission insight payloads cross an API boundary and cannot rely on TypeScript casts.
- `missionKey` should be validated against the mission definition/order source before recording a feedback report.
- Invalid mission keys should fail before `recordMissionInsight` or `createFeedbackReport` is called.

### Atomic Progression Persistence

- `workspace_progression.workspace_id` is unique.
- Drizzle supports PostgreSQL `.onConflictDoUpdate()`.
- PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` provides atomic insert/update behavior under concurrent access.
- The existing repository pattern already uses `.onConflictDoUpdate()` in billing/brand-kit repositories, so the progression repository should follow the same style.

### Current Branch Observation

The current branch already appears to contain the expected fixes:

- `app/src/server/ai/regeneration-correction-brief.ts` includes a `mission` feedback category label.
- `app/src/server/mission-insights/sanitize.ts` includes `VALID_MISSION_KEYS`.
- `app/src/server/repositories/progression.ts` uses `.onConflictDoUpdate()`.
- `app/src/server/repositories/progression.test.ts` and `app/src/server/mission-insights/sanitize.test.ts` include relevant regression coverage.

Phase 72 should verify these changes, fill any coverage gaps, and record evidence. It should not reimplement working fixes just for process purity.

## Validation Architecture

### Automated Gates

- `cd app && npm run build`
- `cd app && npm run lint`
- Focused test command:

```bash
npm test -- src/server/progression src/server/repositories/progression src/app/api/workspace/progression src/lib/hooks/use-progression src/components/dashboard/AdsScientistProgressCard src/app/api/workspace/missions src/lib/hooks/use-missions src/components/dashboard/MissionPathCard src/app/api/workspace/mission-insights src/server/mission-insights src/lib/progression src/server/feedback/mission-credit-signals
```

### Evidence Artifact

- `.planning/phases/72-build-and-data-integrity-hardening/72-VERIFICATION.md`

The artifact should include command output summaries, pass/fail status, and any accepted caveats.

## Sources

- Next.js TypeScript docs: https://nextjs.org/docs/app/api-reference/config/typescript
- Drizzle insert/upsert docs: https://orm.drizzle.team/docs/insert
- PostgreSQL INSERT docs: https://www.postgresql.org/docs/current/static/sql-insert.html

## Recommendation

Plan Phase 72 as verification-first hardening:

1. Inspect current code and tests against the review findings.
2. Patch only gaps that remain.
3. Run build, lint, and focused tests.
4. Write `72-VERIFICATION.md` with the evidence bundle.
