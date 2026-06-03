# Roadmap: ADScale v11.3 Site de Apresentação Separado

**Created:** 2026-06-03
**Milestone:** v11.3
**Total phases:** 3
**Requirements:** 14/14 mapped
**Starting phase:** 50

## Overview

v11.3 moves the public ADScale presentation surface into `jhowtkd/site-adscale.git`. Inspection shows ADScale_2 has legal public routes but no root App Router presentation page, while the target repo already contains a Vite/React/Tailwind landing site. This roadmap therefore treats the work as migration/convergence: audit ownership, align content and app links, then verify deploy-readiness.

| Phase | Name | Goal | Requirements | Success Criteria |
|-------|------|------|--------------|------------------|
| 50 | Source and Boundary Audit | Prove what migrates, what already exists in `site-adscale`, and what stays in ADScale_2. | SITE-01, SITE-02, SITE-03 | 4 |
| 51 | Target Site Alignment | Update `site-adscale` content, CTAs, assets, metadata, and implementation quality. | CONT-01, CONT-02, CONT-03, CONT-04, TGT-01, TGT-02, TGT-03, TGT-04 | 5 |
| 52 | Launch Verification and Handoff | Validate browser behavior, build/deploy readiness, and final handoff. | QA-01, QA-02, QA-03 | 5 |

## Phase Details

### Phase 50: Source and Boundary Audit

**Goal:** Prove what migrates, what already exists in `site-adscale`, and what stays in ADScale_2.

**Requirements:** SITE-01, SITE-02, SITE-03

**Scope:**
- Inspect ADScale_2 public routes, layouts, metadata, legal pages, auth/signup/login/beta flows, and any old marketing assets.
- Inspect `jhowtkd/site-adscale.git` current landing structure, dependencies, design system, assets, sections, CTAs, deploy assumptions, and build health.
- Produce a migration contract documenting ownership: presentation/SEO/static marketing in `site-adscale`; auth/dashboard/product runtime/legal decisions in ADScale_2.
- Decide whether legal pages are duplicated in `site-adscale` or linked back to app-hosted `/privacy` and `/terms`.

**Success criteria:**
1. Audit identifies no hidden ADScale_2 root presentation page that would conflict with `site-adscale`.
2. Target repo sections and assets are mapped to ADScale product claims.
3. App URLs for signup/login/beta/legal are listed with source of truth and env/config needs.
4. Migration contract names exact files/repos touched in later phases.

### Phase 51: Target Site Alignment

**Goal:** Update `site-adscale` content, CTAs, assets, metadata, and implementation quality.

**Requirements:** CONT-01, CONT-02, CONT-03, CONT-04, TGT-01, TGT-02, TGT-03, TGT-04

**Scope:**
- Update `site-adscale` copy to match current ADScale capability and beta/credit language.
- Wire CTA destinations to configurable app URLs for signup/login/beta access.
- Add or correct footer/legal links, metadata, title, description, Open Graph basics, favicon/logo paths, and canonical/domain assumptions.
- Fix target repo responsive/a11y/text-overflow issues discovered during audit.
- Keep the target stack as Vite + React + Tailwind unless execution finds a hard blocker.
- Run target repo `npm run build`, `npm run typecheck`, and `npm run lint`.

**Success criteria:**
1. Hero, product sections, pricing/beta copy, FAQ, and final CTA all describe shipped ADScale behavior accurately.
2. CTAs never dead-end and point to the intended app route or configured external URL.
3. The site has production metadata/assets suitable for social previews and browser tabs.
4. Target repo build/typecheck/lint pass or failures are documented with exact blockers.
5. No visible mobile/desktop text overlap or broken layout remains in the main landing sections.

### Phase 52: Launch Verification and Handoff

**Goal:** Validate browser behavior, build/deploy readiness, and final handoff.

**Requirements:** QA-01, QA-02, QA-03

**Scope:**
- Run local target site and inspect desktop and mobile breakpoints.
- Click through navbar anchors, primary/secondary CTAs, pricing/beta CTA, legal/footer links, and app links.
- Check built artifact/deploy settings for selected host.
- Document environment variables, app URL assumptions, domain/canonical choice, and residual risks.
- Create final handoff with target repo commit/branch, commands run, verification evidence, and next action.

**Success criteria:**
1. Desktop browser smoke covers hero, nav, major sections, CTAs, footer, and legal links.
2. Mobile browser smoke covers navigation, hero CTA, pricing/beta, FAQ, and footer without overlap.
3. Build artifact and deployment config are ready for the selected host.
4. Handoff names the `site-adscale` commit/branch and exact deploy instructions.
5. Remaining risks are explicit, especially legal hosting choice, domain mapping, analytics/cookie consent, and any app URL still pending.

## Requirement Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SITE-01 | Phase 50 | Planned |
| SITE-02 | Phase 50 | Planned |
| SITE-03 | Phase 50 | Planned |
| CONT-01 | Phase 51 | Planned |
| CONT-02 | Phase 51 | Planned |
| CONT-03 | Phase 51 | Planned |
| CONT-04 | Phase 51 | Planned |
| TGT-01 | Phase 51 | Planned |
| TGT-02 | Phase 51 | Planned |
| TGT-03 | Phase 51 | Planned |
| TGT-04 | Phase 51 | Planned |
| QA-01 | Phase 52 | Planned |
| QA-02 | Phase 52 | Planned |
| QA-03 | Phase 52 | Planned |

**Coverage:**
- v11.3 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

## Build Order Rationale

1. Audit first because local inspection found the target repo already has a landing page, while ADScale_2 lacks a root presentation page. Copying before resolving ownership risks duplicating or regressing the marketing surface.
2. Align target content and implementation second because CTAs, beta/credit language, legal links, and metadata must match current app behavior.
3. Verify launch last because browser checks and deploy readiness depend on final target repo changes.

---
*Roadmap created: 2026-06-03*
