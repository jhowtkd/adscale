# v12.4 Research Summary

**Milestone candidate:** v12.4 Aprendizado de Qualidade dos Outputs

## Recommended Direction

Use real human output decisions as the first-class learning signal:

- approval
- rejection
- regeneration
- save as reference
- delivery selection

Then apply those learnings to the **next generation** through bounded prefills and restrictions, not through uncontrolled freeform memory.

## Why This Fits ADScale_2

- v12.3 fixed the integrity foundation but left a quality gap (`meanQualityScore=70.17 < 75`)
- v12.1 already established the right architecture for durable learning:
  Postgres canonical + Mem0 projection + explainable recommendation
- The repo already captures key human actions in derivation review flows, so this milestone can extend real product behavior instead of inventing a lab-only system

## Architecture Decision

`Postgres canonical -> Mem0 projection -> bounded application`

This is the main protection against degradation.

## Scope Recommendation

### In scope

- normalized output-decision evidence
- canonical output learnings with confidence/contradiction/supersession
- retrieval by client/campaign/mode/format context
- next-generation recommendation and prefill application
- evals proving quality improvement without factual regression

### Out of scope

- fine-tuning
- full media-performance blending in v1 of this milestone
- autonomous prompt mutation from vector memory
- cross-client global taste model

## Proposed Requirement Themes

- `SIGNAL`: capture trustworthy human output signals
- `LEARN`: aggregate durable learnings from those signals
- `APPLY`: use learnings before the next generation
- `SAFE`: bound and explain learned behavior
- `EVAL`: prove improvement with a fixed regression set

## Watch Out For

- stale learnings treated as permanent truths
- retrieval relevance confused with approval
- recommendation logic that hides contradictions
- quality optimization that weakens factual fidelity
