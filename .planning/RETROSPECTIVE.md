# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v12.6 — Operacao Live do Corpus de Qualidade

**Shipped:** 2026-06-18
**Phases:** 4 | **Plans:** 14 | **Sessions:** current closure session plus phase execution sessions

### What Was Built
- Batch selection and queue progress for real generated outputs in the live human-quality corpus.
- Faster reviewer workflow with structured visual/factual/intent/failure fields and privacy-safe payloads.
- Sampling thresholds and guidance that return `insufficient_sample` instead of optimistic claims.
- Quality trend API/UI/evidence CLI for owner-facing trend, coverage and regression visibility.
- Operational release gate with separate technical and operational status.

### What Worked
- The milestone kept technical pass and operational evidence separate instead of treating green automation as proof of quality movement.
- Evidence files now make sample insufficiency explicit enough for future operators to know the exact next action.

### What Was Inefficient
- Live DB/operator evidence remained data-dependent, so the milestone still closed with `evaluatedItemCount=0`.
- Nyquist validation metadata lagged behind implementation and verification for Phases 135-137.

### Patterns Established
- Release gates can pass technical regression while carrying `tech_debt` for operational insufficiency.
- Quality claims must remain withheld until sample sufficiency and factual pass criteria are both satisfied.

### Key Lessons
1. Treat corpus population as an operator workflow with its own evidence, not as a side effect of implementation.
2. Keep denominator provenance visible across fixture, live-human and accepted-caveat evidence.
3. Close validation metadata during the phase, not only during milestone audit.

### Cost Observations
- Model mix: not measured in repo artifacts.
- Sessions: multiple phase execution sessions plus one closure session.
- Notable: automated gate time is meaningful, but the true bottleneck is still live sample collection.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v12.6 | multiple | 4 | Introduced dual technical/operational release status for quality gates |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v12.6 | 1923 passing, 1 skipped in fresh gate | not measured | no new dependency noted |

### Top Lessons (Verified Across Milestones)

1. Automated green does not replace human/live evidence for quality milestones.
2. Accepted gaps are useful only when preserved explicitly in audit, evidence and next-operator actions.
