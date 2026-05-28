# Architecture Research: UI Refinement, Micro-animations & Responsive Design

**Domain:** Frontend UX Layer (v10.0 Refinamento de Interface)
**Researched:** 2026-05-28
**Confidence:** HIGH

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Presentation Layer (UI)                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │   Layout     │  │  Components  │  │  Animations  │  │ States  │ │
│  │  AppShell    │  │  shadcn/ui+  │  │   Framer     │  │Skeleton │ │
│  │  Sidebar     │  │  Custom      │  │   Motion     │  │ Empty   │ │
│  │  TopBar      │  │  Cards/Forms │  │   CSS        │  │ Error   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬────┘ │
│         │                 │                 │               │       │
├─────────┴─────────────────┴─────────────────┴───────────────┴───────┤
│                     State & Configuration Layer                      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │   Zustand Store  │  │  Tailwind Theme  │  │  CSS Variables   │  │
│  │  UI-only state   │  │  v4 + Custom     │  │  Design Tokens   │  │
│  │  sidebar/toasts  │  │  theme inline    │  │  colors/easing   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                     Framework Layer (Next.js)                        │
├─────────────────────────────────────────────────────────────────────┤
│  App Router │ Server Components │ Client Components │ i18n (next-intl)│
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Current Implementation |
|-----------|----------------|------------------------|
| `AppShell` | Layout orchestration: sidebar, topbar, main content area, mobile nav | Client component with Zustand integration for sidebar state |
| `Sidebar` | Desktop navigation rail, mobile bottom nav | Fixed left aside, hidden on mobile (`md:flex`) |
| `TopBar` | Header with notifications, user menu, page title | Client component with Framer Motion for notification panel |
| `Card/DerivationCard` | Content containers, gallery items | Custom components with hover states and status overlays |
| `Button` (shadcn) | Interactive actions | `@base-ui/react` primitive with CVA variants |
| `Dialog` (shadcn) | Modal overlays | `@base-ui/react` with Framer Motion enter/exit animations |
| `Skeleton` | Loading placeholders | Basic `animate-pulse` on muted background |
| `EmptyState` | Empty/error content states | Custom component with icon, copy, and action |
| `A11yProvider` | Accessibility auditing | axe-core integration in development only |

---

## Recommended Project Structure

```
src/
├── app/                          # Next.js App Router (unchanged)
│   ├── (dashboard)/              # Dashboard route group
│   ├── (public)/                 # Public pages
│   ├── api/                      # API routes
│   ├── layout.tsx                # Root layout with providers
│   └── globals.css               # Design tokens + keyframes
├── components/
│   ├── ui/                       # shadcn/ui components (base)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── skeleton.tsx
│   │   └── ...
│   ├── layout/                   # Shell components
│   │   ├── AppShell.tsx          # ← enhance responsive transitions
│   │   ├── Sidebar.tsx           # ← add mobile drawer behavior
│   │   ├── TopBar.tsx            # ← already uses Framer Motion
│   │   └── Footer.tsx
│   ├── animations/               # NEW: reusable animation primitives
│   │   ├── FadeIn.tsx            # Staggered fade-in wrapper
│   │   ├── SlideIn.tsx           # Directional slide wrapper
│   │   ├── ScaleIn.tsx           # Scale entrance for modals/cards
│   │   ├── Shimmer.tsx           # Skeleton shimmer overlay
│   │   └── StaggerContainer.tsx  # Parent for staggered children
│   ├── responsive/               # NEW: responsive layout utilities
│   │   ├── MobileDrawer.tsx      # Slide-out drawer for mobile nav
│   │   ├── ResponsiveGrid.tsx    # Adaptive grid with breakpoints
│   │   └── CollapsibleSection.tsx# Accordion for mobile forms
│   └── features/                 # Domain components (existing)
│       ├── campaigns/
│       ├── workspace/
│       └── dashboard/
├── lib/
│   ├── utils.ts                  # cn() and helpers
│   ├── store.ts                  # Zustand UI state
│   ├── animations/               # NEW: animation configuration
│   │   ├── variants.ts           # Framer Motion variant presets
│   │   ├── easings.ts            # Custom easing definitions
│   │   └── transitions.ts        # Reusable transition configs
│   └── hooks/                    # Custom hooks
│       ├── use-reduced-motion.ts # NEW: respect prefers-reduced-motion
│       ├── use-mobile.ts         # NEW: breakpoint detection
│       └── use-stagger.ts        # NEW: stagger animation helper
└── hooks/                        # (shadcn convention — keep or merge)
```

### Structure Rationale

- **`components/animations/`:** Isolates reusable Framer Motion wrappers. Prevents inline motion props duplication across 50+ components. Each wrapper handles `prefers-reduced-motion` gracefully.
- **`components/responsive/`:** Dedicated responsive primitives. Mobile drawer for sidebar, collapsible sections for forms, adaptive grids for gallery. Keeps responsive logic out of feature components.
- **`lib/animations/`:** Centralized animation configuration. Single source of truth for easing curves, durations, and variant presets. Matches existing design token approach in `globals.css`.
- **`lib/hooks/use-reduced-motion.ts`:** Essential hook for v10.0 accessibility requirement. Already partially supported via CSS `@media (prefers-reduced-motion: reduce)` but needs JS integration for Framer Motion.

---

## Architectural Patterns

### Pattern 1: CSS-First Micro-animations (Progressive Enhancement)

**What:** Use Tailwind/CSS transitions for simple interactions (hover, focus, active states). Reserve Framer Motion for complex sequences (page transitions, modal enter/exit, staggered lists).

**When to use:** Button hovers, input focus rings, card hover lifts, link underlines, simple opacity/transform changes.

**Trade-offs:**
- **Pros:** Zero JS bundle cost, GPU-composited, works without JS, respects `prefers-reduced-motion` automatically.
- **Cons:** Cannot do spring physics, sequenced animations, or layout animations.

**Example:**
```css
/* globals.css — already exists, extend */
@layer utilities {
  .hover-lift {
    @apply transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)];
  }
  .hover-lift:hover {
    @apply -translate-y-0.5 shadow-lg;
  }
  .focus-ring {
    @apply focus-visible:ring-2 focus-visible:ring-[var(--accent-mint)] 
           focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--deep-bg)]
           focus-visible:outline-none transition-shadow duration-200;
  }
}
```

### Pattern 2: Framer Motion Variant System (Complex Sequences)

**What:** Define reusable animation variants in a central config. Compose them in components via `motion` components and `AnimatePresence`.

**When to use:** Page transitions, modal/dialog enter+exit, notification toasts, gallery item entrance, sidebar collapse/expand, onboarding tour steps.

**Trade-offs:**
- **Pros:** Spring physics, stagger children, exit animations, layout animations, AnimatePresence for mount/unmount.
- **Cons:** Adds ~25-40KB gzipped if tree-shaken poorly. Must gate behind `useReducedMotion` hook.

**Example:**
```typescript
// lib/animations/variants.ts
export const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.25, ease: [0.19, 1, 0.22, 1] }
  },
  exit: { opacity: 0, y: 8, transition: { duration: 0.15 } }
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } }
};
```

### Pattern 3: Responsive Layout Strategy (Mobile-First)

**What:** Use Tailwind's mobile-first breakpoint system (`sm:`, `md:`, `lg:`). Replace conditional rendering with CSS visibility where possible. Use `useMobile` hook only when logic truly differs (e.g., sidebar drawer vs. rail).

**When to use:** Gallery grids, form layouts, navigation patterns, modal sizes, typography scaling.

**Trade-offs:**
- **Pros:** Single component tree, no hydration mismatch, works with SSR, simpler testing.
- **Cons:** Must ship all breakpoint CSS (mitigated by Tailwind v4's CSS-first approach).

**Example:**
```tsx
// Gallery grid — responsive columns
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
  {items.map((item, i) => (
    <motion.div
      key={item.id}
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      custom={i}
    >
      <DerivationCard {...item} />
    </motion.div>
  ))}
</div>
```

### Pattern 4: Skeleton Shimmer Loading State

**What:** Enhance existing `Skeleton` component with a shimmer gradient animation. Use CSS `background-size` and `translate` for performance.

**When to use:** Initial page load, data fetching states, card/grid placeholders, modal content loading.

**Trade-offs:**
- **Pros:** Visual feedback during loading, perceived performance improvement, reusable across all features.
- **Cons:** Must match final layout dimensions to avoid layout shift.

**Example:**
```tsx
// components/animations/Shimmer.tsx
export function Shimmer({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}
```

---

## Data Flow

### Animation State Flow

```
[User Interaction] (hover, click, scroll, route change)
    ↓
[Component Event Handler]
    ↓
[Framer Motion Variant] ──→ [useReducedMotion gate?] ──→ [CSS Transition]
    ↓                                                      (simple states)
[Animated DOM Element]
    ↓
[Visual Feedback to User]
```

### Responsive State Flow

```
[Viewport Resize]
    ↓
[CSS Media Queries] ──→ [Tailwind breakpoint classes applied]
    ↓
[useMobile Hook] ──→ [JS logic branch if needed]
    ↓
[Component renders adapted layout]
```

### Key Data Flows

1. **Page Transition Animation:** Route change → `AnimatePresence` in layout → exit variant on current page → enter variant on new page. *Note: Next.js App Router does not support `AnimatePresence` for page transitions natively; use template or custom transition wrapper.*

2. **Gallery Item Entrance:** Data loaded → `staggerContainer` parent → `fadeInUp` per card with `index * 80ms` delay. Already partially implemented in `DerivationCard` via inline `animationDelay`.

3. **Modal Open/Close:** Trigger click → state change → `AnimatePresence` mounts `DialogContent` with `scaleIn` variant → backdrop fades in. Already exists in `dialog.tsx`.

4. **Mobile Sidebar Drawer:** Mobile breakpoint → hamburger button → `MobileDrawer` slides in from left with overlay → touch swipe to dismiss.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (single dev) | Co-locate animation variants in `lib/animations/`. Use Framer Motion freely. No abstraction needed yet. |
| Team growth (3-5 devs) | Extract animation system to package or stricter directory conventions. Add Storybook for animation documentation. |
| Design system maturity | Move to design tokens JSON consumed by both Tailwind and Framer Motion. Consider motion design system (like @react-spring/web if bundle is concern). |

### Scaling Priorities

1. **First bottleneck:** Framer Motion bundle size if importing full library. *Fix:* Use tree-shaken imports (`import { motion } from 'framer-motion'` is already tree-shakeable in v12). Monitor with `npm run analyze`.

2. **Second bottleneck:** Animation jank on low-end mobile. *Fix:* Use `will-change` sparingly, prefer `transform` and `opacity`, implement `useReducedMotion` to disable heavy effects on battery saver.

---

## Anti-Patterns

### Anti-Pattern 1: Inline Animation Logic Duplication

**What people do:** Copy-paste `initial={{ opacity: 0 }} animate={{ opacity: 1 }}` across 20+ components.

**Why it's wrong:** Inconsistent timing/easing. Hard to maintain. No reduced-motion gating.

**Do this instead:** Use centralized variants in `lib/animations/variants.ts`. Import and reference by name.

### Anti-Pattern 2: JS-Only Responsive Logic

**What people do:** `const isMobile = useMobile(); return isMobile ? <MobileLayout /> : <DesktopLayout />`

**Why it's wrong:** Hydration mismatch risk in Next.js App Router. Double component tree. Flash of wrong layout.

**Do this instead:** CSS-first with Tailwind (`md:hidden`, `hidden md:block`). Use JS hook only for behavior differences (drawer vs. rail), not layout structure.

### Anti-Pattern 3: Animating Layout Properties

**What people do:** Animate `width`, `height`, `top`, `left` directly.

**Why it's wrong:** Triggers layout recalculation (CPU-intensive). Janky on mobile.

**Do this instead:** Animate `transform: scale/translate` and `opacity`. Use Framer Motion's `layout` prop for layout animations if needed.

### Anti-Pattern 4: Ignoring Reduced Motion

**What people do:** All animations run regardless of user preference.

**Why it's wrong:** Accessibility violation (WCAG 2.2.2). Can cause vestibular disorders.

**Do this instead:** CSS already has `@media (prefers-reduced-motion: reduce)`. For JS animations, implement `useReducedMotion` hook and gate Framer Motion animations.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Framer Motion | npm package, tree-shaken imports | Already installed v12.38.0. Use motion components, AnimatePresence, useReducedMotion. |
| Tailwind CSS v4 | CSS-first configuration in `globals.css` | Uses `@theme inline` for design tokens. No `tailwind.config.js` file. |
| shadcn/ui + @base-ui/react | Component primitives | Dialog, Button, DropdownMenu already have base. Enhance with motion wrappers. |
| axe-core/react | Dev-only accessibility auditing | Already in `A11yProvider`. Will catch animation-related a11y issues. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `components/ui/` ↔ `components/animations/` | Composition | Animation wrappers wrap shadcn components. No modification to shadcn internals needed. |
| `components/layout/` ↔ `lib/animations/` | Import | Layout components import variant presets. Centralized config ensures consistency. |
| `lib/store.ts` ↔ `components/responsive/` | Subscribe | Zustand sidebar state drives `MobileDrawer` open/close. Add `mobileDrawerOpen` to store if needed. |
| `app/globals.css` ↔ `lib/animations/` | Dual source | CSS keyframes for simple animations, JS variants for complex. Keep easing values in sync manually or via shared tokens. |

---

## Build Order (Suggested)

### Phase 1: Foundation (Week 1)
1. **Animation utilities:** Create `lib/animations/variants.ts`, `lib/animations/easings.ts`, `lib/hooks/use-reduced-motion.ts`
2. **Responsive hooks:** Create `lib/hooks/use-mobile.ts`
3. **Animation primitives:** Create `components/animations/FadeIn.tsx`, `StaggerContainer.tsx`
4. **Audit:** Run `npm run analyze` to establish bundle baseline

### Phase 2: Core Components Polish (Week 1-2)
1. **Button enhancements:** Focus ring, active scale, loading spinner animation
2. **Card enhancements:** Hover lift, image scale, status badge pulse
3. **Input enhancements:** Focus transition, validation shake animation
4. **Skeleton enhancements:** Shimmer effect in `components/animations/Shimmer.tsx`

### Phase 3: Layout Responsive + Animations (Week 2)
1. **Sidebar:** Mobile drawer with slide animation, overlay backdrop
2. **AppShell:** Page transition wrapper, smooth sidebar collapse
3. **TopBar:** Scroll behavior (hide/show on scroll)
4. **Footer:** Mobile-safe padding (already partially done with `pb-20 md:pb-0`)

### Phase 4: Feature Components (Week 3)
1. **Campaign gallery:** Responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`)
2. **Derivation cards:** Stagger entrance, hover polish
3. **Forms:** Collapsible sections for mobile, field animations
4. **Modals:** Enhanced enter/exit with scale + fade

### Phase 5: States & Accessibility (Week 3-4)
1. **Empty states:** Add contextual illustrations (Lottie or SVG)
2. **Error states:** Shake animation, error message fade-in
3. **Focus states:** Keyboard navigation ring on all interactive elements
4. **Reduced motion:** Full audit, gate all Framer Motion behind hook
5. **Testing:** Verify `npm run test`, `npm run lint`, `npm run build` pass

---

## Sources

- [Framer Motion Documentation](https://www.framer.com/motion/)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs/v4-beta)
- [Next.js App Router](https://nextjs.org/docs/app)
- [WCAG 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide)
- [prefers-reduced-motion MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- Existing codebase: `app/src/components/`, `app/src/lib/`, `app/src/app/globals.css`

---
*Architecture research for: ADScale v10.0 UI Refinement*
*Researched: 2026-05-28*
