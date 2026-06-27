# Project Research Summary

**Project:** ADScale v13.9 Copiloto Criativo Iterativo
**Domain:** Conversational plan and creative versioning
**Researched:** 2026-06-27
**Confidence:** HIGH

## Executive Summary

Natural extension is immutable artifact iteration, not new journeys or another orchestration framework. Existing v13.8 command CAS, action binding, review UI, plan rows, derivation parent links, job sync, credits, and telemetry provide most primitives.

Build one linear version model spanning plan and creative artifacts. Chat feedback creates an inspectable proposal; confirmed cost/write creates a new immutable version; user compares two versions and explicitly promotes one as current. Biggest risks: silent overwrite, stale approval, duplicate jobs/credits, plan-creative lineage drift, unreadable diffs.

## Decisions

- No new runtime/library.
- Full snapshots over patch chains.
- Creative media referenced, never copied.
- Linear parent lineage; no arbitrary merge UI.
- Semantic typed diff generated server-side.
- Current version promoted transactionally.
- New writes/costs remain action-confirmed; approval itself costs nothing.

## Must Have

1. Immutable version history for plans and creatives.
2. Feedback-to-proposal with source/version provenance.
3. Confirmed execution with idempotency and recovery.
4. Two-version semantic comparison.
5. Explicit approval/current version.
6. Resume, stale rejection, scope isolation.

## Suggested Roadmap

### Phase 203: Artifact Version Foundation
Schema, repositories, typed snapshots, lineage, current-pointer invariant, CAS.

### Phase 204: Plan Iteration Loop
Chat feedback → proposed plan revision → confirm → ready version.

### Phase 205: Creative Iteration Loop
Feedback → confirmed async derivation → version lifecycle/retry.

### Phase 206: Compare and Approval UX
Timeline, two-version compare, semantic changes, approve/promote/revert.

### Phase 207: Integration and UAT
Both paths, reload, conflicts, credits, failure, stale cards, browser coverage, audit.

## Defer

- New journeys, voice, multiuser merge, cross-thread memory, automatic learning, pixel diff.

## Sources

### Primary
- Current ADScale schema, repositories, action engine, guided flow, review panel.
- PostgreSQL JSONB: https://www.postgresql.org/docs/16/datatype-json.html
- PostgreSQL isolation: https://www.postgresql.org/docs/17/transaction-iso.html
- React state identity: https://react.dev/learn/preserving-and-resetting-state
- TanStack optimistic updates: https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates

---
*Ready for requirements: yes.*
