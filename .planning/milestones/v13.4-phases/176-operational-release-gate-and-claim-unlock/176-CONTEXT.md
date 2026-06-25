# Phase 176: Operational Release Gate and Claim Unlock - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** Auto-advance (--auto)

<domain>
## Phase Boundary

Rerun release gate until operational evidence passes; apply claim unlock only with recorded proof.
</domain>

<decisions>
## Implementation Decisions

### Release gate
- `npm run v13-3-release-gate` auto-refreshes operational evidence when `173-CORPUS-MANIFEST.json` exists.
- Root status becomes `ok` only when technical pass AND operational `ok`.

### Claim unlock
- No manual override — customer-real claims follow `activeBrandSample.claimsAllowed` from refresh script.
</decisions>
