---
phase: 95
plan: 01
subsystem: campaigns-ui
tags: [stall-nudge, share-correlation]
requires: [phase 92, phase 91]
provides: [previewPendingBatch metric, Continue batch CTA]
affects: [CampaignListCard, CampaignTableRow, campaign repository]
key-files:
  modified:
    - app/src/server/repositories/campaign.ts
    - app/src/lib/hooks/use-campaigns.ts
    - app/src/lib/mock-data.ts
    - app/src/components/campaigns/CampaignListCard.tsx
    - app/src/components/campaigns/CampaignTableRow.tsx
    - app/messages/en.json
    - app/messages/pt-BR.json
metrics:
  completed: 2026-06-08
---

# Phase 95 Plan 01: Stall UX + Share Correlation Summary

**One-liner:** `previewPendingBatch` SQL derivation flags approved preview without batch derivations; amber "Continue → batch" chip on list card and table row; share engagement by assistance already in owner dashboard (phase 92).

## Requirements

- STALL-03 — post-preview continue nudge
- SHARE-03 — share open rate by assistance level (dashboard panel)

## Self-Check: PASSED
