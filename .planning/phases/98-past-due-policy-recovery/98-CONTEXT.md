# Phase 98: Past-Due Policy and Recovery - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart discuss — auto-accepted)

<domain>
## Phase Boundary

Define and enforce one explicit `past_due` spend policy while giving users a direct path to recover payment.

</domain>

<decisions>
## Implementation Decisions

### Past-due spend policy (DUEN-01)
**Decision:** Existing credit balance remains spendable during `past_due`; new monthly grants from `invoice.paid` are suspended until payment recovers.

**Rationale:** Users already paid for credits in prior periods; blocking spend would strand in-flight campaigns. Suspending new grants protects revenue without hard-locking workspace.

### Recovery path (DUEN-02)
**Decision:** Expose `past_due` as a distinct billing state with Customer Portal CTA via existing portal mutation — not generic "no access" copy.

### Gate consistency (DUEN-03)
**Decision:** Apply the same policy in `access.ts`, `credits.ts`, and all spend gates (preview, batch, preflight, assisted generation). Beta entitlements unchanged.

### Claude's Discretion
Implementation details, test fixtures, and exact API field names at executor discretion per codebase conventions.

</decisions>

<code_context>
## Existing Code Insights

- Phase 97: `subscriptionStatus` normalized independently from `access.kind`; `getLatestSubscriptionByWorkspace` exposes past_due.
- Stripe webhook handles `invoice.payment_failed`; portal route exists.
- BillingTab and use-billing hook typed for subscription status.

</code_context>

<specifics>
## Specific Ideas

- Document policy inline in billing access module or adjacent ADR comment block.
- Past-due metadata on `/api/billing/status` should include `recoveryAction: "portal"`.

</specifics>

<deferred>
## Deferred Ideas

- Dunning email sequences — out of scope for v12.0.

</deferred>
