---
phase: 26
name: Onboarding Aprimorado
discussed: "2026-05-27"
---

# Phase 26 Context: Onboarding Aprimorado

## Existing Infrastructure (Already Built)

The codebase already has a basic onboarding system in place:

- **Database**: `user.onboardingCompletedAt` timestamp field
- **API**: `/api/user/onboarding` — GET returns `{completed: boolean}`, POST marks complete
- **Hook**: `useOnboarding()` — queries status, provides `complete()` mutation
- **Component**: `OnboardingTour` — custom spotlight overlay with:
  - SVG mask cutout around target element
  - Highlight border with glow effect
  - Tooltip with arrow, title, description
  - Step dots (clickable), prev/next buttons, skip (X) button
  - Auto-positioning (top/bottom/left/right based on viewport)
  - 3 steps currently on dashboard page
- **i18n**: Translation keys in `onboarding` namespace

## Gray Areas

### 1. Tour Scope & Flow
**Current**: Tour runs only on dashboard (3 steps: header, quick actions, campaign list)
**Question**: Should the tour extend to other pages (campaigns, upload, generation, review) or stay dashboard-only?

### 2. Contextual Tooltips vs Tour
**Current**: No contextual tooltips exist
**Question**: Should tooltips be:
- (A) Always-visible info icons on hover (separate from tour)
- (B) Part of the tour flow (shown only during onboarding)
- (C) Both — tour introduces features, tooltips remain for reference

### 3. Restart Mechanism
**Current**: No restart capability
**Question**: Where should the restart button live?
- (A) Settings page (dedicated "Onboarding" section)
- (B) Help menu in TopBar
- (C) Both

### 4. Progress Tracking Granularity
**Current**: Binary (completed or not) — single timestamp
**Question**: Should we track:
- (A) Binary only (current) — simple, sufficient
- (B) Per-step progress — allows resuming mid-tour
- (C) Step count (e.g., "3 of 5 completed") — for analytics

### 5. Tour Trigger
**Current**: Shows automatically on dashboard if not completed
**Question**: Should tour:
- (A) Start on first dashboard visit (current behavior)
- (B) Start immediately after first login (redirect to dashboard first)
- (C) Start after user creates first campaign (contextual milestone)

## Code Context

### Reusable Assets
- `OnboardingTour` component — can be extended with more steps or reused on other pages
- `useOnboarding` hook — pattern for user-preference queries/mutations
- `data-tour-step` attribute pattern — for targeting elements

### Established Patterns
- User preferences stored in `user` table (e.g., `locale`, `emailNotificationsEnabled`)
- API routes under `/api/user/*` for user-specific data
- Settings tabs use dynamic imports with skeleton loading
- i18n keys organized by feature domain

### Integration Points
- Dashboard page already has tour integration
- Settings page has tab system for adding new section
- User auth context available throughout app

## Decisions Locked

1. **Tour scope**: Dashboard-only (A) — Tour runs on dashboard only, 4-5 steps covering header, quick actions, campaign list, and "New Campaign" CTA
2. **Tooltip strategy**: Separate info icons (A) — ℹ️ icons on hover for 3-4 complex features (creativity profile, generation mode, CTA config). Independent from tour.
3. **Restart location**: Settings (A) — New "General" or "Preferences" tab in Settings with "Restart Welcome Tour" button
4. **Progress granularity**: Binary (A) — Keep `onboardingCompletedAt` timestamp. No migration needed.
5. **Trigger timing**: Dashboard visit (A) — Shows automatically on first dashboard visit. Skip available at all times.

## Deferred Ideas

- Tour analytics (which steps are skipped, completion rates) — future phase
- Video tutorials embedded in tour — future phase
- Onboarding checklist (separate from tour) — future phase
- Personalized tour based on user role — future phase
