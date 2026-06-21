# Phase 159: Global Review Queue and Preview - Context

**Gathered:** 2026-06-20
**Status:** Ready for execution

## Phase Boundary

Extend the global corpus GET with dimensional filters, source-label resolution via candidate join, mixed-workspace previews (done in 157), and owner UI filter controls. Evaluation submit-and-next and feedback artifacts remain Phase 160.

## Decisions

- Filters apply to global and scoped list calls via shared query params.
- Default queue status filter: `pending`.
- Source label: `coalesce(candidate.source_label, 'operator_imported')` for manual corpus selections.
- Review context uses existing qualitySnapshot fields only — no prompts or storage keys in API responses.
