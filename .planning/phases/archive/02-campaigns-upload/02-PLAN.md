# Plan: Phase 2 — Campaigns, Upload & Dashboard

## Overview
Build campaign CRUD, presigned upload flow, asset linking, and connect dashboard to real APIs.

## Requirements Covered
CAMP-01, CAMP-02, CAMP-03, UPLOAD-01, UPLOAD-02, UPLOAD-03, DASH-01, DASH-02

## Tasks

### T1: Campaign Repository
Create `app/src/server/repositories/campaign.ts`:
- `createCampaign(workspaceId, data)`
- `getCampaigns(workspaceId)`
- `getCampaignById(id, workspaceId)`
- `updateCampaign(id, workspaceId, data)`
- `deleteCampaign(id, workspaceId)`

### T2: Campaign API Routes
- `GET /api/campaigns` — list with workspace filter
- `POST /api/campaigns` — create
- `GET /api/campaigns/[id]` — get by id
- `PATCH /api/campaigns/[id]` — update
- `DELETE /api/campaigns/[id]` — delete (cascade assets)

### T3: Asset Repository
Create `app/src/server/repositories/asset.ts`:
- `createAsset(workspaceId, campaignId, data)`
- `getAssetsByCampaign(campaignId, workspaceId)`
- `deleteAsset(id, workspaceId)`

### T4: Upload API Routes
- `POST /api/campaigns/[id]/assets/presign` — validate file type/size, return presigned URL
- `POST /api/campaigns/[id]/assets/complete` — confirm upload, save metadata

### T5: Dashboard API
- `GET /api/dashboard` — aggregate campaign count, recent activity

### T6: TanStack Query Hooks
Create hooks for:
- `useCampaigns()`
- `useCampaign(id)`
- `useCreateCampaign()`
- `useUpdateCampaign()`
- `useDeleteCampaign()`
- `useUploadAsset()`
- `useDashboard()`

### T7: UI Integration
- Replace mock data in Campaigns page with real API
- Replace mock data in Dashboard with real API
- Loading/error/empty states

### T8: Validation
- Upload rejects non-image files
- Upload rejects files > 20MB
- All routes check workspace membership

## Verification
- [ ] Campaign CRUD works end-to-end
- [ ] Upload flow works (presign → browser upload → complete)
- [ ] Dashboard shows real data
- [ ] Workspace isolation enforced
