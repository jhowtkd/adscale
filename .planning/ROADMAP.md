# Roadmap: ADScale v2.0 — Internacionalização PT-BR

## Milestone Overview

**Version:** v2.0  
**Name:** Internacionalização PT-BR  
**Goal:** Prepare ADScale for public launch in Brazil by localizing the entire platform and adapting AI outputs to Portuguese.  
**Phases:** 4 (6 → 9)  
**Requirements:** 21  

---

## Phase 6: Foundation — i18n Infrastructure

**Goal:** Set up the i18n library, language persistence, and detection pipeline.

**Requirements:**
- TECH-01: i18n library chosen and integrated
- TECH-02: Translation keys organized by feature/domain
- TECH-03: Server-side rendering renders correct lang attribute without hydration mismatch
- LANG-01: User language preference stored in database
- LANG-02: Cookie stores active language for SSR/initial render
- LANG-03: Browser language detection sets default on first visit
- LANG-05: Unauthenticated visitors see PT-BR by default

**Success Criteria:**
1. App renders in PT-BR on first visit from Brazil
2. Language switcher changes UI language instantly
3. Refresh preserves selected language without flash
4. Database schema supports per-user language preference

---

## Phase 7: UI Translation

**Goal:** Translate every user-facing surface in the app.

**Requirements:**
- I18N-01: Language switcher in UI header/settings
- I18N-02: All UI labels, buttons, navigation translated
- I18N-03: Form validation errors localized
- I18N-04: API error responses localized
- I18N-05: Toast notifications and empty states translated
- I18N-06: Date, number, currency formatting uses PT-BR locale
- LANG-04: Language preference persists across logout/login

**Success Criteria:**
1. Every visible text in the app has a PT-BR translation
2. Validation errors appear in Portuguese
3. Dates display as DD/MM/YYYY when PT-BR is active
4. No hardcoded English strings remain in UI components

---

## Phase 8: AI Localization

**Goal:** Adapt all OpenAI prompts and outputs to the user's language.

**Requirements:**
- AI-PT-01: Plan generation prompt instructs OpenAI to output in PT-BR
- AI-PT-02: Derivation generation prompt instructs OpenAI in PT-BR
- AI-PT-03: Regeneration feedback preserves language for revised outputs
- AI-PT-04: Campaign brief field labels adapt to active language
- AI-PT-05: Plan preview and derivation cards display text in produced language
- TECH-04: Language context available in API routes
- TECH-05: Prompt builder accepts language parameter

**Success Criteria:**
1. Creative plan generated in PT-BR contains Portuguese strategy/angles/hooks/ctas
2. Derivation prompts reference Portuguese copy when PT-BR is selected
3. Feedback regeneration produces revised content in the same language
4. No English leaks in AI-generated content when PT-BR is active

---

## Phase 9: Polish & QA

**Goal:** Fix edge cases, ensure no language leaks, and validate the full PT-BR experience.

**Requirements:**
- (Catch-all for edge cases discovered in previous phases)

**Success Criteria:**
1. Complete end-to-end test: signup → campaign → brief → upload → plan → derivation → review → export, all in PT-BR
2. Switch to EN and verify full English experience works
3. No hydration mismatches or flash of untranslated content
4. All 57 existing tests still pass
5. Build and lint clean

---

## Requirement Coverage

| REQ-ID | Phase | Mapped |
|--------|-------|--------|
| I18N-01 | 7 | ✓ |
| I18N-02 | 7 | ✓ |
| I18N-03 | 7 | ✓ |
| I18N-04 | 7 | ✓ |
| I18N-05 | 7 | ✓ |
| I18N-06 | 7 | ✓ |
| LANG-01 | 6 | ✓ |
| LANG-02 | 6 | ✓ |
| LANG-03 | 6 | ✓ |
| LANG-04 | 7 | ✓ |
| LANG-05 | 6 | ✓ |
| AI-PT-01 | 8 | ✓ |
| AI-PT-02 | 8 | ✓ |
| AI-PT-03 | 8 | ✓ |
| AI-PT-04 | 8 | ✓ |
| AI-PT-05 | 8 | ✓ |
| TECH-01 | 6 | ✓ |
| TECH-02 | 6 | ✓ |
| TECH-03 | 6 | ✓ |
| TECH-04 | 8 | ✓ |
| TECH-05 | 8 | ✓ |

**Coverage:** 21/21 requirements mapped across 4 phases ✓
