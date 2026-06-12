# Phase 105: Research

## Prior Art

| Asset | Location | Reuse |
|-------|----------|-------|
| Performance snapshots | `creative_performance_snapshots` | Aggregate per derivation for comparison window |
| Derived metrics | `derivePerformanceMetrics`, `divideDecimalStrings` | Zero-safe ratios from summed raw metrics |
| Campaign objective | `campaigns.objective` | Comparability context gate |
| Import panel UX | `PerformanceImportPanel` | Tab/form patterns for hypotheses panel |
| Phase 29 comparison | Side-by-side derivations (visual) | Different domain — no metric verdicts |

## Design Choices

1. **Normalized schema** — hypotheses, variant links, and comparison results as separate tables for audit trail and re-comparison.
2. **Deterministic engine** — no LLM for winner/confidence; all verdicts reproducible from stored snapshots.
3. **Persist comparisons** — each run creates `variant_comparisons` row; hypothesis `outcome` updated from latest controlled comparison.
4. **Observational path** — same engine, `kind: observational`, no hypothesis outcome side effects.

## Risks

| Risk | Mitigation |
|------|------------|
| Sparse snapshot data | `insufficient_evidence` verdict + explicit sample counts |
| Mixed platforms in imports | Platform filter on hypothesis + comparability check |
| User expects p-values | UI copy: observational, not causal; no significance claims |

## Test Focus (QA-11)

- Zero denominators → null derived metric, `insufficient_evidence`
- Platform mismatch → `not_comparable` with reason
- Period non-overlap → `not_comparable`
- Clear winner vs tie band → `winner` vs `no_clear_winner`
- Expected direction mapping → supported/contradicted/inconclusive
