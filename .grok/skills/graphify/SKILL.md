---
name: graphify
description: "Use for any architectural, structural, or relationship question about this codebase. When graphify-out/graph.json exists, treat the question as a graph query first — answer from the local knowledge graph (god nodes, communities, shortest paths) before grepping the tree. Use to understand what calls what, what depends on a module, the blast radius of a change, or which files own a given concept."
metadata:
  short-description: "Answer codebase questions from the local Graphify knowledge graph"
argument-hint: "<concept, A→B path, or open question>"
---

# /graphify

Turn any folder of files into a navigable knowledge graph with community detection, an honest audit trail, and three outputs: interactive HTML, GraphRAG-ready JSON, and a plain-language GRAPH_REPORT.md.

## When this skill fires

Use this skill for any question that asks about code structure, ownership, or relationships. Typical triggers:

- "What calls X?" / "What does X depend on?" / "What is the blast radius of changing X?"
- "What are the core abstractions in this repo?" / "Which files own Y?"
- "How is X persisted / validated / rendered / persisted?"
- "Trace a flow from A through B to C."
- After editing code: "Is the graph still accurate? Should I rebuild?"

Skip this skill if the user explicitly says not to use it, or if the question is about a specific file's contents (just read the file).

## Tooling rules

For codebase questions, **first run a graphify command** when `graphify-out/graph.json` exists. Pick the narrowest tool that answers the question:

- `graphify query "<question>"` — BFS context dump, the default for open-ended questions. Use `--budget` to cap output.
- `graphify path "A" "B"` — shortest path between two nodes (id, label, or norm_label). Use for blast radius and data flow.
- `graphify explain "<concept>"` — node + its incoming and outgoing relations. Use to understand a single symbol/module.
- `graphify god-nodes --top N` — top N most-connected nodes. Use to find core abstractions and refactor targets.
- `graphify extract . --update` — incremental re-extraction (no LLM cost) after code changes.
- `graphify cluster-only .` — re-run clustering + regenerate `graph.html` and `GRAPH_REPORT.md`.

These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.

## Resolution rules

- All node arguments accept `id`, `label`, or `norm_label`. **Exact label match is preferred** — pass the human label (`"Project"`, `"applyProjectCommand()"`, `"handleApiError()"`) when in doubt.
- Confidence tags: `EXTRACTED` (strong — trust), `INFERRED` (medium — verify in code), `AMBIGUOUS` (weak — confirm before refactoring).
- If a tool returns `node not found`, the name may have changed since the last `graphify extract`. Run `graphify update .` and retry.

## Honesty rules

- Never invent an edge. If unsure, use AMBIGUOUS.
- Never skip the corpus check warning.
- Never hide cohesion scores behind symbols — show the raw number.
- If the graph is stale (you just changed code), prefer `graphify update .` over re-extracting from scratch.
