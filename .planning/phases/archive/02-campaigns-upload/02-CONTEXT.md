# Phase 2: Campaigns, Upload & Dashboard

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated

<domain>
## Phase Boundary

Build campaign CRUD, presigned upload flow, asset linking, and connect dashboard to real APIs.
</domain>

<decisions>
## Implementation Decisions

### API Routes
- `GET/POST /api/campaigns`
- `GET/PATCH/DELETE /api/campaigns/[id]`
- `POST /api/campaigns/[id]/assets/presign`
- `POST /api/campaigns/[id]/assets/complete`
- `GET /api/dashboard`

### Campaign Status
- `draft | active | generating | completed | failed`

### Upload Flow
1. UI requests presigned URL from API
2. Browser uploads directly to R2
3. API confirms and saves asset metadata

### Validation
- File types: PNG, JPEG, WebP
- Max size: 20MB
- Workspace membership check on all routes

</decisions>

<code_context>
## Existing Code Insights

- Server layer from Phase 1 provides db, auth, storage, repositories
- UI components exist but use mock data
- Need to connect real APIs to existing UI
</code_context>

<specifics>
## Specific Ideas

- Campaign repository with full CRUD
- Asset repository for upload tracking
- Dashboard API aggregating campaigns and recent activity
- TanStack Query hooks for all data fetching
</specifics>
