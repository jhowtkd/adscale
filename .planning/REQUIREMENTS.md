# Requirements: ADScale v2.0 — Internacionalização PT-BR

## Overview

Milestone v2.0 prepares ADScale for public launch in Brazil. Every user-facing surface must support Portuguese (PT-BR) as the primary language, with English (EN) as a secondary fallback. AI-generated outputs (creative plans, derivation prompts) must be produced in the user's selected language.

## Requirements

### I18N — Platform Internationalization

- [ ] **I18N-01**: User can switch between PT-BR and EN via a language switcher in the UI header or settings
- [ ] **I18N-02**: All UI labels, buttons, navigation, and static messages are translated based on selected language
- [ ] **I18N-03**: Form validation errors (Zod, client, server) are returned in the user's selected language
- [ ] **I18N-04**: API error responses include localized messages where applicable
- [ ] **I18N-05**: Toast notifications and empty states use translated copy
- [ ] **I18N-06**: Date, number, and currency formatting use PT-BR locale conventions when PT-BR is active

### LANG — Language Persistence & Detection

- [ ] **LANG-01**: User language preference is stored in the database (user profile or workspace settings)
- [ ] **LANG-02**: A cookie stores the active language for SSR/initial render without flashing
- [ ] **LANG-03**: Browser language detection sets the default on first visit (pt → PT-BR, anything else → EN)
- [ ] **LANG-04**: Language preference persists across browser refresh and logout/login
- [ ] **LANG-05**: Unauthenticated visitors see PT-BR by default (Brazil launch market)

### AI-PT — AI Outputs in Portuguese

- [ ] **AI-PT-01**: Creative plan generation prompt instructs OpenAI to return strategy/angles/hooks/ctas in PT-BR when user language is PT-BR
- [ ] **AI-PT-02**: Derivation generation prompt instructs OpenAI to produce the ad image concept/description in PT-BR when user language is PT-BR
- [ ] **AI-PT-03**: Regeneration feedback prompt preserves the user's language for revised outputs
- [ ] **AI-PT-04**: Campaign brief field labels and placeholders adapt to the active language
- [ ] **AI-PT-05**: Plan preview and derivation cards display AI-generated text in the language it was produced

### TECH — Technical Foundation

- [ ] **TECH-01**: i18n library chosen and integrated (e.g. `next-intl` or `react-i18next` with Next.js App Router support)
- [ ] **TECH-02**: Translation keys organized by feature/domain (auth, campaigns, plan, derivations, review, export, dashboard, errors)
- [ ] **TECH-03**: Server-side rendering renders correct lang attribute and initial translations without hydration mismatch
- [ ] **TECH-04**: Language context is available in API routes for localized error messages
- [ ] **TECH-05**: Prompt builder accepts a `language` parameter and injects language instructions into OpenAI prompts

## Deferred (Future Milestones)

- Additional languages (ES, FR) — requires translation infrastructure maturity first
- RTL layout support — not needed for PT-BR/EN
- AI voiceover/text-to-speech localization — out of scope

## Out of Scope

- Auto-translation of existing user-generated content (briefs, feedback) — user input stays as-is
- Region-specific compliance (LGPD) — separate milestone
- Currency conversion — usage is credit-based, not monetary

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| I18N-01 | TBD | Not started |
| I18N-02 | TBD | Not started |
| I18N-03 | TBD | Not started |
| I18N-04 | TBD | Not started |
| I18N-05 | TBD | Not started |
| I18N-06 | TBD | Not started |
| LANG-01 | TBD | Not started |
| LANG-02 | TBD | Not started |
| LANG-03 | TBD | Not started |
| LANG-04 | TBD | Not started |
| LANG-05 | TBD | Not started |
| AI-PT-01 | TBD | Not started |
| AI-PT-02 | TBD | Not started |
| AI-PT-03 | TBD | Not started |
| AI-PT-04 | TBD | Not started |
| AI-PT-05 | TBD | Not started |
| TECH-01 | TBD | Not started |
| TECH-02 | TBD | Not started |
| TECH-03 | TBD | Not started |
| TECH-04 | TBD | Not started |
| TECH-05 | TBD | Not started |
