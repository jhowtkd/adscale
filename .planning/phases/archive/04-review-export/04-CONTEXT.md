# Phase 4: Review, Regeneration & Export

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated

<domain>
## Phase Boundary

Complete the creative workflow with review gallery, regeneration with feedback, and export pipeline.
</domain>

<decisions>
## Implementation Decisions

### API Routes
- `PATCH /api/derivations/[id]/review`
- `POST /api/derivations/[id]/regenerate`
- `POST /api/exports`

### Review
- Approve/reject individual derivations
- Status persists in DB

### Regeneration
- Create new derivation linked to previous one
- Include feedback text in prompt

### Export
- Individual: signed URL download
- Batch all approved: ZIP with jszip
- Format conversion with sharp when needed
- Formats: PNG, JPEG, WebP

</decisions>

<code_context>
## Existing Code Insights

- Derivations exist from Phase 3
- R2 storage client from Phase 1
- Gallery UI exists but uses mock data
</code_context>

<specifics>
## Specific Ideas

- Export service for ZIP generation
- Sharp conversion pipeline
- Signed URL generation for downloads
- Regeneration creates derivation with `parent_id`
</specifics>
