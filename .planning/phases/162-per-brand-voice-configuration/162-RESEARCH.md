# Phase 162 Research: Per-Brand Voice Configuration

**Researched:** 2026-06-23
**Confidence:** HIGH

## Objective

What do we need to know to plan Phase 162 well?

## Current State

| Area | Status |
|------|--------|
| `ClientVoice` interface | `app/src/server/ai/voices/cenbrap.ts` — full Cenbrap content |
| Resolution | `resolveClientVoice()` — string match on campaign name/client/product |
| Injection | `generation-direction.ts` lines 182–195 |
| Review gate | `voice-review-gate.ts` — only `cenbrap` id; status hardcoded `pending_review` |
| DB | No `client_profile_olhar_config`; `client_profiles` has tone/constraints fields but not Olhar voice structure |
| Admin APIs | `/api/admin/quality/learning/*`, `/api/admin/quality/ingestion/*` — pattern for owner routes |

**Critical:** `isClientVoiceInjectionAllowed` returns `false` for Cenbrap today because `CENBRAP_VOICE_REVIEW_STATUS === "pending_review"`. Seed must set `review_status: approved` for Cenbrap parity in production generation, or generation path uses `forceApproved` — CONTEXT locks seed with approved status for Cenbrap.

## Recommended Implementation

### 1. Schema `client_profile_olhar_config`

```sql
-- Migration 0053_client_profile_olhar_config.sql
client_profile_id UUID PK FK → client_profiles(id) ON DELETE CASCADE
workspace_id UUID NOT NULL FK → workspaces(id)
voice_id TEXT NOT NULL
display_name TEXT NOT NULL
config JSONB NOT NULL  -- ClientVoice-shaped (without matchTerms in generation path)
review_status TEXT NOT NULL CHECK (pending_review|approved|changes_requested)
source TEXT NOT NULL DEFAULT 'seeded'
approved_at, approved_by, created_at, updated_at
```

Unique: `(workspace_id, client_profile_id)` — one voice config per profile.

### 2. Repository + resolver

- `getOlharVoiceConfigByClientProfileId({ workspaceId, clientProfileId })`
- `buildClientVoiceFromConfig(row)` → implements `buildPromptSection()`
- `resolveVoiceForClientProfile(clientProfileId, workspaceId)` — used by generation-direction

### 3. Generation wiring

Replace in `buildGenerationDirectionSection`:
```typescript
// Before: resolveClientVoice({ name, client, product })
// After: resolveVoiceForClientProfile(campaign.clientProfileId, workspaceId)
```

Pass `clientProfileId` from derivation job (already available via campaign).

### 4. Cenbrap seed

- Script or migration seed: find Cenbrap `client_profile` by name ilike `%cenbrap%` per workspace OR document operator workspace + profile id in seed test fixture
- Copy `CENBRAP_VOICE` fields into `config` JSONB
- `review_status: approved`, `source: seeded`, `voice_id: cenbrap`

### 5. Deprecate hardcode

- Keep `resolveClientVoice` only for tests during transition; mark `@deprecated`
- Remove from generation path in same phase
- Update `voice-review-gate` to read `review_status` from DB row by voiceId + clientProfileId

### 6. Owner read API + UI

- `GET /api/admin/quality/brands/[clientProfileId]/voice` — requirePlatformOwner
- Response: displayName, reviewStatus, source, config sections (no raw prompt secrets)
- UI tab or page under admin quality — read-only

## Validation Architecture

| Requirement | Test type | Command / file |
|-------------|-----------|----------------|
| VOICE-01 schema | migration + unit | `npm test -- schema` / repository insert |
| VOICE-02 resolver by profile | unit | `client-voice.test.ts` / `voice-config.test.ts` |
| VOICE-03 Cenbrap parity | unit snapshot | compare prompt sections before/after |
| VOICE-04 no string match in generation | unit | `generation-direction.test.ts` |
| VOICE-05 owner GET + 403 non-owner | integration | `route.test.ts` |

**Quick run:** `cd app && npm test -- --run src/server/ai/voices/ src/server/ai/olhar/generation-direction.test.ts`
**Full:** `cd app && npm test -- --run`

## Risks

1. **Cenbrap not injected today** — review gate blocks; seed must use `approved`
2. **client_profiles.workspaceId unique** — one profile per workspace in schema; multi-brand = multiple workspaces or schema evolution later (out of 162 scope)
3. **voice-review-gate** must generalize beyond `voiceId === "cenbrap"`

## Files to Touch

- `app/drizzle/0053_client_profile_olhar_config.sql`
- `app/src/server/db/schema.ts`
- `app/src/server/repositories/client-profile-olhar-config.ts` (new)
- `app/src/server/ai/voices/client-voice.ts`
- `app/src/server/ai/voices/voice-review-gate.ts`
- `app/src/server/ai/olhar/generation-direction.ts`
- `app/src/server/jobs/derivation.ts` (pass clientProfileId if missing)
- `app/src/app/api/admin/quality/brands/[clientProfileId]/voice/route.ts` (new)
- Seed script `scripts/seed-cenbrap-voice-config.mjs` or SQL in migration

## Standard Stack

Vitest, Drizzle, existing `requirePlatformOwner`, Zod for API response shape.

## RESEARCH COMPLETE
