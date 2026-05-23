# Dashboard Redesign — Design Document

**Date:** 2026-05-23
**Status:** Approved
**Topic:** Dashboard v2.0 — Flat Dimension Style

---

## 1. Goal

Redesign the ADScale dashboard from a static, data-poor layout into a dense, functional, design-tool-inspired workspace that:

- Displays **real data** for all KPIs (no hardcoded values)
- Surfaces **all existing dashboard features** (stats, analytics, quick actions, activity feed, credit usage)
- Uses a **flat, sharp-edged aesthetic** with monochrome linear icons
- Feels like a professional design tool (Figma/Sketch/Linear hybrid)
- Supports **live updates** via polling

---

## 2. Visual Direction

### 2.1 Design Principles

| Principle | Application |
|-----------|-------------|
| **Flat** | No glassmorphism, no blur, no glow effects. Solid borders and backgrounds only. |
| **Sharp edges** | Border radius capped at `4px` for all cards, buttons, inputs, and thumbnails. |
| **Monochrome icons** | All icons use `stroke-width: 1.5`, `fill: none`, `currentColor`. No colored icons. |
| **Dense** | Minimal whitespace. Information-dense layout like Linear/GitHub. |
| **Functional hover** | Hover reveals actions (⋮ menu on campaign rows) rather than decorative effects. |
| **Dark-first** | Dashboard remains dark mode. No light mode variant in this phase. |

### 2.2 Color Palette

```
Background:        #0a0a0f
Surface (cards):   #0e0e14
Border:            #1a1a24
Border hover:      #2a2a32
Text primary:      #e8e8ec
Text secondary:    #b4b4be
Text muted:        #6e6e7a
Text disabled:     #4a4a52
Accent (mint):     #2fb67d
Accent hover:      #259d6a
Danger:            #ef4444
Warning:           #f59e0b
```

### 2.3 Typography

- **Font:** System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
- **Numbers:** `font-family: 'SF Mono', monospace` for KPIs and stats
- **Scale:**
  - Page title: `18px / font-weight: 600`
  - Section title: `14px / font-weight: 600`
  - Body: `14px / font-weight: 400`
  - Meta/caption: `12px / font-weight: 400`
  - KPI value: `32px / font-weight: 700 / monospace`
  - KPI label: `11px / font-weight: 500 / uppercase / letter-spacing: 0.5px`

### 2.4 Spacing Scale

```
4px  - tight internal gaps
8px  - button padding, icon gaps
12px - card internal padding
16px - section padding
20px - large card padding
24px - content block gaps
32px - page padding
```

---

## 3. Layout Architecture

### 3.1 Grid Structure

```
┌────────────────────────────────────────────────────────────┐
│  [Sidebar]  │  [Topbar: Dashboard + Actions]               │
│             ├──────────────────────────────────────────────┤
│  64px       │  [Quick Actions Chips]                       │
│  fixed      ├──────────────────────────────────────────────┤
│             │  [KPI Row: 4 cards]                          │
│             ├──────────────────────────────────────────────┤
│             │  ┌──────────────────────┐  ┌──────────────┐  │
│             │  │  [Chart: Credits]    │  │ [Credits]    │  │
│             │  │  toggle: 7D/30D/90D  │  │ bar + stats  │  │
│             │  ├──────────────────────┤  ├──────────────┤  │
│             │  │  [Campaign List]     │  │ [Activity]   │  │
│             │  │  rows with thumbs    │  │ feed         │  │
│             │  └──────────────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Breakpoints

| Breakpoint | Layout Change |
|------------|---------------|
| `≥1280px`  | Full layout: sidebar + 2-column grid |
| `≥1024px`  | 2-column grid, sidebar collapses to icons-only |
| `≥768px`   | Single column, right panel stacks below |
| `<768px`   | Mobile: hide sidebar, hamburger menu, stacked everything |

---

## 4. Component Specifications

### 4.1 Sidebar (`Sidebar.tsx`)

- **Width:** `64px`
- **Background:** `#0e0e14`
- **Border-right:** `1px solid #1a1a24`
- **Items:**
  - Logo (32×32, radius 4px, mint bg)
  - Nav items (40×40, radius 4px)
  - Active state: `background: rgba(47,182,125,0.08); color: #2fb67d`
  - Hover state: `background: #1a1a24; color: #e8e8ec`
- **Icons:** Lucide icons, 20×20, stroke 1.5, monochrome

**Navigation items:**
1. Dashboard (active by default)
2. Quick Tools
3. Library
4. Analytics
5. Settings
6. Profile

### 4.2 Topbar (`TopBar.tsx`)

- **Height:** `56px`
- **Left:** Page title + workspace subtitle
- **Right:** Search button + "+ Nova Campanha" primary button
- **Search button:** `⌘K` shortcut visible

### 4.3 KPI Card (`KpiCard.tsx`)

- **Grid:** 4 columns, gap 12px
- **Card:** `background: #0e0e14; border: 1px solid #1a1a24; radius: 4px; padding: 20px`
- **Hover:** `border-color: #2a2a32; background: #12121a` + green left border (3px)
- **Content:**
  - Label: uppercase, 11px, muted
  - Value: 32px, monospace, bold
  - Change: 12px, green/red with arrow

**KPIs to display:**
1. **Campanhas** — total campaigns count + MoM change
2. **Derivações** — derivations this month + MoM change
3. **Aprovação** — approval rate + MoM change
4. **Créditos** — remaining credits + used this month

### 4.4 Quick Actions (`QuickActions.tsx`)

- **Layout:** Horizontal row of chips
- **Chip:** `padding: 8px 14px; border: 1px solid #1a1a24; radius: 4px; background: #0e0e14`
- **Hover:** `border-color: #2fb67d; color: #e8e8ec; background: rgba(47,182,125,0.04)`
- **Icons:** 14×14, left of label

**Actions:**
1. ⚡ Restyling
2. 📤 Upload
3. 📚 Biblioteca
4. 👥 Equipe

### 4.5 Chart Section (`CreditChart.tsx`)

- **Type:** Bar chart (credits consumed per day)
- **Toggle:** 7D / 30D / 90D buttons
- **Style:** Flat bars, radius 2px, mint fill at 70% opacity
- **Hover:** Bar fill opacity → 100%
- **Library:** Use existing Recharts setup (already in AnalyticsSection)

### 4.6 Campaign List (`CampaignList.tsx`)

- **Rows:** Full-width rows with bottom border
- **Columns:** Thumb | Name+Meta | Status | (Actions on hover)
- **Thumb:** 44×44, radius 4px, gradient placeholder (uses campaign asset)
- **Hover:** Row background → `#12121a`, actions fade in
- **Actions (hover):** ⭐ Favorite, ▼ Expand/Details

**Row content:**
- Name (14px, bold)
- Meta: "{count} peças · {platforms}" (12px, muted)
- Status: colored dot + text (12px)

### 4.7 Credit Panel (`CreditPanel.tsx`)

- **Layout:** Simple horizontal bar + text
- **Bar:** 4px height, radius 2px, track `#1a1a24`, fill `#2fb67d`
- **Text:** `340 / 1,000` + `34%` right-aligned
- **Footer:** Plan name + renewal date

### 4.8 Activity Feed (`ActivityFeed.tsx`)

- **Items:** Vertical list with bottom borders
- **Icon:** 28×28 container, radius 4px, bg `#1a1a24`, icon 14×14
- **Text:** Event description with bold entities
- **Time:** 11px, muted

---

## 5. Data Architecture

### 5.1 New API Endpoint: `GET /api/dashboard/stats`

Returns aggregated dashboard data in a single request.

```typescript
interface DashboardStatsResponse {
  // KPIs
  totalCampaigns: number;
  campaignsChange: number; // percentage vs last month
  derivationsThisMonth: number;
  derivationsChange: number;
  approvalRate: number;
  approvalChange: number;
  creditsRemaining: number;
  creditsUsedThisMonth: number;
  creditsTotal: number;

  // Chart data
  creditUsageSeries: {
    date: string; // ISO date
    used: number;
    remaining: number;
  }[];

  // Recent campaigns (top 5)
  recentCampaigns: {
    id: string;
    name: string;
    thumbnailUrl: string | null;
    pieceCount: number;
    approvedCount: number;
    status: "active" | "draft" | "archived";
    platforms: string[];
    updatedAt: string;
  }[];

  // Activity feed (last 10)
  recentActivity: {
    id: string;
    type: "derivation_approved" | "derivations_generated" | "creative_uploaded" | "invite_accepted" | "campaign_created";
    description: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }[];

  // Billing snapshot
  subscription: {
    planKey: string | null;
    status: string;
  };
}
```

### 5.2 Query Strategy

```typescript
// Hook: useDashboardStats
const { data, isLoading, error } = useQuery({
  queryKey: ["dashboard", "stats", workspaceId],
  queryFn: () => fetchDashboardStats(workspaceId),
  refetchInterval: 30000, // 30s polling
  staleTime: 10000,
});
```

**Invalidation triggers:**
- Campaign created → invalidate
- Derivations generated → invalidate
- Credits spent → invalidate
- User returns to dashboard (window focus) → refetch

### 5.3 Backend Implementation

**Repository:** `src/server/repositories/dashboard.ts`

```typescript
export async function getDashboardStats(workspaceId: string): Promise<DashboardStats> {
  // Parallel queries
  const [
    campaigns,
    derivationsThisMonth,
    creditBalance,
    creditUsageSeries,
    recentActivity,
    subscription,
  ] = await Promise.all([
    getCampaignCount(workspaceId),
    getDerivationCountThisMonth(workspaceId),
    getAvailableCreditGrants(workspaceId),
    getCreditUsageSeries(workspaceId, 7),
    getRecentActivity(workspaceId, 10),
    getActiveSubscriptionByWorkspace(workspaceId),
  ]);

  // Compute derived stats
  const totalPieces = campaigns.reduce((sum, c) => sum + c.pieceCount, 0);
  const approvedPieces = campaigns.reduce((sum, c) => sum + c.approvedCount, 0);
  const approvalRate = totalPieces > 0 ? Math.round((approvedPieces / totalPieces) * 100) : 0;

  return {
    totalCampaigns: campaigns.length,
    campaignsChange: computeMoMChange(campaigns.length, /* prev month */),
    derivationsThisMonth,
    derivationsChange: computeMoMChange(derivationsThisMonth, /* prev month */),
    approvalRate,
    approvalChange: 0, // computed from history
    creditsRemaining: creditBalance,
    creditsUsedThisMonth: computeCreditsUsedThisMonth(workspaceId),
    creditsTotal: computeCreditsTotal(workspaceId),
    creditUsageSeries,
    recentCampaigns: campaigns.slice(0, 5),
    recentActivity,
    subscription,
  };
}
```

---

## 6. Functional Requirements

### 6.1 Campaign Row Actions (Hover)

When hovering a campaign row, reveal action buttons:

| Action | Icon | Behavior |
|--------|------|----------|
| Favorite | ⭐ | Toggle `isFavorite` on campaign; optimistic update |
| Details | ▼ | Navigate to campaign detail page |
| More | ⋮ | Dropdown: Edit, Duplicate, Archive, Delete |

### 6.2 Quick Actions

| Action | Destination |
|--------|-------------|
| Restyling | Open `/restyling` modal/page |
| Upload | Open upload modal → create campaign flow |
| Biblioteca | Navigate to `/library` |
| Equipe | Navigate to `/settings?tab=team` |

### 6.3 Activity Feed

- Show last 10 events
- "Ver Mais →" links to `/activity` page (or expands inline)
- Event types map to icons and descriptions

### 6.4 Chart Toggle

- 7D: Last 7 days, daily buckets
- 30D: Last 30 days, daily buckets
- 90D: Last 90 days, weekly buckets

---

## 7. Empty States

### 7.1 New User (0 campaigns)

```
┌────────────────────────────────────────┐
│  [Large illustration: empty canvas]    │
│                                        │
│  Bem-vindo ao ADScale                  │
│  Crie sua primeira campanha para       │
│  começar a gerar variações de criativos│
│                                        │
│  [+ Criar Primeira Campanha]           │
│                                        │
│  Ou use Quick Tools: Restyling | Upload│
└────────────────────────────────────────┘
```

### 7.2 No Activity

Show callout: "Ainda não há atividade. Gere derivações para ver eventos aqui."

### 7.3 No Credits

Credit panel shows: "0 créditos restantes" in red + prominent "Upgrade" CTA

---

## 8. Error Handling

| Scenario | UI Behavior |
|----------|-------------|
| API failure | Show inline error state on affected section (not full page error) |
| Partial data | Render available sections, show skeleton for failed ones |
| Loading | Skeleton loaders matching card shapes (no spinner) |
| No workspace | Redirect to onboarding |

---

## 9. Performance

- **Single API call** for all dashboard data (avoids N+1)
- **30s polling** for live updates
- **Image optimization:** Campaign thumbnails via Next.js Image with lazy loading
- **Virtualization:** Campaign list virtualized if > 50 items
- **Memoization:** KPI cards and activity items use React.memo

---

## 10. Testing Strategy

### 10.1 Unit Tests

- `KpiCard`: renders correct value, change color, hover state
- `CampaignList`: renders rows, hover actions, click navigation
- `CreditPanel`: calculates percentage, shows correct color
- `useDashboardStats`: caching, refetch, error handling

### 10.2 Integration Tests

- `GET /api/dashboard/stats`: returns correct aggregation
- Dashboard page: loads with real data, no hardcoded values
- Quick actions: navigate to correct routes

### 10.3 Visual Regression

- Screenshot test for dashboard at 1280px, 1024px, 768px, 375px

---

## 11. Out of Scope

- Light mode variant
- Drag-and-drop campaign reordering
- Real-time WebSocket updates (polling only for v1)
- Custom dashboard widget arrangement
- Mobile-native gestures

---

## 12. Migration Plan

1. Create `GET /api/dashboard/stats` endpoint + repository
2. Build new components alongside old dashboard (feature flag)
3. Replace old `page.tsx` with new layout
4. Delete old dashboard components:
   - `WelcomeBanner.tsx`
   - `StatsCardsGrid.tsx` (old version)
   - `CreditUsagePanel.tsx` (old version)
   - `QuickActionsGrid.tsx` (old version)
   - `ActivityFeedPanel.tsx` (old version)
   - `RecentCampaignsSection.tsx` (old version)
5. Update routes and navigation

---

## 13. Open Questions

1. Should campaign thumbnails be generated automatically or uploaded manually?
2. Should the chart default to 7D or 30D?
3. Should activity feed include derivation-level events or campaign-level only?

---

**Approved by:** @jhowtkd
**Next step:** Invoke `writing-plans` skill for implementation plan
