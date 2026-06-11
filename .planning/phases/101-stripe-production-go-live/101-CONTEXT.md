# Phase 101: Stripe Production Go-Live - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart discuss — auto-accepted)

<domain>
## Phase Boundary

Configure and prove production Stripe integration with operator-repeatable checklist and live webhook smoke.

</domain>

<decisions>
## Implementation Decisions

### Documentation (LIVE-01)
**Decision:** Repository runbook lists env var NAMES only (STRIPE_SECRET_KEY, price IDs, webhook secret, URLs) — never commit secrets.

### Live verification (LIVE-02)
**Decision:** Capture redacted evidence artifact (event IDs, deploy ID, timestamps) after signed webhook smoke on production.

### Operator scope
**Decision:** Use controlled test/operator Stripe account for checkout/portal verification — document steps, do not automate secret injection.

### Claude's Discretion
**Note:** Plan marked `autonomous: false` — human may need to complete deploy/webhook steps; executor documents checklist and validates what can be verified locally.

</decisions>

<code_context>
## Existing Code Insights

- scripts/seed-stripe-real.ts, server/billing/plans.ts, env validation.
- Render deployment; webhook at /api/billing/webhook.

</code_context>

<specifics>
## Specific Ideas

- Preflight script comparing plans.ts price IDs vs env vars.
- Rollback section in runbook.

</specifics>

<deferred>
## Deferred Ideas

- Stripe Connect — not in v12.0 scope.

</deferred>
