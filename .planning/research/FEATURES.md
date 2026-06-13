# Feature Research: v12.2 Refinamento Visual e Consistencia da Interface

**Domain:** Visual consistency and responsive UX for the authenticated ADScale product
**Researched:** 2026-06-12
**Confidence:** HIGH for current surface inventory and interaction risks; MEDIUM for final visual priorities until browser audit evidence is captured
**Milestone constraint:** Existing product refinement only. No new product capability and no application-code change is part of this research task.

## Research Frame

ADScale serves deadline-driven marketing operators who need to move from source creative and brief to reviewable, exportable variations quickly. The milestone should therefore make the interface predictable under pressure, not merely more decorative. Dense information is acceptable when hierarchy, state and next action remain unambiguous.

The target register is **product**: familiar controls, compact density, restrained color, structural responsive behavior and one clear action hierarchy. The green accent should indicate primary action, selection, progress or success, while content and creative previews remain visually dominant.

### Success Criteria

- No overlap, clipping, unreachable control or accidental horizontal page scroll from 320px mobile widths through ultrawide displays.
- Every authenticated surface follows a shared page frame, spacing rhythm, type hierarchy and control vocabulary.
- Every workflow state exposes one dominant next action; secondary and destructive actions are visibly subordinate.
- Existing capabilities, status meaning, data density, localization and keyboard access are preserved.
- Loading, empty, error, disabled and long-content states are designed as first-class variants, not fallback fragments.

## Authenticated Surface Inventory

| Surface | Current role and observed structure | Expected UX behavior for v12.2 | Complexity / dependencies |
|---|---|---|---|
| Global shell and top bar | Fixed top bar, desktop navigation, mobile four-item bottom navigation, locale, feedback, theme, notifications and account controls. The dashboard conditionally replaces notifications with a new-campaign CTA. | Stable content offsets; no competition among global actions; current location always legible; safe-area-aware mobile navigation; overflow strategy for narrow widths; consistent global CTA placement; footer never obscured by mobile nav. | **HIGH.** Shared blast radius across all authenticated routes; depends on breakpoint contract, navigation hierarchy, focus management and long translated labels. |
| Dashboard | Campaign search and view controls, progress/mission panels, recent campaigns, credit chart, credit balance and activity feed in several visually separated sections. | Compact command-oriented overview; campaign continuation and creation lead; learning/progression is informative but subordinate; metrics and activity collapse without becoming a long card stack; loading skeletons match final geometry. | **HIGH.** Multiple independently styled components, dynamic data, onboarding anchors, charts and responsive grid changes. |
| Campaign list | Header, create action, bulk actions, search, filters, sorting, list/grid/board modes, pagination and row/card menus. | One toolbar hierarchy; controls wrap or collapse without crowding; chosen view persists visually; list becomes intentional mobile records rather than a broken table; bulk mode clearly replaces normal actions; filters remain discoverable. | **HIGH.** Three view modes, URL state, selection, menus, pagination and long campaign metadata. |
| Campaign creation and workspace | Header, pilot upload + guided briefing, readiness, sidebar/details, action bar, generation states, media results, hypotheses, learnings, recommendation, derivation review, approval and delivery. | Stage and next action remain visible; content priority changes by workflow state; dense supporting panels use progressive disclosure; mobile follows a single-column task order; desktop uses a stable work area; sticky elements never overlap sheets, dialogs or mobile nav. | **VERY HIGH.** Highest interaction density and business criticality; depends on workflow-state mapping, gallery behavior, sheets/dialogs, credit gates and long AI/user content. |
| Library | Upload action, dropzone, search, responsive asset grid, hover-only delete overlay and confirmation dialog. | Upload and retrieval are primary; asset actions work on touch and keyboard, not hover only; metadata truncates safely; grid density scales from mobile to ultrawide; empty state teaches upload and reuse. | **MEDIUM.** Asset aspect ratios, touch actions, long filenames/tags, upload progress and destructive confirmation. |
| Templates | Header/create path, loading grid, template cards and empty state. | Match campaign/library page grammar; clarify template creation and reuse; avoid an isolated card-grid aesthetic; cards expose the same action hierarchy across pointer and touch devices. | **MEDIUM.** Shared cards/modals and reuse flow; should follow rather than define primitives. |
| Feedback owner surface | Owner-gated master/detail layout, analytics/session panels, filters, report list, diagnostic details, metadata and notes. | Readable dense operations console; list/detail relationship is explicit; mobile uses sequential drill-in; filters and status remain visible; long diagnostics wrap safely; semantic state does not rely on color alone. | **HIGH.** Role-gated route, large detail payloads, mixed analytics and triage, potentially unbounded strings. |
| Settings | Page header and horizontally scrollable tab set for profile, workspace, team, brand kit, plans, billing, history, integrations and privacy. | Stable settings information architecture; active tab remains visible; narrow screens use a deliberate overflow or select pattern; save/destructive actions use consistent placement; tab content shares form widths and section rhythm. | **HIGH.** Nine heterogeneous tabs, billing edge states, forms, permissions and horizontal overflow. |
| Quick tools / restyling | Focused forms, uploads, selectors, previews and action footer outside the main campaign flow. | Reuse the same inputs, upload grammar, validation and action order as the workspace; compact single-task layout; no visual fork that makes the tool feel like another product. | **MEDIUM.** Repeated patterns are currently implemented separately; depends on shared form and upload primitives. |
| Cross-surface states | Page-specific skeletons, bespoke empty states, campaign errors/not-found, global error page, toasts, disabled/loading buttons and overlays. | Shared state anatomy with surface-specific copy; preserve layout during loading; errors identify impact and recovery; empty states distinguish first use from no search results; all actions remain reachable on mobile and keyboard. | **HIGH.** Cross-cutting standardization plus localization, reduced motion, focus return and async state contracts. |

## Feature Landscape

### Table Stakes

Users will interpret the product as unfinished if any of these are missing, regardless of visual polish elsewhere.

| Capability | Expected behavior | Complexity | Source evidence / dependencies |
|---|---|---:|---|
| Shared responsive page frame | Standard content gutter, maximum width, vertical rhythm and top/bottom safe offsets across every authenticated route. Mobile, tablet, desktop and ultrawide are explicit structural modes. | HIGH | Shell currently owns top/bottom offsets and mobile nav (`AppShell.tsx:35-71`), while dashboard uses `max-w-[1600px]`, campaign list `max-w-7xl`, workspace `max-w-[1100px]`, feedback/settings `max-w-6xl`. Requires a documented layout scale. |
| Overlap and overflow prevention | No fixed/sticky element covers content; flex/grid children use `min-width: 0`; long names, labels, diagnostics and translated strings wrap or truncate intentionally; horizontal scrolling is local and signposted. | HIGH | Workspace already needs `min-w-0` and breakpoint-specific sidebar disclosure (`campaigns/[id]/page.tsx:582-609, 798-832`). Settings tabs use horizontal overflow; campaign board and data tables also scroll locally. |
| Consistent visual primitives | Buttons, inputs, selects, tabs, badges, cards/panels, toolbars, menus, dialogs, sheets and feedback states share size, radius, border, focus, disabled and loading rules. | HIGH | Tokens exist in `globals.css:54-195`; design guidance calls for compact `p-4`, tonal layers and status tokens (`DESIGN.md:127-150`). Bespoke class strings remain widespread, so consolidation must precede page polish. |
| Compact typography hierarchy | Product chrome uses Inter/system sans; page title, section title, body, metadata and mono labels have fixed, restrained steps. Long prose stays readable; data remains dense. | MEDIUM | Product guidance defines expert clarity (`PRODUCT.md:37-43`) and page titles near 18px (`DESIGN.md:117-125`), while dashboard currently uses a 3xl/4xl campaign heading (`(dashboard)/page.tsx:101-113`). |
| Predictable action hierarchy | Each state has one primary action, secondary actions are grouped, icon-only actions have labels/tooltips, and destructive actions are separated and confirmed. | HIGH | Dashboard, top bar and campaign pages expose creation in different places; workspace header, contextual feedback, delete and action bar compete (`campaigns/[id]/page.tsx:609-627, 832-838`). |
| Structural responsive behavior | Navigation, tables, master/detail layouts, toolbars, sidebars, grids and action bars change structure at breakpoints rather than merely shrinking. Touch targets remain at least 44px where practical. | VERY HIGH | Campaign rows already switch from table row to mobile card (`CampaignTableRow.tsx:98-151`); workspace sidebar switches to `<details>` (`campaigns/[id]/page.tsx:798-831`). These patterns need one coherent breakpoint contract. |
| First-class loading states | Skeletons reserve the final content geometry, loading actions preserve labels and width, and repeated page-load animation is removed from task surfaces. | MEDIUM | Dashboard has separate skeleton geometries (`(dashboard)/page.tsx:17-23, 312-328`); campaigns mix table/grid skeletons with a spinner for board view (`campaigns/page.tsx:13-26`). |
| First-class empty states | Distinguish first-run, no results and filtered-empty; teach the next action without oversized illustration or excessive vertical space; maintain the same component anatomy. | MEDIUM | Dashboard has a bespoke 192px illustration and CTA (`(dashboard)/page.tsx:274-307`), library has a plain icon/text state (`library/page.tsx:189-210`), and a separate shared `EmptyState` exists (`components/ui/EmptyState.tsx`). |
| Actionable error and recovery states | State what failed, what remains safe, and the next recovery action. Support retry, return and escalation where applicable. Not-found, route error and global error use consistent tone and hierarchy. | MEDIUM | Campaign error supports retry/back while not-found differs in accent and anatomy; global error uses hard-coded standalone styling (`global-error.tsx`, `globals.css:3-46`). Product principle requires visible, actionable failures (`PRODUCT.md:39-41`). |
| Accessible interaction states | Visible focus, keyboard traversal, focus return for overlays, reduced motion, adequate semantic contrast and non-color status cues. Hover-only actions have touch/keyboard equivalents. | HIGH | Accessibility direction is explicit (`PRODUCT.md:45-49`). Notification panel already traps/restores focus, but library delete is hidden in a hover overlay (`library/page.tsx:243-266`). |
| Theme parity | Light and dark themes preserve hierarchy, contrast and elevation; no surface depends on raw black/white overlays or a token alias with different semantics. | MEDIUM | Light/dark and semantic tokens exist (`globals.css:110-195`); library overlay and several component fallbacks use raw colors. Both themes require visual regression. |
| Localization resilience | PT-BR and EN fit without overlap, clipped tabs or icon displacement; labels are not hard-coded where translations already exist. | HIGH | Locale switching is a validated product capability (`.planning/PROJECT.md:96-105`); top bar and campaign controls mix translation keys with hard-coded Portuguese/English labels. |

### High-Value Refinements

These refinements provide the greatest perceived-quality and operational gains after table stakes are secured.

| Refinement | Value proposition | Complexity | Source evidence / dependencies |
|---|---|---:|---|
| Unified authenticated page header | Users immediately understand location, context and primary action. Define compact title, optional count/status, optional description, primary CTA and secondary overflow. | MEDIUM | Dashboard, campaign list, library, settings and workspace each implement a different header grammar. Depends on action hierarchy and content-width tokens. |
| Dashboard reframed around continuation | Place current/recent campaign work and creation before progress, credits and activity. Reduce decorative section boundaries and repeated campaign-list concepts. | HIGH | Dashboard labels the page “Campanhas”, then adds progression, mission path, campaign grid and stats sections (`(dashboard)/page.tsx:87-261`). Must preserve onboarding anchors and real metrics. |
| Workspace stage hierarchy | Establish a durable hierarchy: campaign context, stage/status, primary work canvas, contextual guidance, secondary analysis/history. Keep current step and next action visible. | VERY HIGH | Workspace accepts many simultaneous actions and panels (`campaigns/[id]/page.tsx:632-752`) and renders upload/briefing, sidebar/action bar and performance sections by state (`:756-850`). Requires workflow-state inventory before styling. |
| Progressive disclosure for supporting panels | Collapse readiness detail, performance import, hypotheses, learnings, recommendations and approval utilities when they are not the current task, while preserving discoverability and status summaries. | HIGH | Current workspace can accumulate many full panels below the main action area. Depends on state summaries, anchor/deep-link behavior and mobile reading order. |
| Adaptive campaign management toolbar | Desktop shows search + compact filters + sort + views; tablet wraps deliberately; mobile exposes search and active-filter count with secondary controls in a sheet/popover. | MEDIUM | Current toolbar wraps fixed-width controls and pushes view toggle with `ml-auto` (`CampaignsFilterToolbar.tsx:55-177`), risking narrow-width irregularity. |
| Purpose-built mobile campaign records | Preserve status, campaign name, update time and primary continuation action; move secondary metadata/actions behind disclosure. Avoid imitating desktop table cells. | MEDIUM | Current table row conditionally behaves as a flex card and repeats platform/status metadata (`CampaignTableRow.tsx:98-302`). Can be simplified without changing data behavior. |
| Touch-safe asset library | Persistent or explicitly revealed asset menu on touch, selected-asset feedback, predictable upload progress and an informative empty state. | MEDIUM | Delete is currently hover-only (`library/page.tsx:243-266`); grid jumps from two to six columns (`:189-203`) without an ultrawide density cap. |
| Settings navigation and form grammar | Group tabs by account, workspace and billing concerns; keep the active destination visible; standardize section title, help text, field width, save row and danger zone. | HIGH | Nine tabs create horizontal pressure (`settings/page.tsx:95-131`). Content is split across independent tab components, including complex billing states. |
| Feedback triage master/detail refinement | Dense report list with clear selected state and compact filters; detail uses scannable metadata groups and sticky triage actions; mobile transitions from list to report detail. | HIGH | Current page uses `320px + 1fr` at large widths and stacks below (`feedback/page.tsx:182-244`); diagnostics contain long route/workspace/campaign identifiers and many chips (`:324-360`). |
| Unified state components | Create a state family rather than a single generic card: `PageSkeleton`, `CollectionEmpty`, `FilteredEmpty`, `InlineError`, `PageError`, `NotFound`, with consistent action placement. | MEDIUM | Existing implementations differ substantially across dashboard, library, campaign states and global error. Depends on localized copy and layout reservation. |
| Density modes by surface, not user toggle | Define compact defaults for tables/toolbars/settings and more breathing room only for creative review/upload. Avoid one spacing value everywhere. | MEDIUM | Product context favors expert density (`PRODUCT.md:39-43`); design specifies varied rhythm and compact panels (`DESIGN.md:138-158`). |
| Controlled ultrawide utilization | Use wider canvases where media grids, comparison or data tables benefit; keep forms/settings/prose capped; prevent tiny islands centered in vast empty space. | MEDIUM | Existing caps range from 1100 to 1600px. Requires per-surface width roles rather than one global maximum. |
| Visual regression matrix | Browser evidence at representative widths and both themes for every route and state, including long PT-BR/EN content, empty/loading/error and overlay interactions. | HIGH | Milestone goal explicitly includes browser validation (`.planning/PROJECT.md:13-22`). Depends on deterministic fixtures or seeded states and screenshot naming/acceptance rules. |

### Anti-Features

| Anti-feature | Why it may be requested | Why it is harmful here | Preferred alternative |
|---|---|---|---|
| Full visual rebrand | Feels like a decisive fix for inconsistency. | Changes identity while leaving layout/state defects unresolved; expands review surface and risks dark/light regressions. | Preserve green + tinted-neutral identity; refine token semantics, density and hierarchy. |
| New product features inside v12.2 | Makes redesigned screens appear more valuable. | Prevents clean attribution, increases state complexity and violates the refinement-only milestone boundary. | Capture product ideas separately; make existing capabilities coherent and discoverable. |
| One giant CSS cleanup pass | Appears faster than surface-by-surface work. | High regression risk; global selectors cannot encode workflow-specific responsive behavior. | Establish primitives and tokens first, then migrate bounded surfaces with browser evidence. |
| Universal card conversion | Cards seem responsive and easy to standardize. | Produces nested-card noise, weak hierarchy and excessive vertical length, especially in workspace/settings. | Use page sections, rows, split panes, toolbars and tonal grouping based on task structure. |
| Desktop scaled down to mobile | Preserves visual similarity. | Causes crowded toolbars, unreadable tables and overlapping fixed elements. | Define mobile task order and disclosure, then expand structurally at breakpoints. |
| Hover-only controls | Keeps grids visually clean. | Actions disappear on touch and can remain inaccessible to keyboard users. | Persistent overflow menu, selected-state action bar or focus-visible controls. |
| Sticky everything | Keeps actions visible. | Multiple sticky headers, bars and bottom navigation collide and reduce usable viewport. | One sticky layer per axis/region with documented offsets and ownership. |
| User-configurable density toggle | Sounds professional and flexible. | Adds persistent preference/state complexity before the base density is coherent. | Ship a compact professional default with surface-specific spacing roles. |
| More animation and decorative glow | Can make refinement feel “premium.” | Competes with creative work, slows task flow and worsens loading perception. | Use 150–250ms state transitions only; reserve accent/motion for progress and feedback. |
| Modal-first simplification | Hides complex content quickly. | Moves complexity into stacked overlays, harms mobile navigation and focus management. | Inline progression, sheets for contextual tasks and full routes for deep workflows. |
| Hide metadata to make screens cleaner | Reduces visible density. | Expert users need status, recency, platform and quality context to act confidently. | Prioritize and progressively disclose metadata while keeping critical state visible. |
| New bespoke component per page | Lets each page be polished independently. | Recreates the inconsistency this milestone must remove. | Shared primitives plus limited surface-level composition variants. |
| Pixel/display typography in product chrome | Reinforces brand personality. | Reduces scan speed and trust when used in labels, tabs or controls. | Restrict mono/pixel moments to sparse status/index accents; use Inter for operations. |

## Responsive Behavior Contract

| Viewport class | Expected structure |
|---|---|
| **Small mobile, 320–389px** | Single task column; no page-level horizontal scroll; bottom navigation respects safe area; labels may shorten but remain understandable; toolbars reduce to search + filter/action disclosure; dialogs/sheets fit viewport and keep primary action reachable. |
| **Mobile, 390–767px** | Same task order with slightly richer metadata; two-column media grid where minimum item width permits; touch actions are persistent or explicit; sticky bottom actions sit above app navigation. |
| **Tablet, 768–1023px** | Desktop top navigation may appear only if actions fit; sidebars remain collapsible; campaign management can use compact table or structured records based on real minimum widths; settings tabs use controlled overflow. |
| **Desktop, 1024–1439px** | Stable two-column workspace where useful; toolbars remain on one or two intentional rows; master/detail surfaces are available; content widths prevent collision with global chrome. |
| **Wide, 1440–1919px** | Increase usable work canvas for galleries, comparisons and feedback detail; do not inflate type or spacing; forms and prose remain capped. |
| **Ultrawide, 1920px+** | Add columns or comparison room only where content benefits; cap line length and card width; keep primary action near its task context rather than at a distant screen edge. |

## Interaction and State Contract

Every reusable interactive component should define:

1. Default, hover, focus-visible, active/selected, disabled and loading states.
2. Keyboard and touch behavior equivalent to pointer behavior.
3. Long-label and localization behavior.
4. Light and dark theme contrast.
5. Error behavior and recovery action where async work is involved.
6. Reduced-motion behavior.
7. Overlay focus entry, trapping where appropriate, Escape handling and focus return.

Every collection surface should define:

1. Initial loading.
2. First-use empty.
3. Filtered/search empty.
4. Partial stale/loading refresh.
5. Recoverable error.
6. Permission/not-found state.
7. Long-content and high-volume behavior.

## Feature Dependencies

```text
Surface inventory and browser baseline
    -> layout/breakpoint contract
        -> shell and page-frame stabilization
            -> shared primitives and state vocabulary
                -> dashboard + campaign list refinement
                -> workspace refinement
                -> library + templates refinement
                -> feedback + settings refinement
                    -> cross-theme/localization/accessibility pass
                        -> responsive visual regression matrix

Action hierarchy model
    -> page headers and toolbars
    -> workspace stage hierarchy
    -> empty/error recovery actions

Token semantics
    -> component consistency
    -> light/dark parity
    -> status and contrast validation
```

### Dependency Notes

- **Inventory must precede standardization:** visual fixes applied before all states and surfaces are mapped will create another partial vocabulary.
- **Breakpoint contract must precede page polish:** shell offsets, mobile navigation, local scroll regions and sticky ownership constrain every route.
- **Primitives must precede broad migration:** buttons, fields, badges, panels, tabs and states need agreed anatomy before route-by-route changes.
- **Workspace should follow foundational work but receive the deepest validation:** it has the highest density, business value and overlay/state complexity.
- **Accessibility, localization and theme checks are continuous gates:** they should be verified during each surface migration, then repeated globally.
- **Visual regression depends on deterministic data:** loading, empty, error, long-content and populated states need reproducible fixtures or browser setup.

## Prioritization Matrix

| Capability | User value | Cost | Priority |
|---|---|---|---|
| Shell, responsive frame and overlap prevention | HIGH | HIGH | P0 |
| Shared primitives and interaction states | HIGH | HIGH | P0 |
| Action hierarchy and page-header grammar | HIGH | MEDIUM | P0 |
| Workspace stage and responsive hierarchy | VERY HIGH | VERY HIGH | P0 |
| Campaign management toolbar and mobile records | HIGH | HIGH | P1 |
| Unified loading/empty/error states | HIGH | MEDIUM | P1 |
| Dashboard continuation-first hierarchy | HIGH | HIGH | P1 |
| Settings navigation/form consistency | MEDIUM-HIGH | HIGH | P1 |
| Feedback master/detail refinement | MEDIUM-HIGH | HIGH | P1 |
| Library touch actions and grid density | MEDIUM-HIGH | MEDIUM | P1 |
| Templates and quick-tools alignment | MEDIUM | MEDIUM | P2 |
| Ultrawide optimization | MEDIUM | MEDIUM | P2 |
| Decorative delight beyond state feedback | LOW | MEDIUM | P3 / exclude |

## Recommended Milestone Scope

### Must Ship

- Shared layout, breakpoint, density, typography and action-hierarchy contracts.
- Shell/top-bar/mobile-nav stabilization with explicit sticky and safe-area ownership.
- Shared interactive primitives and state components with accessibility/theme/localization behavior.
- Dashboard, campaign list and full campaign workspace refinement.
- Library, feedback and settings refinement.
- Loading, empty, filtered-empty, error and not-found consistency.
- Browser verification from small mobile through ultrawide, in light/dark and PT-BR/EN representative states.

### Ship If Capacity Allows

- Templates and both restyling routes migrated to the completed shared vocabulary.
- High-volume and long-content stress fixtures for grids, tables, diagnostics and translations.
- Reduced-motion and keyboard-only walkthrough evidence across critical flows.

### Explicitly Excluded

- New AI, campaign, analytics, billing, feedback or asset-management capabilities.
- Brand redesign, new color identity or broad illustration campaign.
- User-selectable density/layout customization.
- Decorative animation program.
- Backend contract or data-model changes unless a current UI state cannot be represented without a narrowly documented fix.

## Source Evidence

- `PRODUCT.md:7-21` defines task-focused users, speed and static-ad creative production.
- `PRODUCT.md:31-49` defines anti-references, expert clarity, restrained creative energy and accessibility direction.
- `DESIGN.md:91-115` defines the calm professional scene and restrained green color strategy.
- `DESIGN.md:117-168` defines product typography, tonal layers, compact components, app-shell expectations and visual bans.
- `.planning/PROJECT.md:3-22` defines the core value and v12.2 goal: complete authenticated-app consistency, structural responsiveness and browser validation.
- `app/src/app/globals.css:54-195` provides existing theme, radius, status and motion tokens that should be normalized rather than replaced wholesale.
- `app/src/components/layout/AppShell.tsx:35-71` shows global offsets and mobile navigation constraints.
- `app/src/components/layout/TopBar.tsx:123-257` shows desktop navigation and the concentration of global controls/actions.
- `app/src/app/(dashboard)/page.tsx:87-261` shows dashboard section density, multiple widths and competing campaign/progression/metrics layers.
- `app/src/components/campaigns/CampaignsFilterToolbar.tsx:55-209` shows fixed-width filter controls, view modes and active-filter layout.
- `app/src/components/campaigns/CampaignTableRow.tsx:98-302` shows the current desktop-table/mobile-card hybrid.
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx:572-850` shows workspace header hierarchy, extensive state/action surface and responsive sidebar disclosure.
- `app/src/app/(dashboard)/library/page.tsx:158-210,243-290` shows upload/search/grid states and hover-only asset actions.
- `app/src/app/(dashboard)/feedback/page.tsx:182-360` shows owner master/detail density and diagnostic-content pressure.
- `app/src/app/(dashboard)/settings/page.tsx:95-131` shows the nine-tab settings navigation and horizontal-overflow requirement.
- `app/src/components/ui/EmptyState.tsx` plus dashboard/library/campaign error implementations show the current fragmented state vocabulary.

---
*Feature research for v12.2 Refinamento Visual e Consistencia da Interface, based on repository evidence available on 2026-06-12.*
