# Surface inventory — Convergence Phase 1

**Raw scan:** [`surface-inventory.raw.json`](./surface-inventory.raw.json) (regenerate with `cd app && npm run convergence:inventory`)

**Decisions (machine-checked):** [`surface-decisions.yaml`](./surface-decisions.yaml)

**Gate:** `npm run convergence:check-inventory` (also part of `convergence:gate`)

## Rules

1. Scanner flags **inert** CTAs only: bare `disabled` / `disabled={true}` / `comingSoon` (not `disabled={isPending}`).
2. Every raw item with `requiresDecision: true` must have a matching `evidence` decision.
3. Curated product surfaces (templates, persona, landing API, primary destinations) must also appear in `surface-decisions.yaml`.
4. Stale raw JSON is refreshed by the check script; undecided blockers fail CI.

## Decision legend

| Decision | Meaning |
|----------|---------|
| `manter` | Keep; consumer works |
| `fundir` | Merge into canonical flow later |
| `esconder` | Hide / freeze until evidence |
| `apagar` | Remove after migration |

Human narrative for each id lives in `surface-decisions.yaml` (`rationale` field).
