# Plan: Phase 3 — AI Plan & Derivation Jobs

## Overview
Integrate OpenAI for creative plan generation and image derivation via Inngest jobs.

## Requirements Covered
PLAN-01, PLAN-02, PLAN-03, DERIV-01, DERIV-02, DERIV-03, DERIV-04, DERIV-05

## Tasks

### T1: Prompt Builder Service
Create `app/src/server/ai/prompt-builder.ts`:
- Build plan prompt from brief + asset metadata
- Build derivation prompt from plan + feedback

### T2: Plan Repository
Create `app/src/server/repositories/plan.ts`:
- `createPlan(campaignId, workspaceId, data)`
- `getPlanByCampaign(campaignId, workspaceId)`
- `updatePlanStatus(id, workspaceId, status)`

### T3: Plan API Routes
- `POST /api/campaigns/[id]/plan` — generate plan with OpenAI
- `PATCH /api/campaigns/[id]/plan` — approve/reject plan

### T4: OpenAI Plan Generation
- Call `gpt-5-mini` with structured output
- Parse JSON response
- Validate with Zod schema
- Save to DB

### T5: Derivation Repository
Create `app/src/server/repositories/derivation.ts`:
- `createDerivation(data)`
- `getDerivationsByCampaign(campaignId, workspaceId)`
- `updateDerivationStatus(id, workspaceId, status, outputKey?)`

### T6: Derivation API Routes
- `POST /api/campaigns/[id]/derivations` — create batch
- `GET /api/campaigns/[id]/derivations` — list with status

### T7: Inngest Derivation Job
Create `app/src/server/jobs/derivation.ts`:
- Event handler for derivation generation
- Download input from R2
- Call OpenAI image model (`gpt-image-2-2026-04-21`)
- Upload output to R2
- Update DB status
- Track usage/cost

### T8: Credit Tracking
Create `app/src/server/repositories/usage.ts`:
- Simple credit estimation and tracking
- No real billing — MVP tracking only

### T9: UI Polling
- TanStack Query hooks with polling for derivation status
- `useDerivations(campaignId)` with `refetchInterval`

### T10: Error Handling
- Failed derivations show clear error
- Retry mechanism

## Verification
- [ ] Plan generation returns valid JSON
- [ ] Plan approval triggers derivations
- [ ] Derivation jobs progress through statuses
- [ ] UI polls and updates status
- [ ] Failed jobs show errors
