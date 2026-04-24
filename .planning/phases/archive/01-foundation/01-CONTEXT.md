# Phase 1: Foundation — Server Layer, Auth & Infra

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped — full context provided in milestone spec)

<domain>
## Phase Boundary

Establish the real server layer: database schema, auth system, R2 storage, Inngest queue, and env validation. Strip business data from Zustand.

</domain>

<decisions>
## Implementation Decisions

### Database
- Neon PostgreSQL with Drizzle ORM
- Better Auth tables: user, session, account, verification
- App tables: workspaces, workspace_members, campaigns, campaign_assets, creative_plans, derivations, usage_events, activity_events, exports

### Auth
- Better Auth with email/password
- Open signup
- First signup auto-creates initial workspace
- Protected routes: dashboard, campaigns, settings

### Storage
- Cloudflare R2 via AWS S3 SDK
- Presigned URLs for upload/download
- Server-side only credentials

### Jobs
- Inngest for durable derivation jobs
- Local dev support via Inngest dev server

### Env Validation
- Zod schema for all env vars
- Throw at startup if invalid

### Deps to Add
- `inngest`
- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`
- `sharp`
- `jszip`

</decisions>

<code_context>
## Existing Code Insights

- Next.js 16.2.4 app in `app/` with App Router
- Current Zustand store (`useAppStore`) holds business data — must be stripped to UI-only
- No server layer exists yet
- Tests dir does not exist
</code_context>

<specifics>
## Specific Ideas

- Create `app/src/server/` with: `db/`, `auth/`, `storage/`, `ai/`, `jobs/`, `repositories/`, `validation/`
- Drizzle schema file should be in `app/src/server/db/schema.ts`
- Env validation in `app/src/server/validation/env.ts`
- R2 client in `app/src/server/storage/r2.ts`
- Inngest client in `app/src/server/jobs/client.ts`
</specifics>

<deferred>
## Deferred Ideas

- Campaign CRUD logic (Phase 2)
- OpenAI integration logic (Phase 3)
- Export pipeline (Phase 4)
- Comprehensive test suite (Phase 5)
</deferred>
