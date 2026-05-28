# Pitfalls Research

**Domain:** UI Refinement, Micro-animations & Responsive Design (Adding to Existing React/Next.js App)
**Researched:** 2026-05-28
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Bundle Size Inflation from Animation Libraries

**What goes wrong:**
Adding Framer Motion, GSAP, or heavy animation libraries can reverse the ~18% bundle reduction achieved in v6.0 (2.9MB → 2.39MB). A single animation library can add 100-300KB gzipped.

**Why it happens:**
- Developers reach for full-featured animation libraries without checking tree-shaking
- Importing entire library instead of specific modules
- Adding multiple animation libraries (Framer Motion + GSAP + Lottie)
- Not measuring bundle impact before/after

**How to avoid:**
- Prefer CSS transitions/animations for simple hover states, opacity fades, transforms
- Use native CSS `animate` and Tailwind `transition-*` utilities first
- If library needed: import only what you use (`import { motion } from 'framer-motion'` not `import * as motion from 'framer-motion'`)
- Measure with `npm run analyze` or `@next/bundle-analyzer` after adding any animation dependency
- Set a budget: animation code must not increase total chunks by >50KB gzipped

**Warning signs:**
- `npm run build` shows chunk sizes increasing >5%
- Lighthouse performance score drops below 90
- Vercel deployment shows "Large Page Data" warnings

**Phase to address:**
UI-02 (Micro-animations) — evaluate animation approach during planning, before implementation

---

### Pitfall 2: Animations Breaking Layout Stability (CLS)

**What goes wrong:**
Animations that change height, width, top, left, or margin cause Cumulative Layout Shift (CLS). With galleries and image-heavy pages, this is especially visible when cards expand, filters slide in, or modals animate.

**Why it happens:**
- Using `transition: all` which includes layout properties
- Animating `height: 0 → auto` for accordion/collapsible content
- Modals that fade in without reserving space
- Gallery items that expand on hover and push siblings

**How to avoid:**
- Only animate `transform` and `opacity` — they don't trigger layout recalculation
- For height animations: use `transform: scaleY()` with `transform-origin: top` or use the CSS `grid-template-rows` trick
- Reserve modal space with fixed positioning or overlay, don't push content
- For gallery hover effects: use `transform: scale()` on the image itself, never on the container
- Always specify `aspect-ratio` on image containers (already done for OptimizedImage)

**Warning signs:**
- Content visibly shifts/jumps during animation
- Lighthouse CLS score > 0.1
- Users report "elements moving under my cursor"

**Phase to address:**
UI-02 (Micro-animations) + UI-03 (Responsive) — test every animation for layout shift

---

### Pitfall 3: Responsive Design Breaking Existing Component Contracts

**What goes wrong:**
Adding responsive breakpoints (`md:`, `lg:`) to existing components can break their internal layouts, especially for complex components like the derivation gallery, comparison view, and canvas annotations.

**Why it happens:**
- Existing components weren't built with responsiveness in mind
- Adding responsive classes without understanding internal flex/grid structures
- Sidebar → hamburger menu transition breaks layout calculations
- Canvas annotation coordinates assume fixed viewport size
- Comparison view with synchronized zoom/pan breaks on mobile

**How to avoid:**
- Audit existing components for fixed widths, absolute positioning, hardcoded breakpoints
- Create mobile-first responsive wrappers rather than modifying component internals
- For canvas/annotation features: implement coordinate scaling (not just CSS scaling)
- Test gallery filters, batch actions, and comparison views at 320px, 768px, 1024px
- Use container queries (`@container`) for component-level responsiveness instead of media queries where possible

**Warning signs:**
- Horizontal scrollbars appearing on mobile
- Canvas annotations in wrong positions on tablet
- Gallery grid becomes single column with oversized images
- Comparison slider handle becomes unusable on touch devices

**Phase to address:**
UI-03 (Responsive) — requires dedicated responsive audit before implementation

---

### Pitfall 4: Micro-animations Causing INP Regression

**What goes wrong:**
Smooth animations feel great on desktop but make the app feel sluggish on mobile or low-end devices. INP (Interaction to Next Paint) degrades when animations block the main thread.

**Why it happens:**
- Animating many elements simultaneously (gallery items all animating on filter change)
- Using `requestAnimationFrame` loops without cleanup
- Complex spring physics calculations in JavaScript
- Forcing layout reads during animation (`getBoundingClientRect`)
- Not using `will-change` strategically (or using it everywhere)

**How to avoid:**
- Use CSS `transition` for state changes (hover, focus, active) — they run on compositor thread
- Limit simultaneous animations: max 5-10 elements at once
- Use `will-change: transform` only on elements actively animating, remove after
- For filter transitions: use `content-visibility: auto` on off-screen items
- Prefer `transform` over animating `left/top/width/height`
- Test on actual mobile devices, not just Chrome DevTools mobile view

**Warning signs:**
- Button clicks feel delayed on mobile
- Gallery filter changes take >200ms to respond
- Frame drops visible in DevTools Performance panel
- INP score > 200ms in field data

**Phase to address:**
UI-02 (Micro-animations) — performance budget for animations during implementation

---

### Pitfall 5: Accessibility Regression from Animations

**What goes wrong:**
Adding animations without respecting `prefers-reduced-motion` can make the app unusable for users with vestibular disorders. Focus states and keyboard navigation get lost in visual polish.

**Why it happens:**
- Developers forget to wrap animations in `@media (prefers-reduced-motion: reduce)` checks
- Custom focus rings removed during "visual refinement" without replacement
- Keyboard traps created in modals with animated entrance
- Screen reader announcements not synchronized with animated state changes

**How to avoid:**
- Create a `useReducedMotion()` hook (or use Framer Motion's built-in)
- For CSS: wrap animation rules in `@media (prefers-reduced-motion: no-preference)`
- Always preserve visible focus indicators (Tailwind `focus-visible:ring-2`)
- Test keyboard navigation through all animated flows (tab order, escape to close modals)
- Use `aria-live` regions for state changes that are communicated visually via animation
- Respect `prefers-reduced-motion` for: page transitions, loading spinners, hover effects, auto-playing carousels

**Warning signs:**
- No focus indicator visible on animated buttons
- Screen reader doesn't announce filter changes
- Users report dizziness/motion sickness
- axe-core accessibility tests failing after UI changes

**Phase to address:**
UI-07 (Focus states & a11y) + UI-02 (Micro-animations) — bake in from start

---

### Pitfall 6: Responsive Design Fragmenting Test Suite

**What goes wrong:**
Adding responsive behavior causes existing tests to fail because they assume desktop viewport. The 448 tests that are green must stay green.

**Why it happens:**
- Jest/Vitest tests using `window.innerWidth` or media query mocks that don't match new breakpoints
- Playwright/E2E tests clicking elements that are hidden on mobile
- Component tests assuming sidebar is always visible
- Snapshot tests failing due to responsive class order changes

**How to avoid:**
- Add responsive test matrix: run critical tests at 375px, 768px, 1440px
- Use `data-testid` attributes that persist across responsive states
- For E2E: test mobile paths separately (hamburger menu navigation, bottom sheets)
- Update test utilities to set viewport size before rendering
- Run full test suite after every responsive change: `npm test`
- Add specific tests for responsive behavior rather than modifying existing tests

**Warning signs:**
- Tests pass locally but fail in CI (headless vs headed browser differences)
- Snapshot tests requiring mass updates
- Tests timing out waiting for elements hidden on mobile

**Phase to address:**
All UI phases — continuous testing during implementation

---

### Pitfall 7: Shimmer/Skeleton Loading Increasing Perceived Load Time

**What goes wrong:**
Adding shimmer effects and animated skeletons can actually make the app feel slower if they persist too long or replace content that was loading quickly before.

**Why it happens:**
- Skeletons shown for content that loads <200ms (worse than instant render)
- Shimmer animations using `background-position` animation (GPU-unfriendly)
- Skeleton structure doesn't match final content, causing layout shift when real content arrives
- Multiple nested skeletons creating "skeleton waterfall"

**How to avoid:**
- Only show skeleton if data takes >300ms to load (use `useDeferredValue` or timeout)
- Use CSS `background: linear-gradient(...)` with `animation` for shimmer, not JS
- Match skeleton dimensions exactly to final content (same height, padding, margins)
- Reuse existing `VirtualList` loading placeholders, just style them
- Add `min-h` to skeleton containers to prevent collapse

**Warning signs:**
- "Flash of skeleton" on fast connections
- Content "snapping in" when skeleton disappears
- Performance tab showing continuous paint operations from shimmer

**Phase to address:**
UI-08 (Skeleton loading) — measure before/after perceived performance

---

### Pitfall 8: Over-Engineering "Polish" Components

**What goes wrong:**
Spending too much time on reusable "polish" components (ButtonV2, CardV2) that replace shadcn/ui components but introduce inconsistency and maintenance burden.

**Why it happens:**
- Desire for "pixel-perfect" overrides leads to forking shadcn components
- Creating parallel component hierarchies instead of extending existing ones
- Each new component needs its own tests, documentation, Storybook entry
- Overrides not applied consistently across all usages

**How to avoid:**
- Extend shadcn/ui components via `className` and `cn()` utility, don't fork
- Create theme tokens in Tailwind config (`colors`, `borderRadius`, `shadows`) rather than new components
- For common overrides (e.g., all cards need new shadow), use Tailwind plugin or global CSS
- If new component needed: ensure it replaces >3 existing usages or is used >5 times
- Keep shadcn/ui upgrade path open — don't modify `components/ui/*` internals

**Warning signs:**
- Multiple Button components (`Button`, `ButtonNew`, `PolishedButton`)
- shadcn/ui components diverging from upstream
- CSS specificity wars between old and new styles

**Phase to address:**
UI-04 (Component polish) — establish extension patterns first

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Add Framer Motion for all animations | Fast to implement | +100-300KB bundle, main thread blocking | Only for complex orchestrated sequences, never for simple hovers |
| Use `!important` to override shadcn styles | Fixes visual issue quickly | Unmaintainable specificity, breaks on update | Never — use `cn()` utility properly |
| Skip mobile breakpoint for complex feature | Ships faster | Users can't use gallery/canvas on mobile | Never — all features must work on mobile |
| Inline animation keyframes in components | No new CSS files | Duplication, inconsistent timing, hard to maintain | Only for one-off demo animations |
| Remove existing tests that fail on responsive | Gets CI green | Blind spots in test coverage | Never — fix tests, don't delete |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tailwind + shadcn/ui | Adding custom classes that conflict with `cn()` merges | Use `cn()` utility, add utilities to `tailwind.config.ts` |
| next-intl (i18n) | Animating text that changes language mid-animation | Wait for locale switch to complete before animating |
| TanStack Query | Adding loading spinners that replace cached content | Show stale data + subtle loading indicator, not skeleton |
| VirtualList | Adding margins/padding that break virtualized height calculations | Use `gap` or container padding, never margin on virtualized items |
| Canvas annotations | Not scaling annotation coordinates on responsive resize | Store normalized coordinates (0-1), scale to viewport |
| R2 images | Responsive images without `sizes` attribute | Use Next.js `<Image>` with `sizes` for responsive srcset |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Animate `filter: blur()` on scroll | Janky scrolling, frame drops | Use `opacity` + pre-blurred image, or `will-change: filter` sparingly | >20 gallery items with blur hover |
| Resize observer on every animated element | High memory, slow resize | Debounce resize handlers, use CSS container queries | >50 observed elements |
| Spring physics on mobile | Battery drain, warm devices | Use CSS `cubic-bezier` transitions, reduce spring mass on mobile | All mobile users |
| Hover effects on touch devices | "Sticky" hover states after tap | Use `@media (hover: hover)` to gate hover-only animations | All mobile/tablet users |
| `motion.div` for every list item | React reconciliation overhead | Batch list animations, use `AnimatePresence` mode="popLayout" | Lists >20 items |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing animation library internals via props | XSS if user input reaches animation config | Sanitize all dynamic animation values |
| Inline styles from user data for animations | Style injection | Use CSS classes, never `style={{...userInput}}` |
| Logging animation performance metrics | Potential data leakage | Strip user-identifiable info from performance logs |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Animation duration >300ms for micro-interactions | Feels sluggish | Keep micro-interactions at 150-200ms |
| No animation for important state changes | Disorienting | Add subtle transitions for: route changes, modal open/close, filter apply |
| Parallax/dramatic motion for functional elements | Distracting, can cause motion sickness | Reserve dramatic motion for marketing pages, not SaaS workflows |
| Mobile gestures conflicting with app gestures | Can't swipe to go back, accidental actions | Use `touch-action: pan-y` on horizontal carousels, respect system gestures |
| Responsive breakpoints hiding critical actions | Users can't find export/approve buttons | Use priority+ pattern: collapse less important actions first |
| "Polish" that changes established interaction patterns | Users re-learn app | Maintain interaction patterns, only change visuals |

## "Looks Done But Isn't" Checklist

- [ ] **Responsive sidebar:** Collapses to hamburger but focus trap and escape-to-close work — verify with keyboard
- [ ] **Gallery grid:** Adapts columns but virtualized scroll position resets on resize — verify scroll persistence
- [ ] **Animation polish:** All hover states have `:focus-visible` equivalent — verify keyboard navigation
- [ ] **Skeleton loading:** Shimmer doesn't run on fast loads (<200ms) — verify with throttling
- [ ] **Canvas responsive:** Annotations stay in correct relative positions after resize — verify on tablet rotation
- [ ] **Comparison view:** Slider works with touch and doesn't conflict with pinch-zoom — verify on actual mobile
- [ ] **Empty states:** Illustrations scale correctly and text wraps without truncation — verify at 320px
- [ ] **Toast notifications:** Stack correctly on mobile without covering action buttons — verify with multiple toasts
- [ ] **Modal dialogs:** Full-screen on mobile, centered on desktop, scrollable content — verify overflow behavior
- [ ] **Form responsiveness:** Date pickers, dropdowns, multi-select work on mobile — verify touch interaction

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bundle size inflation | MEDIUM | Audit with bundle analyzer, replace library animations with CSS, code-split animation components |
| Layout shift from animations | LOW | Add `transform` animations, reserve space with min-height, fix in 1-2 days |
| Responsive breaking components | HIGH | Revert responsive changes, component-by-component audit, rebuild mobile views |
| INP regression | MEDIUM | Profile with DevTools, reduce simultaneous animations, add `content-visibility` |
| Accessibility regression | LOW | Add `prefers-reduced-motion` checks, restore focus rings, run axe-core |
| Test failures from responsive | LOW-MEDIUM | Add viewport mocking, update selectors, add mobile test paths |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Bundle size inflation | UI-02 planning | `npm run build` chunk size diff, Lighthouse score |
| Layout shift (CLS) | UI-02 implementation | Lighthouse CLS audit, visual regression tests |
| Responsive breaking components | UI-03 planning | Component audit at 3 breakpoints, E2E on mobile |
| INP regression | UI-02 implementation | DevTools Performance, field INP monitoring |
| Accessibility regression | UI-07 + UI-02 | axe-core, keyboard navigation test, screen reader |
| Test fragmentation | All phases | `npm test` after every responsive change |
| Skeleton loading issues | UI-08 implementation | Perceived load time measurement, throttled network |
| Over-engineering components | UI-04 planning | Code review — "does this extend or replace?" |

## Sources

- [Vercel React Best Practices](https://github.com/vercel/react-best-practices) — Bundle optimization, re-render rules
- [web.dev Core Web Vitals](https://web.dev/articles/vitals) — LCP, INP, CLS measurement and thresholds
- [Make Interfaces Feel Better](https://github.com/) — Concentric radius, interruptible animations, scale on press
- [Framer Motion Performance](https://www.framer.com/motion/performance/) — Animation best practices
- [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design) — Mobile-first breakpoints
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) — Accessibility for motion
- [Project context: ADScale v6.0 performance optimizations](.planning/PROJECT.md) — Existing bundle size, VirtualList, code splitting
- [Project context: ADScale v9.0 gallery features](.planning/PROJECT.md) — Canvas annotations, comparison view complexity

---
*Pitfalls research for: UI Refinement, Micro-animations & Responsive Design*
*Researched: 2026-05-28*
