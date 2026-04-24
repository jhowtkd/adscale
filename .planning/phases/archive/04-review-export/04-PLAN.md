# Plan: Phase 4 — Review, Regeneration & Export

## Overview
Complete the creative workflow with review gallery, regeneration with feedback, and export pipeline.

## Requirements Covered
REVIEW-01, REVIEW-02, REVIEW-03, EXPORT-01, EXPORT-02, EXPORT-03

## Tasks

### T1: Review API Route
- `PATCH /api/derivations/[id]/review` — update status to approved/rejected

### T2: Regeneration API Route
- `POST /api/derivations/[id]/regenerate` — create new derivation with parent_id and feedback

### T3: Export Service
Create `app/src/server/services/export.ts`:
- `exportIndividual(derivationId, format)` — signed URL
- `exportAllApproved(campaignId, format)` — ZIP generation

### T4: Export API Route
- `POST /api/exports` — handle individual or batch export

### T5: Format Conversion
- Use `sharp` when output format differs from stored format
- Support PNG, JPEG, WebP

### T6: Gallery UI Updates
- Connect to real derivation data
- Approve/reject buttons
- Regenerate with feedback modal
- Compare view

### T7: Export UI
- Individual download buttons
- Export all approved button
- Format selector

## Verification
- [ ] Approve/reject persists
- [ ] Regeneration creates linked derivation
- [ ] Individual export downloads correct format
- [ ] Batch export generates ZIP
- [ ] Format conversion works
