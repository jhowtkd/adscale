# v12.4 Research: Pitfalls

**Milestone:** v12.4 Aprendizado de Qualidade dos Outputs

## Primary Risks

| Risk | Why it happens | Prevention |
|---|---|---|
| Memory drift | Retrieval memory accumulates stale patterns and starts steering generations incorrectly | Keep Postgres canonical; Mem0 projection only |
| False certainty | A few approvals look like a durable rule | Require confidence + evidence counts + contradiction checks |
| Cross-context leakage | One client's preferences spill into another campaign or mode | Scope learnings tightly by workspace/client/mode/format/objective |
| Prompt bloat | Learned context becomes another long freeform prompt section | Apply learnings as bounded variables or compact rule packs |
| Reward hacking | System optimizes for easy approvals rather than genuinely better outputs | Keep explicit evals and preserve factual fidelity gates |
| Silent regression | Learnings improve approval rate but reintroduce factual drift or generic visuals | Reuse v12.3 eval structure and track fidelity separately from quality |

## Specific Anti-Degradation Rules

- Retrieval never becomes source of truth
- Negative evidence can supersede positive evidence
- Old evidence must decay or be explicitly superseded
- Learnings should be explainable and inspectable in the UI or API payload
- Human acceptance must be treated differently from weak implicit signals

## Evaluation Guidance

- Do not compress all output quality into one hidden score
- Keep explicit metrics separate:
  approval tendency, rejection reasons, regeneration frequency, factual fidelity, human quality rating
- Add a fixed evaluation set before trusting live adaptive behavior

## Recommended Warnings to Encode in Requirements

- No auto-approval from learned confidence
- No mutation of core factual-preservation rules
- No cross-workspace shared learning pool
- No shipping if learned application cannot be explained with evidence
