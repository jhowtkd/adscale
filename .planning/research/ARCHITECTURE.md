# v12.4 Research: Architecture

**Milestone:** v12.4 Aprendizado de Qualidade dos Outputs

## Architectural Direction

Follow the same three-layer pattern already used in v12.1:

1. `Canonical layer` in Postgres
2. `Projection / retrieval layer` in Mem0
3. `Application layer` that converts approved learnings into bounded product behavior

This is the key guardrail against degradation.

## Proposed Flow

1. Human acts on a derivation:
   approve, reject, regenerate, save reference, choose for delivery
2. Route writes a normalized output-learning evidence event
3. Background recompute groups evidence into scoped learnings
4. Canonical learnings are approved/superseded based on confidence + contradiction rules
5. Approved learnings are projected to Mem0
6. Next-generation recommendation/retrieval fetches relevant learnings
7. Prefill/restriction mapper applies only bounded variables before prompt build
8. Evals compare quality outcomes and ensure factual fidelity is not regressed

## Scope Boundaries for Learning

Every learning should be scoped by as many of these as needed:

- workspace
- client profile
- campaign objective
- generation mode
- target format
- CTA semantics or CTA class
- quality issue family

## Canonical Record Requirements

Each learning should include:

- stable ID
- statement
- variable key / value
- evidence references
- supporting count
- contradicting count
- confidence level / score
- freshness window or last-evidence timestamp
- algorithm version
- status: `draft`, `approved`, `superseded`, `removed`

## Application Rules

- Learnings influence bounded product variables, not arbitrary prompt prose
- Canonical contract and factual rules remain higher priority than learned preferences
- When contradictions are present, recommendations must be framed as hypotheses
- If evidence is insufficient, return no recommendation rather than forcing one

## Recommended Build Order

1. Signal capture + canonical schema
2. Aggregation + supersession logic
3. Retrieval + recommendation packet
4. Generation prefill application
5. Eval + regression gate
