# ADScale presentation migration contract (v11.3)

**Date:** 2026-06-03  
**Repos:** `ADScale_2` (app) · `jhowtkd/site-adscale` (marketing)

## Source of truth

| Concern | Owner | Location |
|---------|--------|----------|
| Marketing landing (hero, features, pricing copy, FAQ) | `site-adscale` | `src/components/*`, `index.html` |
| Product runtime (campaigns, derivations, export) | ADScale_2 | `app/src/app/(dashboard)/*`, `app/src/server/*` |
| Authentication | ADScale_2 | `app/src/app/login`, `signup`, `app/src/server/auth` |
| Beta access redemption | ADScale_2 | Settings → Billing, `BETA_ACCESS_CODES` |
| Paid subscriptions / Stripe trial | ADScale_2 | `app/src/server/billing/*` |
| Privacy & Terms **content** | ADScale_2 | `app/src/app/(public)/privacy`, `terms` |
| Legal links on marketing site | `site-adscale` | Points to `{VITE_APP_URL}/privacy` and `/terms` |
| SEO for product app | ADScale_2 | Per-route metadata in app only |
| SEO for public brand site | `site-adscale` | `index.html` + optional `VITE_SITE_URL` canonical |

## ADScale_2 route audit

**Protected (session required):** `/`, `/campaigns`, `/campaigns/*`, `/settings`, `/library`, `/templates`, `/restyling`

**Public (no dashboard):**

| Path | Purpose |
|------|---------|
| `/login` | Sign in |
| `/signup` | Registration + workspace bootstrap |
| `/invite` | Workspace invite acceptance |
| `/forgot-password`, `/reset-password` | Auth recovery |
| `/share/[token]` | Shared derivation gallery |
| `/privacy`, `/terms` | Legal |

**Not present:** Root `/` marketing page, `/pricing` marketing route.

## site-adscale audit (baseline)

| Section | Component | Notes |
|---------|-----------|--------|
| Nav | `Navbar.tsx` | Anchor links; CTA was `#cta-final` |
| Hero | `Hero.tsx` | Product-accurate headline; CTAs need app URLs |
| Features | `Features.tsx` | Matches plan → derivations → QA → export → landing HTML |
| Pricing | `Pricing.tsx` | Prices/copy must match app (`pricing-model.ts`) |
| FAQ | `FAQ.tsx` | Trial/beta claims must match Stripe + beta program |
| Footer | `Footer.tsx` | Legal links were `#` placeholders |

**Stack:** Vite 5, React 18, Tailwind 3. Scripts: `build`, `typecheck`, `lint`.

## App URL matrix (configure on marketing deploy)

| Variable | Example | Used for |
|----------|---------|----------|
| `VITE_APP_URL` | `https://app.example.com` | Signup, login, legal |
| `VITE_SITE_URL` | `https://www.example.com` | Canonical / OG URL (optional) |

| User action | Target |
|-------------|--------|
| Primary CTA | `{VITE_APP_URL}/signup` |
| Login | `{VITE_APP_URL}/login` |
| Privacy | `{VITE_APP_URL}/privacy` |
| Terms | `{VITE_APP_URL}/terms` |

## Phase 51+ file touch list

**site-adscale:** `src/config/site.ts`, `.env.example`, `index.html`, `Hero`, `Navbar`, `FinalCTA`, `Pricing`, `FAQ`, `Footer`, `README.md`

**ADScale_2:** Planning artifacts only (no competing marketing route in v11.3).

## Risks (explicit)

- Marketing/app on different domains → CORS not required for links; cookie consent may differ per host.
- Stripe trial still requires checkout flow (card per Stripe config); beta is separate (code in Settings).
- Unused `@supabase/supabase-js` in `site-adscale` — dead dependency, safe to remove later.
