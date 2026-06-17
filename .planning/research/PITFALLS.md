# Research: v12.6 Pitfalls

## Question

What mistakes are common when adding live human evaluation to an AI product?

## Pitfalls

### Vague Rubrics

Rubric-driven evaluation is useful only when labels are stable enough for repeat use. v12.6 should keep visible failure reasons closed and explicit, with "other" bounded rather than freeform as the main signal.

### False Certainty From Small Samples

Averages without sample count and uncertainty create misleading improvement claims. v12.6 should default to `insufficient_sample` until minimum slice counts are met.

### Hidden Denominators

Trend charts must show coverage and stale evidence state. Otherwise a single evaluated item can look like a product-level quality trend.

### Human Review Drift

If reviewers do not see a consistent flow and playbook, the corpus becomes inconsistent over time. v12.6 needs an operator playbook and review queue progress state.

### Conflating Technical Green With Product Evidence

Tests/build/regressions can pass while live corpus evidence is empty. The gate must report both independently.

## Sources Consulted

- https://aclanthology.org/W19-8643.pdf
- https://openaccess.thecvf.com/content/CVPR2023/papers/Otani_Toward_Verifiable_and_Reproducible_Human_Evaluation_for_Text-to-Image_Generation_CVPR_2023_paper.pdf
- https://www.getmaxim.ai/articles/llm-as-a-judge-vs-human-in-the-loop-evaluations-a-complete-guide-for-ai-engineers/
