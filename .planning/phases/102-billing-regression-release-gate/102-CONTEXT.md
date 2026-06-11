# Phase 102: Billing Regression and Release Gate - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart discuss — auto-accepted)

<domain>
## Phase Boundary

Close v12.0 only after lifecycle, access, conversion, and production behavior are covered by regression evidence.

</domain>

<decisions>
## Implementation Decisions

### Coverage audit (QA-07)
**Decision:** Add only missing tests — no weakening existing assertions. Focus on idempotency, payment_failed, double-grant prevention.

### Access matrix (QA-08)
**Decision:** Tests for trialing, active, past_due, canceled/none, beta, no-access — one case per state minimum.

### Release gate (QA-09)
**Decision:** Full npm test + lint + build from app/ must pass; record evidence in 102-VERIFICATION.md with requirement traceability.

</decisions>

<code_context>
## Existing Code Insights

- Phases 97-100 ship focused billing tests; 101 adds live evidence doc.
- REQUIREMENTS.md v12.0 traceability matrix.

</code_context>

<specifics>
## Specific Ideas

- Run focused suites first, then full suite.
- Map SUBS/DUEN/CONV/BILL/LIVE/QA IDs to test files in verification doc.

</specifics>

<deferred>
## Deferred Ideas

- E2E Playwright billing flows — optional if unit coverage sufficient.

</deferred>
