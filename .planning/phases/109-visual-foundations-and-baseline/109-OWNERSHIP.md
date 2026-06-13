# Phase 109 Visual Ownership Contract

This document is the canonical QA-14 ownership inventory. The tables below are parsed by `app/scripts/check-visual-ownership.mjs`; keep IDs and matchers stable and unique.

Implementation owners are restricted to Phases 109-113. `no visual migration` and `out of milestone` are explicit exceptions with rationale. Phase 114 owns browser verification scenarios only.

## Authenticated Routes

| ID | Matcher | Owner | Boundary | Rationale | Phase 114 Scenario |
|---|---|---|---|---|---|
| ROUTE-DASHBOARD | `/` | 113 | Dashboard composition, search, view controls, progression, credits, and route states. | Secondary authenticated surface migration. | SCN-DASHBOARD |
| ROUTE-CAMPAIGNS | `/campaigns` | 111 | Campaign list, grid, kanban, filters, bulk actions, pagination, and list states. | Operational listing and shared route controls. | SCN-CAMPAIGN-LIST |
| ROUTE-CAMPAIGNS-NEW | `/campaigns/new` | 111 | Server create entry and redirect to the created campaign workspace. | Entry contract belongs with campaign listing/settings operations; workspace rendering remains Phase 112. | SCN-CAMPAIGN-CREATE |
| ROUTE-CAMPAIGN-DETAIL | `/campaigns/[id]` | 112 | Campaign workspace, sticky actions, briefing, derivations, performance panels, and workflow overlays. | Dedicated workspace migration. | SCN-CAMPAIGN-WORKSPACE |
| ROUTE-LIBRARY | `/library` | 113 | Asset gallery, upload, asset actions, and empty state. | Secondary authenticated surface migration. | SCN-LIBRARY |
| ROUTE-TEMPLATES | `/templates` | 113 | Template gallery, cards, actions, and empty state. | Secondary authenticated surface migration. | SCN-TEMPLATES |
| ROUTE-RESTYLING | `/restyling` | 113 | Guided restyling upload, form, progress, and validation states. | Secondary authenticated surface migration. | SCN-RESTYLING |
| ROUTE-QUICK-RESTYLING | `/quick-tools/restyling` | 113 | Quick-tool form, long labels, narrow actions, and generated result. | Secondary authenticated surface migration. | SCN-QUICK-RESTYLING |
| ROUTE-FEEDBACK | `/feedback` | 113 | Owner analytics, beta sessions, filters, and dense long content. | Secondary authenticated surface migration. | SCN-FEEDBACK |
| ROUTE-SETTINGS | `/settings` | 111 | Settings tabs, forms, billing, plans, team, integrations, and validation states. | Shared operational forms and controls. | SCN-SETTINGS |
| ROUTE-AUTH-LAYOUT | `authenticated layout` | 110 | App shell, top bar, footer, global navigation, mobile navigation, offsets, and safe areas. | Shared authenticated chrome. | SCN-AUTH-SHELL |

## Visible Component Families

Matchers are repository-relative regular expressions. Tests, type-only files, hooks, and barrel files are explicit validator exclusions because they do not render a visible family.

| ID | Matcher | Owner | Boundary | Rationale | Phase 114 Scenario |
|---|---|---|---|---|---|
| FAMILY-UI-PRIMITIVES | `re:^app/src/components/ui/[^/]+\.tsx$` | 109 | Shared controls, fields, statuses, data states, menus, dialogs, sheets, tooltips, language/theme controls, and Sonner adapter. | Foundation token consumption and representative primitive contracts. | SCN-FOUNDATION-PRIMITIVES |
| FAMILY-LAYOUT | `re:^app/src/components/layout/[^/]+\.tsx$` | 110 | App shell, top bar, footer, deployment guard, and global chrome geometry. | Shell and navigation migration. | SCN-AUTH-SHELL |
| FAMILY-CAMPAIGN-LIST | `re:^app/src/components/campaigns/(CampaignCard\|CampaignListCard\|CampaignTableRow\|CampaignsBulkActionsBar\|CampaignsFilterToolbar\|CampaignsGridView\|CampaignsHeader\|CampaignsListView\|CampaignsPagination\|GridSkeleton\|KanbanBoard\|KanbanCard\|KanbanColumn\|NewCampaignModal\|TableSkeleton)\.tsx$` | 111 | Campaign listing views, list cards/rows, toolbar, bulk actions, create modal, pagination, and list skeletons. | Operational campaign listing migration. | SCN-CAMPAIGN-LIST |
| FAMILY-CAMPAIGN-DETAIL | `re:^app/src/components/campaigns/(CampaignClientSubtitle\|CampaignErrorState\|CampaignNotFoundState\|CampaignSkeleton\|HypothesesPanel\|LearningsPanel\|NextExperimentRecommendationCard\|PerformanceImportPanel)\.tsx$` | 112 | Campaign-detail-only loading/errors, subtitle, hypotheses, learnings, recommendations, and performance import. | These panels render only inside the campaign workspace. | SCN-CAMPAIGN-WORKSPACE |
| FAMILY-WORKSPACE | `re:^app/src/components/workspace/[^/]+\.tsx$` | 112 | Briefing through delivery, sticky actions, derivation gallery, and workspace overlays. | Dedicated campaign workspace migration. | SCN-CAMPAIGN-WORKSPACE |
| FAMILY-DASHBOARD | `re:^app/src/components/dashboard/[^/]+\.tsx$` | 113 | Dashboard cards, feeds, campaign views, progression, credits, and onboarding tour. | Dashboard composition and progression migration. | SCN-DASHBOARD |
| FAMILY-SETTINGS | `re:^app/src/components/settings/[^/]+\.tsx$` | 111 | Profile, workspace, team, billing, plans, credits, integrations, privacy, and brand kit. | Shared operational forms and settings states. | SCN-SETTINGS |
| FAMILY-BILLING-CTA | `re:^app/src/components/billing/[^/]+\.tsx$` | 111 | Billing conversion actions displayed in authenticated operational surfaces. | Billing actions follow the settings/forms owner. | SCN-SETTINGS |
| FAMILY-TEMPLATES | `re:^app/src/components/templates/[^/]+\.tsx$` | 113 | Template cards and save-template modal outside the campaign workspace. | Secondary authenticated surface migration. | SCN-TEMPLATES |
| FAMILY-RESTYLING | `re:^app/src/components/restyling/[^/]+\.tsx$` | 113 | Guided restyling form and upload surfaces. | Secondary authenticated surface migration. | SCN-RESTYLING |
| FAMILY-FEEDBACK-VISIBLE | `re:^app/src/components/feedback/(BetaSessionsPanel\|ContextualFeedbackButton\|FeedbackModal\|FeedbackTriggerButton\|OwnerAnalyticsPanel)\.tsx$` | 113 | Visible feedback capture, trigger, sessions, and owner analytics surfaces. | Secondary/global feedback visual migration. | SCN-FEEDBACK |
| FAMILY-FEEDBACK-NONVISUAL | `re:^app/src/components/feedback/(FeedbackBreadcrumbTracker\|FeedbackProvider)\.tsx$` | no visual migration | Context orchestration and navigation telemetry; visible modal/trigger consumers are owned separately. | Behavior must remain unchanged and has no independent visible surface. | SCN-FEEDBACK |
| FAMILY-MISSION-PROMPT | `re:^app/src/components/mission-insights/MissionInsightPrompt\.tsx$` | 113 | Visible mission insight prompt and its interaction states. | Secondary global product-feedback surface. | SCN-MISSION-INSIGHT |
| FAMILY-MISSION-PROVIDER | `re:^app/src/components/mission-insights/MissionInsightProvider\.tsx$` | no visual migration | Context, persistence, and mutation orchestration; prompt rendering is owned separately. | Provider behavior has no independent visual migration. | SCN-MISSION-INSIGHT |
| FAMILY-ANIMATIONS | `re:^app/src/components/animations/[^/]+\.tsx$` | 113 | Route-level fade and stagger helpers. | Route motion audit follows secondary-surface migration after Phase 109 defines motion tokens. | SCN-ROUTE-MOTION |
| FAMILY-PROVIDERS-NONVISUAL | `re:^app/src/components/providers/(A11yProvider\|MotionProvider\|QueryProvider\|SentryErrorBoundary\|ThemeProvider)\.tsx$` | no visual migration | Application context, instrumentation, theme, query, and motion infrastructure. | These providers have no independent production visual surface. | SCN-AUTH-SHELL |
| FAMILY-TOAST-STACK | `re:^app/src/components/providers/ToastStack\.tsx$` | 109 | Global toast surface and canonical layer/token consumption. | Representative foundation overlay contract. | SCN-LAYER-TOAST |
| FAMILY-AUTH | `re:^app/src/components/auth/[^/]+\.tsx$` | out of milestone | Authentication page shell, cards, password input, and social auth controls. | Public authentication surfaces are outside the authenticated-app refinement milestone. | SCN-AUTH-COMPAT |
| FAMILY-COOKIE-CONSENT | `re:^app/src/components/cookie-consent/[^/]+\.tsx$` | out of milestone | Public cookie-consent banner. | Cookie consent is compatibility-only and outside authenticated-surface redesign. | SCN-COOKIE-COMPAT |

## Phase 114 Scenario Catalog

| ID | Observable Browser State |
|---|---|
| SCN-DASHBOARD | Authenticated populated and empty/error dashboard at milestone widths with search/view controls, credits, progression, and no clipped actions. |
| SCN-CAMPAIGN-LIST | Dense and empty/error campaign list, grid, and kanban with filters, bulk actions, pagination, long PT-BR/EN content, and narrow/ultrawide layouts. |
| SCN-CAMPAIGN-CREATE | Authenticated create entry creates one synthetic campaign, preserves redirect to `/campaigns/[id]`, and presents deterministic failure feedback. |
| SCN-CAMPAIGN-WORKSPACE | Populated campaign workspace with sticky action bar, briefing, derivations, performance panels, loading/error states, and derivation review sheet. |
| SCN-LIBRARY | Dense asset gallery plus upload and empty states with bounded content and visible actions. |
| SCN-TEMPLATES | Populated and empty template gallery with card and save-template actions. |
| SCN-RESTYLING | Guided restyling upload and long form with validation error and generated-result state. |
| SCN-QUICK-RESTYLING | Quick restyling form with long labels and stable narrow-viewport actions. |
| SCN-FEEDBACK | Feedback trigger/modal plus owner analytics and beta-session data with filters and long content. |
| SCN-SETTINGS | Profile and billing tabs, long tab labels, form controls, validation error, brand-kit confirmation dialog, and billing state. |
| SCN-AUTH-SHELL | Every authenticated route exercises top bar, desktop/mobile navigation, footer, notifications, account menu, offsets, and safe areas. |
| SCN-FOUNDATION-PRIMITIVES | Shared controls, fields, statuses, tables, empty/loading/error states, menus, dialogs, sheets, focus, and disabled/invalid variants in both themes. |
| SCN-MISSION-INSIGHT | Visible mission prompt opened from a deterministic synthetic workflow and exercised through dismiss/skip/submit states. |
| SCN-ROUTE-MOTION | Route transitions and animated entries respect reduced motion and do not hide or displace critical content. |
| SCN-LAYER-TOAST | Toast displayed with sticky, shell, popover, backdrop, and overlay compositions at mobile and desktop widths. |
| SCN-AUTH-COMPAT | Public sign-in/sign-up/password surfaces remain behaviorally and visually compatible after authenticated-app changes. |
| SCN-COOKIE-COMPAT | Cookie banner remains readable, operable, and non-overlapping after global foundation changes. |
