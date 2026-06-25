---
phase: 170-product-narrative-rollout
status: complete
created: 2026-06-25
---

# Phase 170 Research: Product Narrative Rollout

## Objective

Plan how to move conservative "Curator > operator" positioning into authenticated app copy via i18n, without lifting unapproved marketing promises from `marketing/brand/conceituacao.md` or violating Phase 168/169 claim-gate honesty.

## Existing Implementation Facts

### i18n architecture

- All user-facing copy flows through **next-intl** JSON files: `app/messages/en.json` and `app/messages/pt-BR.json`.
- Changes are key edits only — no inline strings in components for narrative surfaces.
- Both locales must stay in parity for every changed key (CONTEXT D-03 / BRAND-03).

### Onboarding (dashboard-only tour)

- `OnboardingTour` + `useOnboarding()` — 5 steps, binary completion via `user.onboardingCompletedAt`.
- Keys under top-level `onboarding.*` (step1Title..step5Desc, skip/back/next/finish).
- Dashboard page (`app/src/app/(dashboard)/page.tsx`) wires tour steps from `onboarding.*` translations.
- Settings restart copy under `settings.onboarding.*`.
- Phase 26 locked scope: dashboard-only tour — do not extend to other pages.

### Empty states

- Shared `EmptyState` component: `app/src/components/ui/EmptyState.tsx`.
- Dashboard home empty: inline `EmptyState` in `page.tsx` using `dashboard.home.empty*` keys.
- Campaigns list: `campaigns` page uses `EmptyState` with list empty keys.
- Library: `library.emptyTitle` / `library.emptyDescription`.
- Generation gallery empty: `generation` namespace `emptyTitle`, `emptyDescription`, `emptyAction`.
- Templates empty: `template.emptyTitle` / `emptyDescription`.

### Workflow copy surfaces (BRAND-01 / BRAND-03)

| Namespace | Decision-point copy |
|-----------|---------------------|
| `metadata` | App title/description (authenticated shell) |
| `navigation` | Sidebar labels |
| `auth.signUpSubtitle` | First product promise on signup |
| `campaign.*` | Wizard intros, createDescription, manageCampaigns |
| `steps.*` | Wizard step labels and CTAs (brief → upload → generation → plan → gallery → review) |
| `generation.*` | Batch/derivation mode descriptions, start CTAs |
| `workspace.derivar.*` | Derivation choice descriptions |
| `review.*` | Approve/reject guidance (not Olhar/export internal labels) |
| `settings.*` | Tab labels where curator framing helps |

### Out of scope (do not edit)

- `review.olhar*`, `review.export*`, `review.decision*` — internal art-direction mechanics (CONTEXT locked).
- Owner/corpus/calibration panels — honest technical language already appropriate.
- `marketing/brand/conceituacao.md` — reference-only; production frozen.
- Marketing site, emails, social copy.

### Current copy gaps (conservative audit)

- `metadata.description` positions as generic "AI-Powered Creative Variants" — no curator framing.
- `onboarding.step*` focuses on dashboard mechanics, not briefing → batch → curate arc.
- `dashboard.home.emptyCreateHint` says "generating creatives with AI" without human curation loop.
- `auth.signUpSubtitle` is generic "Start generating ad variations with AI".
- Wizard `campaign.createDescription` is functional, not role-defining.
- No in-repo checklist for in-app copy review (BRAND-04 gap).

### conceituacao.md constraints (reference-only)

- **Borrow:** Curator > operator structure, three mechanisms (briefing, batch, human curation), canonical/forbidden vocabulary (§4.1–4.4).
- **Withhold:** Performance promises (§2.4 "scale without hiring", speed multiples), unapproved marketing claims.
- **PT-BR:** "curador" (estratégico), never "operador" as user identity target.

### Phase 168/169 cross-cutting honesty

- Fixture validates operation only; customer-real claims withheld.
- No Cenbrap naming on general user surfaces.
- No calibration/corpus/Olhar jargon in onboarding/empty states/wizard.

## Recommended Implementation Shape

### Plan 01 — Checklist + automated guard (BRAND-04, Wave 0)

1. Create `marketing/brand/in-app-copy-checklist.md` with 7 auditable criteria from CONTEXT + conceituacao §4.2–4.4 + Phase 169 gates.
2. Add `app/tests/unit/i18n/product-narrative-copy.test.ts`:
   - Locale key parity for narrative namespaces.
   - Forbidden pattern scan (Cenbrap, magic/revolutionary, performance lift, automation overclaim).
   - Positive signals in onboarding (curator/curador, brief/batch vocabulary).

### Plan 02 — Onboarding + empty states (BRAND-01 partial, BRAND-02)

Rewrite keys only (no tour scope change):
- `onboarding.step1Title`..`step5Desc` — curator arc, remove emoji per discretion.
- `dashboard.home.empty*`, campaigns list empty, `library.empty*`, `generation.empty*`, `template.empty*`.
- Run copy guard test after edits.

### Plan 03 — Workflow language + verification (BRAND-01 partial, BRAND-03, BRAND-04)

1. Update `metadata`, `navigation`, `auth.signUpSubtitle`, `campaign.*` wizard copy, `steps.*`, `generation.*`, `workspace.derivar.*`, `review` action guidance (approve/reject hints only), selective `settings` labels.
2. Extend copy guard test namespaces; run checklist audit; publish `170-VERIFICATION.md` and update planning status.

## Validation Architecture

### Test infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest via `npm test -- --run ...` |
| **Config file** | `app/config/vitest.config.ts` |
| **Copy guard command** | `cd app && npm test -- --run tests/unit/i18n/product-narrative-copy.test.ts` |
| **Full phase command** | Same + planning grep verification |
| **Estimated runtime** | ~5 seconds |

### Required automated coverage

- BRAND-01: onboarding + workflow keys contain curator framing at decision points; forbidden automation claims absent.
- BRAND-02: empty-state keys explain curator role; no Cenbrap/calibration jargon.
- BRAND-03: en/pt-BR key parity for all narrative namespaces touched.
- BRAND-04: checklist file exists; copy guard test encodes forbidden list.

### Manual verification

Optional human spot-check of dashboard tour and one campaign wizard path after automated tests pass. Not blocking if copy guard is green.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Lifting unapproved conceituacao promises | Conservative framing default in CONTEXT; checklist gates performance claims |
| Locale drift en vs pt-BR | Parity test in copy guard; parallel edits required per task |
| Accidental Olhar/review internal rename | Scope lock on `review.olhar*`, `review.export*`, `review.decision*` keys |
| Cenbrap leakage in copy | Forbidden pattern scan in automated test |

## Architectural Responsibility Map

| Tier | Responsibility |
|------|----------------|
| `marketing/brand/in-app-copy-checklist.md` | Human-auditable BRAND-04 gate |
| `app/tests/unit/i18n/product-narrative-copy.test.ts` | Automated copy guard |
| `app/messages/en.json` + `pt-BR.json` | Sole runtime copy source |
| `OnboardingTour` / `EmptyState` consumers | Read keys only — no component changes unless key structure changes |
