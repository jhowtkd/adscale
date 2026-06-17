# Phase 128: Evaluation and Release Gate — Context

**Milestone:** v12.4 Aprendizado de Qualidade dos Outputs  
**Depends on:** Phase 127 (safety guards, appliedLearningTrace, Postgres-only approved learnings)

## Goal

Close v12.4 only if the output learning loop proves a quality improvement path without factual regression.

## Upstream Deliverables (124–127)

| Phase | Capability |
|-------|------------|
| 124 | `output_decision_events` canonical evidence capture |
| 125 | `client_output_learnings` aggregation + Mem0 projection |
| 126 | Recommendation API + UI card + bounded prefill |
| 127 | Safety guards, `appliedLearningTrace`, factual-contract protection |

## Evaluation Principles (EVAL-02)

Metrics MUST remain separated:

| Bucket | Measures | Does NOT measure |
|--------|----------|------------------|
| **Quality signals** | Approval→learning path, rejection/regeneration capture, recommendation prefill coverage, contradiction handling | Factual hard-failure taxonomy |
| **Factual fidelity** | Safety guard blocks, v12.3 gate-failure-matrix + creative-quality-gate regression, Postgres-only authorization | Subjective visual polish |

## Reference Patterns

- Phase 108: performance learning release gate + milestone audit
- Phase 123: `creative-validation-matrix.ts`, `check-creative-validation-evidence.mjs`, `run-creative-release-gate.mjs`
- v12.3 audit: factual regression subset documented in `v12.3-MILESTONE-AUDIT.md`

## Accepted Gaps

- v12.3 QA-19 (mean visual quality 70.17 < 75) remains accepted — EVAL-03 only guards factual hard-failure protections, not QA-19 visual threshold.

## Plans

| Plan | Focus | Requirements |
|------|-------|--------------|
| 128-01 | Fixed eval matrix + pipeline eval tests | EVAL-01 |
| 128-02 | Evidence checker + baseline docs | EVAL-02 |
| 128-03 | Release gate orchestrator + milestone audit | EVAL-03, EVAL-04 |
