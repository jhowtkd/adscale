# Stack Audit: Visual Refinement and Interface Consistency

**Milestone:** v12.2 Refinamento Visual e Consistência da Interface
**Domain:** Complete authenticated product UI, mobile through ultrawide
**Audited:** 2026-06-12
**Confidence:** HIGH for implementation findings; MEDIUM for runtime overlap defects until viewport verification
**Scope:** Design-system and frontend implementation only. No application code was changed.

## Executive Decision

ADScale does not need a new frontend framework or a second component library. The current stack is capable of delivering the milestone:

- Next.js 16.2.6, React 19.2.4 and TypeScript
- Tailwind CSS 4.3 with CSS custom properties in `app/src/app/globals.css`
- Base UI primitives, CVA, `clsx` and `tailwind-merge`
- Lucide icons, `next-themes`, Framer Motion and Recharts
- Existing `app/src/components/ui/*` primitive layer

The problem is adoption and governance. The codebase currently mixes the shared primitive layer with local controls, undefined token dialects, legacy aliases, raw semantic colors, several card and badge vocabularies, and page-specific density rules. This makes the interface look irregular even when individual components are acceptable.

**Recommendation:** consolidate the existing stack before visual page-by-page polish. Establish one token contract and one primitive vocabulary, migrate the shell and high-reuse controls, then refine routes by workflow. Do not add another UI kit, styling engine, icon set, or animation library.

## Audit Baseline

The intended product register is explicit: a task-focused professional tool where density is allowed but ambiguity is not (`PRODUCT.md:5-16`, `PRODUCT.md:37-42`). `DESIGN.md` specifies restrained neutrals, green accent, tonal elevation, compact panels, an icon sidebar/top bar model and consistent shared controls (`DESIGN.md:71-116`).

Static source scan of `app/src` found:

| Signal | Observed |
|---|---:|
| Native `<button>` elements | 117 across 47 TSX files |
| Files importing shared `Button` | 40 |
| Native `<input>`, `<select>` or `<textarea>` elements | 88 |
| Files importing shared field primitives | 17 |
| Arbitrary pixel/rem text-size utilities | 139 |
| Rounded utility uses | 455 |
| `glass-card` uses | 15 |
| Explicit shadow utilities | 31 |
| Borders thicker than 1px | 31 |

These counts do not imply every native element is wrong. They show that the design-system layer is optional in practice, so visual consistency cannot be guaranteed centrally.

## Audit Health

| Dimension | Score | Key finding |
|---|---:|---|
| Token integrity | 1/4 | Multiple undefined token dialects and legacy aliases coexist with canonical tokens |
| Component consistency | 1/4 | Shared primitives exist, but many product controls recreate their own states and dimensions |
| Typography and density | 2/4 | Inter and compact sizing are appropriate, but 9, 10, 11, 13, 15, 18 and 28px local scales are repeated without semantic roles |
| Elevation and surfaces | 1/4 | Tonal layers, glass, glow, thick borders and custom shadows compete across authenticated screens |
| Responsive structure | 2/4 | Mobile adaptations exist, but page containers, sticky offsets, table transformations and action layouts are independently authored |
| **Total** | **7/20** | **Poor: system consolidation should precede route polish** |

## Current Stack: Keep

| Layer | Keep | Why |
|---|---|---|
| Framework | Next.js + React + TypeScript | No visual issue requires an architectural migration |
| Styling | Tailwind CSS 4 + CSS custom properties | Appropriate for centralized tokens and responsive variants |
| Primitive foundation | Base UI-backed components in `app/src/components/ui` | Provides accessible behavior and supports CVA variants |
| Variants | CVA + `clsx` + `tailwind-merge` | Correct mechanism for canonical sizes and states |
| Theme | `next-themes` with light/dark variables | Existing theme boundary should be repaired, not replaced |
| Icons | Lucide | Already the dominant icon vocabulary |
| Motion | Existing LazyMotion/Framer Motion setup | Sufficient for state transitions; usage should be reduced and standardized |
| Data visualization | Recharts | Existing charts are unrelated to the consistency problem |
| Product direction | Restrained green accent, Inter UI type, mono for compact metadata | Matches the compact professional goal when used consistently |

## Token Audit

### What is working

- Tailwind semantic mappings already exist for background, foreground, card, popover, primary, destructive, border, input and ring (`app/src/app/globals.css:54-95`).
- Light and dark surface, text, accent and status foundations are centralized (`app/src/app/globals.css:110-196`, `app/src/app/globals.css:202-270`).
- Status badges have a shared token family and a reusable component (`app/src/components/ui/StatusBadge.tsx:12-61`).
- Reduced-motion support is centralized in `globals.css`.

### Token drift and raw values

1. **Undefined token dialects are used by live components.**
   - `--surface-1` and `--surface-2`: `app/src/components/campaigns/PerformanceImportPanel.tsx:132-176`
   - `--bg-surface` and `--bg-elevated`: `app/src/components/campaigns/HypothesesPanel.tsx:45-56`, `app/src/components/campaigns/NextExperimentRecommendationCard.tsx:115-162`, `app/src/components/campaigns/LearningsPanel.tsx:16-21`
   - `--surface-secondary`, `--border-subtle` and `--text-tertiary`: `app/src/components/workspace/RegenerateFeedbackDialog.tsx:64-101`
   - `--neutral`: `app/src/components/restyling/RestylingUpload.tsx:144`
   - `--status-amber-bg`, `--status-amber-text` and `--status-rose-bg`: `app/src/components/settings/BillingTab.tsx:185-239`, `app/src/components/settings/PrivacyTab.tsx:105`
   - `--accent-green-hover` and `--accent-rose-dim`: `app/src/components/dashboard/OnboardingTour.tsx:241`, `app/src/components/layout/TopBar.tsx:400`

   These names are not defined in `globals.css`. CSS custom-property failure can become transparent or invalid styling, which is a direct cause of visually inconsistent surfaces and states.

2. **Legacy color aliases preserve obsolete vocabulary.** `--accent-blue`, `--accent-teal`, `--accent-purple` and mint aliases all map to green (`app/src/app/globals.css:142-150`, `app/src/app/globals.css:228-236`). They are still used in forms and workspace flows, so names no longer communicate intent.

3. **The documented color model and implementation diverge.** `DESIGN.md` says no pure white/black in new work and recommends eventual OKLCH migration, while `globals.css` uses `#ffffff`, `#0a0a0a` and raw RGB alpha values throughout (`DESIGN.md:76-82`; `app/src/app/globals.css:116-140`, `app/src/app/globals.css:204-226`). The milestone should not force a risky full color-space rewrite, but it should define canonical semantic roles first.

4. **Raw semantic colors bypass theme tokens.** Examples include indigo fallbacks in campaign platform tags (`app/src/components/campaigns/CampaignTableRow.tsx:220-256`), orange/rose/amber utility colors in derivation QA (`app/src/components/workspace/DerivationCard.tsx:397-500`), and raw fallback colors in `StatusBadge` (`app/src/components/ui/StatusBadge.tsx:69-73`). These produce dark-mode and contrast drift.

5. **Global error styling is a separate design system.** It hard-codes colors, spacing and radius before the token layer (`app/src/app/globals.css:3-46`). A no-JS/error fallback may require standalone CSS, but it should still mirror the canonical visual values.

### Recommended canonical token contract

Use semantic names that describe role, not hue or one screen:

| Group | Canonical roles |
|---|---|
| Surfaces | `canvas`, `surface`, `surface-subtle`, `surface-raised`, `overlay` |
| Text | `text-strong`, `text-default`, `text-muted`, `text-disabled`, `text-on-accent` |
| Borders | `border-subtle`, `border-default`, `border-strong`, `focus-ring` |
| Actions | `action-primary`, `action-primary-hover`, `action-secondary`, `action-danger` |
| Semantic | `success`, `warning`, `danger`, `info`, each with `fg`, `bg`, `border`, `dot` |
| Geometry | `radius-control`, `radius-panel`, `radius-overlay`, `control-sm/md/lg` |
| Elevation | `shadow-overlay`, `shadow-floating`; default panels use no shadow |
| Motion | `duration-fast`, `duration-default`, `ease-out-product` |

Map these once into Tailwind semantic utilities. Keep temporary aliases only during migration, mark them deprecated, and remove them before milestone completion.

## Component Vocabulary Audit

### Buttons and actions

The shared `Button` already defines variants, sizes, focus, disabled and invalid states (`app/src/components/ui/button.tsx:6-39`). However, product routes often hand-build controls with different heights, radii, type sizes and active transforms. Examples include the dashboard search/view controls and empty-state CTA (`app/src/app/(dashboard)/page.tsx:130-168`, `app/src/app/(dashboard)/page.tsx:274-307`) and the header campaign CTA (`app/src/components/layout/TopBar.tsx:138-149`).

**Consolidation:** establish `Button` sizes around a compact desktop scale while preserving 44px touch targets through responsive wrappers or an `icon-touch` size. Add explicit `primary`, `secondary`, `quiet`, `danger` and `icon` usage rules. Route all button-like links through a shared `buttonVariants` export or polymorphic primitive.

### Form controls

The shared `Input` uses an 8-unit height, rounded-lg and standard focus state (`app/src/components/ui/input.tsx:5-16`), while many feature forms use 9/10/11-unit heights, rounded/rounded-md/rounded-xl, 1px or 2px borders and custom rings. The dashboard search alone uses `h-11`, `border-2`, `rounded-xl` and a bespoke focus treatment (`app/src/app/(dashboard)/page.tsx:131-140`). Performance import recreates its entire field vocabulary with undefined surface tokens (`app/src/components/campaigns/PerformanceImportPanel.tsx:132-214`).

**Consolidation:** define `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `Input`, `Select`, `Textarea`, `SearchInput`, `SegmentedControl` and `Dropzone` contracts. A field density variant is preferable to arbitrary per-screen heights.

### Badges and statuses

`Badge` and `StatusBadge` are separate systems (`app/src/components/ui/badge.tsx:7-27`; `app/src/components/ui/StatusBadge.tsx:12-97`), while feature code creates additional chips for platform, QA, preview, CTA and warning states. `DerivationCard` alone contains multiple local badge shapes and color strategies (`app/src/components/workspace/DerivationCard.tsx:397-465`).

**Consolidation:** keep one structural `Badge` primitive with semantic variants and build `StatusBadge` as a typed adapter over it. Define variants for neutral metadata, status, warning, danger, success and platform. Do not encode colors inline in feature components.

### Panels, cards and elevation

The design intent is tonal layering with subtle borders, but `glass-card` remains a general-purpose utility and is used in dashboard, auth, campaign and derivation surfaces. `DerivationCard` combines glass, a 15px custom radius, lift, scale and shadow (`app/src/components/workspace/DerivationCard.tsx:332-342`). Dashboard sections use 2px dividers, dot/grid decorations, glow shadows and glass skeletons (`app/src/app/(dashboard)/page.tsx:90-101`, `app/src/app/(dashboard)/page.tsx:222-260`, `app/src/app/(dashboard)/page.tsx:312-329`).

**Consolidation:** define only three surface patterns:

- `Panel`: flat surface, 1px subtle border, panel radius
- `Inset`: subtle tonal region inside a workflow, no nested card shadow
- `Overlay`: raised surface with the single overlay shadow

Reserve glass/backdrop blur for overlays that need visual separation from moving content. Remove glass from ordinary cards and skeletons.

### Dialogs, sheets and overlays

Base dialog and sheet primitives exist, but the feature layer contains numerous custom `Modal`, `Dialog` and `Sheet` components. The notification panel also implements a custom focus trap in `TopBar` (`app/src/components/layout/TopBar.tsx:276-300`).

**Consolidation:** standardize overlay anatomy: title, optional description, scroll region, footer, close action, width presets and mobile sheet behavior. Keep specialized workflow content but share the accessible shell. Prefer inline expansion for simple confirmations or edits; use overlays only when task context must remain visible.

### Empty, loading and error states

There is a reusable `EmptyState`, but the dashboard reimplements its own larger version and CTA (`app/src/components/ui/EmptyState.tsx:23-101`; `app/src/app/(dashboard)/page.tsx:274-307`). Skeleton vocabulary ranges from the shared primitive to hand-built glass and 2px-bordered blocks (`app/src/app/(dashboard)/page.tsx:312-329`). Error visuals also use bespoke oversized icon panels and glow.

**Consolidation:** provide compact empty-state, zero-result, skeleton and error-state variants. Use the same action primitive and surface rules as normal content.

## Typography and Spacing Audit

### Typography

- Keep Inter as the product font and Space Mono only for terse metadata or codes.
- Press Start 2P should remain outside routine authenticated chrome, consistent with `DESIGN.md`.
- The implementation contains 139 arbitrary text sizes, including repeated 9, 10, 11, 13, 15, 18 and 28px values. Examples span `CampaignsHeader`, settings sections, dashboard cards and derivation metadata.
- Page title treatment is inconsistent: the dashboard uses 30/36px black weight (`app/src/app/(dashboard)/page.tsx:103-111`), while route headers such as campaigns/restyling use 28px semibold. `DESIGN.md` describes product page titles around 18px semibold.
- 10px uppercase mono labels with wide tracking appear extensively. This can work for compact metadata, but broad use makes the interface look noisy and can reduce readability.

**Recommendation:** define semantic type styles, not a large numeric scale:

| Role | Target use |
|---|---|
| `page-title` | Route identity, one per page |
| `section-title` | Major workflow section |
| `panel-title` | Panel/card heading |
| `body` | Default UI copy |
| `body-compact` | Dense rows and supporting detail |
| `label` | Form labels and controls |
| `meta` | Dates, counts and low-priority data |
| `code/meta-mono` | IDs, formats and compact technical labels only |

Prefer Tailwind theme aliases or shared class recipes. Ban new arbitrary font-size utilities in authenticated UI unless documented.

### Spacing and density

- The code uses a generally sensible 4px base, but page padding and panel gaps vary independently.
- The dashboard uses a 1600px container (`app/src/app/(dashboard)/page.tsx:101-183`), campaigns skeleton uses 1100px, settings/feedback use `max-w-6xl`, and focused tools use `max-w-3xl`. This may be intentional by task, but it lacks a named container vocabulary.
- Card padding ranges from 12px to 24px for similar hierarchy levels. Repeated `space-y-*` and nested bordered panels create uneven density.
- `CampaignTableRow` changes table rows into standalone mobile cards with its own radius, shadow and padding (`app/src/components/campaigns/CampaignTableRow.tsx:98-100`). This is a valid structural adaptation but should use shared mobile-list patterns.

**Recommendation:** define named layout recipes:

- `page-shell`: horizontal gutter by breakpoint
- `content-wide`: galleries and dense tables
- `content-standard`: dashboards and settings
- `content-focused`: forms and single-task tools
- `section-gap`, `panel-gap`, `control-gap`
- `stack-compact`, `stack-default`, `stack-relaxed`

Compact does not mean uniformly small. Preserve at least 44px touch targets on coarse pointers while allowing 32-36px desktop controls.

## Responsive and Overlap Risk

The code demonstrates real responsive effort: the shell has mobile bottom navigation, top-bar sizing changes, grid breakpoints and table-to-card adaptation (`app/src/components/layout/AppShell.tsx:35-72`; `app/src/components/campaigns/CampaignTableRow.tsx:98-137`). The risk is that each route owns its breakpoints and offsets.

Concrete risks to validate in browser phases:

1. **Competing fixed/sticky chrome.** Top bar heights switch between 48 and 56px, while `WorkspaceActionBar` uses fixed `top-14` (`app/src/components/layout/TopBar.tsx:93-100`; `app/src/components/workspace/WorkspaceActionBar.tsx:37-43`). At narrow widths the top bar can hide on scroll while the action bar retains the desktop offset.
2. **Dense top-bar actions.** Language, feedback, theme, primary CTA, notifications and avatar share one horizontal row (`app/src/components/layout/TopBar.tsx:132-205`). The logo uses a viewport clamp to compete for remaining width (`app/src/components/layout/TopBar.tsx:103-120`). This is a likely collision zone between mobile and tablet widths.
3. **Independent container widths.** Different routes use 1600px, 1100px, 6xl and 3xl boundaries, so ultrawide rhythm and alignment change between screens.
4. **Table/card breakpoint at `md`.** Campaign rows switch structure at one breakpoint with many fixed column widths (`app/src/components/campaigns/CampaignTableRow.tsx:215-302`). Intermediate widths and text expansion require targeted verification.
5. **Sticky negative margins.** `WorkspaceActionBar` uses breakpoint-specific negative margins and backdrop blur (`app/src/components/workspace/WorkspaceActionBar.tsx:41`). This can overlap scroll content or diverge from page gutters.
6. **Hover-only affordances.** Campaign row actions become visible through group hover and opacity (`app/src/components/campaigns/CampaignTableRow.tsx:301-313`), which needs a persistent keyboard/touch equivalent.

Use structural breakpoints based on content failure, not device labels. Acceptance viewports should include at minimum 320, 390, 768, 1024, 1280, 1440, 1920 and 2560px, plus 200% text zoom and coarse-pointer checks.

## Elevation and Motion Audit

- `DESIGN.md` calls for flat tonal layering, yet the implementation includes glass panels, glow shadows, thick borders and repeated hover lift.
- The dashboard and derivation gallery have the most decorative motion and elevation (`app/src/app/(dashboard)/page.tsx:90-101`, `app/src/app/(dashboard)/page.tsx:300-338`; `app/src/components/workspace/DerivationCard.tsx:332-365`).
- Framer Motion is already lazy-loaded, which should be kept. No second motion system is needed.
- Most product transitions should be 150-250ms. Existing 300-500ms transitions and scale/lift effects should be reserved for content previews, not routine controls.
- `globals.css` contains float, marquee, grain and pulse-glow utilities. These belong to brand/marketing moments, not routine authenticated surfaces.

**Recommendation:** use motion only for state change, feedback, loading and reveal. Canonicalize fast/default durations and one ease-out curve. Default panels should not lift; image previews may zoom subtly when that signals inspectability.

## Keep / Change / Do Not Add

### Keep

- Existing framework, styling stack and dependencies
- Light/dark theme support
- Restrained green accent and tinted neutral foundation
- Inter for product UI, Lucide for icons
- Base UI-backed accessible primitives
- Compact information density where it supports expert workflows
- Mobile bottom navigation and table-to-card structural adaptation as concepts
- Reduced-motion support and LazyMotion provider

### Change

- Replace undefined and hue-named tokens with one semantic contract
- Deprecate and remove mint/blue/teal/purple aliases
- Route button-like links, buttons and fields through shared recipes
- Merge badge/status/chip structure into one primitive vocabulary
- Reduce surfaces to Panel, Inset and Overlay patterns
- Replace routine glass, glow, thick border and lift effects with tonal hierarchy
- Define semantic typography and named layout/container recipes
- Standardize route headers, action bars, empty states, skeletons and errors
- Make sticky/fixed offsets derive from shared shell variables
- Normalize responsive behavior at mobile, intermediate, desktop and ultrawide widths
- Add visual-regression and viewport acceptance coverage after consolidation

### Do Not Add

- Another component library such as MUI, Chakra, Mantine or Ant Design
- Another headless primitive library alongside Base UI
- CSS-in-JS or a second styling engine
- Another icon library
- Another animation library
- A generic third-party design-system theme that erases ADScale identity
- New glassmorphism utilities, decorative gradients, side-stripe accents or hero-metric card grids
- Page-local tokens or raw semantic colors for new authenticated components
- New arbitrary type sizes, radii, shadows or control heights without a named system role

## Consolidation Opportunities

| Opportunity | Implementation recommendation | Impact |
|---|---|---|
| Token contract | Introduce canonical semantic variables, map Tailwind roles, add temporary deprecated aliases, then remove undefined/legacy names | Fixes theme drift and invisible/transparent states |
| Control recipes | Export shared variants for Button, button-like Link, Input, Select, Textarea, icon action and segmented control | Removes duplicated dimensions and interaction states |
| Surface recipes | Add `Panel`, `Inset` and `Overlay` primitives or class recipes | Normalizes radius, border, background and elevation |
| Status vocabulary | Build typed semantic Badge variants and migrate local chips | Aligns statuses, QA and warnings across routes |
| Layout recipes | Add shared page gutter, content width, route header and sticky offset recipes | Prevents overlap and ultrawide misalignment |
| Feedback states | Standardize EmptyState, ErrorState and Skeleton patterns | Removes repeated oversized and decorative states |
| Static enforcement | Add lint/check script for undefined CSS vars, legacy tokens and forbidden raw values in authenticated UI | Prevents recurrence |
| Visual verification | Add Playwright screenshot matrix and overlap assertions for representative authenticated routes | Makes mobile-to-ultrawide completion testable |

## Roadmap-Ready Phase Recommendations

### Phase 1: Token Contract and Enforcement

**Goal:** create one trustworthy theme and geometry vocabulary before visual migration.

- Inventory every CSS variable reference and definition.
- Define canonical semantic tokens for both themes.
- Resolve undefined tokens and provide temporary aliases where migration cannot be atomic.
- Define type, radius, control height, spacing, elevation and motion roles.
- Add a static check that fails on undefined variables and newly introduced legacy names/raw semantic colors.
- Update `DESIGN.md` to match the implemented contract.

**Exit evidence:** zero undefined CSS variable references in authenticated UI; new components can be styled without raw colors or arbitrary dimensions.

### Phase 2: Primitive and Pattern Consolidation

**Goal:** make the design-system layer the normal path for controls and feedback states.

- Normalize Button and button-like Link variants and sizes.
- Normalize Input, Select, Textarea, SearchInput, segmented controls and field anatomy.
- Consolidate Badge/StatusBadge/chips.
- Introduce Panel, Inset, Overlay, RouteHeader, EmptyState, ErrorState and Skeleton patterns.
- Define overlay width, scroll and mobile sheet behavior.
- Add component-level interaction and accessibility tests.

**Exit evidence:** representative components expose complete default, hover, focus, active, disabled, loading and error states.

### Phase 3: Shell and Responsive Structure

**Goal:** remove overlap risk and establish consistent alignment from 320px to 2560px.

- Consolidate top bar, mobile nav, route gutters and content widths.
- Derive sticky offsets from shell variables rather than fixed `top-14` values.
- Resolve top-bar action priority at intermediate widths.
- Define mobile/tablet/desktop/ultrawide layout recipes and coarse-pointer target rules.
- Verify keyboard visibility and non-hover access to row actions.

**Exit evidence:** shell and navigation have no overlap, clipping or horizontal scroll at the viewport matrix and 200% text zoom.

### Phase 4: Core Workflow Migration

**Goal:** apply the system to the highest-value authenticated workflows.

- Dashboard and campaign listing
- Campaign workspace, briefing, generation, review and action bar
- Derivation gallery and QA/status states
- Campaign experiment/performance panels

Reduce decorative dashboard treatment, nested panels and competing actions while preserving expert density and the shortest path to generation/export.

**Exit evidence:** core flows use canonical tokens and primitives; primary action hierarchy is visually consistent; no local glass/card vocabulary remains in these routes.

### Phase 5: Secondary Surface Migration

**Goal:** complete system coverage across the authenticated app.

- Settings and billing
- Library and templates
- Restyling/quick tools
- Feedback owner surfaces
- Authenticated empty, loading and error states

**Exit evidence:** no duplicated component vocabulary remains in milestone scope; route headers, forms, panels and semantic states align across modules.

### Phase 6: Visual QA and Hardening

**Goal:** prove consistency and responsiveness rather than relying on source inspection.

- Playwright screenshot matrix for representative routes at 320, 390, 768, 1024, 1280, 1440, 1920 and 2560px.
- Light/dark, loading, empty, error, long-copy and dense-data states.
- Automated horizontal-overflow checks and focused overlap assertions for fixed/sticky chrome.
- Keyboard, visible focus, reduced motion, 200% text zoom and touch-target review.
- Final source scan for raw colors, undefined/legacy tokens, arbitrary type sizes and unauthorized surface patterns.

**Exit evidence:** approved visual baselines, zero known overlap defects, and documented exceptions with owners.

## Implementation Order and Dependencies

1. Tokens must precede component migration; otherwise components will encode another temporary dialect.
2. Primitives must precede route polish; otherwise each route will solve the same control problem differently.
3. Shell must precede full viewport QA; route-level fixes cannot compensate reliably for fixed/sticky chrome.
4. Core workflows should migrate before secondary routes because they expose the richest state and responsive requirements.
5. Visual-regression baselines should be captured after the system foundation stabilizes, not before.

## Acceptance Guardrails

- No application feature behavior changes are required for this milestone.
- Reorganization may change hierarchy, density and action placement, but must preserve workflow capability and accessibility names.
- No authenticated route should introduce horizontal page scroll at supported widths.
- Primary actions must be unique and recognizable within each task region.
- Product UI must use restrained accent color; green signals action, selection, progress or success, not decoration.
- Panels default to tonal separation and 1px borders; shadow is reserved for overlays/floating elements.
- Desktop density may be compact, but touch contexts retain adequate targets.
- Every reusable interactive component has default, hover, focus, active, disabled, loading and error behavior where applicable.

## Evidence Sources

- `PRODUCT.md`: product register, users, purpose and design principles
- `DESIGN.md`: intended colors, typography, elevation, shell and component guidance
- `.planning/PROJECT.md`: existing product scope and shipped capabilities
- `app/package.json`: installed frontend stack and versions
- `app/src/app/globals.css`: implemented tokens, themes, utilities and motion
- `app/src/components/ui/*`: current primitive vocabulary
- `app/src/components/layout/AppShell.tsx` and `TopBar.tsx`: authenticated shell
- `app/src/app/(dashboard)/*`: route-level layout conventions
- `app/src/components/{dashboard,campaigns,workspace,settings}/*`: component adoption and drift evidence

---
*Stack audit for: v12.2 Refinamento Visual e Consistência da Interface*
*No application code changed.*
