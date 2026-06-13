# Phase 109: Visual Foundations and Baseline - Research

**Researched:** 2026-06-13
**Phase requirements:** FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, QA-14
**Confidence:** HIGH for source-grounded architecture and scope; MEDIUM for runtime severity until authenticated browser baselines are captured

## Executive Summary

Phase 109 should establish the contracts that make the rest of v12.2 implementable without turning this phase into a whole-app redesign. The repository already has the correct frontend stack and a partially semantic token layer. The failure is governance: routes use different content widths and gutters, equivalent controls bypass shared primitives, legacy hue aliases conceal meaning, and fixed/sticky/overlay layers use local `z-*` values.

The recommended implementation is:

1. Freeze an authenticated route and component-family ownership inventory.
2. Extend `globals.css` into one canonical semantic, geometry, density, typography, radius, motion and layer contract.
3. Preserve existing public token names as compatibility aliases where needed; prohibit new use of legacy hue aliases and undefined variables.
4. Prove the contract through a narrow set of shared primitives and focused tests, without migrating route composition.
5. Capture authenticated browser baselines for representative routes and define the complete Phase 114 scenario matrix.

This phase should not repair the top bar, migrate route headers, redesign tables, or restyle the campaign workspace. Those changes depend on the contracts created here and belong to Phases 110-113.

## Codebase Findings

### Existing foundation worth retaining

- Next.js 16, React 19, Tailwind CSS 4 and CSS custom properties already support centralized design contracts.
- Base UI-backed primitives under `app/src/components/ui/` already provide accessible behavior for buttons, fields, menus, dialogs, sheets, selects, tables and tooltips.
- `globals.css` already maps semantic CSS variables into Tailwind's `@theme inline` roles.
- `PRODUCT.md` and `DESIGN.md` already lock the product register: compact professional UI, restrained electric green, tonal surfaces, purposeful motion, light default and dark support.
- Reduced-motion behavior is centralized.
- Existing Vitest and Testing Library coverage can verify primitive states. Playwright exists, but the current config has only one Chromium project and one product-flow spec.

### Systemic drift Phase 109 must constrain

- Authenticated route widths include `max-w-[1600px]`, `max-w-7xl`, `max-w-6xl`, `max-w-3xl`, `max-w-[1100px]`, `max-w-[720px]` and `max-w-[560px]`.
- Gutters are independently expressed as `px-2`, `px-3`, `px-4`, `px-5`, `px-6`, `px-8`, `sm:px-6` and `lg:px-8`.
- The top bar is `z-40`, bottom navigation and most overlays are `z-50`, the onboarding tour is `z-[100]`, and the custom toast stack is `z-[200]`.
- `WorkspaceActionBar` uses `sticky top-14`, while the top bar changes between 48px and 56px and may translate away on mobile.
- The shared `Button` and `Input` are compact, but route-local controls use unrelated heights, 2px borders, radii, transforms and focus treatments.
- `glass-card`, custom shadows, thick borders and glow effects are still used as general structure rather than only for inspectable objects or overlays.
- Legacy aliases such as `--accent-blue`, `--accent-teal`, `--accent-purple` and mint variants all resolve to green and no longer communicate intent.
- The global error page hard-codes a parallel set of colors, spacing and geometry.

## Exact Phase Scope

### Implement in Phase 109

1. **Canonical token contract in `app/src/app/globals.css`**
   - Theme colors and semantic states for light and dark.
   - Surface, border, text, focus and overlay roles.
   - Geometry, content width, density, typography, radius, motion and layer variables.
   - Tailwind semantic mappings and a small set of reusable contract utilities.
   - Compatibility aliases for existing live names where atomic migration is unsafe.

2. **Representative primitive proof**
   - Normalize the shared `Button`, `Input`, `Textarea`, `Badge`/`StatusBadge`, `Dialog`, `Sheet`, `Table`, `Skeleton` and `EmptyState` contracts only where needed to consume canonical tokens.
   - Add tests for state, size, semantic variant and layer behavior.
   - Do not migrate all callers in this phase.

3. **Static enforcement**
   - Add a deterministic source check for undefined CSS variables, newly introduced legacy hue aliases, unauthorized raw `z-*` values and new arbitrary authenticated type/radius values.
   - Start with an explicit allowlist for existing debt. The check must prevent growth without requiring all debt to be removed in Phase 109.

4. **Ownership and browser baseline artifacts**
   - Freeze all authenticated routes and shared component families with exactly one implementation phase.
   - Define at least one Phase 114 browser scenario per route/family.
   - Capture pre-migration authenticated screenshots and runtime notes for representative routes at the milestone widths.

5. **Validation contract**
   - Add focused unit/static/browser checks for the foundation itself.
   - Produce `109-VALIDATION.md` from the architecture later in this document.

### Explicitly defer

- Top bar, global nav, mobile nav, shell offsets and safe-area repair: **Phase 110**.
- Shared route header, action group, toolbar, form, table/card adaptation and route-state migration: **Phase 111**.
- Campaign workspace layout, sticky actions, derivation gallery and workflow overlays: **Phase 112**.
- Dashboard, library, templates, both restyling routes, feedback, settings completion, language/theme/a11y remediation: **Phase 113**.
- Full screenshot approval, all viewport/language/theme combinations, axe gate and milestone-wide test/lint/build/UAT: **Phase 114**.
- Removal of compatibility aliases: only after all consumers have migrated, normally Phase 113 or 114.

## Token and Alias Strategy

### Strategy

Use semantic roles as the source of truth. Keep compatibility names as one-way aliases to semantic roles. Never make canonical roles point back to legacy aliases.

The safest migration is additive:

1. Define canonical roles and both theme values.
2. Map Tailwind roles to canonical variables.
3. Point still-live compatibility names at canonical roles.
4. Migrate consumers by owner phase.
5. Remove aliases only after a zero-usage source scan.

Use OKLCH for new canonical color declarations. Preserve the current visual character by matching existing colors closely rather than doing a global recolor. Tinted neutrals should carry a very small green hue bias; no new canonical token should use pure black or pure white.

### Canonical color roles

Keep or introduce these semantic roles:

```css
/* Planes */
--canvas;
--surface-base;
--surface-raised;
--surface-inset;
--surface-overlay;

/* Content */
--text-primary;
--text-secondary;
--text-muted;
--text-disabled;
--text-on-accent;

/* Separation and focus */
--border-subtle;
--border-default;
--border-strong;
--focus-ring;

/* Brand and interaction */
--accent-primary;
--accent-primary-hover;
--accent-primary-subtle;
--accent-primary-text;

/* Semantic state families */
--success-bg; --success-border; --success-text; --success-dot;
--warning-bg; --warning-border; --warning-text; --warning-dot;
--danger-bg;  --danger-border;  --danger-text;  --danger-dot;
--info-bg;    --info-border;    --info-text;    --info-dot;
--neutral-bg; --neutral-border; --neutral-text; --neutral-dot;
```

Compatibility mapping should initially include:

```css
--deep-bg: var(--canvas);
--border-dim: var(--border-subtle);
--border-medium: var(--border-default);
--accent-green: var(--accent-primary);
--accent-green-light: var(--accent-primary-hover);
--accent-green-dim: var(--accent-primary-subtle);
--accent-green-text: var(--accent-primary-text);
--accent-green-on-fill: var(--text-on-accent);
```

`--accent-blue`, `--accent-teal`, `--accent-purple`, `--accent-mint*`, `--pale` and `--cream` remain deprecated aliases only while current consumers exist. The static check must reject new references outside the allowlist.

Status names such as draft, queued, processing, completed, approved, rejected and failed should remain typed product aliases over the five semantic state families. This preserves domain meaning while preventing each status from inventing colors.

### Tailwind mapping

`@theme inline` should consume canonical roles, not compatibility roles. Examples:

```css
--color-background: var(--canvas);
--color-card: var(--surface-base);
--color-popover: var(--surface-overlay);
--color-primary: var(--accent-primary);
--color-primary-foreground: var(--text-on-accent);
--color-border: var(--border-subtle);
--color-input: var(--border-default);
--color-ring: var(--focus-ring);
```

This allows existing Tailwind primitives to improve centrally while route-local CSS variable references continue working through aliases.

## Foundation Contracts

### Geometry and shell contract

Phase 109 defines values; Phase 110 makes the shell consume them.

```css
--shell-topbar-mobile: 3rem;       /* 48px */
--shell-topbar-desktop: 3.5rem;    /* 56px */
--shell-sidebar-expanded: 15rem;   /* reserved future shell width */
--shell-sidebar-rail: 4rem;        /* compact rail */
--shell-bottom-nav: 4rem;          /* plus safe area */
--shell-sticky-gap: 0.5rem;

--page-gutter-mobile: 1rem;
--page-gutter-tablet: 1.5rem;
--page-gutter-desktop: 2rem;
--page-gutter-wide: 2.5rem;
```

Sticky regions must calculate offsets from shell variables, never repeat `top-12` or `top-14`. Bottom-fixed content must include `env(safe-area-inset-bottom)` and the bottom-nav token.

### Content width recipes

Do not impose one universal max width. Define named recipes:

| Recipe | Maximum | Intended use |
|---|---:|---|
| `reading` | `45rem` / 720px | Long descriptions, instructions, privacy copy |
| `form` | `40rem` / 640px | Focused forms and restyling setup |
| `operational` | `80rem` / 1280px | Lists, settings and normal task pages |
| `workspace` | `87.5rem` / 1400px | Campaign workspace and split layouts |
| `wide` | `100rem` / 1600px | Dashboard, galleries and dense multi-column data |
| `fluid` | none, bounded by gutters | Tables or galleries that explicitly need available width |

All recipes use `width: min(100%, var(--content-*)); margin-inline: auto;` and the shared page gutters. Reading/form content stays bounded on ultrawide. Galleries may use `wide` or `fluid`, but column count must be capped deliberately.

### Density and spacing

Use a 4px base with semantic grouping rather than arbitrary local padding:

```css
--space-1: 0.25rem;  /* 4 */
--space-2: 0.5rem;   /* 8 */
--space-3: 0.75rem;  /* 12 */
--space-4: 1rem;     /* 16 */
--space-5: 1.5rem;   /* 24 */
--space-6: 2rem;     /* 32 */
--space-7: 3rem;     /* 48 */

--control-sm: 1.75rem;       /* 28px desktop-only compact */
--control-md: 2rem;          /* 32px default desktop */
--control-lg: 2.25rem;       /* 36px emphasized desktop */
--control-touch: 2.75rem;    /* 44px hit area */
```

Visible controls may remain 28-36px in pointer-fine desktop contexts, but interactive hit areas must reach 44px on coarse pointers and touch layouts. Inputs should render 16px text on mobile to avoid browser zoom; desktop may use the compact 14px role.

Grouping rules:

- 4-8px inside a tight control or metadata cluster.
- 8-12px between related siblings.
- 16-24px between component regions.
- 32-48px between page sections.
- Cards are reserved for actionable domain objects. Static sections use open layout, tonal changes or dividers.

### Typography

Use Inter for all authenticated UI. Space Mono is limited to short metadata/status labels. Press Start 2P remains outside routine product chrome.

```css
--text-caption: 0.75rem;   /* 12px */
--text-label: 0.8125rem;   /* 13px */
--text-body: 0.875rem;     /* 14px */
--text-body-lg: 1rem;      /* 16px */
--text-section: 1rem;      /* 16px, 600 */
--text-page: 1.25rem;      /* 20px, 600 */
--text-display: 1.5rem;    /* 24px, exceptional product metric only */
```

- Product type is fixed in `rem`; no viewport-fluid app headings.
- Page title: 20px/1.25, semibold.
- Section title: 16px/1.35, semibold.
- Body: 14px/1.5 desktop; 16px for mobile form controls and prose when needed.
- Metadata: 12-13px with adequate contrast; avoid 9-10px operational text.
- Numeric tables and metrics use `font-variant-numeric: tabular-nums`.
- New arbitrary authenticated font sizes require an allowlist entry and rationale.

### Radius and elevation

```css
--radius-control: 0.375rem; /* 6px */
--radius-panel: 0.5rem;     /* 8px */
--radius-object: 0.75rem;   /* 12px */
--radius-overlay: 0.75rem;  /* 12px */
--radius-pill: 9999px;

--shadow-floating: 0 12px 32px color-mix(in oklch, var(--text-primary) 12%, transparent);
--shadow-overlay: 0 24px 80px color-mix(in oklch, var(--text-primary) 16%, transparent);
```

- Ordinary panels use tonal contrast and a 1px border, not decorative lift.
- Shadows belong to menus, popovers, dialogs, sheets, toasts and inspectable previews.
- `glass-card` must not be used for page structure or static sections. Existing use is migrated by later owners.
- No nested cards, gradient text or colored side-stripe borders.

### Motion

```css
--duration-instant: 100ms;
--duration-fast: 150ms;
--duration-default: 200ms;
--duration-overlay: 250ms;
--ease-out-product: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-product: cubic-bezier(0.7, 0, 0.84, 0);
--ease-in-out-product: cubic-bezier(0.65, 0, 0.35, 1);
```

- 100-150ms: press, hover, selected and focus feedback.
- 150-200ms: menus, tooltips and simple state transitions.
- 200-250ms: dialogs and sheets.
- No broad page entrance choreography in authenticated UI.
- Do not animate layout properties. Use opacity and transform for normal transitions.
- Reduced motion preserves functional feedback while suppressing spatial movement.

### Layer scale

Use variables through arbitrary Tailwind values such as `z-[var(--layer-popover)]`. Local integer escalation is prohibited.

```css
--layer-base: 0;
--layer-raised: 1;
--layer-sticky: 10;
--layer-shell: 20;
--layer-shell-floating: 30;
--layer-popover: 40;
--layer-backdrop: 50;
--layer-overlay: 60;
--layer-toast: 70;
--layer-tour: 80;
--layer-skip-link: 90;
```

Contract:

- Feature content may use only `base`, `raised` and `sticky`.
- App shell uses `shell` and `shell-floating`.
- Dropdowns, selects and tooltips use `popover`.
- Dialog/sheet backdrops use `backdrop`; their content uses `overlay`.
- Toasts must remain above overlays but below guided tours and skip links.
- A component must create a local stacking context with `isolation: isolate` when internal children need local layering.
- No feature component may use `z-[100]`, `z-[200]` or another raw global level after migration.

## Representative Primitive Proof

The proof should be intentionally narrow. It demonstrates that the contract works without forcing every route to migrate.

### Primitive set

1. `Button`: semantic variants, compact sizes, icon/touch target, loading/disabled/focus/invalid states.
2. `Input` and `Textarea`: shared geometry, focus, invalid, disabled and mobile text sizing.
3. `Badge` plus typed `StatusBadge`: neutral/success/warning/danger/info variants with dot and non-color meaning.
4. `Dialog` and `Sheet`: canonical overlay layer, anatomy, scroll region and mobile geometry.
5. `Table`: canonical density and horizontal containment contract, without migrating route tables.
6. `Skeleton` and `EmptyState`: canonical surface/action vocabulary without page-specific decorative treatment.

### Proof boundaries

- Modify shared primitives only where the current implementation conflicts with the new contract.
- Preserve exports and call signatures unless a backward-compatible variant is added.
- Do not change route data fetching, hooks, mutations, permissions, query parameters or conditional rendering.
- Do not convert all native buttons/inputs in the codebase during this phase.
- Do not introduce `PageFrame`, `RouteHeader` or broad page primitives yet; Phase 111 owns them after the shell is stable.

### Focused proof tests

- Rendering tests assert variant classes/attributes and accessible names.
- Interaction tests verify keyboard focus, disabled behavior, dialog/sheet close and focus return.
- A token contract test verifies both `:root` and `.dark` define every canonical variable.
- A static scan verifies compatibility aliases resolve one-way and deprecated aliases do not appear in newly changed consumers.
- Browser smoke visits existing representative routes; there is no public design-system demo route.

## Ownership Inventory

QA-14 requires exact ownership. The implementation should write this inventory to a machine-readable or easily checked artifact, for example `109-OWNERSHIP.md` plus a small validator.

### Authenticated routes

| Route | Primary surface | Implementation owner | Phase 114 minimum browser scenario |
|---|---|---:|---|
| `/` | Dashboard | 113 | populated dashboard, search/view controls, light/PT-BR |
| `/campaigns` | Campaign list/grid/kanban | 111 | dense list plus filters and bulk actions |
| `/campaigns/new` | Server redirect/create entry | 111 | create entry preserves redirect and error contract |
| `/campaigns/[id]` | Campaign workspace | 112 | populated workspace with sticky action and one overlay |
| `/library` | Asset gallery/upload | 113 | dense gallery plus upload/empty state |
| `/templates` | Template gallery | 113 | populated and empty states |
| `/restyling` | Guided restyling form | 113 | long form, upload, validation error |
| `/quick-tools/restyling` | Quick restyling form | 113 | long labels and narrow viewport action layout |
| `/feedback` | Owner analytics/triage | 113 | dense data, filters and long content |
| `/settings` | Settings tabs/forms/billing | 111 | long tab labels, form controls and billing state |
| authenticated layout | Shell/chrome shared by all routes | 110 | top bar, nav, mobile nav, notifications and account menu |

### Shared component families

| Family | Owner | Boundary |
|---|---:|---|
| `components/ui` foundation primitives | 109 | token consumption and representative primitive contracts |
| `globals.css`, theme aliases and foundation checks | 109 | canonical contract and enforcement |
| `components/layout` | 110 | shell, top bar, footer and global navigation geometry |
| campaign list components (`Campaigns*`, list/grid/kanban, table rows, create modal) | 111 | operational listing and actions |
| settings components | 111 | forms, tabs, billing and operational states |
| workspace components and campaign detail-only campaign panels | 112 | briefing through performance, sticky actions and workflow overlays |
| dashboard components | 113 | dashboard composition and progression surfaces |
| library route-local asset cards | 113 | gallery, upload and asset actions |
| templates components | 113 | gallery, cards and save template consistency outside workspace |
| restyling components | 113 | standard and quick-tool form surfaces |
| feedback components | 113 | feedback capture, sessions and owner analytics |
| mission-insights visible prompts | 113 | secondary global product feedback surface |
| animation helpers/providers | 113 | route-level motion audit; foundation tokens originate in 109 |
| feedback/mission/providers with no visible UI | no visual migration | behavior preserved; only consumers are visually owned above |
| auth, public share and cookie consent | out of milestone | compatibility only; no authenticated-surface redesign |

Where a directory contains both list and workspace components, ownership is assigned by named subfamily, not by directory alone. A validator should fail duplicate route rows or missing Phase 114 scenarios.

## Browser Baseline Matrix

Phase 109 captures a small representative baseline and freezes the full release matrix. It should not attempt the full combinatorial Phase 114 run.

### Required milestone viewports

Use the requirement widths exactly:

- 390 x 844: mobile portrait
- 768 x 1024: tablet portrait
- 1024 x 768: tablet/compact landscape
- 1280 x 800: compact notebook
- 1440 x 900: standard desktop
- 1920 x 1080: wide desktop

Optional diagnostic widths 320 and 2560 are valuable but do not replace the required set.

### Phase 109 representative capture

| Scenario | Why selected | Required variants in 109 |
|---|---|---|
| Dashboard populated | widest current route, bespoke controls and decorative surface drift | 390 light/PT-BR, 1024 light/PT-BR, 1440 dark/EN, 1920 light/PT-BR |
| Campaign list dense | table/card switch, filters, bulk actions and primitive use | 390 light/PT-BR, 768 light/EN, 1280 dark/PT-BR, 1920 light/PT-BR |
| Campaign workspace populated | sticky offset, widest component composition and overlay risk | 390 light/PT-BR, 1024 dark/EN, 1440 light/PT-BR |
| Settings billing/profile | tabs, form controls, badges and long labels | 390 light/EN, 768 dark/PT-BR, 1280 light/PT-BR |
| One dialog and one sheet | primitive layer/focus proof | 390 and 1440, both themes represented |

Capture screenshots before foundation edits, then repeat after token/primitive proof. Phase 109 acceptance is not visual perfection on these routes. Acceptance is that global foundation changes introduce no new clipping, lost actions, unreadable state or behavior regression, and that observed defects are assigned to the correct later phase.

### Fixture requirements

- Use an authenticated storage state produced by the existing email/password login pattern.
- Prefer deterministic seeded data from `seed-dev-admin.ts` and `seed-testsprite.ts` over production data.
- Include: dense campaign list, one campaign with derivations/statuses/performance content, empty template or library state, long PT-BR label, long EN label, loading/error fixture where deterministic.
- Freeze identifiers in a generated local seed manifest; do not hard-code private production data in screenshots or repository artifacts.
- Mask timestamps, random IDs or unstable image regions when visual comparison would otherwise be noisy.

### Browser assertions beyond screenshots

For each captured route:

```ts
expect(await page.evaluate(() => document.documentElement.scrollWidth))
  .toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth + 1));
```

Also assert:

- Primary action and route heading are visible.
- Fixed navigation does not intersect the main content bounding box.
- Focused controls have a visible focus indicator.
- Dialog/sheet focus stays contained and returns to the trigger on close.
- No `pageerror` or unexpected console error occurs.

## Concrete File Targets and Dependency Order

### Primary implementation targets

| Order | File | Planned change |
|---:|---|---|
| 1 | `.planning/phases/109-visual-foundations-and-baseline/109-OWNERSHIP.md` | route/family owner and Phase 114 scenario inventory |
| 2 | `.planning/phases/109-visual-foundations-and-baseline/109-BASELINE.md` | authenticated fixture/capture matrix and observed defect assignment |
| 3 | `app/src/app/globals.css` | canonical tokens, compatibility aliases, geometry, density, type, radius, motion, layers and utilities |
| 4 | `app/src/components/ui/button.tsx` | consume canonical control/radius/motion roles; preserve API |
| 5 | `app/src/components/ui/input.tsx`, `textarea.tsx` | canonical field geometry/focus/mobile sizing |
| 6 | `app/src/components/ui/badge.tsx`, `StatusBadge.tsx` | semantic state vocabulary and typed status mapping |
| 7 | `app/src/components/ui/dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tooltip.tsx` | consume layer and overlay roles, no behavior rewrite |
| 8 | `app/src/components/ui/table.tsx`, `skeleton.tsx`, `EmptyState.tsx` | density/surface proof and removal of primitive-local visual dialect |
| 9 | `app/scripts/check-visual-contract.mjs` | deterministic debt-aware static enforcement |
| 10 | `app/src/components/ui/visual-foundations.test.tsx` | primitive variants, focus and overlay behavior |
| 11 | `app/tests/e2e/visual-foundations.spec.ts` | authenticated representative browser captures/assertions |
| 12 | `app/playwright.visual.config.ts` or extension of `playwright.config.ts` | viewport projects, auth state, output and stable screenshot policy |
| 13 | `.planning/phases/109-visual-foundations-and-baseline/109-VALIDATION.md` | execution and evidence record generated from Validation Architecture |

The planner may split tests by primitive if the repository's test conventions make a single test file unwieldy. Do not create a new UI framework directory or a public foundation-demo route.

### Dependency order

1. Ownership inventory and fixture contract.
2. Canonical variable names and compatibility policy.
3. Theme values and Tailwind mappings.
4. Geometry/type/density/radius/motion/layer utilities.
5. Primitive proof with focused unit tests.
6. Static visual contract check and allowlist baseline.
7. Authenticated pre/post browser capture and runtime assertions.
8. Documentation of deferred defects by owner phase.
9. Full phase verification.

Do not capture post-change baselines before the primitive/token contract stabilizes. Do capture pre-change screenshots before editing global tokens.

## Risks and Mitigations

### Global token changes recolor or resize the whole app unexpectedly

**Mitigation:** additive aliases first; preserve current values closely; inspect light/dark representative routes after each token family; avoid deleting legacy aliases in Phase 109.

### Primitive proof becomes a broad caller migration

**Mitigation:** preserve primitive APIs and exports; change only shared implementation; log incompatible callers for their owner phase rather than fixing every route.

### Static checks fail on existing debt and become ignored

**Mitigation:** baseline existing violations in an explicit allowlist keyed by file and rule. New violations fail. Owner phases burn down the allowlist.

### Ownership has gaps or duplicate responsibility

**Mitigation:** validate unique route rows, unique named component-family rows, phase range 109-114 and non-empty browser scenario. Treat split directories as named subfamilies.

### Baselines are unstable because data is not deterministic

**Mitigation:** seed a local account/workspace, freeze fixture IDs, disable transitions for capture, wait for network idle plus route-ready selectors, mask timestamps and avoid production data.

### Layer tokens do not solve stacking contexts

**Mitigation:** document that transforms, opacity, filters and isolation create local stacking contexts. Browser tests must exercise a sticky region plus a popover and a modal/sheet, not only inspect class names.

### Compact density harms touch or readability

**Mitigation:** separate visual control height from touch hit area; coarse-pointer checks; 16px mobile field text; 44px touch target; do not reduce expert metadata to gain space.

### Billing work already present in the worktree is disturbed

**Mitigation:** Phase 109 files do not include the currently modified billing repository or billing tests except visual consumption of the shared settings surface in browser capture. Never revert or stage unrelated billing changes.

## Test Strategy and Acceptance Evidence

### Static and unit tests

- Token completeness for `:root` and `.dark`.
- No canonical token references an undefined variable.
- Compatibility aliases resolve toward canonical roles.
- New deprecated hue aliases, raw global z-index levels and unauthorized arbitrary typography/radius values are rejected.
- Button, field, badge/status, dialog and sheet states preserve accessible semantics.
- Dialog/sheet keyboard close and focus return remain intact.
- Reduced-motion rules remain present and motion tokens stay within the product duration contract.

### Browser tests

- Authenticated representative matrix listed above.
- Required screenshots before and after foundation implementation.
- No document-level horizontal overflow.
- No overlap between shell chrome and main content at the captured widths.
- Primitive overlay layer/focus checks.
- Light/dark and PT-BR/EN are represented, not exhaustively combined in this phase.

### Regression gate

Run from `app/`:

```bash
npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx
npm run lint
npm run build
npm run test:e2e -- visual-foundations.spec.ts
node scripts/check-visual-contract.mjs
```

The final validation file must record the exact successful commands and the full `npm test` result rather than copying this focused example blindly.

### Acceptance evidence by requirement

| Requirement | Evidence |
|---|---|
| FOUND-01 | canonical light/dark token table, token completeness test, primitive screenshots |
| FOUND-02 | documented type/spacing/density contract, primitive state tests, mobile/desktop capture |
| FOUND-03 | geometry/content-width/sticky token definitions plus ownership showing Phase 110 consumption |
| FOUND-04 | layer table, source enforcement and dialog/sheet/popover browser stress proof |
| FOUND-05 | shared primitive contract tests and no-new-local-dialect source check |
| QA-14 | validated ownership inventory with exactly one implementation owner and at least one Phase 114 scenario per route/family |

## Validation Architecture

`109-VALIDATION.md` should be created before implementation begins and updated as evidence is produced. It must separate automated checks, browser evidence and manual judgment so that a passing build cannot substitute for visual proof.

### 1. Validation document header

Record:

- Phase, commit/working tree reference and validation date.
- Implementer and reviewer where available.
- Base URL and whether validation used local development, local production build or deployed preview.
- Seed command, test account identifier and fixture manifest path, without secrets.
- Browser engine/version, OS and device emulation details.
- Known unrelated dirty-worktree files excluded from the phase.

### 2. Requirement-to-evidence matrix

Create one row for FOUND-01 through FOUND-05 and QA-14 with:

- Requirement ID.
- Observable assertion.
- Automated check or test file.
- Browser scenario/screenshot IDs.
- Manual review item.
- Result: pass/fail/blocked.
- Evidence path or command output summary.

No requirement may be marked complete from a prose claim alone.

### 3. Token contract validation

Automated checks must prove:

- Every canonical token exists in both light and dark themes where theme-specific.
- Every `var(--name)` in `globals.css` resolves to a declaration or approved external/font variable.
- Tailwind semantic mappings point to canonical roles.
- Legacy aliases point only to canonical roles and are listed as deprecated.
- New authenticated code cannot reference deprecated hue aliases.
- Status aliases map to semantic state families.
- No new pure `#000` or `#fff` canonical values are introduced.

Manual checks compare light and dark screenshots for canvas, base, raised, inset, overlay, text hierarchy, borders, focus, primary accent and each semantic state.

### 4. Geometry and responsive contract validation

Automated source checks confirm geometry variables exist for top bar, bottom navigation, sidebar/rail, gutters, widths and sticky offsets.

Browser checks at 390, 768, 1024, 1280, 1440 and 1920 record:

- `scrollWidth <= clientWidth + 1`.
- Main content begins below visible top chrome.
- Bottom navigation does not cover the last actionable control on mobile.
- Sticky proof element remains visible without covering its section heading or action target.
- Reading/form recipes remain bounded at 1920.
- Wide/gallery recipe gains usable columns or working space without unbounded text measure.

Phase 109 may record existing failures as deferred only when the foundation change did not introduce them and ownership is assigned to Phase 110-113.

### 5. Primitive state validation

For each proof primitive, record default, hover, focus-visible, active/selected, disabled, loading and invalid/error where applicable.

- Button: primary, secondary/outline, quiet/ghost, danger and icon/touch.
- Input/Textarea: default, placeholder, focus, disabled and invalid.
- Badge/Status: neutral, success, warning, danger and info with text/icon/dot meaning.
- Dialog/Sheet: open/close, Escape, backdrop, scroll region, focus trap and focus return.
- Table: compact row, long content and horizontal containment.
- Skeleton/EmptyState: same geometry family as loaded content and canonical action primitive.

Testing Library covers semantics and interaction. Browser captures cover computed visual states and layering.

### 6. Layer stress validation

Use at least two browser compositions:

1. Sticky content + popover/dropdown + toast.
2. Shell + backdrop + dialog or sheet + toast, with no shell control above the backdrop.

Record computed `z-index`, stacking-context ancestors and bounding boxes when a defect occurs. A screenshot alone is insufficient for a stacking failure.

Expected order:

`base < raised < sticky < shell < shell-floating < popover < backdrop < overlay < toast < tour < skip-link`.

### 7. Ownership validation

The ownership validator must fail when:

- An authenticated route is absent.
- A route has more than one implementation phase.
- A visible component family is absent or duplicated.
- An owner is outside Phases 109-114 or out-of-scope without rationale.
- A route/family has no Phase 114 browser scenario.

The validation document includes the inventory checksum or validator output and a human review confirming dynamic routes and server redirects are represented.

### 8. Baseline artifact structure

Store generated screenshots outside source-controlled application directories unless the project explicitly decides to commit approved images. Use stable IDs:

```text
109-dashboard-populated-390-light-ptbr-before.png
109-dashboard-populated-390-light-ptbr-after.png
109-campaigns-dense-1280-dark-ptbr-after.png
109-workspace-overlay-1440-light-ptbr-after.png
109-settings-long-labels-768-dark-ptbr-after.png
```

`109-BASELINE.md` links each artifact, records fixture ID, viewport, theme, locale, expected state, observed defects and owner phase. No screenshot may contain secrets, personal email, access tokens or production-only client data.

### 9. Command gate

The validation document records exact commands and exit results for:

- Focused foundation unit tests.
- Visual contract static checker.
- Focused Playwright foundation spec.
- Full `npm test`.
- `npm run lint`.
- `npm run build`.
- `git diff --check` from repository root.

If unrelated dirty files cause a failure, document the exact failure and re-run a scoped command that proves Phase 109. Do not modify or revert unrelated work.

### 10. Manual sign-off checklist

- Compact and professional, not compressed.
- Green remains restrained and meaningful.
- Tonal planes establish hierarchy before cards.
- Cards imply inspectable/actionable objects.
- No new nested cards, gradient text, decorative glass or side-stripe accents.
- Light and dark remain legible.
- PT-BR and EN examples do not conceal critical information.
- Focus is visible and touch targets remain usable.
- Global changes introduce no new route behavior or data-flow changes.
- Every observed defect is fixed in 109 or assigned to exactly one later phase.

### 11. Exit rule

Phase 109 passes only when all six requirements have evidence, focused and full quality commands pass, representative before/after baselines are reviewed, and the ownership validator reports complete unique coverage. Existing route defects may remain only when documented in `109-BASELINE.md` with a Phase 110-113 owner and no regression from the Phase 109 changes.

## Planning Recommendations

Plan Phase 109 as four bounded plans:

1. **Inventory and pre-change baseline:** ownership artifact, deterministic fixtures and representative screenshots before global edits.
2. **Canonical foundation contract:** colors, aliases, geometry, widths, density, typography, radii, motion, layers and Tailwind mappings.
3. **Primitive proof and enforcement:** narrow shared primitive updates, unit/interaction tests and debt-aware static checker.
4. **Browser proof and validation closure:** post-change captures, overlap/layer assertions, full quality gate and requirement evidence.

This order makes baseline evidence available before global CSS changes and keeps route migration outside the phase.

## Sources Consulted

- `.planning/phases/109-visual-foundations-and-baseline/109-CONTEXT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/research/SUMMARY.md`
- `.planning/research/STACK.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- `PRODUCT.md`
- `DESIGN.md`
- `app/src/app/globals.css`
- Authenticated routes under `app/src/app/(dashboard)/`
- Shared components under `app/src/components/layout/` and `app/src/components/ui/`
- Feature families under `app/src/components/{campaigns,dashboard,feedback,restyling,settings,templates,workspace}/`
- `app/package.json`, `app/playwright.config.ts`, `app/config/vitest.config.ts`
- `app/tests/e2e/restyle.spec.ts`, `app/scripts/seed-dev-admin.ts`, `app/scripts/seed-testsprite.ts`
- `design-an-interface` skill (used to compare CSS-only, broad primitive and narrow contract-plus-proof shapes; the narrow contract-plus-proof approach best preserves phase boundaries)
- Impeccable product, layout, responsive, typography and motion guidance

---

*Research complete: 2026-06-13*
