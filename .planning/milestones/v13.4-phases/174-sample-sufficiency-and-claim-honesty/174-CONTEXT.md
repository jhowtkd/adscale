# Phase 174: Sample Sufficiency and Claim Honesty - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** Auto-advance (--auto)

<domain>
## Phase Boundary

Lift `fixtureOnly` only when sample sufficiency rules pass; keep customer-real claims withheld until honest.
</domain>

<decisions>
## Implementation Decisions

### Sufficiency rules
- Reuse `buildPerBrandEvidenceReport` / `EVIDENCE_BACKED_REAL_MIN` (3+) and operational gate (5 evaluated items, `real_customer > 0`).
- `fixtureOnly` must match `sourceComposition.real_customer === 0`.

### Claim honesty
- Customer-real claims unlock only when `operationalStatus === ok` and `fixtureOnly === false`.
- Fixture-only rows alone never unlock customer-real claims.

### Refresh path
- `refresh-v13-3-operational-evidence.ts` builds `activeBrandSample` from DB signals with manifest fallback.
</decisions>
