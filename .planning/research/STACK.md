# Stack Research

**Domain:** UI Refinement, Micro-Animations, and Responsive Design for Next.js + React + Tailwind
**Researched:** 2026-05-28
**Confidence:** HIGH

## Executive Summary

The existing stack is **well-equipped** for the v10.0 milestone. **No major new dependencies are required.** The primary work is leveraging existing tools (Framer Motion, Tailwind CSS v4, @base-ui/react) more effectively, plus version bumps and a small set of custom utilities.

## Recommended Stack

### Core Technologies (Already Installed)

| Technology | Current Version | Latest | Purpose | Action Needed |
|------------|----------------|--------|---------|---------------|
| framer-motion | ^12.38.0 | 12.40.0 | Micro-animations, page transitions, gesture interactions, layout animations | **Bump to ^12.40.0** — bug fixes and performance improvements |
| @base-ui/react | ^1.4.1 | 1.5.0 | Accessible UI primitives (Dialog, Tooltip, Focus management) | **Bump to ^1.5.0** — accessibility improvements |
| tailwindcss | ^4 | 4.3.0 | Responsive utilities, custom animations, design tokens | **No bump required** — v4 is current major |
| lucide-react | ^1.11.0 | latest | Icons for empty states, UI elements | Keep current |
| sonner | ^2.0.7 | latest | Toast notifications with animations | Keep current |

### Supporting Libraries (Custom, No Dependencies)

| Utility | Type | Purpose | Implementation |
|---------|------|---------|----------------|
| useMediaQuery | Custom Hook | Responsive conditional rendering (mobile sidebar, grid columns) | 15-line hook using `matchMedia` API |
| useReducedMotion | Custom Hook | Respect `prefers-reduced-motion` for accessibility | Wraps Framer Motion's `useReducedMotion` |
| useScrollDirection | Custom Hook | Show/hide top bar on scroll, sticky header behavior | `scroll` event listener with threshold |
| shimmer animation | Tailwind Custom | Refined skeleton loading beyond basic `animate-pulse` | CSS keyframe via `@theme` or inline `@keyframes` |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| @axe-core/react | Accessibility auditing in dev | Currently in `dependencies` — **move to `devDependencies`** |

## Installation Commands

```bash
# Version bumps
npm install framer-motion@^12.40.0 @base-ui/react@^1.5.0

# Move dev dependency to correct section
npm uninstall @axe-core/react && npm install -D @axe-core/react@^4.11.3

# No new runtime dependencies needed
```

## What's Already Working Well

### Animation Infrastructure
- **Framer Motion** is already used extensively (166+ references across components)
- `AnimatePresence` handles enter/exit animations for modals, toasts, page transitions
- `motion` components provide hover, tap, and drag gestures
- Variants system enables staggered, orchestrated animations

### Responsive Foundation
- **Tailwind CSS v4** provides mobile-first responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`)
- `@container` queries supported for component-level responsive behavior
- `Sheet` component (mobile drawer) already built via `@base-ui/react/dialog`

### Accessibility Primitives
- `@base-ui/react` provides focus trapping, keyboard navigation, ARIA attributes
- `focus-visible` utilities for keyboard focus indicators
- `sr-only` class for screen reader text

### Component Library
- shadcn/ui components: Button, Card, Badge, Input, Dialog, Sheet, Skeleton, Tabs
- `cn()` utility (clsx + tailwind-merge) for conditional class merging
- Design tokens via CSS custom properties

## Integration Points

### Framer Motion + Tailwind CSS v4
- **Use Tailwind** for: simple hover states (`hover:scale-105`), color transitions, opacity fades
- **Use Framer Motion** for: complex sequences (staggered children), layout animations (`layout` prop), gesture-driven interactions (drag, pan), scroll-triggered effects (`useScroll`, `useInView`)
- **Avoid** animating the same property with both — choose one per effect

### Responsive Sidebar Pattern
- Desktop (>1024px): Fixed sidebar with `lg:flex`
- Mobile (<1024px): Hamburger menu triggers `Sheet` component (already built)
- Use `useMediaQuery` hook to conditionally render sidebar vs. sheet trigger

### Skeleton Loading Upgrade
- Current: `animate-pulse` with solid background
- Refined: Custom `shimmer` keyframe with gradient sweep (`bg-gradient-to-r` + `animate-shimmer`)
- Add to Tailwind v4 via `@theme` block or component-level `@keyframes`

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Framer Motion (existing) | GSAP + @gsap/react | Complex timeline sequences, scroll-scrubbed animations (overkill for micro-interactions) |
| Tailwind responsive (existing) | Container Queries primary | When components need to respond to their own width, not viewport (use `@container`) |
| Custom useMediaQuery | react-responsive or @react-hook/media-query | If hook complexity grows beyond 3 breakpoints (avoid adding dependency for simple cases) |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-intersection-observer` | Framer Motion provides `useInView` hook with better React integration | `useInView` from `framer-motion` |
| `tailwindcss-animate` plugin | Built for Tailwind v3 plugin system; v4 uses CSS-native `@theme` and `@keyframes` | Tailwind v4 native `animate-*` utilities + custom `@keyframes` |
| `vaul` | Already have functional `Sheet` component using `@base-ui/react/dialog` | Existing `Sheet` component in `src/components/ui/sheet.tsx` |
| `lenis` smooth scroll | Adds 5-10KB for behavior achievable with `scroll-behavior: smooth` CSS | CSS `html { scroll-behavior: smooth }` + Framer Motion `useScroll` for progress |
| `react-spring` | Framer Motion already installed and is the modern standard for React animations | Existing `framer-motion` |
| Heavy illustration libraries (unDraw, Storyset) | Adds bundle weight for decorative assets | Lucide icons + custom SVGs for empty states |
| `react-device-detect` | SSR-incompatible, causes hydration mismatches | `useMediaQuery` hook with `matchMedia` |

## Stack Patterns by Variant

**If implementing complex scroll-linked animations (e.g., parallax, progress bars):**
- Use Framer Motion `useScroll` + `useTransform`
- Because it updates MotionValues outside React render cycle (60fps without re-renders)

**If implementing reduced-motion support:**
- Use Framer Motion `useReducedMotion` hook
- Wrap animated components to disable/reduce motion when `prefers-reduced-motion: reduce` is set
- Because accessibility compliance (WCAG 2.1) requires this

**If customizing skeleton shimmer:**
- Add custom `@keyframes shimmer` in global CSS or Tailwind v4 `@theme`
- Use `bg-gradient-to-r` with `background-size: 200% 100%` and `animate-[shimmer_2s_infinite]`
- Because Tailwind v4 does not include a built-in shimmer animation

## Version Compatibility

| Package | Compatible With | Notes |
|---------|----------------|-------|
| framer-motion@^12.40.0 | react@^19.2.4 | Verified compatible; React 19 support added in v11+ |
| @base-ui/react@^1.5.0 | react@^19.2.4 | Base UI v1.x targets React 19 |
| tailwindcss@^4 | postcss@8.5.10 | Current override in package.json is correct |

## Specific Recommendations by Requirement

### UI-01: Visual Refinement
- **No new libraries.** Use existing `cn()` utility, CSS custom properties, and Tailwind's spacing scale.
- Audit concentric border radius (outer = inner + padding) per `make-interfaces-feel-better` guidelines.

### UI-02: Micro-Animations
- **Primary tool:** Framer Motion `motion` components with `whileHover`, `whileTap`, `transition` props.
- **Secondary tool:** Tailwind `transition-*` utilities for simple color/opacity changes.
- **Pattern:** Scale on press (`scale: 0.96`), staggered children (`staggerChildren: 0.05`).

### UI-03: Responsiveness
- **Primary tool:** Tailwind responsive prefixes (`md:grid-cols-2`, `lg:flex`).
- **Hook needed:** `useMediaQuery` for conditional rendering (e.g., sidebar vs. bottom nav).
- **Component needed:** Use existing `Sheet` for mobile navigation drawer.

### UI-04: Polished Components
- **No new libraries.** Refine existing shadcn/ui components with:
  - Concentric border radius
  - Layered `box-shadow` instead of solid borders
  - `focus-visible` ring colors

### UI-05: Empty/Error States
- **No new libraries.** Extend existing `EmptyState` component.
- Use Lucide icons (`ImageOff`, `AlertTriangle`, `Inbox`) instead of illustrations.

### UI-06: Scroll Behaviors
- **CSS:** `scroll-behavior: smooth` in global styles.
- **Framer Motion:** `useScroll` for scroll-linked animations (progress bars, fade-ins).
- **Avoid:** External smooth-scroll libraries.

### UI-07: Focus States / Accessibility
- **Tailwind:** `focus-visible:ring-2 focus-visible:ring-offset-2` utilities.
- **@base-ui/react:** Already handles focus trapping in Dialog/Sheet.
- **Hook:** `useReducedMotion` from Framer Motion for motion preferences.

### UI-08: Skeleton Loading / Shimmer
- **Custom animation needed:** Define `@keyframes shimmer` (not built into Tailwind).
- **Refine existing:** Upgrade `Skeleton` component from `animate-pulse` to gradient shimmer.

## Sources

- `/grx7/framer-motion` (Context7) — Animation patterns, `useScroll`, `useInView`, `useReducedMotion`
- `/rombohq/tailwindcss-motion` (Context7) — Tailwind v4 animation plugin compatibility
- [Framer Motion Docs](https://www.framer.com/motion/) — React 19 compatibility verified
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs/v4-beta) — Responsive utilities, custom animations
- [Base UI Docs](https://base-ui.com/) — Accessibility primitives, focus management
- Project codebase analysis — 166 Framer Motion references, existing UI component inventory

---
*Stack research for: ADScale v10.0 — Refinamento de Interface*
*Researched: 2026-05-28*
