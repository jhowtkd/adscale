---
phase: 106-client-performance-memory-and-mem0
plan: 01
subsystem: performance-learning
tags: [mem0, postgres, hypotheses, client-memory]
dependency_graph:
  requires: [phase-105-hypotheses]
  provides: [client-learnings, mem0-projection, learning-apis]
  affects: [campaign-workspace, client-profiles]
tech_stack:
  added: [client_performance_learnings table, performance-learning module]
  patterns: [postgres-canonical-mem0-projection, evidence-jsonb]
key_files:
  created:
    - app/drizzle/0040_client_performance_learnings.sql
    - app/src/server/performance/learning/
    - app/src/server/repositories/client-learning.ts
    - app/src/server/memory/performance-learning-projection.ts
    - app/src/server/memory/performance-learning-retrieval.ts
    - app/src/components/campaigns/LearningsPanel.tsx
    - app/src/app/api/client-profiles/[id]/learnings/route.ts
    - app/src/app/api/campaigns/[id]/learnings/route.ts
  modified:
    - app/src/server/db/schema.ts
    - app/src/server/performance/hypothesis/service.ts
    - app/src/server/performance/import/service.ts
    - app/src/app/(dashboard)/campaigns/[id]/page.tsx
decisions:
  - Algorithm version 1.0.0 with automatic approval when support exceeds contradiction
  - Mem0 projection uses performance_learning memoryType and canonical learningId metadata
  - Recompute triggered non-blocking after comparison and import confirm
metrics:
  duration: ~45m
  completed: 2026-06-12
---

# Phase 106 Plan 01: Client Performance Memory Summary

**One-liner:** Canonical client learnings from hypothesis outcomes with Postgres evidence ledger and non-blocking Mem0 projection/retrieval.

## What Shipped

- `client_performance_learnings` migration and Drizzle schema with evidence refs, confidence, algorithm version, Mem0 ID.
- Deterministic aggregation from controlled hypothesis comparisons (CTA/format/recipe/style).
- Mem0 create/update/delete projection; search resolves canonical Postgres rows.
- APIs: `/api/client-profiles/[id]/learnings`, `/api/campaigns/[id]/learnings`.
- Campaign workspace panel `(01c) Memória de performance` with sample, recency, context, confidence.

## Deviations

None — plan executed as specified.

## Self-Check: PASSED

- Migration `0040_client_performance_learnings.sql` exists
- Tests: 1164 passed
- Build: OK
