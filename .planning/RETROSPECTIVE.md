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

## Milestone: v13.5 — Assistente Conversacional de Ações

**Shipped:** 2026-06-25
**Phases:** 7 | **Plans:** 18

### What Was Built
- Multi-client foundation removing workspace-level `clientProfile` uniqueness (migration 0056).
- Assistant conversation persistence: threads, messages, action records, job sync (migration 0057).
- MiniMax M3 orchestration with allowlisted context and deny-by-default tool policy.
- Action contract grammar with propose/confirm gates and seven post-confirm executors.
- `/assistant` three-column surface, campaign drawer, review panel reusing workspace components.

### What Worked
- Reusing mature workspace primitives (derivation jobs, review sheet) instead of duplicating chat UI logic.
- Action contracts kept quick paths honest without forcing full campaign briefs.
- Audit-driven closure fixed the `jobRef` payload gap before milestone archive.

### What Was Inefficient
- Phases 182/183 shipped code before full GSD PLAN/SUMMARY artifacts existed on disk.
- `roadmap analyze` could not see phases under `milestones/v13.5-phases/` (0 plans reported by CLI).

### Patterns Established
- `Cliente > Campanha > Thread` as the assistant navigation model.
- Confirmed action cards as the only gate for write/credit/async execution.
- `jobRef` mirrored on both `assistant_action_records` and action-card message payload for UI linking.

### Key Lessons
1. Integration audits should verify message payload fields UI components actually read, not only DB record fields.
2. Retrospective GSD artifacts are cheap insurance when execution outpaces planning docs.
3. `passed_with_tech_debt` is the right close when automated coverage is green but live operator smoke remains.

### Cost Observations
- Model mix: not measured in repo artifacts.
- Assistant unit tests: 99 passing at archive time.
- Notable: P0 `jobRef` fix was ~30 lines; high UX impact per line changed.

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
