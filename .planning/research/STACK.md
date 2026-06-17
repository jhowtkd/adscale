# Research: v12.6 Stack

## Question

What stack additions or changes are needed to operationalize live human quality evaluation for ADScale outputs?

## Findings

No new core stack is required. v12.6 should reuse the existing Next.js, Postgres/Drizzle, owner UI, evidence CLIs and release-gate scripts from v12.5.

Useful additions are operational, not architectural:

- Scheduled/operator-driven batch selection around existing corpus tables.
- Queue progress views on existing owner/internal surfaces.
- Threshold configuration for sample sufficiency, stored close to the existing calibration/impact services.
- Evidence aggregation extensions that keep fixture metrics, live human metrics and accepted caveats separate.

## Sources Consulted

- https://www.braintrust.dev/articles/llm-evaluation-guide
- https://cameronrwolfe.substack.com/p/stats-llm-evals
- https://openaccess.thecvf.com/content/CVPR2023/papers/Otani_Toward_Verifiable_and_Reproducible_Human_Evaluation_for_Text-to-Image_Generation_CVPR_2023_paper.pdf

## Recommendation

Do not add a third-party evaluation platform in v12.6. The existing product already has the right primitives; the milestone should harden operations, thresholds and reporting.
