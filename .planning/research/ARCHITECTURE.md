# Research: v12.6 Architecture

## Question

How should live quality operations integrate with the existing v12.5 corpus, calibration, impact and gate architecture?

## Integration Points

- Phase 129 corpus selection and evaluation data model remains the source for reviewed items.
- Phase 130 score calibration consumes evaluated corpus rows and needs clearer status/output guidance when sample count is low.
- Phase 131 learning impact report already supports `insufficient_sample`; v12.6 should make the missing slices actionable.
- Phase 132 quality improvement report should read live evidence without overwriting fixture-based regression value.
- Phase 133 release evidence should become an operational gate that separates technical regression pass from live evidence sufficiency.

## Suggested Build Order

1. Build live corpus operations and queue visibility.
2. Add sample sufficiency policy and next-sample guidance.
3. Expose trends and drilldown in owner dashboard.
4. Close with a live operational release gate.

## Risks

- If sampling thresholds are hardcoded too narrowly, operators may not understand how to unblock the next claim.
- If dashboard aggregates hide denominators, the product may look healthier than the evidence supports.
- If technical gate and operational gate share a single pass/fail, milestone status will become ambiguous again.

## Sources Consulted

- https://www.braintrust.dev/articles/llm-evaluation-guide
- https://cameronrwolfe.substack.com/p/stats-llm-evals
- https://arxiv.org/html/2506.13023v2
