# Roadmap: ADScale v10.0 — Refinamento de Interface

## Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 35 | Animation Foundation | Establish shared animation primitives and hooks | ANIM-01, ANIM-04, ANIM-05, A11Y-03, A11Y-04 | 5 |
| 36 | Core Component Polish | Apply animations to Button, Card, Input, Badge | COMP-01..04 | 4 |
| 37 | Layout Responsive | Responsive AppShell, sidebar, grids, smooth scroll | RESP-01..04, A11Y-05 | 5 |
| 38 | Feature Components | Gallery responsive, touch gestures, modals, stagger | RESP-05, ANIM-02, ANIM-03 | 4 |
| 39 | States & Accessibility | Empty/error states, final a11y verification | A11Y-01, A11Y-02 | 4 |

**19 requirements** | **5 phases** | All covered ✓

---

## Phase 35: Animation Foundation

**Goal:** Establish shared animation primitives, hooks, and CSS foundations that all subsequent UI work depends on.

**Requirements:** ANIM-01, ANIM-04, ANIM-05, A11Y-03, A11Y-04

**Success Criteria:**
1. User hovers over any button and sees a smooth color/opacity transition within 150ms
2. User focuses any input via keyboard and sees a visible focus ring with smooth transition
3. User toggles system "Reduce motion" preference and all animations disable instantly
4. User sees skeleton screens with shimmer effect instead of spinners when data loads
5. User triggers a toast notification and sees smooth slide-in/slide-out animation

**Depends on:** Phase 34 (Slider Antes/Depois — concluído)

**Spike:** None (Framer Motion patterns well-documented, 166+ refs in codebase)

---

## Phase 36: Core Component Polish

**Goal:** Apply animation primitives to the most-used components (Button, Card, Input, Badge) for immediate user-visible impact.

**Requirements:** COMP-01, COMP-02, COMP-03, COMP-04

**Success Criteria:**
1. User hovers over a campaign card and it lifts with enhanced shadow (translateY -2px, shadow-lg)
2. User clicks a button and sees active scale down to 0.97 with smooth spring
3. User focuses an input and border color transitions smoothly with subtle shadow glow
4. User sees badge color transition smoothly when derivation status changes

**Depends on:** Phase 35

---

## Phase 37: Layout Responsive

**Goal:** Make AppShell, sidebar, grids, and forms responsive with mobile-first breakpoints.

**Requirements:** RESP-01, RESP-02, RESP-03, RESP-04, A11Y-05

**Success Criteria:**
1. User opens app on 375px width and sidebar collapses to hamburger menu drawer
2. User resizes browser and campaign grid smoothly transitions from 1→2→3→4 columns
3. User views campaign form on mobile and fields stack vertically in single column
4. User scrolls down on mobile and TopBar smoothly hides; scrolls up and it reappears
5. User clicks nav link and page smoothly scrolls to section with eased animation

**Depends on:** Phase 36

**Spike:** Canvas annotation coordinate scaling on responsive resize (non-trivial math problem)

---

## Phase 38: Feature Components

**Goal:** Adapt feature-specific components (gallery, comparison, modals) to be responsive and animated.

**Requirements:** RESP-05, ANIM-02, ANIM-03

**Success Criteria:**
1. User opens modal/dialog and content fades in with scale from 0.95→1 over 200ms
2. User loads gallery page and cards enter with staggered fade-in (50ms delay each)
3. User swipes left/right on mobile gallery to navigate between derivation views
4. User pinches to zoom on mobile comparison view

**Depends on:** Phase 37

**Spike:** Mobile touch interaction for comparison view (may require gesture library research)

---

## Phase 39: States & Accessibility

**Goal:** Final polish pass on empty/error states, focus management, reduced motion support, and full test verification.

**Requirements:** A11Y-01, A11Y-02

**Success Criteria:**
1. User visits empty campaign list and sees contextual illustration with "No campaigns yet" copy
2. User encounters form validation error and sees input shake with red border and helpful message
3. User visits empty derivation gallery and sees illustration with "No derivations yet" copy
4. User navigates entire app via keyboard and every interactive element shows visible focus state

**Depends on:** Phase 38

---

## Archive Notes

- Previous roadmap: `.planning/milestones/v9.0-ROADMAP.md`
- v9.0 ended at Phase 34
- v10.0 starts at Phase 35

---
*Roadmap created: 2026-05-28*
