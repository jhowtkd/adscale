# Pitfalls Research

**Domain:** Whole-app visual refinement of an authenticated, data-dense creative operations product
**Milestone:** v12.2 Refinamento Visual e Consistência da Interface
**Researched:** 2026-06-12
**Confidence:** HIGH for repository-specific risks; MEDIUM for runtime-only defects until browser validation

## Scope and Proposed Phase Ownership

This milestone changes presentation and interaction structure, not product capability. The safest roadmap is a sequence of bounded visual systems followed by route-level refinement and an independent verification gate.

| Phase | Proposed ownership | Primary risk controlled |
|---|---|---|
| **109: Visual Baseline and Design Contracts** | Inventory, tokens, spacing/density rules, component states, route matrix, screenshot baseline | Uncoordinated redesign and scope explosion |
| **110: Responsive App Shell and Navigation** | Top bar, authenticated frame, mobile bottom navigation, content widths, safe areas, ultrawide behavior | Global overlap and viewport failures |
| **111: Core Workflow and Dense Data Surfaces** | Dashboard, campaigns, campaign workspace, tables, forms, settings, feedback | Behavioral regressions and unusable density |
| **112: Galleries, Overlays and Layering** | Asset grids, derivation review, dialogs, sheets, popovers, notifications, action bars, z-index contract | Hidden actions, stacking conflicts and inaccessible overlays |
| **113: Accessibility, Localization and State Consistency** | Keyboard/focus, semantics, contrast, reduced motion, PT-BR/EN expansion, empty/loading/error/disabled states | Cosmetic completion with interaction defects |
| **114: Cross-Viewport Browser Regression Gate** | Automated and manual browser matrix, visual diffs, interaction smoke, build/lint/tests, defect closure | “Looks done” without reliable evidence |

Phase numbers continue after v12.1 Phase 108. The roadmapper may rename phases, but each ownership boundary below should remain explicit.

## Critical Pitfalls

### 1. A visual refactor silently changes product behavior

**What goes wrong:** Reorganizing hierarchy, actions and responsive structures changes click targets, query/deep-link behavior, form submission, selection, upload, review, export or billing recovery even though the milestone promises no new feature.

**Why it happens:** The campaign workspace composes many stateful panels, dynamic overlays and hooks in one route. Moving a control can alter event propagation, mounting, focus, state retention or conditional rendering. Existing tests are weighted toward business logic and individual components, not whole-route visual interaction.

**Warning signs:**
- A visual PR changes hooks, API calls, mutation payloads, route parameters or domain state.
- Controls disappear at a breakpoint or become available in a different workflow state.
- A form resets after tabs, panels or sheets are reorganized.
- Existing deep links such as campaign tabs no longer land on the intended content.

**Prevention:**
- Freeze product contracts before editing: route, primary action, prerequisites, loading/error/empty state, keyboard path and expected mutation for every authenticated surface.
- Separate structural CSS/component changes from domain logic changes.
- Preserve DOM identity and state ownership when relocating visual wrappers.
- Add focused interaction regression tests around any component whose structure changes.

**Verification:**
- Run existing unit/integration suites plus route-level smoke for create campaign, upload, briefing, generate/review, regenerate, approve, export, performance import and billing recovery.
- Compare network requests and URL state before and after representative flows.
- Require `npm test`, `npm run lint` and `npm run build` before Phase 114 closure.

**Phase to address:** Contract in **Phase 109**, implementation safeguards in **Phase 111**, final proof in **Phase 114**.

**Source evidence:** `app/src/app/(dashboard)/campaigns/[id]/page.tsx:14-63` dynamically composes delivery, persona, review, regeneration, performance and recommendation surfaces; `app/src/app/(dashboard)/campaigns/[id]/page.tsx:69-129` coordinates route state and multiple workflow states; `app/package.json` exposes broad unit, integration and Playwright commands but only one current E2E spec is present under `app/tests/e2e/restyle.spec.ts`.

---

### 2. Compactness becomes compression instead of professional density

**What goes wrong:** Padding, type and control sizes are reduced globally until labels wrap, scan paths disappear, touch targets shrink and dense tables become harder to understand. The UI looks smaller but not more efficient.

**Why it happens:** “Compact” is interpreted as a universal spacing reduction. ADScale needs expert density, but galleries, forms, metrics, action bars and destructive controls do not share the same density requirements.

**Warning signs:**
- Body or metadata falls below readable sizes, especially `text-[10px]` content carrying real meaning.
- Adjacent actions lose grouping or primary-action dominance.
- Mobile controls fall below a 44px effective target.
- Every panel receives identical padding and every page the same vertical rhythm.

**Prevention:**
- Define density by role: shell, toolbar, data row, form, content panel and touch surface.
- Keep 44px effective touch targets on coarse pointers while allowing tighter desktop rows.
- Use hierarchy, grouping and removal of redundant wrappers before shrinking typography.
- Preserve restrained color and familiar product affordances from the Impeccable product register.

**Verification:**
- Inspect pointer and touch modes separately at 390px, 768px, 1280px, 1440px and ultrawide.
- Measure target dimensions and line wrapping with PT-BR and EN content.
- Conduct a five-second scan test: page purpose, status and primary action must be immediately identifiable.

**Phase to address:** Rules in **Phase 109**, route application in **Phase 111**, accessibility checks in **Phase 113**.

**Source evidence:** `DESIGN.md` specifies compact `p-4` panels, 13px inputs and 14–15px body type; `PRODUCT.md` permits dense information but rejects ambiguity; `app/src/components/layout/AppShell.tsx:91-102` already preserves 44px mobile navigation targets, while `app/src/app/(dashboard)/feedback/page.tsx:294-302` uses 10px operational metadata that can become fragile under further compression.

---

### 3. Mobile is treated as desktop with hidden columns

**What goes wrong:** Content technically fits at narrow widths but loses priority, context or actions. Tables become horizontal-scroll traps, sticky controls collide with bottom navigation, two-column forms remain semantically paired after stacking, and hover-only gallery actions become unreachable.

**Why it happens:** The code contains many breakpoint utilities and fixed/minimum widths, but breakpoints alone do not define structural behavior. Hiding columns is not equivalent to designing a mobile representation.

**Warning signs:**
- Horizontal scrolling occurs on the page body instead of a deliberate local region.
- Actions depend on hover or are placed behind a fixed bottom bar.
- Fixed widths such as 260px columns, 360px panels and 480px tables dominate narrow viewports.
- Content order after stacking differs from task order.

**Prevention:**
- Define a mobile information-priority contract per route: must-show, collapsible, deferred and alternate representation.
- Convert dense tables to explicit mobile rows/cards only where preserving table semantics is impossible.
- Expose gallery actions on focus and touch, not only `group-hover`.
- Account for top bar, bottom navigation, safe-area insets, virtual keyboard and sticky action regions together.

**Verification:**
- Browser test at 320, 360, 390, 430 and 768 CSS pixels, portrait and landscape where practical.
- Test touch emulation, 200% zoom, software keyboard, long labels and empty/error/loading states.
- Assert no body-level horizontal overflow and no interactive element under fixed chrome.

**Phase to address:** Shell in **Phase 110**, route structures in **Phase 111**, touch overlays in **Phase 112**, matrix proof in **Phase 114**.

**Source evidence:** `app/src/components/layout/AppShell.tsx:35-45` combines fixed top and bottom chrome with calculated padding; `app/src/components/campaigns/HypothesesPanel.tsx:78-79` uses a 480px minimum-width table; `app/src/components/campaigns/KanbanColumn.tsx:25` fixes columns at 260px; `app/src/components/layout/TopBar.tsx:351-383` positions a 360px notification panel and caps only its viewport width; `app/src/app/(dashboard)/library/page.tsx:256-266` reveals delete only through hover opacity.

---

### 4. Ultrawide refinement turns into stretched whitespace or overlong scan lines

**What goes wrong:** Full-width pages spread controls and related content too far apart, grids create oversized cards, tables become difficult to scan, and a 2560px monitor shows a sparse interface with weak hierarchy.

**Why it happens:** Different routes currently use different width policies (`max-w-2xl`, `max-w-7xl`, `max-w-[1100px]`, `max-w-[1600px]` or no container). Applying one global maximum ignores the needs of forms, galleries, tables and two-pane workspaces.

**Warning signs:**
- Primary action and page title occupy opposite ends of a very wide viewport.
- Card width grows instead of column count or controlled negative space.
- Form labels and controls become visually disconnected.
- Dashboard and campaign pages have visibly different left edges without task-based reason.

**Prevention:**
- Define width archetypes: narrow form, standard content, dense table, gallery and split workspace.
- Cap readable text and form measures while allowing galleries/tables to use additional columns deliberately.
- Preserve local grouping inside wide shells rather than relying on `justify-between` across the viewport.

**Verification:**
- Validate at 1440, 1920, 2560 and 3440 widths.
- Measure card width, line length, action-to-context distance and column count.
- Compare route screenshots side by side for aligned shell gutters and intentional width differences.

**Phase to address:** Width contracts in **Phase 109**, shell gutters in **Phase 110**, surface-specific behavior in **Phase 111**, screenshots in **Phase 114**.

**Source evidence:** `DESIGN.md` says max content width 1400px, while `app/src/app/(dashboard)/page.tsx:101-175` uses 1600px, `app/src/app/(dashboard)/campaigns/page.tsx:105` uses `max-w-7xl`, `app/src/components/campaigns/CampaignSkeleton.tsx:7` uses 1100px and `app/src/app/(dashboard)/quick-tools/restyling/page.tsx:146` uses `max-w-2xl`.

---

### 5. Z-index fixes become an escalating stacking war

**What goes wrong:** A local overlap is “fixed” by adding a higher z-index, then notifications, dropdowns, sheets, toasts, sticky headers and mobile navigation cover one another unpredictably. Backdrops may appear below fixed chrome while focused content appears above them.

**Why it happens:** Layer values are assigned locally. The authenticated shell already uses `z-40` and `z-50`, while overlays, sticky headers and absolute panels create separate stacking contexts through transforms, opacity and positioned ancestors.

**Warning signs:**
- New arbitrary values such as `z-[60]`, `z-[100]` or `z-[9999]` appear.
- A modal backdrop does not cover the top bar or mobile navigation.
- Dropdowns are clipped by `overflow-hidden` ancestors.
- An overlay works on one route but not inside a transformed or animated container.

**Prevention:**
- Establish a layer contract in Phase 109: base, sticky content, shell, dropdown/popover, backdrop, modal/sheet and toast.
- Prefer portal-based primitives for global overlays.
- Remove accidental stacking contexts and clipping ancestors instead of raising values.
- Test combinations, not isolated overlays.

**Verification:**
- Open notification + dropdown, review sheet + confirmation dialog, gallery preview + toast and mobile overlay + bottom nav scenarios.
- Inspect stacking contexts in browser devtools and verify backdrop coverage.
- Add a browser checklist for focus return, Escape behavior, scroll lock and click-outside handling.

**Phase to address:** Contract in **Phase 109**, shell layers in **Phase 110**, all overlay corrections in **Phase 112**, stress test in **Phase 114**.

**Source evidence:** `app/src/components/layout/TopBar.tsx:93-100` fixes the header at `z-40`; `app/src/components/layout/AppShell.tsx:43-45` fixes mobile navigation at `z-50`; `app/src/components/layout/TopBar.tsx:340-351` creates an absolute notification dialog at `z-50`; `app/src/components/campaigns/CampaignsListView.tsx:47` uses a sticky table header at `z-20`; the repository scan found 67 fixed, absolute or sticky declarations across authenticated app/components.

---

### 6. Modal and sheet cleanup breaks focus, scroll and nested workflows

**What goes wrong:** Overlays look consistent but trap focus incorrectly, close during nested actions, lose the trigger on return, hide content behind the keyboard or exceed the viewport. Modal proliferation also keeps competing actions out of the underlying task context.

**Why it happens:** The app mixes shared Radix-based primitives with bespoke overlay behavior. The notification panel implements its own focus trap, while campaign workflows dynamically mount multiple dialogs and sheets.

**Warning signs:**
- More than one element claims `aria-modal=true`.
- Escape closes the wrong layer or all layers.
- Background scroll remains active, or sheet content cannot scroll.
- Trigger focus is lost after close.
- A visual change replaces an inline action with another modal merely to simplify layout.

**Prevention:**
- Inventory every dialog, sheet, modal, popover and bespoke overlay before changing them.
- Standardize ownership of portal, backdrop, focus trap, initial focus, return focus, scroll lock and responsive sizing.
- Keep workflows inline/progressive where context matters; reserve modal layers for interruption or focused inspection.
- Define nested-overlay policy and test only supported combinations.

**Verification:**
- Keyboard-only traversal with Tab, Shift+Tab and Escape.
- Screen-reader semantics check for name, description and modal state.
- Mobile tests with long content and virtual keyboard.
- Verify background inertness and exact focus return target.

**Phase to address:** **Phase 112**, with accessibility closure in **Phase 113** and browser proof in **Phase 114**.

**Source evidence:** `app/src/components/layout/TopBar.tsx:276-337` manually implements focus trapping, Escape and focus return; `app/src/components/layout/TopBar.tsx:340-351` declares the bespoke panel as a dialog; `app/src/app/(dashboard)/campaigns/[id]/page.tsx:14-45` mounts several modal/sheet workflows; the repository scan found 27 authenticated files referencing Dialog, Sheet or Modal.

---

### 7. Dense tables and galleries are polished only with ideal data

**What goes wrong:** The refined UI works with short fixture content but fails with long campaign names, many status values, thousands of assets, missing images, large currency values, CSV errors or mixed aspect ratios. Sticky headers and virtualized/scrolling regions can also conflict with the shell.

**Why it happens:** Visual work often uses happy-path screenshots. ADScale's value appears at scale, so dense states are core states, not edge cases.

**Warning signs:**
- `truncate` or `line-clamp` hides the only distinguishing information without tooltip/detail access.
- Table columns have fixed widths but no explicit overflow or priority behavior.
- Gallery cards assume square images or hover input.
- Loading skeleton dimensions differ significantly from loaded content.
- Nested scroll areas make wheel/touch navigation ambiguous.

**Prevention:**
- Build stress fixtures: zero, one, typical, maximum practical and malformed/missing content.
- Define column priority, wrapping, truncation disclosure, local scrolling and sticky behavior per table.
- Test gallery ratios 1:1, 4:5 and 9:16, missing thumbnails and long metadata.
- Avoid expensive blur/shadow/animation on repeated cards.

**Verification:**
- Populate representative high-volume campaigns/assets and inspect scroll performance.
- Confirm header/body alignment, keyboard access and action visibility at every breakpoint.
- Compare skeleton and loaded geometry to detect layout shift.

**Phase to address:** **Phase 111** for tables/forms, **Phase 112** for galleries and previews, **Phase 114** for volume/browser stress.

**Source evidence:** `app/src/components/campaigns/CampaignsListView.tsx:44-97` combines horizontal scrolling, sticky headers and multiple fixed column widths; `app/src/components/campaigns/PerformanceImportPanel.tsx:278-407` contains separate horizontal and capped vertical table regions; `app/src/app/(dashboard)/library/page.tsx:189-204` grows a 2/4/6-column asset grid; `PRODUCT.md` states that scale to dozens of variations is the product's hero moment.

---

### 8. Accessibility is deferred as a final cosmetic pass

**What goes wrong:** Contrast, focus order, accessible names, keyboard reachability, reduced motion and semantic structure regress while the interface appears visually cleaner. Fixing these late forces structural rework.

**Why it happens:** Visual refinement changes DOM order, color, visibility and interaction states. Accessibility cannot be inferred from screenshots, and compact controls magnify target-size and focus-visibility risk.

**Warning signs:**
- Icon-only buttons have no localized accessible name.
- Focus rings are clipped or invisible on tinted/green surfaces.
- Visual order differs from DOM/tab order after responsive rearrangement.
- `text-[10px]`, muted tokens or translucent surfaces carry required information.
- decorative motion continues under reduced motion or animation conveys unique state.

**Prevention:**
- Include accessibility acceptance criteria in each component and route, not only Phase 113.
- Preserve semantic tables, headings, labels and native controls where possible.
- Verify all interactive states: default, hover, focus, active, disabled, loading and error.
- Use Phase 113 as a cross-app audit and remediation pass, not the first time accessibility is considered.

**Verification:**
- Automated axe-style scan plus keyboard-only route walkthrough.
- Contrast checks in light/dark themes and all semantic statuses.
- 200% and 400% zoom, reduced-motion mode and screen-reader spot checks.
- Validate no keyboard trap outside intentional modal focus containment.

**Phase to address:** Embedded in **Phases 109-112**, cross-app ownership in **Phase 113**, release gate in **Phase 114**.

**Source evidence:** `PRODUCT.md` names WCAG 2.1 AA as the direction and requires focus rings, labels and reduced motion; `app/src/app/globals.css:133-186` documents contrast-oriented status tokens; `app/src/app/globals.css:323-460` defines many animations; reduced-motion handling exists globally near the end of `globals.css`, so refinements must preserve it.

---

### 9. Localization is validated only in the default language

**What goes wrong:** PT-BR or EN labels overflow tabs, buttons and table headers; hardcoded mixed-language copy remains; dates/numbers render with browser defaults; compact layouts fail once translations expand.

**Why it happens:** The codebase uses `next-intl` broadly but still contains hardcoded Portuguese and English strings, fallback literals and direct `toLocaleString()` calls. Visual screenshots in one locale do not expose the other locale's width and formatting behavior.

**Warning signs:**
- Buttons rely on fixed widths or hide text at a breakpoint without equivalent accessible context.
- Components concatenate translated and hardcoded fragments.
- A date/number uses runtime locale implicitly.
- Layout tests use translation mocks that return short keys.

**Prevention:**
- Treat PT-BR and EN as required visual fixtures for every changed route.
- Remove presentation assumptions based on string length; allow wrapping or controlled truncation with disclosure.
- Use explicit locale-aware formatters for date, currency, percent and compact numbers.
- Include long-string pseudo-localization or expanded fixtures in Phase 113.

**Verification:**
- Capture key-route screenshots in both locales at mobile, laptop and desktop widths.
- Search changed files for hardcoded user-facing copy and implicit locale formatting.
- Verify tabs, filters, tables, toolbars, dialogs and error states with longest translations.

**Phase to address:** Component behavior in **Phases 110-112**, systematic localization audit in **Phase 113**, screenshot matrix in **Phase 114**.

**Source evidence:** `app/src/components/layout/TopBar.tsx:124-149` hardcodes Portuguese navigation/action labels beside `next-intl` usage; `app/src/app/(dashboard)/feedback/page.tsx:218-230` contains hardcoded English filter options; `app/src/app/(dashboard)/feedback/page.tsx:301-303` calls `toLocaleString()` without an explicit locale; `app/src/app/(dashboard)/library/page.tsx:170-175` contains hardcoded Portuguese upload instructions.

---

### 10. Token consolidation becomes a risky global recolor

**What goes wrong:** Replacing legacy aliases and raw values globally changes semantic contrast, chart/status meaning, dark mode or external/public surfaces. A token cleanup creates regressions far beyond the target component.

**Why it happens:** `globals.css` already contains core tokens, status tokens and legacy aliases. Authenticated components still use raw colors and old aliases. Global replacement is tempting but cannot distinguish semantic usage from accidental usage.

**Warning signs:**
- A single token change modifies dozens of unrelated screenshots.
- Green is used for inactive decoration, warning or destructive state.
- Light mode passes while dark mode loses contrast.
- Legacy alias removal happens before consumer inventory.

**Prevention:**
- Inventory token consumers and classify by semantic role before replacement.
- Add missing semantic roles rather than mapping every legacy name to one generic accent.
- Migrate in bounded component families and compare both themes.
- Keep public/share/auth surfaces out of scope unless a shared token change demonstrably affects them and is tested.

**Verification:**
- Screenshot diff light/dark for every migrated family.
- Contrast checks for primary, muted, disabled and semantic states.
- Search for remaining raw/legacy values after each phase, but do not require zero raw values where imagery/backdrops legitimately need them.

**Phase to address:** Contract and inventory in **Phase 109**, bounded migrations in **Phases 110-113**, global diff in **Phase 114**.

**Source evidence:** `app/src/app/globals.css:54-103` maps semantic Tailwind roles; `app/src/app/globals.css:110-150` defines primary tokens plus four legacy green aliases; `app/src/app/globals.css:152-186` separates status roles; the authenticated source scan found 70 hardcoded hex/RGB color occurrences.

---

### 11. Browser validation checks screenshots but not interaction states

**What goes wrong:** Static screenshots look correct while menus clip, focus gets lost, sticky elements overlap during scroll, hover/focus/touch differ, loading causes layout shifts and overlays fail in real combinations.

**Why it happens:** Visual regression is reduced to a few desktop screenshots. Runtime-only failures require scrolling, opening layers, changing viewport, switching theme/locale and exercising state transitions.

**Warning signs:**
- Acceptance evidence covers only one viewport, theme, locale or data state.
- Screenshots are captured before fonts/images/data settle.
- No evidence exists for keyboard, scroll, touch or overlay behavior.
- Manual defects are accepted because unit tests and build pass.

**Prevention:**
- Define a route-by-state-by-viewport matrix in Phase 109 and keep it bounded to representative surfaces.
- Combine stable screenshot assertions with interaction smoke tests.
- Use deterministic seed data and explicit waits for fonts, images, queries and animations.
- Keep Phase 114 independent from implementation phases so defects are fixed, not merely documented.

**Verification:**
- Automated Playwright coverage for representative routes and critical overlay interactions.
- Manual browser pass for responsive drag, zoom, touch, keyboard and ultrawide behavior.
- Require captured evidence and a zero-known-overlap list for milestone completion.

**Phase to address:** Matrix definition in **Phase 109**, testability during **Phases 110-113**, ownership and closure in **Phase 114**.

**Source evidence:** `app/playwright.config.ts` exists and `app/package.json` exposes `test:e2e`, but current E2E coverage lists only `app/tests/e2e/restyle.spec.ts`; previous milestone history in `.planning/MILESTONES.md` records manual browser/mobile smoke as residual debt in v11.4, demonstrating that automated green gates alone are insufficient.

---

### 12. Whole-app scope expands until no surface is truly finished

**What goes wrong:** Every inconsistency becomes eligible, including public pages, product behavior, copy rewrites, animation redesign, design-system extraction and unrelated technical debt. The milestone accumulates partial changes across many routes and never reaches a stable verification gate.

**Why it happens:** “Complete authenticated app” is broad, and visual cleanup exposes adjacent issues. Without a route inventory and definition of done, teams optimize whichever inconsistency is currently visible.

**Warning signs:**
- New feature requests or backend changes enter visual phases.
- The same component is revisited in several phases without a clear owner.
- Public login/share/marketing surfaces enter scope accidentally.
- No route can be declared complete because acceptance is app-wide and vague.

**Prevention:**
- Freeze the authenticated route inventory in Phase 109 and assign each route/component family to exactly one implementation phase.
- Define non-goals: no new product capability, no backend/domain refactor, no public-site redesign, no speculative animation work.
- Use vertical completion: component contract, affected routes, both themes/locales, target viewports and tests close together.
- Maintain a defect budget: only milestone-blocking visual/accessibility regressions enter Phase 114.

**Verification:**
- Traceability table maps every authenticated route and shared UI family to one phase and one final smoke scenario.
- Review diffs for application-code changes outside assigned surfaces.
- Milestone closes only when all matrix cells are pass/fail, not “mostly reviewed.”

**Phase to address:** Primary ownership in **Phase 109**, enforcement in every phase, closure in **Phase 114**.

**Source evidence:** The authenticated app currently has dashboard, campaigns list/new/detail, feedback, library, restyling, settings and templates routes plus many shared component families. `.planning/PROJECT.md` explicitly scopes all authenticated surfaces and allows hierarchy reorganization, which makes route-level ownership essential.

## Technical Debt Patterns

| Shortcut | Immediate benefit | Long-term cost | When acceptable |
|---|---|---|---|
| Add a one-off breakpoint to the failing component | Fast local fix | Breakpoint drift and adjacent-width failures | Only as a documented emergency fix with matrix coverage |
| Raise z-index until overlap disappears | Resolves one screenshot | Creates non-deterministic layer hierarchy | Never without the layer contract |
| Shrink font/padding globally | Instant compact appearance | Reduced legibility, target size and hierarchy | Never as the first intervention |
| Convert every section into a card | Easy visual grouping | Nested-card noise and wasted space | Only when the boundary represents a real object/action scope |
| Hide difficult columns/actions on mobile | Makes layout fit | Removes capability or context | Only with an equivalent mobile representation |
| Rewrite shared tokens and aliases in one pass | Fast consistency | Wide light/dark and semantic regressions | Only after consumer inventory and screenshot baseline |
| Validate with ideal seed data | Clean screenshots | Production breaks on long, empty or high-volume states | Never for dense surfaces |
| Accept manual QA notes without repeatable evidence | Faster closure | Regressions return immediately | Only for explicitly documented low-risk residuals |

## Integration Gotchas

| Integration | Common mistake | Correct approach |
|---|---|---|
| `next-intl` | Validate only one locale or preserve mixed hardcoded copy | Run PT-BR/EN fixtures and explicit locale formatting |
| Radix/shadcn overlays | Restyle content without validating portal, focus and scroll ownership | Test primitive contract and nested overlay combinations |
| Framer Motion | Add decorative entry sequences or create transform stacking contexts | Keep 150–250ms state motion and inspect layer effects |
| Next Image/R2 assets | Assume one ratio and loaded image state | Test 1:1, 4:5, 9:16, broken, slow and missing media |
| TanStack Query | Reorganize loading/error components without preserving mutation/query state | Keep query ownership stable and verify transitions |
| Playwright | Capture brittle screenshots with live data/animation | Seed deterministic states, disable nondeterminism and pair screenshots with interactions |

## Performance Traps

| Trap | Symptoms | Prevention | When it breaks |
|---|---|---|---|
| Blur and large shadows on repeated cards | Scroll jank and high paint cost | Flat tonal layers; reserve effects for overlays/selected state | Large galleries and lower-power laptops |
| Rendering full asset/campaign collections | Slow input and scroll response | Preserve pagination/virtualization; test realistic volume | Hundreds of rows/assets |
| Multiple nested scroll containers | Wheel/touch gets trapped; sticky headers fail | One primary scroll owner per region | Tables/panels taller than viewport |
| Layout animation of width/height/top/left | Jank and overlay drift | Transform/opacity only | Any animated dense route |
| Unstable skeleton geometry | Cumulative layout shift and missed clicks | Match loaded dimensions and content hierarchy | Slow network/image loads |

## Security and Privacy Mistakes

Visual work still touches privileged and destructive controls.

| Mistake | Risk | Prevention |
|---|---|---|
| Moving owner-only feedback/analytics UI into shared navigation | Privileged data exposure or confusing unauthorized entry | Preserve server authorization and verify role-specific visibility |
| Making destructive gallery/table actions easier to trigger | Accidental asset/campaign deletion | Keep confirmation, clear destructive styling and keyboard/touch separation |
| Showing diagnostic IDs/content more prominently | Sensitive workspace/campaign context leaks in screenshots or shared environments | Preserve least exposure and existing access boundaries |
| Restyling billing recovery as a generic CTA | Users may trigger wrong financial action | Keep subscription state, loading/disabled state and destination explicit |

## UX Pitfalls

| Pitfall | User impact | Better approach |
|---|---|---|
| Too many equally prominent actions | User cannot identify the next step | One primary action per task region; demote or group secondary actions |
| Removing labels to gain space | Expert users still guess unfamiliar icons | Preserve labels where meaning is not universal; tooltips are supplementary |
| Hiding state in color only | Status becomes inaccessible and ambiguous | Pair color with text/icon and stable semantic tokens |
| Replacing useful density with large empty areas | More scrolling and slower comparison | Compact rows/panels with clear grouping and alignment |
| Standardizing every page into one layout | Forms, galleries and tables all become mediocre | Use shared shell plus task-specific width/layout archetypes |
| Treating empty/error/loading as secondary | Real workflows feel broken despite polished happy path | Design and verify every operational state |

## “Looks Done But Isn't” Checklist

- [ ] Every authenticated route is assigned to one implementation phase and one Phase 114 browser scenario.
- [ ] No body-level horizontal overflow at 320–430px, 768px, 1280px, 1440px, 1920px, 2560px and 3440px.
- [ ] Top bar, mobile bottom navigation, sticky headers/action bars, toasts and every overlay combination obey one layer contract.
- [ ] All primary workflows still emit the same URLs, mutations and product outcomes.
- [ ] Tables, galleries and forms are tested with empty, loading, error, long-content and high-volume fixtures.
- [ ] Every changed interactive component has default, hover, focus, active, disabled, loading and error states where applicable.
- [ ] Keyboard traversal, focus return, Escape, scroll lock and touch access pass for dialogs, sheets, popovers and bespoke panels.
- [ ] Light and dark themes pass contrast and visual regression checks.
- [ ] PT-BR and EN pass at mobile, laptop and desktop widths with locale-aware dates, currency and numbers.
- [ ] Reduced motion, 200% zoom and 400% zoom do not hide content or actions.
- [ ] `npm test`, `npm run lint`, `npm run build` and representative Playwright suites pass.
- [ ] Browser evidence includes interaction states, not only static screenshots.
- [ ] No new product feature, backend refactor or public-surface redesign entered the milestone without explicit rescoping.

## Recovery Strategies

| Pitfall | Recovery cost | Recovery steps |
|---|---|---|
| Behavioral regression after visual move | HIGH | Restore prior state/DOM ownership, isolate structural change, add interaction regression test, then reapply styling |
| Z-index escalation | MEDIUM | Remove arbitrary values, map stacking contexts, portal global overlays, apply layer tokens and retest combinations |
| Mobile overflow across many routes | HIGH | Fix shell width/overflow first, classify local offenders, replace fixed widths with structural variants, rerun matrix |
| Token migration breaks dark mode | MEDIUM | Revert only the token family change, classify semantic consumers, migrate component family by family |
| Localization overflow late in cycle | MEDIUM | Add expanded fixtures, remove fixed text widths, wrap/reflow actions, validate both locales per route |
| Scope explosion | HIGH | Freeze intake, return to route/component ownership table, defer non-blockers, finish vertical slices before expanding |
| Screenshot suite too brittle | MEDIUM | Stabilize data/fonts/images/animation, reduce screenshot scope to representative states, keep interaction assertions separate |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention phase | Verification |
|---|---|---|
| Behavioral regression | 109 + 111 | Product-contract checklist, interaction tests, unchanged request/URL outcomes |
| Compactness becomes compression | 109 + 111 + 113 | Density roles, target measurements, zoom/locale checks |
| Mobile desktop-shrink | 110 + 111 + 112 | No body overflow, touch access, safe-area and keyboard scenarios |
| Ultrawide stretch | 109 + 110 + 111 | 1920–3440 screenshots and width-archetype measurements |
| Z-index stacking war | 109 + 112 | Layer inventory and combined-overlay browser scenarios |
| Modal/sheet regressions | 112 + 113 | Focus, Escape, scroll lock, keyboard and screen-reader checks |
| Dense-data failure | 111 + 112 | High-volume/long-content table and gallery fixtures |
| Accessibility deferred | 109–113 | Automated scan plus keyboard, contrast, zoom and reduced-motion pass |
| Localization overflow | 113 | PT-BR/EN screenshot and formatter audit |
| Risky token recolor | 109 + bounded route phases | Consumer inventory and light/dark diffs |
| Screenshot-only validation | 114 | Repeatable interaction + visual matrix with stored evidence |
| Scope explosion | 109 + 114 | Route traceability and explicit non-goal review |

## Sources

### Product and design contracts

- `PRODUCT.md`: users, task-focused workflow, expert density, speed-first principle, restrained creative energy and accessibility direction.
- `DESIGN.md`: product scene, restrained green strategy, shell dimensions, compact component guidance, max-width intent and banned patterns.
- `.planning/PROJECT.md`: v12.2 goal and explicit whole-authenticated-app scope, including permitted hierarchy/density reorganization.
- `.planning/MILESTONES.md`: prior residual browser/mobile smoke debt and the need for a separate runtime gate.
- Impeccable `reference/product.md`: familiar product affordances, structural responsiveness, complete component states, restrained color and consistency over surprise.

### Live implementation evidence

- `app/src/app/globals.css:54-220`: semantic theme mapping, light/dark tokens, legacy aliases and status vocabulary.
- `app/src/app/globals.css:281-317`: global body and scrollbar behavior.
- `app/src/app/globals.css:323-460`: motion utilities that must retain reduced-motion behavior.
- `app/src/components/layout/AppShell.tsx:20-72`: fixed authenticated chrome, safe-area padding and mobile bottom navigation.
- `app/src/components/layout/TopBar.tsx:90-210`: responsive header density, hardcoded navigation labels and fixed shell layering.
- `app/src/components/layout/TopBar.tsx:276-383`: bespoke notification focus trap, absolute positioning and local scrolling.
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx:14-63`: high-complexity workspace composition and overlay surface count.
- `app/src/components/campaigns/CampaignsListView.tsx:44-97`: horizontally scrollable dense table with sticky header and fixed columns.
- `app/src/components/campaigns/HypothesesPanel.tsx:78-79`: 480px minimum-width data table.
- `app/src/components/campaigns/KanbanColumn.tsx:25`: fixed-width board columns.
- `app/src/components/campaigns/PerformanceImportPanel.tsx:278-407`: multiple table/scroll contexts.
- `app/src/app/(dashboard)/library/page.tsx:126-204`: route without a shared width wrapper and responsive asset grid.
- `app/src/app/(dashboard)/library/page.tsx:243-266`: hover-only asset action risk.
- `app/src/app/(dashboard)/feedback/page.tsx:218-230`: hardcoded English filters.
- `app/src/app/(dashboard)/feedback/page.tsx:294-303`: compact operational metadata and implicit locale formatting.
- `app/playwright.config.ts`, `app/tests/e2e/restyle.spec.ts`, `app/package.json`: existing browser harness with narrow current E2E route coverage.

### Repository-wide indicators

- 67 fixed, absolute or sticky declarations across authenticated routes/components.
- 27 authenticated files referencing Dialog, Sheet or Modal.
- 77 arbitrary fixed/minimum width utilities.
- 244 responsive breakpoint utilities, indicating broad but locally defined behavior.
- 70 raw hex/RGB color occurrences across authenticated routes/components, despite central tokens.

---
*Pitfalls research for: v12.2 Refinamento Visual e Consistência da Interface*
*Researched: 2026-06-12*
