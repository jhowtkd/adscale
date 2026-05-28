# Phase 35: Animation Foundation

**Goal:** Establish shared animation primitives, hooks, and CSS foundations

**Requirements:** ANIM-01, ANIM-04, ANIM-05, A11Y-03, A11Y-04

**Approach:**
1. Create animation config (variants, easings, transitions)
2. Create custom hooks (useReducedMotion, useMediaQuery)
3. Create reusable animation components (FadeIn, StaggerContainer, ShimmerSkeleton)
4. Enhance existing components with smooth transitions
5. Ensure accessibility with reduced motion support

**Files to create/modify:**
- `app/src/lib/animations/variants.ts` - Animation variant presets
- `app/src/lib/animations/easings.ts` - Easing curves
- `app/src/lib/animations/transitions.ts` - Transition presets
- `app/src/lib/hooks/use-reduced-motion.ts` - Reduced motion hook
- `app/src/lib/hooks/use-media-query.ts` - Media query hook
- `app/src/components/animations/FadeIn.tsx` - Fade animation wrapper
- `app/src/components/animations/StaggerContainer.tsx` - Stagger children wrapper
- `app/src/components/ui/skeleton.tsx` - Enhanced with shimmer

**Success criteria:**
- All interactive elements have smooth hover/focus transitions
- Skeleton loading displays shimmer effect
- Toast notifications animate smoothly
- Reduced motion preference is respected
