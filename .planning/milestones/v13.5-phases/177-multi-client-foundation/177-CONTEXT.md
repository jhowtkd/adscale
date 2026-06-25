# Phase 177: Multi-Client Foundation - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Source:** `$gsd-plan-phase 177`

<domain>
## Phase Boundary

Phase 177 makes `clientProfile` a true multi-client workspace entity. It removes the remaining database and repository assumptions that a workspace has only one profile, then verifies all brand data paths resolve through `clientProfileId` when a specific client is known.

This phase does not build the `/assistant` surface. It prepares the data model and isolation rules that later assistant phases depend on.
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- A workspace may contain multiple `client_profiles` rows.
- Existing campaigns must keep working after migration.
- Campaign resolution order is explicit `campaign.clientProfileId`, then exact campaign `client` name match, then sole-profile fallback only when the workspace has exactly one profile.
- If more than one profile exists and the caller does not provide a specific profile, write paths must not mutate an arbitrary profile.
- Brand kit, memory, references, voice configuration, corpus, and calibration rules must be checked for `clientProfileId` scoping.
- The existing app code already uses `clientProfileId` heavily; this phase should tighten gaps rather than introduce a parallel client model.

### Claude's Discretion
- Exact helper names for profile-scoped brand-kit APIs.
- Whether legacy workspace brand-kit endpoints keep a sole-profile fallback or return an ambiguity error when multiple profiles exist.
- Exact test file placement, as long as targeted regression coverage is close to the changed code.
</decisions>

<specifics>
## Specific Ideas

- Add a corrective migration after `0055_user_workspace_settings.sql` to drop historical `client_profiles_workspace_id_unique` constraints/indexes and preserve or create the non-unique workspace index.
- Keep historical migrations intact; the new migration is the forward-compatible fix for existing and fresh databases.
- Replace workspace-only brand-kit repository helpers with profile-aware helpers and a deterministic resolver for legacy workspace calls.
- Zep/Mem0 brand memory currently uses a workspace-level user id plus metadata. Retrieval and ingestion need a client-profile filter or profile-specific user scope so one client's learned context cannot appear in another client's prompt.
- Add tests for multiple profile creation/listing, brand-kit ambiguity, memory scoping, campaign profile resolution, and scoped learning/reference/calibration paths.
</specifics>

<deferred>
## Deferred Ideas

- Assistant thread persistence, action contracts, MiniMax adapter, and chat UI are deferred to Phases 178-183.
- Full project/folder entity above client/campaign remains deferred.
</deferred>

---

*Phase: 177-multi-client-foundation*
*Context gathered: 2026-06-25 via plan-phase*
