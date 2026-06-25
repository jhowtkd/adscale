# Phase 177: Multi-Client Foundation - Research

**Researched:** 2026-06-25
**Status:** Complete

## Question

What do we need to know to plan Phase 177 well?

## Findings

### Database Shape

- Current Drizzle schema defines `client_profiles.workspace_id` with a non-unique index, but historical migrations still add `client_profiles_workspace_id_unique`.
- `app/drizzle/0017_client_profiles_workspace_unique.sql` adds `UNIQUE ("workspace_id")`.
- `app/drizzle/0019_redundant_human_torch.sql` conditionally recreates the same unique constraint.
- Next migration should be `0056_client_profiles_multi_workspace.sql` or equivalent after `0055_user_workspace_settings.sql`.

### Client Profile Repository

- `app/src/server/repositories/client-reference.ts` already exposes `createClientProfile`, `getClientProfiles`, `getClientProfile`, and profile-scoped references.
- `resolveCampaignClientProfileId` already uses the right conceptual resolution order: explicit linked profile, exact client-name match, sole-profile fallback, otherwise `null`.
- The missing work is regression coverage and guarding code paths that still assume a single profile elsewhere.

### Brand Kit

- `app/src/server/db/repositories/brand-kit.ts` still treats brand kit as workspace-owned:
  - `getBrandKitByWorkspace(workspaceId)` returns the first profile for a workspace.
  - `upsertBrandKit(workspaceId, data)` uses `onConflictDoUpdate({ target: clientProfiles.workspaceId })`, which depends on the unique constraint Phase 177 must remove.
  - `deleteBrandKit(workspaceId)` mutates whichever profile `getBrandKitByWorkspace` returns.
- Callers include:
  - `app/src/app/api/workspace/brand-kit/route.ts`
  - `app/src/app/api/workspace/brand-kit/logo/route.ts`
  - `app/src/server/jobs/derivation.ts`
  - `app/src/app/api/derivations/[id]/copy-variants/route.ts`

### Memory

- Brand-memory implementation surfaces are `app/src/server/memory/*`, `app/src/server/jobs/brand-memory.ts`, and `GET /api/client-profiles/[id]/memory`.
- Current Mem0/Zep helpers derive a user scope from workspace id via `getBrandMemoryUserId(workspaceId)`.
- Some retrieval paths pass `clientProfileId` as metadata filter, but ingestion/projection helpers still need explicit coverage so profile A cannot retrieve learned facts for profile B.
- The existing product rule remains: learned memory is auxiliary and must not override literal campaign contracts.

### Already Profile-Scoped Areas

- References use `clientReferences.workspaceId` and `clientReferences.clientProfileId`.
- Voice config, performance learnings, output learnings, quality corpus, calibration signals, calibration rules, and owner quality routes are mostly keyed by `clientProfileId`.
- Phase 177 should verify these with targeted tests rather than rewrite already-scoped systems.

## Risks

- Fresh database installs can still end up with the historical unique constraint unless the new migration explicitly drops it after old migrations run.
- Workspace-level brand-kit endpoints can silently mutate the wrong profile after multiple profiles exist.
- Workspace-scoped memory user ids can leak learned context unless search/write paths consistently filter or isolate by profile.
- Legacy campaigns with no `clientProfileId` and a non-unique `client` label can become ambiguous; returning `null` is safer than guessing.

## Validation Architecture

Use Vitest and build validation from `app/`.

Automated coverage must include:
- Migration/schema assertion that multiple `client_profiles` rows can share one `workspace_id`.
- Repository/API tests for `GET`/`POST /api/client-profiles` with two profiles in one workspace.
- Resolver tests for explicit id, exact name match, sole-profile fallback, and ambiguous multi-profile fallback.
- Brand-kit tests proving explicit `clientProfileId` writes update the intended profile and omitted profile ids are rejected or deterministically limited to a sole-profile workspace.
- Memory tests proving retrieval and projection preserve `clientProfileId` filtering/scope.
- Cross-client regression for references or learnings to prove profile B data is not returned for profile A.

Required commands:
- `cd app && npm test -- src/app/api/client-profiles/route.test.ts`
- `cd app && npm test -- src/server/repositories/client-reference.test.ts src/server/db/repositories/brand-kit.test.ts src/server/memory/brand-memory-context.test.ts`
- `cd app && npm run build`
- `cd app && npx drizzle-kit check`

## Research Complete
