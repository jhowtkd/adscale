# Research Summary: v12.6 Operacao Live do Corpus de Qualidade

## Stack Additions

No major stack addition. Reuse the v12.5 corpus, calibration, impact and release-gate infrastructure. Add operational logic: batch selection, review queue progress, sample sufficiency policy, trend aggregation and release evidence separation.

## Feature Table Stakes

- Versioned live corpus sourced from real outputs.
- Human review flow with structured, repeatable rubric fields.
- Sample sufficiency and `insufficient_sample` states.
- Trends with visible denominators, stale-state warnings and drilldown.
- Release gate that separates technical regression from operational evidence.

## Watch Out For

- Do not claim improvement from an empty or tiny live corpus.
- Do not merge fixture, live-human and accepted-caveat metrics into one number.
- Do not let visual quality improvements offset factual pass/fail.
- Do not introduce a new evaluation vendor before internal operations are stable.

## Roadmap Implication

The natural v12.6 sequence is:

1. Live corpus operations.
2. Sampling sufficiency and evidence honesty.
3. Quality trend dashboard.
4. Operational quality release gate.

## Sources

- Braintrust, "What is LLM evaluation?" https://www.braintrust.dev/articles/llm-evaluation-guide
- Cameron Wolfe, "Applying Statistics to LLM Evaluations" https://cameronrwolfe.substack.com/p/stats-llm-evals
- Otani et al., "Toward Verifiable and Reproducible Human Evaluation for Text-to-Image Generation" https://openaccess.thecvf.com/content/CVPR2023/papers/Otani_Toward_Verifiable_and_Reproducible_Human_Evaluation_for_Text-to-Image_Generation_CVPR_2023_paper.pdf
- Snorkel AI, "Data quality and rubrics" https://snorkel.ai/blog/data-quality-and-rubrics-how-to-build-trust-in-your-models/
- iMerit, "Image Generation Evaluation" https://imerit.ai/solutions/generative-ai-data-solutions/image-generation-evaluation/
