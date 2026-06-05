---
target: "ArtVariationConfigModal (default: recent workspace derivation UI)"
total_score: 25
p0_count: 0
p1_count: 1
p2_count: 2
timestamp: 2026-06-01T21-08-47Z
slug: c-components-workspace-artvariationconfigmodal-tsx
---
# Critique: ArtVariationConfigModal

**Target:** `app/src/components/workspace/ArtVariationConfigModal.tsx`  
**Context:** Product register · derivation flow (`DerivarModal` → art config → generate)  
**Date:** 2026-06-01

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Auto-art shows a small spinner for CTA fetch only; creative grid stays interactive; analysis failure is silent |
| 2 | Match System / Real World | 3 | Briefing vocabulary and contract copy fit marketers; "extreme" still needs mental mapping |
| 3 | User Control and Freedom | 3 | Back, Cancel, overlay close, Esc; redundant Cancel vs close |
| 4 | Consistency and Standards | 3 | Mirrors `FormatAdaptationConfigModal` shell; shadcn Dialog |
| 5 | Error Prevention | 2 | Confirm disabled without CTA, but three fields with no required/optional affordance |
| 6 | Recognition Rather Than Recall | 3 | Pre-fills campaign level/CTAs; auto mode overwrites after load without highlighting changes |
| 7 | Flexibility and Efficiency | 2 | No keyboard selection for creative level; two-step modal chain for power users |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained tokens; 2×2 grid is dense on narrow modal |
| 9 | Error Recovery | 1 | `analyze()` errors fall back quietly with no user-facing message |
| 10 | Help and Documentation | 3 | `ctaHelpArt` + per-level contract strings |
| **Total** | | **25/40** | **Needs improvement** |

## Anti-Patterns Verdict

**LLM assessment:** Does not read as generic AI slop. Uses CSS variables, familiar dialog chrome, and domain-specific copy. Minor tropes: `Sparkles` on primary confirm, 2×2 selectable tiles (common but acceptable for a single-choice control). No gradient text, side stripes, or hero metrics. Modal stacking is a product-pattern concern, not an aesthetic tell.

**Deterministic scan:** Unavailable (`detect.mjs`: bundled detector not found). No automated rule hits.

**Browser visualization:** Skipped. Surface lives behind authenticated campaign workspace; no stable public URL to open the modal without session. Fallback: source + flow review only.

## Overall Impression

The modal is a competent configuration gate: creative level + CTAs before generation, with a clear split between manual and auto copy. The biggest gap is **trust under failure and load** (auto suggestions): users cannot tell whether AI prep failed, is still running, or changed their inputs.

## What's Working

1. **Intent-specific copy** (`manualArt` vs `autoArt` titles/descriptions) sets expectations before editing.
2. **Contract lines under each creative level** connect slider labels to brand-fidelity outcomes (aligns with PRODUCT principle on brand fidelity).
3. **Confirm gating** (`canConfirm` + disabled state + tests) prevents empty CTA submits.

## Priority Issues

### [P1] Silent failure when auto suggestions cannot load
- **What:** `use-art-variation-suggestions.ts` catches analysis errors and resets to defaults with no inline alert or toast.
- **Why it matters:** Users think AI reviewed their creative when it did not; wrong level/CTAs ship to generation.
- **Fix:** Inline `role="alert"` banner on failure with retry; distinguish "using campaign defaults" vs "AI suggestions applied."
- **Suggested command:** `impeccable harden ArtVariationConfigModal`

### [P2] Weak status during auto_art loading
- **What:** Only CTA section shows spinner; creative level grid remains fully interactive; no skeleton or disabled state on the form.
- **Why it matters:** Users edit fields that get overwritten when analysis completes (perceived loss of control).
- **Fix:** Disable or skeleton the whole form until `isLoadingSuggestions` clears; on success, briefly highlight fields that changed.
- **Suggested command:** `impeccable polish ArtVariationConfigModal`

### [P2] Three CTA inputs, one requirement, unclear affordance
- **What:** Help text says "at least one CTA" but three identical inputs look equally required.
- **Why it matters:** Jordan persona hesitates; extra fields add friction without guidance.
- **Fix:** Label "CTA 1 (required)" and "CTA 2–3 (optional)" or collapse optional behind "Add another CTA."
- **Suggested command:** `impeccable clarify ArtVariationConfigModal`

### [P3] Creative level grid lacks accessible selection semantics
- **What:** Plain `<button>` tiles without `aria-pressed` / radiogroup pattern.
- **Why it matters:** Screen reader users cannot hear which level is selected; keyboard users get no roving tabindex.
- **Fix:** `role="radiogroup"` + `role="radio"` + `aria-checked`, arrow-key navigation.
- **Suggested command:** `impeccable audit ArtVariationConfigModal`

### [P3] Footer action redundancy on mobile
- **What:** Back, Cancel, and X close compete; `flex-col-reverse` stacks three actions.
- **Why it matters:** Alex loses time; Jordan wonders which escape is "correct."
- **Fix:** Drop Cancel when X exists, or rename Back to "Choose another method" only.
- **Suggested command:** `impeccable distill ArtVariationConfigModal`

## Persona Red Flags

**Alex (Power User):** Second modal after `DerivarModal` adds a mandatory stop. No arrow-key level switching. Cancel + Back + close is three exits. Auto path may overwrite edits without a diff.

**Jordan (First-Timer):** Four creative levels with multi-line contracts in a small modal is a high-stakes choice without preview. "Conservative" vs "extreme" needs an example thumbnail, not only text. Auto mode spinner easy to miss if user focuses on the grid first.

**Sam (Marketing lead, project-specific):** Brand fidelity is the buying reason; failure to surface analysis errors undermines confidence before spend on credits/generation.

## Minor Observations

- `sm:max-w-lg` with four tall tiles may scroll on short viewports; consider vertical list on mobile.
- `Palette` icon in title is decorative but fine for product register.
- Hook uses setState during render for session reset (implementation smell; may cause flicker).

## Questions to Consider

- Could creative level be a compact segmented control with expandable "what this means" instead of four mini-cards?
- Should auto_art skip the modal when analysis succeeds and only open on ambiguity?
- What would "expert fast" feel like: one screen with level + single CTA + advanced disclosure?
