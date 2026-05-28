# Phase 38: Feature Components

**Goal:** Adapt feature-specific components to be responsive and animated

**Requirements:** RESP-05, ANIM-02, ANIM-03

**Tasks:**
1. Add stagger animations to campaign grid/list
2. Add stagger animations to derivation gallery
3. Enhance modal/dialog enter/exit animations
4. Add touch swipe gestures to gallery

**Files to modify:**
- `components/campaigns/CampaignsGridView.tsx` - Add stagger
- `components/campaigns/CampaignsListView.tsx` - Add stagger
- `components/workspace/DerivationsStep.tsx` - Add stagger + swipe
- `components/ui/dialog.tsx` - Enhance animations
- `components/animations/FadeIn.tsx` - Add gesture support

**Approach:**
- Use StaggerContainer/StaggerItem from Phase 35
- Use modal variants from Phase 35
- Add swipe gesture handling with onTouchStart/onTouchEnd
