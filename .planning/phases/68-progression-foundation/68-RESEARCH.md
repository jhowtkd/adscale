# Phase 68: Progression Foundation - Research

**Researched:** 2026-06-06  
**Status:** Complete  
**Scope:** External UX/product research plus current library documentation for implementing Ads Scientist progression.

## Research Questions

1. What product/UX principles should guide a progression system that teaches usage without feeling manipulative?
2. What current technical patterns should shape a workspace-scoped progression snapshot in this Next.js/Drizzle/TanStack app?
3. What should the planner account for so Phase 68 supports later missions, insight capture, and credit activation?

## External UX Findings

### Progression should support competence and autonomy

Self-determination theory is the strongest external frame for this phase. Recent gamification research warns that gamification works best when it supports users' autonomy, competence, and relatedness, and can backfire when challenges or feedback feel coercive. For ADScale, this means progression should help users feel more capable at creating ads, not merely pressure them to spend credits.

Planning implications:
- Treat the compact dashboard module as orientation and skill feedback, not a casino-like reward system.
- Use "next useful experiment" language and evidence-backed progress to support competence.
- Keep credit-related advancement tied to useful creative outcomes, not raw spend alone.
- Avoid streaks, guilt language, or artificial punishment for not completing actions.

Sources:
- Springer Nature, *Advancing Gamification Research and Practice with Three Underexplored Ideas in Self-Determination Theory* (2024): https://link.springer.com/article/10.1007/s11528-024-00968-9
- Springer Nature, *Gamification enhances student intrinsic motivation...: a meta-analysis and systematic review* (2023): https://link.springer.com/article/10.1007/s11423-023-10337-7

### Visible progress is useful when it orients the user

UX references around progress indicators and lean UX support the same practical direction: visible progress is useful when it helps users understand where they are, what is next, and whether effort is paying off. It should not overload the screen or become a decorative metric detached from user goals.

Planning implications:
- The Phase 68 dashboard card should be compact: current level, progress bar, and one next action.
- The next action should deep-link to an existing high-value app path, not open a full mission center yet.
- The system should make the reason for progress explainable through evidence and timestamps.
- Use clear labels and avoid internal jargon in the UI.

Sources:
- Nielsen Norman Group, *UX Strategy Handout* (progress toward goals as part of UX strategy): https://media.nngroup.com/media/articles/attachments/NNg_UX_Strategy_Handout_A4.pdf
- Nielsen Norman Group, *Hostile Error Messages* handout (do not overload users with multiple indicators; provide constraints upfront): https://media.nngroup.com/media/articles/attachments/Hostile-Error-Messages.pdf

## Current Technical Documentation Findings

### Next.js App Router

The app is on Next.js 16.2.6. Current Next.js docs support App Router data fetching through Server Components and Route Handlers. This repo already uses authenticated JSON Route Handlers plus client-side TanStack Query for dashboard widgets, so Phase 68 should follow the existing route/hook pattern instead of converting the dashboard to a server component.

Planning implications:
- Add a workspace-authenticated JSON endpoint for progression, likely under `/api/workspace/progression` or `/api/dashboard/progression`.
- Keep the dashboard page as the existing client component and add a hook-backed compact widget.
- Return a bounded JSON response with level, completed evidence, progress percent, next action, and blocker state.

Source:
- Next.js docs via Context7, `/vercel/next.js/v16.2.2`: App Router data fetching and Route Handler guidance.

### Drizzle ORM and PostgreSQL

Drizzle supports typed PostgreSQL schema definitions, indexes, jsonb columns, and migration generation. A workspace-scoped snapshot table with jsonb evidence is a good fit: normalized enough to be queried by workspace, flexible enough to carry explainable evidence for later phases.

Planning implications:
- Add a `workspace_progression` or similarly named table keyed by `workspaceId`.
- Store level key, completed keys/evidence, next action snapshot, and last recalculated time.
- Use `jsonb` for evidence objects, but keep top-level indexed columns for workspace and current level.
- Generate a Drizzle migration and keep schema/type exports aligned.

Source:
- Drizzle ORM docs via Context7, `/drizzle-team/drizzle-orm-docs`: PostgreSQL schema, jsonb, indexes, and migration patterns.

### TanStack Query v5

TanStack Query v5 supports typed `useQuery`, reusable query options, stale times, and invalidation after mutations. The repo already uses this pattern for dashboard stats and billing.

Planning implications:
- Add `use-progression.ts` or dashboard query integration with stable query key like `["progression"]` or `["dashboard", "progression"]`.
- Use dynamic stale time; progress should update after user actions and dashboard refresh.
- If Phase 68 adds a recalculation endpoint/mutation, invalidate both progression and dashboard stats as needed.

Source:
- TanStack Query docs via Context7, `/tanstack/query/v5.90.3`: query defaults, staleTime, typed query options, and invalidation.

## Local Code Findings

### Existing assets to reuse

- `app/src/app/(dashboard)/page.tsx`: Existing dashboard surface; add the compact progression module near the top.
- `app/src/components/dashboard/CreditPanel.tsx`: Compact card with progress bar and action link; useful UI pattern.
- `app/src/lib/hooks/use-dashboard-stats.ts`: Query hook style for dashboard data.
- `app/src/server/repositories/dashboard.ts`: Existing aggregation of campaigns, derivations, credits, and recent activity.
- `app/src/app/api/dashboard/stats/route.ts`: Authenticated dashboard API pattern.
- `app/src/server/db/schema.ts`: Existing workspace-scoped tables and `jsonb` usage.
- Existing durable product evidence: `campaigns`, `campaign_assets`, `derivations`, `exports`, `share_links`, `credit_transactions`, `usage_events`, and `activity_events`.

### Important constraints

- Progression must not reuse `user.onboardingCompletedAt` as primary state. That field is user-scoped and boolean, while Phase 68 needs workspace-scoped, explainable progression.
- Progression must not be based on page views or tour steps.
- Progression should include readiness evidence if available through existing diagnosis/preflight records; if the durable readiness source is not reliable yet, the planner should treat readiness as optional evidence in Phase 68 and leave exact mission treatment for Phase 69.
- Keep Phase 68 focused on the foundation and compact dashboard indicator; do not implement the full mission center.

## Suggested Plan Shape

Two plans are enough:

1. **Backend progression snapshot and service**
   - Schema/migration
   - Progression levels/config
   - Evidence derivation service
   - Workspace-authenticated API
   - Repository/service/route tests

2. **Dashboard progression module**
   - Query hook
   - Compact dashboard component
   - Dashboard integration
   - Component/hook tests
   - Verification checklist

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Progress becomes a fake checklist | Infer from durable product records; do not allow manual checkboxes |
| Leveling becomes too fast | Keep first level sticky; require first approved creative to advance |
| Expensive dashboard query | Persist snapshot and recalculate through a bounded service; keep API response small |
| Future phases need richer mission data | Store evidence keys/timestamps in snapshot so Phase 69 can build mission UI without rewriting foundation |
| Credit pressure feels manipulative | Do not advance on credit spend alone; use value-producing evidence and transparent next actions |

## Validation Architecture

Phase 68 should validate at three layers:

1. **Service/repository unit tests**
   - Level calculation from durable product evidence.
   - Workspace isolation for snapshots and evidence reads.
   - Next-action blocker state when prerequisites are missing.

2. **Route tests**
   - Authenticated workspace access required.
   - JSON response shape includes level, progress, completed evidence, next action, and blocker state.
   - Cross-workspace data does not leak.

3. **UI/hook tests**
   - Dashboard card renders current level, progress bar, and next action.
   - Loading/empty/error states are compact and do not block dashboard.
   - CTA points to the next product action.

Recommended commands:
- Focused quick run: `cd app && npm test -- src/server/progression src/app/api/workspace/progression src/lib/hooks/use-progression src/components/dashboard/AdsScientistProgressCard`
- Full phase run: `cd app && npm test -- src/server/progression src/app/api/workspace/progression src/lib/hooks/use-progression src/components/dashboard/AdsScientistProgressCard && npm run lint`

## Research Complete

The plan should proceed with a backend-first snapshot/service plan followed by a dashboard UI plan. No new external library is recommended for Phase 68.
