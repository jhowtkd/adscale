# Key page dependency trees

Local `@/` and relative component imports, traced recursively. External packages (`next`, `react`, `next-intl`, `lucide-react`, `sonner`, `zod`, `date-fns`) omitted after first mention. Hooks/lib/server modules listed once at the leaf where they first appear.

Studio/home is page 1.

---

## 1. Studio / home — `/`

`app/src/app/(dashboard)/page.tsx`

```
app/src/app/(dashboard)/page.tsx
├── app/src/app/(dashboard)/dashboard-search-params.ts
├── app/src/server/auth/workspace.ts                    (requireWorkspaceAccess)
├── app/src/server/studio-rollout.ts
├── app/src/server/validation/env.ts
└── app/src/components/dashboard/DashboardHomeActions.tsx
    ├── app/src/components/billing/AccessGatePanel.tsx
    │   └── app/src/components/ui/button.tsx
    │       └── app/src/lib/utils.ts
    ├── app/src/components/creative-work/CreativeComposer.tsx
    │   ├── app/src/components/layout/ActiveBrandSwitcher.tsx
    │   │   ├── app/src/components/assistant/AssistantCreateClientDialog.tsx
    │   │   │   ├── app/src/components/ui/dialog.tsx
    │   │   │   ├── app/src/components/ui/button.tsx
    │   │   │   ├── app/src/components/ui/input.tsx
    │   │   │   └── app/src/components/ui/label.tsx
    │   │   └── app/src/components/ui/ConfirmDialog.tsx
    │   │       ├── app/src/components/ui/dialog.tsx
    │   │       └── app/src/components/ui/button.tsx
    │   ├── app/src/components/animations/AnimatedDisplayValue.tsx
    │   ├── app/src/components/ui/contextual-help.tsx
    │   │   └── app/src/components/ui/tooltip.tsx
    │   ├── app/src/components/creative-work/CreativeSourceChip.tsx
    │   ├── app/src/components/creative-work/PieceReferenceStrip.tsx
    │   ├── app/src/components/creative-work/CreativeSourcePreviewCard.tsx
    │   ├── app/src/components/creative-work/CreativeVariationBrief.tsx
    │   ├── app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx
    │   │   ├── app/src/components/creative-work/CreativeResultCard.tsx
    │   │   │   └── app/src/components/animations/ActionStatusIcon.tsx
    │   │   ├── app/src/components/creative-work/layer-editor/LayerEditorDialog.tsx
    │   │   │   ├── app/src/components/ui/dialog.tsx
    │   │   │   ├── app/src/components/ui/button.tsx
    │   │   │   ├── app/src/components/creative-work/layer-editor/LayerCanvas.tsx
    │   │   │   ├── app/src/components/creative-work/layer-editor/LayerPanel.tsx
    │   │   │   │   └── app/src/components/ui/button.tsx
    │   │   │   ├── app/src/components/creative-work/layer-editor/LayerRegenerationPanel.tsx
    │   │   │   └── app/src/components/creative-work/layer-editor/useLayerEditor.ts
    │   │   ├── app/src/components/ui/loader-tetris.tsx
    │   │   └── app/src/components/ui/sheet.tsx
    │   └── app/src/components/creative-work/CarouselComposer.tsx
    │       ├── app/src/components/creative-work/CarouselSequenceBoard.tsx
    │       ├── app/src/components/creative-work/CarouselSlideEditor.tsx
    │       ├── app/src/components/creative-work/CarouselVisualSummary.tsx
    │       └── app/src/components/creative-work/CarouselDeckReview.tsx
    ├── app/src/components/creative-work/CreativeToolCards.tsx
    ├── app/src/components/creative-work/BrandInspirations.tsx
    │   ├── app/src/components/ui/dialog.tsx
    │   └── app/src/components/ui/sheet.tsx
    ├── app/src/components/creative-work/CreativePlanReview.tsx
    ├── app/src/components/creative-work/useCreativeComposer.ts
    │   ├── app/src/components/creative-work/useCarouselComposer.ts
    │   ├── app/src/lib/hooks/use-creative-work.ts
    │   ├── app/src/lib/hooks/use-active-client-profile.ts
    │   ├── app/src/lib/hooks/use-brand-training.ts
    │   ├── app/src/lib/hooks/use-record-beta-event.ts
    │   ├── app/src/lib/assistant/chat-attachments.ts
    │   ├── app/src/lib/api-client.ts
    │   └── app/src/lib/creative-work-protocol-eligibility.ts
    ├── app/src/components/layout/ActiveBrandSwitcher.tsx          (also used in header)
    ├── app/src/components/ui/dialog.tsx                           (CreateCampaignDialog)
    ├── app/src/lib/dashboard/resolve-continue-work.ts
    ├── app/src/lib/hooks/use-canonical-works.ts
    ├── app/src/lib/hooks/use-billing.ts
    ├── app/src/lib/hooks/use-campaigns.ts
    └── app/src/lib/beta-analytics/studio-session.ts
```

Shell around this page: `(dashboard)/layout.tsx` → `DashboardShellSwitcher` → `AppShell` → `V6ShellLayout` + `AppSidebar` (see `layouts.md`).

---

## 2. Overview dashboard — `/dashboard`

`app/src/app/(dashboard)/dashboard/page.tsx`

```
app/src/app/(dashboard)/dashboard/page.tsx
├── app/src/components/dashboard/v6/DashboardV6View.tsx
│   ├── app/src/components/animations/AnimatedDisplayValue.tsx
│   └── app/src/components/dashboard/campaign-status-config.ts
├── app/src/components/dashboard/v6/build-dashboard-v6-labels.ts
├── app/src/components/dashboard/v6/map-dashboard-v6.ts
├── app/src/lib/hooks/use-dashboard-stats.ts
├── app/src/lib/hooks/use-canonical-works.ts
├── app/src/lib/hooks/use-templates.ts
└── app/src/lib/hooks/use-user-profile.ts
```

---

## 3. Library — `/library`

`app/src/app/(dashboard)/library/page.tsx`

```
app/src/app/(dashboard)/library/page.tsx
├── app/src/components/ui/ConfirmDialog.tsx
│   ├── app/src/components/ui/dialog.tsx
│   └── app/src/components/ui/button.tsx
├── app/src/components/ui/EmptyState.tsx
│   ├── app/src/components/animations/FadeIn.tsx
│   └── app/src/components/ui/button.tsx
├── app/src/components/library/v6/LibraryV6View.tsx
├── app/src/components/library/v6/build-library-v6-labels.ts
├── app/src/components/library/v6/map-library-v6.ts
└── app/src/lib/hooks/use-workspace-assets.ts
```

---

## 4. Campaigns list — `/campaigns`

`app/src/app/(dashboard)/campaigns/page.tsx`

```
app/src/app/(dashboard)/campaigns/page.tsx
├── app/src/components/ui/EmptyState.tsx
├── app/src/components/ui/ConfirmDialog.tsx
├── app/src/components/campaigns/CampaignsBulkActionsBar.tsx
│   └── app/src/components/ui/button.tsx
├── app/src/components/campaigns/CampaignsPagination.tsx
│   ├── app/src/components/ui/button.tsx
│   └── app/src/components/ui/select.tsx
├── app/src/components/campaigns/useCampaignsPage.ts
├── app/src/components/campaigns/v6/CampaignsV6View.tsx
│   └── app/src/components/ui/dropdown-menu.tsx
├── app/src/components/campaigns/v6/build-campaigns-v6-labels.ts
├── app/src/components/campaigns/v6/map-canonical-work-to-v6-row.ts
├── app/src/components/campaigns/filter-labels.ts
├── app/src/lib/hooks/use-canonical-works.ts
├── app/src/lib/hooks/use-campaigns.ts
├── (dynamic) app/src/components/campaigns/KanbanBoard.tsx
└── (dynamic) app/src/components/templates/SaveTemplateModal.tsx
```

---

## 5. Campaign workspace — `/campaigns/[id]`

`app/src/app/(dashboard)/campaigns/[id]/page.tsx`

```
app/src/app/(dashboard)/campaigns/[id]/page.tsx
├── app/src/components/ui/ConfirmDialog.tsx
├── app/src/components/campaigns/v6/workspace/CampaignWorkspaceV6View.tsx
│   ├── CampaignWorkspaceBriefingV6Panel
│   └── CampaignWorkspaceV6Chrome
├── app/src/components/campaigns/v6/workspace/build-campaign-workspace-v6-labels.ts
├── app/src/components/campaigns/v6/workspace/map-campaign-workspace-to-v6.ts
├── app/src/lib/hooks/use-assets.ts
├── app/src/lib/store.ts
├── (dynamic) app/src/components/workspace/DeliveryPackageModal.tsx
└── (dynamic) app/src/components/workspace/DerivationReviewSheet.tsx
    └── app/src/components/ui/sheet.tsx
```

---

## 6. Settings — `/settings`

`app/src/app/(dashboard)/settings/page.tsx`

```
app/src/app/(dashboard)/settings/page.tsx
├── app/src/app/(dashboard)/settings/settings-tabs.ts
├── app/src/components/animations/MotionBoundary.tsx
├── app/src/components/settings/v6/SettingsV6View.tsx
├── app/src/components/settings/v6/build-settings-v6-labels.ts
├── app/src/components/settings/v6/map-settings-v6.ts
├── app/src/components/settings/ProfileTab.tsx
│   ├── app/src/components/ui/skeleton.tsx
│   ├── app/src/components/ui/LanguageSwitcher.tsx
│   └── app/src/components/animations/ActionStatusIcon.tsx
├── app/src/components/settings/SettingsTabSkeleton.tsx
│   └── app/src/components/ui/skeleton.tsx
├── (dynamic) WorkspaceTab.tsx → skeleton, ConfirmDialog
├── (dynamic) TeamTab.tsx → Button, EmptyState, ConfirmDialog, Skeleton
├── (dynamic) BillingTab.tsx
├── (dynamic) CreditHistoryTab.tsx
├── (dynamic) PlansTab.tsx
├── (dynamic) IntegrationsTab.tsx → Button
└── (dynamic) PrivacyTab.tsx
```

---

## 7. Login — `/login`

`app/src/app/login/page.tsx`

```
app/src/app/login/page.tsx
└── app/src/app/login/LoginContent.tsx
    ├── app/src/components/auth/AuthPageShell.tsx
    ├── app/src/components/auth/AuthCard.tsx
    ├── app/src/components/auth/v6/AuthV6Header.tsx
    ├── app/src/components/auth/v6/AuthV6Alert.tsx
    ├── app/src/components/auth/PasswordInput.tsx
    │   └── app/src/components/animations/MotionBoundary.tsx
    ├── app/src/components/ui/button.tsx
    ├── app/src/components/ui/input.tsx
    ├── app/src/components/ui/label.tsx
    ├── app/src/lib/auth-client.ts
    └── app/src/lib/auth-callback.ts
```

(`SocialAuthButtons.tsx` is used from Signup / related auth screens.)

---

## 8. Brand kit — `/brand-kit`

`app/src/app/(dashboard)/brand-kit/page.tsx`

```
app/src/app/(dashboard)/brand-kit/page.tsx
├── app/src/components/layout/ActiveBrandSwitcher.tsx
├── app/src/components/settings/BrandKitTab.tsx
├── app/src/components/brand-training/BrandTrainingAssets.tsx
├── app/src/components/brand-training/BrandTrainingWizard.tsx
│   ├── BrandFontFiles
│   └── BrandVoiceSection
├── app/src/components/brand-training/BrandKnowledgeReview.tsx
├── app/src/lib/hooks/use-active-client-profile.ts
└── app/src/lib/hooks/use-brand-training.ts
```

---

## 9. Templates — `/templates`

`app/src/app/(dashboard)/templates/page.tsx`

```
app/src/app/(dashboard)/templates/page.tsx
├── app/src/components/ui/button.tsx
├── app/src/components/ui/EmptyState.tsx
├── app/src/components/layout/PageFrame.tsx
├── app/src/components/layout/PageHeader.tsx
├── app/src/components/layout/Panel.tsx
├── app/src/components/templates/TemplateCard.tsx
│   ├── app/src/components/ui/button.tsx
│   ├── app/src/components/ui/input.tsx
│   ├── app/src/components/ui/badge.tsx
│   └── app/src/components/ui/contextual-help.tsx
└── app/src/lib/hooks/use-templates.ts
```

---

## 10. Creative work resume — `/creative-work/[id]`

`app/src/app/(dashboard)/creative-work/[id]/page.tsx`

```
app/src/app/(dashboard)/creative-work/[id]/page.tsx
└── app/src/components/creative-work/CreativeWorkResumeSurface.tsx
    ├── app/src/components/creative-work/CreativeComposer.tsx   (same subtree as home)
    └── app/src/components/creative-work/useCreativeComposer.ts
```

Bonus (assistant, not counted in the 10): `/assistant` → `AssistantMain` → `AssistantChatCore` / `AssistantStartComposer`; layout wraps `AssistantShell` + `AssistantSidebarPanel` + `AssistantContextPanelSlot`.
