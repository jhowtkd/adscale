# Requirements: ADScale v11.3 Site de Apresentação Separado

**Defined:** 2026-06-03
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v11.3 Requirements

### Migration Boundary

- [x] **SITE-01**: The team can identify the exact source of truth for the ADScale presentation page before implementation starts, including whether the current `site-adscale` landing already replaces any missing/inactive page in ADScale_2.
- [x] **SITE-02**: The migration defines what lives in `jhowtkd/site-adscale.git` versus what remains in ADScale_2: marketing content, static assets, SEO metadata, CTAs, legal pages, auth routes, dashboard routes, analytics, and deploy config.
- [x] **SITE-03**: The ADScale_2 app does not gain or retain a competing root marketing surface after the migration; app routes stay focused on auth, invite, legal, share, and dashboard/product workflows.

### Presentation Content

- [x] **CONT-01**: The presentation site communicates the current ADScale product accurately: base creative upload, campaign brief, AI plan, derivations for Meta/TikTok/Google, QA/review, export, beta access, and credit limits.
- [x] **CONT-02**: Primary CTAs on the presentation site point to the correct app destination for signup, login, or beta access, using production-safe URLs configurable outside code when needed.
- [x] **CONT-03**: Legal/footer links on the presentation site point to the correct privacy and terms surfaces, either hosted in `site-adscale` or intentionally linked back to ADScale_2.
- [x] **CONT-04**: Copy does not promise unsupported capabilities such as direct ad-platform publishing, unlimited generation, raw provider-token entitlements, or guaranteed model-perfect output.

### Target Repo Implementation

- [x] **TGT-01**: `jhowtkd/site-adscale.git` can build, typecheck, and lint cleanly after the migration.
- [x] **TGT-02**: The target site's React/Tailwind components preserve the intended ADScale visual identity while fixing obvious responsive, accessibility, and text-overflow issues.
- [x] **TGT-03**: Static assets, favicon/logo references, Open Graph metadata, page title, description, and canonical/domain assumptions are configured for the production presentation site.
- [x] **TGT-04**: Any analytics, cookie consent, or tracking added to the presentation site is explicit, minimal, and does not conflict with ADScale_2 app consent behavior.

### Launch Verification

- [x] **QA-01**: Desktop and mobile browser smoke checks verify hero, navigation, CTAs, pricing/beta section, FAQ, footer, and legal links.
- [x] **QA-02**: Build artifact is deploy-ready for the chosen host, with environment variables and app URL documented.
- [x] **QA-03**: The final handoff includes the target repo branch/commit, verification results, deploy instructions, and known residual risks.

## Future Requirements

| Requirement | Reason |
|-------------|--------|
| **SITE-FUT-01**: Multilingual marketing site | Current milestone should first establish ownership, correctness, and deploy-readiness. |
| **SITE-FUT-02**: CMS-backed content editing | Static Vite site is enough until copy changes become frequent. |
| **SITE-FUT-03**: Full analytics funnel instrumentation | Can follow after CTAs/domains stabilize. |
| **SITE-FUT-04**: A/B testing for hero/pricing copy | Requires stable baseline site and traffic. |

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rebuilding ADScale_2 as a marketing site | The goal is a separate presentation repo, not expanding the app repo. |
| Changing app auth/onboarding behavior | CTAs may link to signup/beta flows, but app behavior changes are separate unless a broken link blocks migration. |
| Migrating dashboard/product UI to `site-adscale` | Target repo is for public presentation only. |
| Direct ad-platform integrations | Product capability remains future scope, not marketing migration scope. |
| Replacing Vite with Next.js in `site-adscale` | Current target stack is already Vite/React/Tailwind and adequate for static presentation. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SITE-01 | Phase 50 | Complete |
| SITE-02 | Phase 50 | Complete |
| SITE-03 | Phase 50 | Complete |
| CONT-01 | Phase 51 | Complete |
| CONT-02 | Phase 51 | Complete |
| CONT-03 | Phase 51 | Complete |
| CONT-04 | Phase 51 | Complete |
| TGT-01 | Phase 51 | Complete (lint debt documented) |
| TGT-02 | Phase 51 | Complete |
| TGT-03 | Phase 51 | Complete (og:image deferred) |
| TGT-04 | Phase 51 | Complete |
| QA-01 | Phase 52 | Complete (owner smoke pending) |
| QA-02 | Phase 52 | Complete |
| QA-03 | Phase 52 | Complete |

**Coverage:**
- v11.3 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-06-03*
*Last updated: 2026-06-03 after v11.3 roadmap creation*
