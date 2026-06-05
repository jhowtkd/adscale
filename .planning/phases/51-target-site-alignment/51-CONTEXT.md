# Phase 51: Target Site Alignment - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous)

<domain>
## Phase Boundary

Update `site-adscale` copy, CTAs, metadata, and implementation quality to match ADScale_2 shipped behavior.
</domain>

<decisions>
## Implementation Decisions

### CTAs
- All primary CTAs → `{VITE_APP_URL}/signup`.
- Login and legal → app URLs from `src/config/site.ts`.

### Copy
- Pricing aligned to app `pricing-model.ts` (R$47 / R$147 / R$397).
- Beta: 10 ads, 50 credits, redeem in Settings.
- No direct ad-platform publishing claims.

### Legal
- Footer links to app `/privacy` and `/terms`.

### Stack
- Keep Vite + React + Tailwind; no Next.js migration.
</decisions>
