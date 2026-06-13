# Phase 111 Context

**Goal:** Shared page primitives and operational surface consistency on `/campaigns` and `/settings`.

**Routes in scope:** `/campaigns`, `/settings` (not workspace, dashboard, library — later phases).

**Families:** FAMILY-CAMPAIGN-LIST, FAMILY-SETTINGS, FAMILY-BILLING-CTA (read-only; BillingTab protected).

**Protected (do not modify):**
- `app/src/components/settings/BillingTab.tsx`
- `app/src/components/settings/BillingTab.test.tsx`
- `app/src/server/repositories/billing.ts`

## Primitives

| Component | Role |
|-----------|------|
| `PageHeader` | Title, description, meta badge, primary actions |
| `PageSection` | Section title + body |
| `Toolbar` | Filter/search row layout |
| `Panel` | Single bordered surface |
| `ResponsiveTabs` | Horizontally scrollable tab nav |

## Migrations

- **Campaigns:** `CampaignsHeader` → `PageHeader`; filter + list unified in `Panel` (SURF-02); `embedded` list mode removes double border.
- **Settings:** `PageHeader` + `ResponsiveTabs`; shared `SettingsTabSkeleton` in `Panel`.

## Requirements

SURF-01 through SURF-05.
