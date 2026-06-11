# Phase 99: In-Product Conversion Surfaces - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart discuss — auto-accepted)

<domain>
## Phase Boundary

Turn credit and entitlement blocks into clear trial or upgrade actions without losing campaign context.

</domain>

<decisions>
## Implementation Decisions

### 402 payload contract (CONV-01)
**Decision:** Single structured 402 schema with `reason`, `recommendedAction` (checkout | billing | portal), optional `suggestedPlan`, and preserved analytics fields.

### Gate rendering (CONV-02)
**Decision:** Preview and batch gates consume server payload — no client-side string matching on error messages.

### Beta exhaustion checkout (CONV-03)
**Decision:** Checkout URL includes return path to current campaign/workspace; use existing checkout route with query params.

### Value moment routing (CONV-04)
**Decision:** Wire existing progression/credit activation CTAs to checkout or Billing settings using same contract.

</decisions>

<code_context>
## Existing Code Insights

- Phase 97-98 billing contracts in access.ts, gates.ts, status route.
- v11.7 upgrade CTAs exist but may be inert on 402 surfaces.
- use-billing hook and billing gates in campaign derivation flows.

</code_context>

<specifics>
## Specific Ideas

- Localize CTA labels PT-BR and EN via existing i18n patterns.
- Reasons: insufficient_credits, beta_exhausted, subscription_required, past_due_recovery.

</specifics>

<deferred>
## Deferred Ideas

- Pricing page A/B tests — post v12.0.

</deferred>
