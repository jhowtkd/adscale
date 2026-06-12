---
phase: 103-performance-data-foundation
plan: 02
subsystem: persistence
tags: [drizzle, postgres, repository, workspace-isolation]
provides:
  - Canonical creative performance snapshot table and migration
  - Database checks, lineage indexes and workspace/source-key uniqueness
  - Workspace-scoped atomic upsert and query repository
requirements-completed: [PERF-13, PERF-15]
completed: 2026-06-12
---

# Phase 103 Plan 02 Summary

Performance snapshots are persisted with exact numeric columns, inclusive date windows, source timezone, raw and normalized placement, explicit scope, external lineage and audit actor.

## Commits

- `b2aeeca0` — schema, generated migration and metric contract alignment
- `67112cfe` — workspace-scoped performance repository

## Key Decisions

- Unique identity is `(workspace_id, source_key)` and updates are atomic.
- Overlapping periods remain independent records and are never implicitly aggregated.
- `created_by_user_id` remains the original audit actor on conflict updates.

## Deviation

- Drizzle generated duplicate historical DDL because older manual migrations were absent from the previous snapshot. The generated `0037` was narrowed to the new table while retaining generated journal and snapshot metadata.

## Verification

- Repository and domain suites passed.
- Migration SQL inspected for FKs, checks, exact numerics, unique identity and indexes.
- Production build passed.
