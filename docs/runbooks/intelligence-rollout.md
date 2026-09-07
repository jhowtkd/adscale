# Intelligence flag rollout

`CREATIVE_WORK_QUALITY_RECOVERY_ENABLED` and `BRAND_CORTEX_SINGLE_PIECE_ENABLED` stay `"false"` in `render.yaml` until a commit SHA has the evidence in `intelligence-rollout.ts`.

Do not turn a flag on because the implementation exists.

| Flag | Owner | Depends on | Rollback |
| --- | --- | --- | --- |
| `CREATIVE_WORK_QUALITY_RECOVERY_ENABLED` | creative-work-quality | M01, M07 | set env to `"false"` and redeploy |
| `BRAND_CORTEX_SINGLE_PIECE_ENABLED` | brand-identity | M01, M07, M08 | set env to `"false"` and redeploy |

## Required evidence (same SHA)

1. Quality recovery: ten complete journeys, at least three brands, objective QA tri-state, idempotent refund on persistent failure.
2. Brand cortex on Peça única: on/off comparison, no leakage into restyle / variations / format_adaptation, identity not worse than the control SHA.

Record the SHA in the deploy notes. Funnel `valueDelivered` before/after is supporting evidence, not a substitute.

## Enable

Set the matching env to `"true"` on `adscale-app` (and the image worker if it reads the same snapshot freeze) for that SHA only.

New work freezes `generationPolicyVersion` / published-brand inclusion at prepare time. Jobs obey the frozen snapshot, not a later env flip.

## Rollback

Set the env back to `"false"` and redeploy. New prepares use the legacy/off contract. In-flight outputs keep the snapshot they were prepared with. Do not delete code to roll back.
