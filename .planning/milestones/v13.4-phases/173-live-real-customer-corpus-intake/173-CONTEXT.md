# Phase 173: Live Real-Customer Corpus Intake - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** Auto-advance (--auto)

<domain>
## Phase Boundary

Seed at least one non-fixture `clientProfileId` with `real_customer` corpus rows through the generic v13.3 promotion/import path. Cenbrap remains fixture/seed only.
</domain>

<decisions>
## Implementation Decisions

### Target profile
- Use the first available non-fixture `clientProfileId` in the owner workspace (name does not match Cenbrap).
- If none exists, create **Live Evidence Brand** with owner consent documented in the corpus manifest.
- Do not block on Cenbrap; it is never the v13.4 proof target.

### Intake path
- Use existing capture → promote (`sourceLabel: real_customer`) → `submitHumanEvaluation` chain — no customer-specific scripts.
- Seed at least 5 evaluated rows to satisfy operational sample guidance for the active brand.

### Evidence honesty
- Manifest records `ownerConsentNote`, workspace/profile ids, and per-row `real_customer` labels.
- UI/copy must not frame Cenbrap fixture rows as customer-real proof.

### Claude's Discretion
- Exact campaign naming prefix and seed marker strings.
- Default workspace email for local seeding (`dev-admin@adscale.local` when present).
</decisions>

<deferred>
## Deferred Ideas

- Bulk CSV customer import UX — v14+.
- Multi-brand dashboard — after first real profile proves path.
</deferred>

---

*Phase: 173-live-real-customer-corpus-intake*
*Context gathered: 2026-06-25*
