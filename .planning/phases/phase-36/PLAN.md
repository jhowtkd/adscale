# Phase 36: Core Component Polish

**Goal:** Apply animation primitives to most-used components

**Requirements:** COMP-01, COMP-02, COMP-03, COMP-04

**Components to enhance:**
1. **Card** - Hover lift with shadow transition
2. **Button** - Active scale down, loading spinner
3. **Input** - Focus glow transition
4. **Badge** - Smooth status color transition

**Approach:**
- Use CSS transitions where possible (zero JS cost)
- Add Framer Motion only for complex interactions
- Maintain existing component APIs
- Respect reduced motion preference

**Files to modify:**
- `components/ui/card.tsx` - Add hover lift
- `components/ui/button.tsx` - Add active scale
- `components/ui/input.tsx` - Enhance focus transition
- `components/ui/badge.tsx` - Add status transition
