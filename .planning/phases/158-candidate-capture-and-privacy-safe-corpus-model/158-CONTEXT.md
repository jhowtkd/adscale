# Phase 158: Candidate Capture and Privacy-Safe Corpus Model - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 158 auto-registers completed derivations as privacy-safe global corpus **candidates**, with idempotent dedupe, source labels and owner promotion into review cohorts. Queue filters, rich UI and analytics remain Phase 159+.
</domain>

<decisions>
## Implementation Decisions

### Candidate vs Corpus Item
- Candidates live in `human_quality_corpus_candidates`; promotion creates `human_quality_corpus_items` (pending) without duplicating derivation rows.
- Idempotency: unique `(workspace_id, derivation_id, corpus_version)`.

### Capture Trigger
- Register after derivation job `mark-completed` (non-preview, status completed).
- Failures in capture must not fail the derivation job.

### Privacy
- Reuse `validatePrivacySafePayload` / `sanitizeCorpusPayloads` from human-quality corpus contract.
- No prompts, output keys, signed URLs or raw diagnostics in candidate payloads.

### Source Labels
- Reuse calibration labels: `synthetic_fixture`, `operator_imported`, `real_customer`.
- Auto-capture defaults to `real_customer`; env `HUMAN_QUALITY_SYNTHETIC_WORKSPACE_IDS` marks fixture workspaces.

### Promotion
- Platform-owner POST promotes candidate to cohort (`baseline`, `pre_learning`, `post_learning`).
- If corpus item already exists for derivation version, link candidate and return existing item (no duplicate).

### Test Focus
- Unit tests for registration dedupe, sanitization, source label resolution and promotion.
</decisions>
