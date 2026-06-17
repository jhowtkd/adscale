# Phase 134 Research: Live Corpus Operations

## Objective

Research what is needed to plan Phase 134 well: turning the existing human-quality corpus foundation into a repeatable live operator workflow.

## Files Read

- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/research/SUMMARY.md`
- `.planning/phases/129-live-human-quality-corpus/129-03-PLAN.md`
- `app/AGENTS.md`
- `app/src/server/human-quality/corpus.ts`
- `app/src/server/human-quality/service.ts`
- `app/src/server/repositories/human-quality-corpus.ts`
- `app/src/app/api/feedback/human-quality-corpus/route.ts`
- `app/src/components/feedback/HumanQualityCorpusPanel.tsx`

## Existing Implementation

Phase 129 already delivered the core path:

- `selectDerivationForCorpus` validates workspace/campaign/derivation membership, requires `clientProfileId`, dedupes by derivation/version, builds bounded artifact and quality snapshots, and freezes output-learning application metadata.
- `listPendingCorpusQueue` lists pending items per workspace.
- `submitHumanEvaluation` validates visual score, factual pass/fail, intent and primary failure reason, then marks the corpus item evaluated.
- `/api/feedback/human-quality-corpus` supports platform-owner `GET` for pending queue and `POST` for single-item selection, with ephemeral preview URL attachment.
- `HumanQualityCorpusPanel` already has queue, calibration, impact and quality tabs.

## Planning Implications

Phase 134 should not recreate schema or core evaluation concepts. The missing operational layer is:

1. Batch selection: controlled multi-item selection and per-item outcomes.
2. Queue progress: aggregate counts and dimensions needed to operate weekly review.
3. Faster review: progress/position, compact metadata, safe preview and fast next-item behavior.
4. Safety regression: forbidden payload keys and signed URL persistence remain blocked.

## Validation Architecture

### Automated Scope

- Unit/service tests for batch selection outcomes and unsafe payload rejection.
- Repository/API tests for queue progress summaries and owner-only access.
- Component tests for queue progress, metadata visibility and required fast-review behavior.
- Existing focused test families should remain green:
  - `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus app/src/components/feedback/HumanQualityCorpusPanel.test.tsx`
  - `cd app && npm run build`

### Manual Scope

No broad browser UAT is required for plan creation, but execution should leave an operator checklist for selecting a small real batch and evaluating at least one item when credentials/data are available.

### Nyquist Checks

Every plan must include focused automated verification. There should be no more than two implementation tasks between automated feedback points. Build remains required because App Router route modules can fail only at build time.

## Risks

- Batch selection can hide partial failures unless per-item results are explicit.
- Queue progress can accidentally become a trend dashboard; keep Phase 134 operational and defer trend claims.
- Fast review can weaken quality if required fields become optional.
- Adding preview conveniences can violate the signed URL persistence boundary.

## Recommended Plan Split

1. Batch operations and queue progress contracts.
2. Operator review UX and fast evaluation loop.
3. Phase verification, operator handoff and planning-state update.

---

*Phase: 134-live-corpus-operations*
*Research completed: 2026-06-17*
