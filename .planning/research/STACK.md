# v12.4 Research: Stack

**Milestone:** v12.4 Aprendizado de Qualidade dos Outputs  
**Question:** What stack additions or changes are needed to learn from human output decisions without degrading over time?

## Existing Stack We Should Reuse

- Postgres canonical tables and repositories for durable learning records
- Mem0 projection + retrieval already used for performance learnings
- Existing derivation QA, score, hard-failure taxonomy, and recommendation prefill flows
- Inngest jobs for async recompute / projection work

## Recommended Stack Shape

| Area | Recommendation | Why |
|---|---|---|
| Canonical storage | Reuse Postgres first, with a dedicated `output learnings` table family or equivalent JSONB-backed schema | Prevents retrieval-layer drift from becoming source of truth |
| Retrieval | Reuse Mem0 only as projection/search index | Keeps relevance search fast without trusting vector memory as authority |
| Learning compute | Reuse TypeScript aggregation services + background recompute job | Fits current `performance/learning` architecture |
| Input signals | Reuse existing derivation review, regenerate, save-reference, delivery, and QA routes | Human decisions already exist in the product; capture before inventing new UI |
| Evaluation | Extend current evidence/eval approach with a fixed output-learning eval set | Research and OpenAI eval guidance both favor measured iteration over prompt-only tweaking |

## New Components to Add

- Canonical event normalization for output decisions:
  approval, rejection, regeneration reason, save-as-reference, export, delivery selection
- Output-learning aggregation service:
  convert raw events into approved/superseded learnings with confidence and contradiction tracking
- Output-learning retrieval service:
  fetch relevant learnings by client profile, campaign objective, mode, format, CTA, and quality pattern
- Generation pre-application step:
  map learnings into bounded prefill/restriction inputs before prompt build
- Eval harness:
  fixed corpus that measures whether applied learnings improve approval-oriented metrics without harming factual fidelity

## What Not to Add

- No fine-tuning in this milestone
- No second vector store
- No prompt-only freeform memory injection as the primary mechanism
- No fully autonomous self-updating rules without approval/supersession states

## Research Notes

- OpenAI's optimization guidance recommends a feedback flywheel of evals, prompt changes, and measured improvement rather than relying on intuition alone.
- OpenAI image-eval guidance recommends keeping graded metrics separate instead of collapsing them too early.
- RLHF/recommender literature consistently treats explicit and intentional human feedback as a high-value signal, but warns that stale signals need ongoing evaluation and confidence management.

## Sources

- OpenAI model optimization: https://developers.openai.com/api/docs/guides/model-optimization
- OpenAI eval best practices: https://developers.openai.com/api/docs/guides/evaluation-best-practices
- OpenAI image evals cookbook: https://developers.openai.com/cookbook/examples/multimodal/image_evals
- RLHF survey: https://arxiv.org/pdf/2312.14925
