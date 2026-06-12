# Phase 107: Learning to Next Experiment

## Goal

Convert canonical performance learnings into an explainable next-experiment recommendation that the user controls end-to-end.

## In scope

- Deterministic recommendation from campaign/client learnings (no LLM winner selection)
- Evidence packet: justification, supporting learnings, contradictions, sample, confidence
- Accept / edit / dismiss — never auto-modify campaign, media spend, or budget
- Accept opens existing Strategy Recipe flow with editable prefill (CTA, format, recipe, style)
- First-party analytics: viewed, accepted, edited, dismissed

## Out of scope

- Auto-publishing or budget changes
- New derivation engine paths
- Mem0 schema changes

## Depends on

Phase 106: learnings API, aggregation, Mem0 retrieval.
