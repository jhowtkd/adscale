# v11.3 Launch handoff — site-adscale

**Date:** 2026-06-03

## Repositories

| Repo | Role | Branch |
|------|------|--------|
| `jhowtkd/site-adscale` | Public marketing landing | `main` |
| `ADScale_2` | SaaS app (auth, product, legal content) | current dev branch |

## Deploy marketing site

```bash
cd site-adscale
cp .env.example .env   # set VITE_APP_URL
npm ci
npm run build
# Publish dist/ to static host
```

**Required env (build time):**

- `VITE_APP_URL` — production app URL (must serve `/signup`, `/login`, `/privacy`, `/terms`)
- `VITE_SITE_URL` — optional canonical for this landing

**Suggested DNS:**

- `www` → marketing static deploy
- `app` → ADScale_2 Next.js deploy

## Commands run (2026-06-03)

```bash
cd /Users/jhonatan/Repos/site-adscale
npm ci
npm run typecheck   # OK
npm run lint        # FAIL — pre-existing any types in MagneticButton, SplitText
npm run build       # OK → dist/
```

## QA checklist (owner)

### Desktop

- [ ] Hero primary CTA → app signup
- [ ] Navbar “Criar conta” → signup
- [ ] Pricing beta banner + plan CTAs → signup
- [ ] Footer Privacidade/Termos → app legal pages
- [ ] Anchor nav (Problema, Produto, Processo, Preços, FAQ)

### Mobile

- [ ] Mobile menu + CTA
- [ ] Pricing cards readable
- [ ] FAQ accordion

## Residual risks

| Risk | Mitigation |
|------|------------|
| Lint fails in CI if added | Fix `no-explicit-any` in SplitText/MagneticButton or relax rule |
| No `og:image` | Add 1200×630 asset when brand asset ready |
| Stripe trial may require card at checkout | FAQ/copy mentions beta as no-card path |
| `@supabase/supabase-js` unused | Remove dependency in cleanup slice |
| Legal on app domain only | Ensure app `/privacy` `/terms` publicly reachable without login |

## Next actions

1. Push `site-adscale` commit `f637d85`
2. Set `VITE_APP_URL` on marketing host CI
3. Deploy `dist/`
4. Smoke test production URLs
5. Optional: add `og:image` + fix ESLint for green CI
