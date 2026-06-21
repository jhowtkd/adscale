# Phase 160 Context — Human Evaluation and Feedback Artifacts

**Milestone:** v13.1 Global Owner Quality Corpus  
**Depends on:** Phase 159 (global queue, filters, previews)

## Goal

Let the platform owner evaluate pending global corpus items and produce structured feedback artifacts that downstream calibration and quality-improvement tooling can consume.

## Scope

- Global evaluation write path with server-resolved workspace
- Duplicate and stale-submit guards
- Structured feedback artifact persistence linking corpus item, evaluation, derivation and source label
- Owner UI: evaluation form only on pending items; submit-and-next via queue refresh

## Out of scope (Phase 161)

- Global evidence aggregates and release gate
- Score calibration / learning impact reports in global mode

## Key files

| Area | Path |
|------|------|
| Service | `app/src/server/human-quality/service.ts` |
| Feedback builder | `app/src/server/human-quality/feedback-artifact.ts` |
| Artifact repo | `app/src/server/repositories/human-quality-feedback-artifact.ts` |
| Evaluation route | `app/src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.ts` |
| Panel | `app/src/components/feedback/HumanQualityCorpusPanel.tsx` |
| Migration | `app/drizzle/0050_human_quality_feedback_artifacts.sql` |
