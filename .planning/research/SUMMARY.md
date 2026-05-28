# Project Research Summary

**Project:** ADScale v10.0 - Refinamento de Interface  
**Domain:** UI Refinement, Micro-Animations, and Responsive Design for Next.js + React + Tailwind  
**Researched:** 2026-05-28  
**Confidence:** HIGH

## Executive Summary

The ADScale v10.0 milestone targets a comprehensive UI refinement of the existing Next.js + React application. Research confirms the existing stack is well-equipped for this work — no major new dependencies are required. The primary effort is leveraging existing tools (Framer Motion, Tailwind CSS v4, `@base-ui/react`) more effectively through version bumps, custom utilities, and architectural patterns for animation and responsive design.

The recommended approach is a **CSS-first, progressively enhanced** strategy: use Tailwind transitions for simple interactions (hover, focus), reserve Framer Motion for complex sequences (page transitions, modal enter/exit, staggered lists), and implement a mobile-first responsive strategy via Tailwind breakpoints. This minimizes bundle impact while delivering premium-feeling interactions. Key risks include bundle size inflation from animation libraries, layout stability (CLS) from poorly implemented animations, and breaking existing component contracts when adding responsive behavior.

Research indicates this milestone can be completed in 3-4 weeks with a single developer, following the suggested 5-phase build order. The architecture supports team growth without requiring major refactoring.

## Key Findings

### Recommended Stack

The existing stack requires only minor version bumps and a small set of custom utilities. No new runtime dependencies are needed. [See full stack details → STACK.md](STACK.md)

**Core technologies (already installed, version bumps needed):**
- **framer-motion** (→ `^12.40.0`): Animation orchestration, gestures, layout animations — already has 166+ references across the codebase
- **@base-ui/react** (→ `^1.5.0`): Accessible UI primitives (Dialog, Tooltip, focus management)
- **tailwindcss** (`^4`): Responsive utilities, custom animations, design tokens — current major is sufficient
- **sonner** (keep current): Toast notifications with animations
- **lucide-react** (keep current): Icons for empty states and UI elements

**Custom utilities to build (zero dependencies):**
- `useMediaQuery` — responsive conditional rendering (sidebar, grid columns)
- `useReducedMotion` — respect `prefers-reduced-motion` for accessibility
- `useScrollDirection` — show/hide top bar on scroll
- `@keyframes shimmer` — refined skeleton loading beyond `animate-pulse`

### Expected Features

User expectations for a modern SaaS app fall into three tiers. [See full feature analysis → FEATURES.md](FEATURES.md)

**Must have (table stakes) — P1:**
- Responsive layout (sidebar collapses, grids adapt, forms stack) — 60%+ of traffic is mobile
- Loading skeletons for all async data surfaces — reduces perceived wait
- Hover states on all interactive elements — basic feedback
- Focus states for keyboard navigation — accessibility compliance
- Toast notifications for action confirmation — already implemented
- Basic modal/dialog transitions — smooth open/close
- Consistent spacing via design tokens — visual coherence

**Should have (competitive differentiators) — P2:**
- Shimmer effects on skeletons — premium feel, low effort
- Staggered animations for lists/galleries — content feels alive
- Smooth scroll-to-section — navigation polish
- Reduced motion support — accessibility improvement
- Page transition orchestration — app-feel continuity

**Defer (v2+) — P3:**
- Advanced gesture support (swipe to dismiss, drag-to-reorder) — high dev cost, niche usage
- Scroll-triggered reveal animations — marketing-site pattern, less relevant for SaaS
- Interactive/animated empty states — nice but not critical

### Architecture Approach

The recommended architecture extends the existing codebase with two new directories: `components/animations/` (reusable Framer Motion wrappers) and `components/responsive/` (responsive layout primitives), plus a `lib/animations/` config layer for centralized variant presets. [See full architecture → ARCHITECTURE.md](ARCHITECTURE.md)

**Major components:**
1. **Animation primitives** (`FadeIn`, `SlideIn`, `ScaleIn`, `StaggerContainer`, `Shimmer`) — reusable wrappers preventing inline motion props duplication across 50+ components
2. **Responsive utilities** (`MobileDrawer`, `ResponsiveGrid`, `CollapsibleSection`) — dedicated responsive primitives keeping logic out of feature components
3. **Animation config** (`lib/animations/variants.ts`, `easings.ts`, `transitions.ts`) — single source of truth for easing curves, durations, and variant presets
4. **Hooks** (`use-reduced-motion.ts`, `use-mobile.ts`, `use-stagger.ts`) — essential for accessibility and breakpoint detection

**Key architectural patterns:**
- **CSS-first micro-animations** for simple interactions (hover, focus, active) — zero JS cost
- **Framer Motion variant system** for complex sequences (page transitions, modals, staggered lists)
- **Mobile-first responsive strategy** via Tailwind breakpoints — single component tree, no hydration mismatch
- **Skeleton shimmer** via CSS `background-size` and `translate` — GPU-friendly, matches final layout

### Critical Pitfalls

[See full pitfalls analysis → PITFALLS.md](PITFALLS.md)

1. **Bundle size inflation from animation libraries** — Adding Framer Motion for simple hover states can reverse the ~18% bundle reduction achieved in v6.0. *Avoid by:* preferring CSS transitions for simple states, using tree-shaken imports, measuring with `npm run analyze`, setting a 50KB gzipped budget for animation code.

2. **Animations breaking layout stability (CLS)** — Animating `height`, `width`, `top`, `left`, or `margin` causes Cumulative Layout Shift, especially visible in galleries and modals. *Avoid by:* only animating `transform` and `opacity`, reserving modal space with fixed positioning, specifying `aspect-ratio` on image containers.

3. **Responsive design breaking existing component contracts** — Adding breakpoints to complex components (derivation gallery, comparison view, canvas annotations) can break internal layouts. *Avoid by:* auditing components for fixed widths and absolute positioning, creating mobile-first wrappers rather than modifying internals, testing at 320px, 768px, and 1024px.

4. **Micro-animations causing INP regression** — Animations blocking the main thread make the app feel sluggish on mobile. *Avoid by:* using CSS `transition` for state changes (compositor thread), limiting simultaneous animations to 5-10 elements, using `will-change` strategically, testing on actual mobile devices.

5. **Accessibility regression from animations** — Missing `prefers-reduced-motion` support makes the app unusable for users with vestibular disorders. *Avoid by:* creating `useReducedMotion()` hook, wrapping animation rules in `@media (prefers-reduced-motion: no-preference)`, preserving visible focus indicators, testing keyboard navigation through all animated flows.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Animation Foundation (Week 1)
**Rationale:** All subsequent UI work depends on shared animation primitives and hooks. Establishing these first prevents inconsistency and duplication.
**Delivers:** `lib/animations/variants.ts`, `lib/animations/easings.ts`, `lib/hooks/use-reduced-motion.ts`, `lib/hooks/use-mobile.ts`, `components/animations/FadeIn.tsx`, `StaggerContainer.tsx`
**Addresses:** UI-02 (Micro-animations), UI-07 (Focus states & a11y)
**Avoids:** Inline animation logic duplication (Pitfall 1), accessibility regression (Pitfall 5)

### Phase 2: Core Component Polish (Week 1-2)
**Rationale:** Once animation primitives exist, apply them to the most-used components (Button, Card, Input, Skeleton) for immediate user-visible impact.
**Delivers:** Enhanced Button (focus ring, active scale, loading spinner), Card (hover lift, image scale), Input (focus transition, validation shake), Skeleton (shimmer effect)
**Uses:** Framer Motion variants, Tailwind `transition-*` utilities, custom `@keyframes shimmer`
**Avoids:** Over-engineering "polish" components (Pitfall 8), layout shift from animations (Pitfall 2)

### Phase 3: Layout Responsive + Animations (Week 2)
**Rationale:** Layout changes (sidebar, AppShell, TopBar) have the broadest impact and must be responsive-aware before feature components are adapted.
**Delivers:** Mobile sidebar drawer with slide animation, AppShell page transition wrapper, TopBar scroll behavior (hide/show on scroll), Footer mobile-safe padding
**Implements:** `components/responsive/MobileDrawer.tsx`, `useScrollDirection` hook
**Avoids:** Responsive breaking component contracts (Pitfall 3), test fragmentation (Pitfall 6)

### Phase 4: Feature Components (Week 3)
**Rationale:** With layout and primitives in place, adapt feature-specific components (gallery, forms, modals) to be responsive and animated.
**Delivers:** Campaign gallery responsive grid, Derivation cards with stagger entrance and hover polish, Forms with collapsible sections for mobile, Modals with enhanced enter/exit
**Implements:** `ResponsiveGrid.tsx`, `CollapsibleSection.tsx`
**Avoids:** Over-engineering components (Pitfall 8), INP regression from too many simultaneous animations (Pitfall 4)

### Phase 5: States & Accessibility (Week 3-4)
**Rationale:** Final polish pass on empty/error states, focus management, reduced motion support, and full test verification.
**Delivers:** Enhanced empty states with contextual icons, error states with shake animation, focus states on all interactive elements, full reduced motion audit, test suite verification
**Addresses:** UI-05 (Empty/error states), UI-07 (Focus states & a11y)
**Avoids:** Accessibility regression (Pitfall 5), skeleton loading increasing perceived load time (Pitfall 7)

### Phase Ordering Rationale

- **Foundation before features:** Animation primitives and responsive hooks must exist before any component uses them. This prevents inconsistent implementations and refactoring later.
- **Layout before components:** The AppShell, Sidebar, and TopBar define the viewport constraints within which all feature components render. Fixing layout first ensures feature components have correct bounds.
- **Components before states:** Empty/error states render *within* feature components. Those components must be responsive and animated before their states can be polished.
- **Accessibility last but not least:** A full accessibility audit is most effective when all visual changes are in place. This avoids re-auditing after late changes.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Layout Responsive):** Canvas annotation coordinate scaling on responsive resize is a non-trivial math problem. Needs dedicated spike.
- **Phase 4 (Feature Components):** Comparison view synchronized zoom/pan on mobile may require significant redesign. Needs mobile UX research.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Animation Foundation):** Framer Motion patterns are well-documented and the codebase already has 166+ references.
- **Phase 2 (Core Component Polish):** Tailwind + Framer Motion hover/focus patterns are standard — no research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified with Context7 (Framer Motion, Tailwind v4), official docs, and codebase analysis (166 Framer Motion refs). Version compatibility confirmed. |
| Features | HIGH | Based on competitor analysis (Linear, Figma, Canva), WCAG 2.1 guidelines, and standard SaaS UX benchmarks. Prioritization is subjective but defensible. |
| Architecture | HIGH | Aligned with existing codebase structure (`components/ui/`, `lib/`, `app/`). Patterns are standard for React/Next.js. Build order follows dependency graph. |
| Pitfalls | HIGH | Derived from v6.0 performance optimizations and v9.0 gallery features context. All pitfalls have documented prevention strategies and warning signs. |

**Overall confidence:** HIGH

### Gaps to Address

- **Canvas annotation responsive scaling:** The research assumes normalized coordinates (0-1) can be scaled to viewport, but the current implementation may use absolute pixel coordinates. Validate during Phase 3 planning.
- **Bundle impact of custom animation components:** The recommendation to add `components/animations/` and `lib/animations/` assumes tree-shaking works correctly. Verify with `npm run analyze` after Phase 1.
- **Mobile touch interaction for comparison view:** No research was done on touch gesture libraries for the comparison slider. May need a spike in Phase 4.
- **Design token synchronization:** CSS easing values in `globals.css` and JS easing values in `lib/animations/easings.ts` must be kept in sync manually. Consider a build-time token generation step if team grows.

## Sources

### Primary (HIGH confidence)
- `/grx7/framer-motion` (Context7) — Animation patterns, `useScroll`, `useInView`, `useReducedMotion`
- `/rombohq/tailwindcss-motion` (Context7) — Tailwind v4 animation plugin compatibility
- [Framer Motion Docs](https://www.framer.com/motion/) — React 19 compatibility, performance best practices
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs/v4-beta) — Responsive utilities, custom animations, `@theme` configuration
- [Base UI Docs](https://base-ui.com/) — Accessibility primitives, focus management
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/) — Accessibility requirements
- [web.dev Core Web Vitals](https://web.dev/articles/vitals) — LCP, INP, CLS measurement and thresholds

### Secondary (MEDIUM confidence)
- [Linear.app](https://linear.app) — Purposeful animation philosophy, SaaS UX benchmarks
- [Vercel Design System](https://vercel.com/design) — SaaS UX patterns, responsive strategies
- [Material Design Motion](https://m3.material.io/styles/motion/overview) — Motion guidelines
- Project codebase analysis — 166 Framer Motion references, existing UI component inventory, v6.0 performance optimizations, v9.0 gallery features

### Tertiary (LOW confidence)
- [Figma](https://figma.com) — Design tool UX patterns (limited relevance to SaaS app)
- [Canva](https://canva.com) — Mass-market UX approach (less relevant to B2B SaaS)

---
*Research completed: 2026-05-28*  
*Ready for roadmap: yes*
