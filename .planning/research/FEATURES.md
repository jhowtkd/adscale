# Research: v12.6 Features

## Question

How should live corpus operations work for an AI creative quality loop?

## Table Stakes

- A versioned golden/live corpus that grows from real traffic.
- Human review flow with structured rubric fields rather than ad hoc notes.
- Sampling rules that make insufficient evidence visible.
- Drilldown from aggregate metrics back to reviewed examples.
- Clear separation between automatic scores, human visual score, factual pass/fail and accepted caveats.

## Differentiators for ADScale

- Tie review items to generation mode, format, client profile and learning-applied cohort.
- Report next required samples per slice, so the operator knows what to evaluate next.
- Keep factual fidelity as a hard guardrail that visual quality cannot offset.
- Make operational status visible beside technical gate status.

## Anti-Features

- Do not claim quality uplift from empty or tiny live corpus slices.
- Do not blend media performance with human quality in this milestone.
- Do not persist raw prompts, signed URLs or large model payloads for reviewer convenience.

## Sources Consulted

- https://snorkel.ai/blog/data-quality-and-rubrics-how-to-build-trust-in-your-models/
- https://imerit.ai/solutions/generative-ai-data-solutions/image-generation-evaluation/
- https://kinde.com/learn/ai-for-software-engineering/ai-devops/human-in-the-loop-evals-at-scale-golden-sets-review-queues-drift-watch/
