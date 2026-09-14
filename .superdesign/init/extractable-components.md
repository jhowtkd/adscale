# Extractable components

Catalog only — **no full source**. Paths from repo root.

---

## Layout / shell

### AppShell

- **Path:** `app/src/components/layout/AppShell.tsx`
- **Category:** layout / app chrome
- **Description:** Default dashboard chrome: wraps children in `V6ShellLayout`, adds a slim fixed header (mobile wordmark + `NotificationMenu`), `main.v6-shell-main`, `Footer`, 5-item mobile bottom nav, and `MobileMoreSheet`.
- **Extractable props:** `children: React.ReactNode`
- **Hardcoded:** Nav destinations (`/`, `/campaigns`, `/library`, `/brand-kit`); “more” active prefixes (`/docs`, `/templates`, `/assistant`, `/settings`, `/feedback`); `ADScale` wordmark; lucide icons; i18n keys `navigation.*` / `library.title`; `#main` landmark.

### V6ShellLayout

- **Path:** `app/src/components/layout/V6ShellLayout.tsx`
- **Category:** layout / providers
- **Description:** Canvas background + `AppSidebar` + children. Wraps `AssistantSurfaceProvider`, `FeedbackProvider`, `MissionInsightProvider`, and `FeedbackBreadcrumbTracker`.
- **Extractable props:** `children: ReactNode`
- **Hardcoded:** Provider stack; `min-h-screen bg-[var(--canvas)]`.

### AppSidebar

- **Path:** `app/src/components/layout/AppSidebar.tsx`
- **Category:** layout / navigation
- **Description:** Floating v6 sidebar (`aside.v6-shell-sidebar`): logo, 4 icon destinations, brand-kit feature card, recent works, docs/settings/feedback, account row (initials avatar) linking to `/dashboard`, logout.
- **Extractable props:** none (reads pathname, session, store, billing, works, owner access internally)
- **Hardcoded:** `/images/logo.svg`; hrefs `/`, `/campaigns`, `/library`, `/brand-kit`, `/docs`, `/settings`, `/feedback`, `/dashboard`, `/login`; initials disc size 30px; logout via `authClient.signOut`.

### DashboardShellSwitcher

- **Path:** `app/src/components/layout/DashboardShellSwitcher.tsx`
- **Category:** layout / routing
- **Description:** If path starts with `/assistant`, uses `V6ShellLayout` + compact mobile header + `assistant-shell-host` main; otherwise `AppShell`.
- **Extractable props:** `children`
- **Hardcoded:** `/assistant` prefix; mobile home/works links.

### TopBar (legacy header)

- **Path:** `app/src/components/layout/TopBar.tsx`
- **Category:** layout / header
- **Description:** Full header with logo, desktop nav, language switcher, feedback, compose CTA, notifications, account dropdown. **Not mounted by v6 AppShell**; v6 uses exported `NotificationMenu` + `deriveRouteTitle`.
- **Extractable props:** `variant?: "floating" | "inline" | "shell-floating"`
- **Hardcoded:** Route-title map; settings tab deep-links; demo restore stub; logo path; `+ New` compose link `/?compose=1`.

### NotificationMenu

- **Path:** `app/src/components/layout/TopBar.tsx` (named export)
- **Category:** layout / header widget
- **Description:** Bell + unread badge + `NotificationPanel` popover used by AppShell / assistant switcher.
- **Extractable props:** `className?: string`
- **Hardcoded:** 30s refetch; grouping copy; campaign deep-links `/campaigns/{id}`.

### MobileMoreSheet

- **Path:** `app/src/components/layout/MobileMoreSheet.tsx`
- **Category:** layout / mobile nav
- **Description:** Bottom sheet with overflow destinations + logout.
- **Extractable props:** `open`, `onOpenChange`
- **Hardcoded:** Items `/dashboard`, `/settings`, `/docs`; logout.

### Footer

- **Path:** `app/src/components/layout/Footer.tsx`
- **Category:** layout / footer
- **Description:** Copyright + privacy/terms links under dashboard main.
- **Extractable props:** none
- **Hardcoded:** `ADScale © 2026`; Portuguese labels `Privacidade` / `Termos`; `/privacy`, `/terms`.

### PageFrame / PageHeader / PageSection / Toolbar / Panel

- **Paths:** `app/src/components/layout/PageFrame.tsx`, `PageHeader.tsx`, `PageSection.tsx`, `Toolbar.tsx`, `Panel.tsx`
- **Category:** layout / page primitives
- **Description:** Width tokens (`content-operational` etc.), title+actions header, section chrome, toolbar row, bordered card panel.
- **Extractable props:**
  - PageFrame: `width`, `className`, `children`
  - PageHeader: `title`, `description?`, `meta?`, `actions?`, `className?`
  - PageSection: `title?`, `description?`, `actions?`, `id?`, `children`, `className?`
  - Toolbar: `children`, `className?`
  - Panel: `padding?: "none"|"sm"|"md"`, `className?`, `children`
- **Hardcoded:** Width class map; product title utility classes.

### ActiveBrandSwitcher

- **Path:** `app/src/components/layout/ActiveBrandSwitcher.tsx`
- **Category:** layout / brand
- **Description:** Native select of client profiles + create dialog + delete confirm.
- **Extractable props:** `id?: string` (default `active-brand-switcher`), `className?`
- **Hardcoded:** Sentinel `__new_brand__`; native `<select>` (not ui/Select).

### SidebarBrandKitFeature

- **Path:** `app/src/components/layout/SidebarBrandKitFeature.tsx`
- **Category:** layout / sidebar widget
- **Description:** Link card to `/brand-kit` showing training status for the active profile.
- **Extractable props:** none
- **Hardcoded:** `/brand-kit`; also treats settings `?tab=brandKit|brandTraining` as active.

### SidebarRecentWorks

- **Path:** `app/src/components/layout/SidebarRecentWorks.tsx`
- **Category:** layout / sidebar widget
- **Description:** Scrollable recent canonical works grouped by brand.
- **Extractable props:** none
- **Hardcoded:** “W” placeholder glyph; work hrefs from canonical works helper.

---

## Home / studio

### DashboardHomeActions

- **Path:** `app/src/components/dashboard/DashboardHomeActions.tsx`
- **Category:** home / studio orchestration
- **Description:** Entire `/` UI: access gate, studio header, continue-work card, arte/briefing mode, tool cards, composer, plan review, inspirations, progressive-rollout variant, create-campaign dialog.
- **Extractable props:** `workId?`, `initialIntent?`, `focusComposer?`, `templateId?`, `studioMode?`, `freshEntry?`, `campaignId?`, `workspaceId?`, `rolloutVariant?`, `carouselCreationEnabled?`
- **Hardcoded:** i18n `dashboard.home.*`; `CreateCampaignDialog` copy; progressive vs control layouts; `#creative-composer-request`; `data-testid` slots.

### CreativeComposer

- **Path:** `app/src/components/creative-work/CreativeComposer.tsx`
- **Category:** home / composer
- **Description:** Request textarea, source upload/chips, piece references, variation/restyle briefs, generate CTA, proposal grid, carousel wizard, brand-conflict UI.
- **Extractable props:** `composer`, `composerRef`, `hideSourceUpload?`, `layout?: "studio"|"piece"`, `workflowVariant?: "control"|"progressive"`, `resultsOnly?`
- **Hardcoded:** Formats `1:1`, `4:5`, `9:16`; element ids `creative-composer-request`, `creative-composer-dropzone`, `creative-composer-original-source`; i18n `dashboard.home.composer.*`.

### CreativeToolCards

- **Path:** `app/src/components/creative-work/CreativeToolCards.tsx`
- **Category:** home / protocol picker
- **Description:** Grid of intents: variations, single (peça), format_adaptation, restyle, optional carousel.
- **Extractable props:** `selected`, `onSelect`, `headerAction?`, `carouselEnabled?`
- **Hardcoded:** Tool ids + lucide icons; focus-target id map; i18n `dashboard.home.tools.*`.

### BrandInspirations (inspirations rail)

- **Path:** `app/src/components/creative-work/BrandInspirations.tsx`
- **Category:** home / inspirations rail
- **Description:** “Add inspiration” trigger opens a right sheet of brand/curated inspirations; preview dialog; attach as restyle style source.
- **Extractable props:** `clientProfileId: string | null`, `onAttach: (inspiration) => boolean | Promise<boolean>`
- **Hardcoded:** Forces `suggestedIntent: "restyle"` on attach; focuses `#creative-composer-original-source`; i18n `dashboard.home.composer.inspirations.*`; sheet `side="right" size="lg"`.

### CreativePlanReview

- **Path:** `app/src/components/creative-work/CreativePlanReview.tsx`
- **Category:** home / plan
- **Description:** Prepared-plan summary (protocol, materials, preserve/explore) with edit/confirm or read-only.
- **Extractable props:** `plan`, `busy`, `onEdit`, `onConfirm`, `readOnly?`
- **Hardcoded:** Protocol label keys; i18n `dashboard.home.planReview.*`.

### ContinueWorkCard (internal)

- **Path:** `app/src/components/dashboard/DashboardHomeActions.tsx` (local function)
- **Category:** home / resume
- **Description:** “Continue where you left off” row with thumbnail from latest completed output.
- **Extractable props:** (not exported) `target`, `brandName`
- **Hardcoded:** Grid layout; `data-testid="continue-work-thumbnail"`; download URL pattern `/api/creative-work/.../download`.

### AccessGatePanel

- **Path:** `app/src/components/billing/AccessGatePanel.tsx`
- **Category:** home / billing
- **Description:** Warning panel when workspace lacks spend access; starter checkout CTA.
- **Extractable props:** none
- **Hardcoded:** `planKey: "starter"`, `returnPath: "/"`; i18n `billing.accessGate.*`.

### CreateCampaignDialog (internal)

- **Path:** `app/src/components/dashboard/DashboardHomeActions.tsx` (local function)
- **Category:** home / campaign grouping
- **Description:** Dialog to name a campaign under the active brand and link it to the current work.
- **Extractable props:** (not exported) `activeProfile`, `onCreated`
- **Hardcoded:** Native `<input>` (not ui/Input); i18n `dashboard.home.campaignDialog.*`.

### DashboardV6View

- **Path:** `app/src/components/dashboard/v6/DashboardV6View.tsx`
- **Category:** overview dashboard (not studio `/`)
- **Description:** KPI cards, activity, templates used by `/dashboard`.
- **Extractable props:** labels + view-model (see `dashboard-v6-types.ts`)
- **Hardcoded:** Card radius/border tokens; CTA copy from labels.

---

## Extraction notes

Highest-value Superdesign targets: **AppShell + AppSidebar + V6ShellLayout** (floating shell), **CreativeComposer + CreativeToolCards + BrandInspirations** (studio), **Panel / PageHeader / PageFrame** (page chrome). Avatar/Card/Tabs should be introduced as primitives wrapping the existing initials disc, Panel, and ResponsiveTabs rather than inventing parallel APIs.
