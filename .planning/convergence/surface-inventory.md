# Surface inventory — Convergence Phase 1

**Raw scan:** [`surface-inventory.raw.json`](./surface-inventory.raw.json) — regenerate only via `npm run convergence:inventory`

**Decisions:** [`surface-decisions.yaml`](./surface-decisions.yaml)

**Gate:** `npm run convergence:check-inventory` (also in `convergence:gate`)

## Rules

1. Scanner flags **inert** CTAs only: bare `disabled` / `disabled={true}` / `comingSoon`.
2. Every `requiresDecision: true` item needs a decision with matching **`blockerId === item.id`** (1:1). File-only evidence never covers blockers.
3. Curated product surfaces use `evidence` without `blockerId`.
4. Stale or tampered raw JSON **fails** the gate (full payload compare vs live scan, ignoring only `generatedAt`); it does not auto-rewrite. Decisions are validated against the live scan.
