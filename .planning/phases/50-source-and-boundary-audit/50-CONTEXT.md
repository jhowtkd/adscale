# Phase 50: Source and Boundary Audit - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous — recommendations accepted)

<domain>
## Phase Boundary

Prove what migrates, what already exists in `site-adscale`, and what stays in ADScale_2. Produce a migration contract with file/repo ownership and app URL source of truth.
</domain>

<decisions>
## Implementation Decisions

### Ownership
- Public marketing landing, SEO metadata, static presentation assets → `jhowtkd/site-adscale.git` (Vite/React/Tailwind).
- Auth, dashboard, product APIs, billing/beta redemption, legal page **content** hosted in app → ADScale_2 `app/`.
- Legal pages: **link** from marketing site to app-hosted `/privacy` and `/terms` (single source of truth, no duplicate legal copy in v11.3).

### App URLs
- `VITE_APP_URL` on marketing site points to production app (e.g. `https://app.adscale.com.br` or current Render/Vercel app URL).
- Signup `/signup`, login `/login`; beta codes redeemed in app Settings after account creation.

### ADScale_2 surface
- No new root marketing page in App Router; `/` remains protected dashboard.
- Public routes today: `login`, `signup`, `invite`, `forgot-password`, `reset-password`, `share/[token]`, `(public)/privacy`, `(public)/terms`.

### Claude's Discretion
- Exact production domain strings documented in handoff env vars, not hardcoded in repo beyond `.env.example`.
</decisions>

<code_context>
## Existing Code Insights

### ADScale_2
- `app/middleware.ts` protects `/` and `/campaigns/*`.
- Beta: 10 ads (50 credits @ 5 each), `BETA_ACCESS_CODES`, redeem in Billing settings.
- Stripe checkout: 14-day `trial_period_days` on subscriptions.
- In-app pricing display: Starter R$47, Growth R$147, Scale R$397 (`pricing-model.ts`).

### site-adscale
- Full single-page landing with Hero, Features, Pricing, FAQ, FinalCTA, Footer.
- CTAs were `#` / `#cta-final` placeholders; pricing copy did not match app.
</code_context>

<specifics>
## Specific Ideas

- Align marketing pricing and beta language with shipped app behavior before launch.
</specifics>

<deferred>
## Deferred Ideas

- CMS, i18n marketing, analytics funnel (see REQUIREMENTS future items).
</deferred>
