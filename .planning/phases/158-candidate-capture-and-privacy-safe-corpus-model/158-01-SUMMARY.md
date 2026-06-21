# Phase 158-01 Summary — Candidate Registration and Dedupe

**Status:** complete  
**Requirements:** CAPTURE-01, CAPTURE-02

## Delivered

- Migration `0049_human_quality_corpus_candidates.sql`
- `captureCorpusCandidate` hook in derivation job (post quality-gate)
- Idempotent insert per workspace + derivation + corpus version

## Verification

- `tests/unit/human-quality/candidate-capture.test.ts` — pass
