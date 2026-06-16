# v12.4 Research: Features

**Milestone:** v12.4 Aprendizado de Qualidade dos Outputs

## Table Stakes

| Feature | Why it matters | Notes |
|---|---|---|
| Durable output-decision capture | Learnings cannot improve if approval/rejection/regeneration signals are not normalized | Capture intent, not just clicks |
| Canonical learning records with confidence | Prevents memory drift and lets the product explain recommendations | Must include evidence counts and contradictions |
| Retrieval bounded by client/campaign context | Avoids leaking one client's pattern into another client's generation | Current workspace/client model already supports this |
| Pre-generation application | Learning should affect the next generation before spend happens | Best first insertion point per user choice |
| Explanation packet | Operator should see why a setting/restriction was recommended | Reuse current recommendation framing style |
| Supersession / freshness handling | Old patterns must weaken or retire instead of accumulating forever | Core anti-degradation mechanism |

## Differentiators

| Feature | Why it matters | Notes |
|---|---|---|
| Approval-oriented learning from output decisions | Learns from product-native human judgment, not only ad performance | Faster feedback loop than waiting for media data |
| Negative-pattern memory | Learn not only "do more of this" but also "avoid this layout/CTA/mode combo" | Particularly useful for reducing medium-quality outputs |
| Contradiction-aware recommendations | Product can say "this is a hypothesis" instead of pretending certainty | Already present in performance recommendation style |
| Mode/format scoped learnings | `art_variation`, `restyling`, `format_adaptation` should not share all lessons | Prevents overgeneralization |

## Anti-Features

| Anti-feature | Why to avoid |
|---|---|
| Global memory that mutates prompt behavior with no audit trail | Impossible to debug and degrades silently |
| Treating vector hits as approved learnings | Retrieval is not evidence |
| Applying every past approval as a permanent rule | Leads to rigid or stale generations |
| One blended "quality score" as the only feedback signal | Loses the structure of why outputs were accepted or rejected |

## Milestone Candidate Scope

### Category 1: Output Signals

- Capture approval, rejection, regeneration, save-reference, and delivery choice as normalized learning evidence
- Distinguish explicit approval from weak implicit signals

### Category 2: Canonical Learnings

- Aggregate evidence into scoped learnings
- Track status, confidence, freshness, contradiction, and supersession

### Category 3: Learning Application

- Apply relevant learnings to next-generation prefill/restrictions
- Explain which variables were influenced and why

### Category 4: Evaluation

- Measure whether output learnings improve human-judged quality without harming v12.3 factual fidelity gains

## Deferred

- Blend in imported media performance as a first-class signal
- Auto-regeneration policies driven directly by learned output patterns
- Cross-client generalization layer
