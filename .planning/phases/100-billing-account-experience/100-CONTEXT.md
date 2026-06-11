# Phase 100: Billing Account Experience - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart discuss — auto-accepted)

<domain>
## Phase Boundary

Make Billing settings an accurate account surface for paid, trial, past-due, canceled, beta, and no-access states.

</domain>

<decisions>
## Implementation Decisions

### Renewal visibility (BILL-01)
**Decision:** Show trial end date or next renewal from normalized subscription when available.

### Recovery banners (BILL-02)
**Decision:** Past-due → portal CTA; canceled → checkout/reactivate CTA; distinct from beta/no-access.

### Grant history (BILL-03)
**Decision:** Ledger history API shows source, quantity, date; separate from internal COGS forecast calculator.

### Localization (BILL-04)
**Decision:** PT-BR and EN strings explicitly label beta vs paid vs no-access — no ambiguous "free" wording.

</decisions>

<code_context>
## Existing Code Insights

- BillingTab.tsx with forecast calculator — keep internal forecast separate.
- use-billing.ts typed from phase 97-98 contracts.
- Portal and checkout mutations already exist.

</code_context>

<specifics>
## Specific Ideas

- Empty grant history state for new workspaces.
- Loading/error skeletons matching settings page patterns.

</specifics>

<deferred>
## Deferred Ideas

- Invoice PDF download — post v12.0.

</deferred>
