# Project Research Summary

**Project:** ADScale v12.2 Refinamento Visual e Consistência da Interface
**Domain:** Product UI consolidation and responsive hardening
**Researched:** 2026-06-12
**Confidence:** HIGH

## Executive Summary

ADScale has a documented product identity and a capable frontend stack, but the authenticated interface accumulated divergent layout recipes, tokens and component vocabularies across many milestones. The audit found 11 authenticated routes, 139 feature component files and more than 250 uses of width, overflow, sticky, fixed or absolute positioning that can interact badly across viewports. The problem is not lack of visual direction; it is inconsistent application of the existing direction.

The recommended approach is consolidation before page polish. Establish one geometry, token, layering and responsive contract; migrate the app shell and shared primitives; then refine route families in dependency order. Compactness must come from clearer hierarchy, predictable density and progressive disclosure, not smaller touch targets or hidden operational context.

The main risks are behavioral regressions disguised as visual cleanup, desktop layouts merely compressed on mobile, z-index escalation, ideal-data-only polishing and an unbounded whole-app scope. Each authenticated route must have one implementation owner and one browser scenario, with validation from mobile through ultrawide in both supported languages and themes where relevant.

## Key Findings

### Recommended Stack

Keep the existing Next.js, React, Tailwind CSS, shadcn/Base UI, Lucide, Framer Motion and CSS custom-property stack. Do not add another UI kit, styling engine, icon family or animation library.

The required stack work is internal consolidation:

- Canonical semantic tokens for canvas, surfaces, text, borders, status, focus and elevation
- Shared geometry tokens for top bar, sidebar, bottom navigation, gutters, content widths and sticky offsets
- Shared responsive primitives for page frames, headers, action groups, dense sections, tables and scroll regions
- One component vocabulary for buttons, controls, badges, panels, overlays and loading/empty/error states
- Bounded motion tokens used only for state transitions and feedback

Detailed evidence: [STACK.md](STACK.md).

### Expected Features

**Must ship:**

- No overlap, clipping, unreachable action or accidental horizontal page scroll on authenticated routes
- Structural layouts for compact mobile, tablet/notebook, desktop and ultrawide ranges
- Consistent page title, subtitle, primary action, secondary action and section hierarchy
- Professional compact density with accessible control sizes and readable content
- Stable shell, navigation and overlay behavior with explicit stacking and sticky contracts
- Unified interaction states: default, hover, focus, active, disabled, loading and error
- Consistent empty, loading and error patterns across route families
- Browser-verified accessibility, localization and responsive regression matrix

**High-value refinements:**

- Reduce nested cards and competing actions
- Use progressive disclosure for secondary metadata and actions
- Consolidate duplicate campaign/dashboard representations
- Improve long-content behavior in tables, galleries, forms and settings tabs
- Preserve expert information density while making the primary task unmistakable

**Explicit exclusions:**

- New product capabilities or backend workflows
- New visual identity, rebrand or marketing-site redesign
- New UI framework, styling engine or icon set
- Decorative animation, broad component rewrites without route evidence or pixel-perfect parity between unrelated surfaces

Detailed evidence: [FEATURES.md](FEATURES.md).

### Architecture Approach

Introduce shared layout contracts before touching route-specific composition. The shell owns viewport geometry and navigation layers. Page primitives own content width, gutters, headers and action wrapping. Feature surfaces own only their internal workflow layout. Overlays use a fixed layer scale and shared dialog/sheet behavior. Responsive changes should be semantic, not a collection of local breakpoint patches.

**Major boundaries:**

1. **Design foundations:** canonical tokens, type/density recipes, layer scale and responsive matrix
2. **App shell:** sidebar, top bar, bottom navigation, viewport offsets and global content frame
3. **Page primitives:** page header, action group, section, dense toolbar, table/scroll container and state surfaces
4. **Core workflow surfaces:** campaigns and campaign workspace, including galleries, panels, action bars and overlays
5. **Secondary surfaces:** dashboard, library, templates/restyling, feedback and settings
6. **Verification harness:** route/state/viewport/language/theme matrix and release evidence

Detailed evidence: [ARCHITECTURE.md](ARCHITECTURE.md).

### Critical Pitfalls

1. **Visual cleanup changes product behavior:** preserve route contracts and run focused tests after each family migration.
2. **Compact becomes cramped:** reduce redundancy and improve hierarchy before reducing spacing or control size.
3. **Mobile becomes hidden desktop:** define structural alternatives for tables, toolbars, navigation and multi-column workflows.
4. **Ultrawide becomes stretched:** set content-width and reading-width contracts while allowing galleries and dense data to use space deliberately.
5. **Z-index becomes an escalation:** define a layer scale for base, sticky content, shell, popover, backdrop, modal/sheet and toast.
6. **Ideal fixtures hide failures:** test long translations, dense data, empty/error/loading states and multiple overlay combinations.
7. **Whole-app scope never closes:** freeze the route inventory, assign every route to one phase and reserve the final phase for milestone-blocking defects only.

Detailed evidence: [PITFALLS.md](PITFALLS.md).

## Implications for Roadmap

### Phase 109: Visual Foundations and Baseline

**Rationale:** Every later route migration depends on shared contracts.

**Delivers:** authenticated route inventory, representative state matrix, canonical tokens, geometry and layer contracts, typography/density recipes, browser baselines and explicit exclusions.

### Phase 110: App Shell and Navigation

**Rationale:** Fixed and sticky global chrome controls the usable geometry of every route.

**Delivers:** responsive sidebar, top bar and mobile navigation; unified viewport offsets; stable global content frame; compact navigation and action behavior.

### Phase 111: Page Primitives and Operational Surfaces

**Rationale:** Shared primitives must exist before high-volume route migration.

**Delivers:** page headers, action groups, sections, toolbars, tables, forms and state surfaces; migration of campaigns list, settings and other dense operational routes.

### Phase 112: Campaign Workspace and Overlays

**Rationale:** The campaign workspace has the highest interaction density and overlay risk.

**Delivers:** responsive workflow hierarchy, galleries, sticky action bars, side panels, dialogs and sheets without overlap or hidden actions.

### Phase 113: Dashboard and Secondary Surface Consistency

**Rationale:** Secondary routes can now reuse proven foundations instead of inventing local patterns.

**Delivers:** dashboard, library, templates/restyling and feedback migration; accessibility, localization, long-content and interaction-state remediation across the app.

### Phase 114: Visual Regression and Release Gate

**Rationale:** Independent verification prevents implementation phases from marking their own visual assumptions as complete.

**Delivers:** browser matrix from mobile through ultrawide, supported-language checks, keyboard/focus and overlay stress tests, automated regression coverage, full test/lint/build gate and UAT evidence.

### Phase Ordering Rationale

- Geometry and tokens precede shell changes because local offsets otherwise continue drifting.
- Shell precedes route migration because every route inherits its usable viewport.
- Shared primitives precede complex workflows to avoid another generation of one-off components.
- Campaign workspace is isolated because it contains the highest density of sticky actions, galleries and overlays.
- The final gate is independent and defect-bounded so the milestone can close.

### Research Flags

- **Phase 109:** verify the final viewport/state matrix against actual authenticated data fixtures before freezing it.
- **Phase 112:** inspect live overlay combinations and campaign states in the browser during planning.
- **Phase 114:** define screenshot tolerance and representative scenarios before implementation completes.

All phases use established frontend patterns; external ecosystem research is not required during phase planning.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against the current dependencies, tokens and component implementation |
| Surface scope | HIGH | Authenticated route and feature-component inventory completed |
| Architecture | HIGH | Shell, width, overflow, sticky and overlay patterns mapped from source |
| Pitfalls | HIGH | Risks tied to concrete code patterns and prior product audits |
| Live severity ranking | MEDIUM | Final ordering within route families requires authenticated browser baselines |

**Overall confidence:** HIGH

### Gaps to Address

- No local app server was running during synthesis; Phase 109 must capture authenticated browser baselines before changing UI code.
- Real long-content and dense-data fixtures must be selected for PT-BR and EN.
- Dark-theme parity should be verified where the theme is user-accessible, without forcing identical visual weight across themes.

## Sources

### Primary

- `PRODUCT.md` and `DESIGN.md`
- `.planning/PROJECT.md`
- `app/src/app/globals.css`
- `app/src/app/(dashboard)/`
- `app/src/components/layout/`
- `app/src/components/dashboard/`
- `app/src/components/campaigns/`
- `app/src/components/workspace/`
- `app/src/components/settings/`

### Supporting Audits

- `tasks/todo.md` Layers surface and product-flow audits
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`

---
*Research completed: 2026-06-12*
*Ready for requirements: yes*
