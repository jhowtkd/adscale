# Plan: Phase 1 — Foundation

## Overview
Establish the real server layer: database schema, auth system, R2 storage, Inngest queue, and env validation. Strip business data from Zustand.

## Requirements Covered
AUTH-01, AUTH-02, AUTH-03, AUTH-04, WORK-01, WORK-02, SEC-02, SEC-03

## Tasks

### T1: Add Dependencies
- `inngest`
- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`
- `sharp`
- `jszip`

### T2: Environment Validation
Create `app/src/server/validation/env.ts` with Zod schema for:
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL=gpt-5-mini`
- `OPENAI_IMAGE_MODEL=gpt-image-2-2026-04-21`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
- `APP_URL`

### T3: Drizzle Schema
Create `app/src/server/db/schema.ts` with tables:
- Better Auth tables: `user`, `session`, `account`, `verification`
- `workspaces` (id, name, slug, createdAt, updatedAt)
- `workspace_members` (id, workspaceId, userId, role, createdAt)
- `campaigns` (id, workspaceId, name, client, product, objective, audience, platforms, tone, offer, constraints, notes, status, createdAt, updatedAt)
- `campaign_assets` (id, campaignId, workspaceId, key, type, size, width, height, createdAt)
- `creative_plans` (id, campaignId, workspaceId, strategy, angles, hooks, ctas, status, createdAt, updatedAt)
- `derivations` (id, campaignId, workspaceId, planId, parentId, status, prompt, outputKey, format, cost, feedback, createdAt, updatedAt)
- `usage_events` (id, workspaceId, type, amount, metadata, createdAt)
- `activity_events` (id, workspaceId, userId, type, metadata, createdAt)
- `exports` (id, workspaceId, derivationId, format, key, createdAt)

### T4: Database Client
Create `app/src/server/db/index.ts` with Drizzle client using Neon serverless.

### T5: Better Auth Setup
Create `app/src/server/auth/index.ts` with Better Auth instance:
- Email/password provider
- Database adapter using Drizzle
- Open signup
- Post-signup hook to create initial workspace
- Session middleware

### T6: R2 Storage Client
Create `app/src/server/storage/r2.ts`:
- S3 client configured for Cloudflare R2
- `getPresignedUploadUrl(key, type, size)`
- `getPresignedDownloadUrl(key)`
- `confirmUpload(key)`
- `deleteObject(key)`

### T7: Inngest Client
Create `app/src/server/jobs/client.ts`:
- Inngest client instance
- Event types for derivation jobs

### T8: Strip Zustand Business Data
Refactor `useAppStore` to UI-only:
- Keep: sidebar open/close, page title, toast notifications
- Remove: campaigns, derivations, assets, plans

### T9: Protected Routes Middleware
Create middleware or route guards for:
- `/dashboard`
- `/campaigns/*`
- `/settings/*`

### T10: Workspace Context
Create `app/src/server/repositories/workspace.ts`:
- `getWorkspaceForUser(userId)`
- `createWorkspace(data)`
- `addMember(workspaceId, userId, role)`
- `verifyMembership(workspaceId, userId)`

## Verification
- [ ] `npm run build` passes
- [ ] Env validation throws clear errors for missing/invalid vars
- [ ] Better Auth signup creates workspace
- [ ] Drizzle schema compiles
- [ ] Zustand has no business data
