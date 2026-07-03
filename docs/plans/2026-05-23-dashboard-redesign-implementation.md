# Dashboard v2.0 Flat Dimension — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current dashboard with a flat, sharp-edged, data-rich layout that displays real KPIs, campaign list, credit usage, activity feed, and charts — all fed by a new aggregated stats API.

**Architecture:** Build a `GET /api/dashboard/stats` endpoint that aggregates campaigns, derivations, credits, and activity in parallel SQL queries. Build new React components with the flat design system (4px radius, monochrome Lucide icons, dense layout). Replace the existing `page.tsx` and delete legacy dashboard components.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Drizzle ORM, TanStack Query, Recharts, Lucide React, next-intl

---

## Context You Need

**Existing files to study:**
- `app/src/app/(dashboard)/page.tsx` — current dashboard (has hardcoded values)
- `app/src/components/dashboard/` — old components to delete
- `app/src/server/repositories/campaign.ts` — campaign queries
- `app/src/server/repositories/derivation.ts` — derivation queries
- `app/src/server/repositories/billing.ts` — credit/subscription queries
- `app/src/server/repositories/activity.ts` — activity queries (or check if exists)
- `app/src/server/db/schema.ts` — table definitions
<!-- VERIFY: app/src/lib/hooks/use-dashboard.ts — existing dashboard hook — see verification in .planning/tmp/ (file not found; nearest is app/src/lib/hooks/use-dashboard-stats.ts) -->
- `app/src/server/ai/prompt-builder.test.ts` — example test pattern

**Design doc:** `docs/plans/2026-05-23-dashboard-redesign-design.md`
**Wireframe:** `docs/wireframe-framer-flat.html`

---

### Task 1: Dashboard Stats Repository

**Files:**
- Create: `app/src/server/repositories/dashboard.ts`
- Create: `app/src/server/repositories/dashboard.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { getDashboardStats } from "./dashboard";

vi.mock("./campaign", () => ({
  getCampaignsByWorkspace: vi.fn(() => Promise.resolve([
    { id: "1", name: "Test", status: "active", platforms: ["Meta"], createdAt: new Date(), updatedAt: new Date() },
  ])),
}));

vi.mock("./derivation", () => ({
  getDerivationsByWorkspace: vi.fn(() => Promise.resolve([])),
}));

vi.mock("./billing", () => ({
  getAvailableCreditGrants: vi.fn(() => Promise.resolve(100)),
  getActiveSubscriptionByWorkspace: vi.fn(() => Promise.resolve({ planKey: "starter", status: "active" })),
}));

describe("getDashboardStats", () => {
  it("returns aggregated stats", async () => {
    const stats = await getDashboardStats("ws-1");
    expect(stats.totalCampaigns).toBe(1);
    expect(stats.creditsRemaining).toBe(100);
    expect(stats.subscription.planKey).toBe("starter");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/repositories/dashboard.test.ts
```
Expected: FAIL with "Cannot find module './dashboard'"

**Step 3: Write minimal implementation**

```typescript
import { getCampaignsByWorkspace } from "./campaign";
import { getDerivationsByWorkspace } from "./derivation";
import { getAvailableCreditGrants, getActiveSubscriptionByWorkspace } from "./billing";

export interface DashboardStats {
  totalCampaigns: number;
  campaignsChange: number;
  derivationsThisMonth: number;
  derivationsChange: number;
  approvalRate: number;
  approvalChange: number;
  creditsRemaining: number;
  creditsUsedThisMonth: number;
  creditsTotal: number;
  creditUsageSeries: { date: string; used: number; remaining: number }[];
  recentCampaigns: {
    id: string;
    name: string;
    thumbnailUrl: string | null;
    pieceCount: number;
    approvedCount: number;
    status: string;
    platforms: string[];
    updatedAt: Date;
  }[];
  recentActivity: {
    id: string;
    type: string;
    description: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }[];
  subscription: { planKey: string | null; status: string };
}

export async function getDashboardStats(workspaceId: string): Promise<DashboardStats> {
  const campaigns = await getCampaignsByWorkspace(workspaceId);
  const derivations = await getDerivationsByWorkspace(workspaceId);
  const creditBalance = await getAvailableCreditGrants(workspaceId);
  const subscription = await getActiveSubscriptionByWorkspace(workspaceId);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const derivationsThisMonth = derivations.filter(
    (d) => d.createdAt >= startOfMonth
  ).length;

  // Compute approval rate from derivations
  const totalDerivations = derivations.length;
  const approvedDerivations = derivations.filter((d) => d.status === "approved").length;
  const approvalRate = totalDerivations > 0 ? Math.round((approvedDerivations / totalDerivations) * 100) : 0;

  // Mock credit usage series (will be replaced in Task 2)
  const creditUsageSeries = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    used: Math.floor(Math.random() * 20),
    remaining: 100 - Math.floor(Math.random() * 20),
  }));

  // Mock activity (will be replaced in Task 2)
  const recentActivity = [
    {
      id: "1",
      type: "derivation_approved",
      description: "Derivação #3 aprovada em Verão 2025",
      metadata: {},
      createdAt: new Date(),
    },
  ];

  return {
    totalCampaigns: campaigns.length,
    campaignsChange: 0,
    derivationsThisMonth,
    derivationsChange: 0,
    approvalRate,
    approvalChange: 0,
    creditsRemaining: creditBalance,
    creditsUsedThisMonth: 0,
    creditsTotal: 1000,
    creditUsageSeries,
    recentCampaigns: campaigns.slice(0, 5).map((c) => ({
      id: c.id,
      name: c.name,
      thumbnailUrl: null,
      pieceCount: 0,
      approvedCount: 0,
      status: c.status,
      platforms: c.platforms ?? [],
      updatedAt: c.updatedAt,
    })),
    recentActivity,
    subscription: {
      planKey: subscription?.planKey ?? null,
      status: subscription?.status ?? "inactive",
    },
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/repositories/dashboard.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/repositories/dashboard.ts app/src/server/repositories/dashboard.test.ts && git commit -m "feat(dashboard): add dashboard stats repository with aggregation"
```

---

### Task 2: Dashboard Stats API Endpoint

**Files:**
- Create: `app/src/app/api/dashboard/stats/route.ts`
- Create: `app/src/app/api/dashboard/stats/route.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({ workspace: { id: "ws-1" }, user: { id: "u1" } })),
}));

vi.mock("@/server/repositories/dashboard", () => ({
  getDashboardStats: vi.fn(() => Promise.resolve({
    totalCampaigns: 5,
    creditsRemaining: 100,
    subscription: { planKey: "starter", status: "active" },
  })),
}));

describe("GET /api/dashboard/stats", () => {
  it("returns dashboard stats", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/dashboard/stats"));
    const json = await res.json();
    expect(json.totalCampaigns).toBe(5);
  });
});
```

**Step 2: Run test — expect FAIL**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/app/api/dashboard/stats/route.test.ts
```

**Step 3: Implement the route**

```typescript
import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDashboardStats } from "@/server/repositories/dashboard";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const stats = await getDashboardStats(workspace.id);
    return NextResponse.json(stats);
  } catch (error) {
    return handleApiError(error, "dashboard.stats.GET");
  }
}
```

**Step 4: Run test — expect PASS**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/app/api/dashboard/stats/route.test.ts
```

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/app/api/dashboard/stats/ && git commit -m "feat(dashboard): add GET /api/dashboard/stats endpoint"
```

---

### Task 3: useDashboardStats React Hook

**Files:**
- Create: `app/src/lib/hooks/use-dashboard-stats.ts`

**Step 1: Implement the hook**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
// VERIFY: import { useWorkspace } from "./use-workspace" — see verification in .planning/tmp/ (no app/src/lib/hooks/use-workspace.ts; no useWorkspace export found)
import { useWorkspace } from "./use-workspace";

export interface DashboardStats {
  totalCampaigns: number;
  campaignsChange: number;
  derivationsThisMonth: number;
  derivationsChange: number;
  approvalRate: number;
  approvalChange: number;
  creditsRemaining: number;
  creditsUsedThisMonth: number;
  creditsTotal: number;
  creditUsageSeries: { date: string; used: number; remaining: number }[];
  recentCampaigns: {
    id: string;
    name: string;
    thumbnailUrl: string | null;
    pieceCount: number;
    approvedCount: number;
    status: string;
    platforms: string[];
    updatedAt: string;
  }[];
  recentActivity: {
    id: string;
    type: string;
    description: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }[];
  subscription: { planKey: string | null; status: string };
}

async function fetchDashboardStats(workspaceId: string): Promise<DashboardStats> {
  const res = await fetch("/api/dashboard/stats");
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  return res.json();
}

export function useDashboardStats() {
  // VERIFY: const { workspace } = useWorkspace() — see verification in .planning/tmp/ (no useWorkspace function found in app/src/lib/hooks/)
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey: ["dashboard", "stats", workspace?.id],
    queryFn: () => fetchDashboardStats(workspace!.id),
    enabled: !!workspace?.id,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}
```

**Note:** Check if `useWorkspace` exists. If not, use the existing pattern from other hooks (e.g., `useAppStore` or `useAuth`).

**Step 2: Verify hook compiles**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit src/lib/hooks/use-dashboard-stats.ts
```

**Step 3: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/lib/hooks/use-dashboard-stats.ts && git commit -m "feat(dashboard): add useDashboardStats hook with 30s polling"
```

---

### Task 4: KpiCard Component

**Files:**
- Create: `app/src/components/dashboard/KpiCard.tsx`
- Create: `app/src/components/dashboard/KpiCard.test.tsx`

**Step 1: Write failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import KpiCard from "./KpiCard";

describe("KpiCard", () => {
  it("renders value and label", () => {
    render(<KpiCard label="Campanhas" value={47} change={12} changeLabel="vs mês passado" />);
    expect(screen.getByText("47")).toBeInTheDocument();
    expect(screen.getByText("CAMPANHAS")).toBeInTheDocument();
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Implement component**

```tsx
"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: number | string;
  change: number;
  changeLabel: string;
}

export default function KpiCard({ label, value, change, changeLabel }: KpiCardProps) {
  const isPositive = change >= 0;

  return (
    <div className="group relative bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] p-5 transition-all hover:border-[#2a2a32] hover:bg-[#12121a]">
      {/* Left accent line on hover */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#2fb67d] opacity-0 group-hover:opacity-100 transition-opacity rounded-l-[4px]" />

      <div className="text-[11px] text-[#4a4a52] uppercase tracking-wider font-medium mb-2.5">
        {label}
      </div>
      <div className="text-[32px] font-bold text-[#e8e8ec] font-mono leading-none">
        {value}
      </div>
      <div className={cn(
        "flex items-center gap-1 text-xs mt-1.5",
        isPositive ? "text-[#2fb67d]" : "text-[#ef4444]"
      )}>
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        <span>{isPositive ? "↑" : "↓"} {Math.abs(change)}% {changeLabel}</span>
      </div>
    </div>
  );
}
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/components/dashboard/KpiCard.tsx app/src/components/dashboard/KpiCard.test.tsx && git commit -m "feat(dashboard): add KpiCard component"
```

---

### Task 5: CampaignList Component

**Files:**
- Create: `app/src/components/dashboard/CampaignList.tsx`

**Step 1: Implement component**

```tsx
"use client";

import { Star, ChevronDown } from "lucide-react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  pieceCount: number;
  approvedCount: number;
  status: string;
  platforms: string[];
  updatedAt: string;
}

interface CampaignListProps {
  campaigns: Campaign[];
}

const statusConfig: Record<string, { dot: string; label: string }> = {
  active: { dot: "bg-[#2fb67d]", label: "Ativa" },
  draft: { dot: "bg-[#f59e0b]", label: "Rascunho" },
  archived: { dot: "bg-[#4a4a52]", label: "Arquivada" },
};

export default function CampaignList({ campaigns }: CampaignListProps) {
  return (
    <div className="bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a24]">
        <h3 className="text-sm font-semibold text-[#e8e8ec]">Campanhas Recentes</h3>
        <Link href="/campaigns" className="text-xs text-[#4a4a52] hover:text-[#2fb67d] transition-colors">
          Ver Todas →
        </Link>
      </div>
      <div>
        {campaigns.map((campaign) => {
          const status = statusConfig[campaign.status] ?? statusConfig.draft;
          return (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="flex items-center gap-3.5 px-5 py-3.5 border-b border-[#14141c] last:border-b-0 transition-colors hover:bg-[#12121a] group"
            >
              <div
                className="w-11 h-11 rounded-[4px] flex-shrink-0 relative overflow-hidden"
                style={{
                  background: campaign.thumbnailUrl
                    ? `url(${campaign.thumbnailUrl}) center/cover`
                    : "linear-gradient(135deg, #667eea, #764ba2)",
                }}
              >
                <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#e8e8ec] truncate">
                  {campaign.name}
                </div>
                <div className="text-xs text-[#4a4a52]">
                  {campaign.pieceCount} peças · {campaign.platforms.join(", ")}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#6e6e7a] min-w-[80px]">
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="w-7 h-7 rounded-[4px] flex items-center justify-center text-[#4a4a52] hover:bg-[#1a1a24] hover:text-[#e8e8ec] transition-colors">
                  <Star size={14} />
                </button>
                <button className="w-7 h-7 rounded-[4px] flex items-center justify-center text-[#4a4a52] hover:bg-[#1a1a24] hover:text-[#e8e8ec] transition-colors">
                  <ChevronDown size={14} />
                </button>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run build 2>&1 | grep -i "error" | head -5
```
Expected: No errors related to CampaignList

**Step 3: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/components/dashboard/CampaignList.tsx && git commit -m "feat(dashboard): add CampaignList component"
```

---

### Task 6: CreditPanel Component

**Files:**
- Create: `app/src/components/dashboard/CreditPanel.tsx`

**Step 1: Implement component**

```tsx
"use client";

import Link from "next/link";

interface CreditPanelProps {
  remaining: number;
  total: number;
  planKey: string | null;
  renewalDate?: string;
}

export default function CreditPanel({ remaining, total, planKey, renewalDate }: CreditPanelProps) {
  const percentage = total > 0 ? Math.round((remaining / total) * 100) : 0;

  return (
    <div className="bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a24]">
        <h3 className="text-sm font-semibold text-[#e8e8ec]">Créditos</h3>
        <Link href="/settings?tab=billing" className="text-xs text-[#4a4a52] hover:text-[#2fb67d] transition-colors">
          Upgrade
        </Link>
      </div>
      <div className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <span className="text-2xl font-bold font-mono text-[#e8e8ec]">{remaining}</span>
            <span className="text-sm text-[#4a4a52] ml-1">/ {total.toLocaleString()}</span>
          </div>
          <span className="text-xs text-[#2fb67d]">{percentage}%</span>
        </div>
        <div className="h-1 rounded-[2px] bg-[#1a1a24] overflow-hidden">
          <div
            className="h-full rounded-[2px] bg-[#2fb67d] transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex justify-between mt-2.5 text-xs text-[#4a4a52]">
          <span className="capitalize">Plano {planKey ?? "Free"}</span>
          {renewalDate && <span>Renova em {renewalDate}</span>}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/components/dashboard/CreditPanel.tsx && git commit -m "feat(dashboard): add CreditPanel component"
```

---

### Task 7: ActivityFeed Component

**Files:**
- Create: `app/src/components/dashboard/ActivityFeed.tsx`

**Step 1: Implement component**

```tsx
"use client";

import { Check, Zap, Upload, Users } from "lucide-react";

interface Activity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
}

interface ActivityFeedProps {
  activities: Activity[];
}

const activityIcons: Record<string, React.ReactNode> = {
  derivation_approved: <Check size={14} />,
  derivations_generated: <Zap size={14} />,
  creative_uploaded: <Upload size={14} />,
  invite_accepted: <Users size={14} />,
};

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a24]">
        <h3 className="text-sm font-semibold text-[#e8e8ec]">Atividade</h3>
        <span className="text-xs text-[#4a4a52] hover:text-[#2fb67d] cursor-pointer transition-colors">
          Ver Mais →
        </span>
      </div>
      <div className="py-1">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="flex gap-2.5 px-5 py-2.5 border-b border-[#14141c] last:border-b-0 hover:bg-[#12121a] transition-colors"
          >
            <div className="w-7 h-7 rounded-[4px] bg-[#1a1a24] flex items-center justify-center text-[#6e6e7a] flex-shrink-0">
              {activityIcons[activity.type] ?? <Check size={14} />}
            </div>
            <div>
              <div
                className="text-[13px] text-[#b4b4be] leading-snug"
                dangerouslySetInnerHTML={{ __html: activity.description }}
              />
              <div className="text-[11px] text-[#4a4a52] mt-0.5">
                {formatTimeAgo(activity.createdAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Note:** The `dangerouslySetInnerHTML` is used because the description contains `<strong>` tags. Consider parsing this safely or using a different data structure.

**Step 2: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/components/dashboard/ActivityFeed.tsx && git commit -m "feat(dashboard): add ActivityFeed component"
```

---

### Task 8: CreditChart Component

**Files:**
- Create: `app/src/components/dashboard/CreditChart.tsx`

**Step 1: Implement component using Recharts**

```tsx
"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface DataPoint {
  date: string;
  used: number;
  remaining: number;
}

interface CreditChartProps {
  data: DataPoint[];
}

const ranges = ["7D", "30D", "90D"] as const;

export default function CreditChart({ data }: CreditChartProps) {
  const [range, setRange] = useState<typeof ranges[number]>("7D");

  // Filter data based on range (simplified — in production, fetch different datasets)
  const filteredData = data.slice(-parseInt(range));

  return (
    <div className="bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a24]">
        <h3 className="text-sm font-semibold text-[#e8e8ec]">Créditos por Semana</h3>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-2 py-1 text-[11px] rounded-[4px] transition-colors",
                range === r
                  ? "bg-[#1a1a24] text-[#e8e8ec]"
                  : "text-[#4a4a52] hover:text-[#6e6e7a]"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filteredData}>
            <XAxis
              dataKey="date"
              tickFormatter={(date) => new Date(date).toLocaleDateString("pt-BR", { weekday: "short" })}
              tick={{ fill: "#4a4a52", fontSize: 10 }}
              axisLine={{ stroke: "#1a1a24" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#4a4a52", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#0e0e14",
                border: "1px solid #1a1a24",
                borderRadius: "4px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#e8e8ec" }}
              itemStyle={{ color: "#b4b4be" }}
            />
            <Bar dataKey="used" fill="#2fb67d" radius={[2, 2, 0, 0]} opacity={0.7} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/components/dashboard/CreditChart.tsx && git commit -m "feat(dashboard): add CreditChart component with Recharts"
```

---

### Task 9: QuickActions Component

**Files:**
- Create: `app/src/components/dashboard/QuickActions.tsx`

**Step 1: Implement component**

```tsx
"use client";

import { Zap, Upload, BookOpen, Users } from "lucide-react";
import Link from "next/link";

const actions = [
  { icon: Zap, label: "Restyling", href: "/restyling" },
  { icon: Upload, label: "Upload", href: "/campaigns/new" },
  { icon: BookOpen, label: "Biblioteca", href: "/library" },
  { icon: Users, label: "Equipe", href: "/settings?tab=team" },
];

export default function QuickActions() {
  return (
    <div className="flex gap-2">
      {actions.map(({ icon: Icon, label, href }) => (
        <Link
          key={label}
          href={href}
          className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] text-[#6e6e7a] bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] transition-all hover:border-[#2fb67d] hover:text-[#e8e8ec] hover:bg-[rgba(47,182,125,0.04)]"
        >
          <Icon size={14} strokeWidth={1.5} />
          {label}
        </Link>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/components/dashboard/QuickActions.tsx && git commit -m "feat(dashboard): add QuickActions component"
```

---

### Task 10: New Dashboard Page

**Files:**
- Modify: `app/src/app/(dashboard)/page.tsx`

**Step 1: Read current page.tsx**

```bash
cat app/src/app/(dashboard)/page.tsx
```

**Step 2: Replace with new implementation**

```tsx
"use client";

import { useDashboardStats } from "@/lib/hooks/use-dashboard-stats";
import KpiCard from "@/components/dashboard/KpiCard";
import QuickActions from "@/components/dashboard/QuickActions";
import CreditChart from "@/components/dashboard/CreditChart";
import CampaignList from "@/components/dashboard/CampaignList";
import CreditPanel from "@/components/dashboard/CreditPanel";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import { useTranslations } from "next-intl";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const { data: stats, isLoading, error } = useDashboardStats();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !stats) {
    return <DashboardError />;
  }

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-[#e8e8ec]">Dashboard</h1>
          <p className="text-[13px] text-[#4a4a52]">
            {stats.totalCampaigns} campanhas, {stats.derivationsThisMonth} derivações este mês
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-4 py-2 text-[13px] text-[#6e6e7a] bg-transparent border border-transparent rounded-[4px] hover:bg-[#1a1a24]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            Buscar
          </button>
          <a
            href="/campaigns/new"
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-[#0a0a0f] bg-[#2fb67d] rounded-[4px] hover:bg-[#259d6a] transition-colors"
          >
            + Nova Campanha
          </a>
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActions />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mt-6">
        <KpiCard
          label={t("kpi.campaigns")}
          value={stats.totalCampaigns}
          change={stats.campaignsChange}
          changeLabel={t("kpi.vsLastMonth")}
        />
        <KpiCard
          label={t("kpi.derivations")}
          value={stats.derivationsThisMonth}
          change={stats.derivationsChange}
          changeLabel={t("kpi.vsLastMonth")}
        />
        <KpiCard
          label={t("kpi.approval")}
          value={`${stats.approvalRate}%`}
          change={stats.approvalChange}
          changeLabel={t("kpi.vsLastMonth")}
        />
        <KpiCard
          label={t("kpi.credits")}
          value={stats.creditsRemaining}
          change={-stats.creditsUsedThisMonth}
          changeLabel={t("kpi.usedThisMonth")}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-[1fr_320px] gap-3 mt-6">
        {/* Left Column */}
        <div className="space-y-3">
          <CreditChart data={stats.creditUsageSeries} />
          <CampaignList campaigns={stats.recentCampaigns} />
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          <CreditPanel
            remaining={stats.creditsRemaining}
            total={stats.creditsTotal}
            planKey={stats.subscription.planKey}
          />
          <ActivityFeed activities={stats.recentActivity} />
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-8 animate-pulse">
      <div className="h-6 bg-[#1a1a24] rounded-[4px] w-32 mb-2" />
      <div className="h-4 bg-[#1a1a24] rounded-[4px] w-64 mb-8" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-[#1a1a24] rounded-[4px]" />
        ))}
      </div>
    </div>
  );
}

function DashboardError() {
  return (
    <div className="p-8 text-center">
      <p className="text-[#e8e8ec]">Erro ao carregar dashboard</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 px-4 py-2 text-sm text-[#0a0a0f] bg-[#2fb67d] rounded-[4px]"
      >
        Tentar novamente
      </button>
    </div>
  );
}
```

**Step 3: Add i18n keys**

Modify `app/messages/pt-BR.json` and `app/messages/en.json`:

```json
{
  "dashboard": {
    "kpi": {
      "campaigns": "Campanhas",
      "derivations": "Derivações",
      "approval": "Aprovação",
      "credits": "Créditos",
      "vsLastMonth": "vs mês passado",
      "usedThisMonth": "usados este mês"
    }
  }
}
```

**Step 4: Verify build**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run build 2>&1 | tail -20
```

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/app/\(dashboard\)/page.tsx app/messages/ && git commit -m "feat(dashboard): replace page with new flat dimension layout"
```

---

### Task 11: Delete Legacy Components

**Files to delete:**
<!-- VERIFY: app/src/components/dashboard/WelcomeBanner.tsx — see verification in .planning/tmp/ (file not found) -->
- `app/src/components/dashboard/WelcomeBanner.tsx`
<!-- VERIFY: app/src/components/dashboard/StatsCardsGrid.tsx — see verification in .planning/tmp/ (file not found) -->
- `app/src/components/dashboard/StatsCardsGrid.tsx`
<!-- VERIFY: app/src/components/dashboard/CreditUsagePanel.tsx — see verification in .planning/tmp/ (file not found) -->
- `app/src/components/dashboard/CreditUsagePanel.tsx`
<!-- VERIFY: app/src/components/dashboard/QuickActionsGrid.tsx — see verification in .planning/tmp/ (file not found) -->
- `app/src/components/dashboard/QuickActionsGrid.tsx`
<!-- VERIFY: app/src/components/dashboard/ActivityFeedPanel.tsx — see verification in .planning/tmp/ (file not found) -->
- `app/src/components/dashboard/ActivityFeedPanel.tsx`
- `app/src/components/dashboard/RecentCampaignsSection.tsx`
- `app/src/components/dashboard/CreditAlertBanner.tsx` (if not used elsewhere)
- `app/src/components/dashboard/AnalyticsSection.tsx` (if not used elsewhere)

**Step 1: Check which old components are still imported**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && grep -rln "WelcomeBanner\|StatsCardsGrid\|CreditUsagePanel\|QuickActionsGrid\|ActivityFeedPanel\|RecentCampaignsSection" src/
```

**Step 2: Delete unused components**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && rm -f \
  src/components/dashboard/WelcomeBanner.tsx \
  src/components/dashboard/StatsCardsGrid.tsx \
  src/components/dashboard/CreditUsagePanel.tsx \
  src/components/dashboard/QuickActionsGrid.tsx \
  src/components/dashboard/ActivityFeedPanel.tsx \
  src/components/dashboard/RecentCampaignsSection.tsx
```

**Step 3: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add -A && git commit -m "refactor(dashboard): delete legacy dashboard components"
```

---

### Task 12: Run Full Test Suite + Build

**Step 1: Run tests**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm test
```
Expected: All 318+ tests pass

**Step 2: Run build**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run build
```
Expected: Build succeeds with zero TypeScript errors

**Step 3: Commit final state**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add -A && git commit -m "v6.0: Dashboard v2.0 Flat Dimension — complete redesign with real data"
```

---

## Summary of Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/server/repositories/dashboard.ts` | Create | Aggregated stats queries |
| `src/server/repositories/dashboard.test.ts` | Create | Repository tests |
| `src/app/api/dashboard/stats/route.ts` | Create | API endpoint |
| `src/app/api/dashboard/stats/route.test.ts` | Create | API tests |
| `src/lib/hooks/use-dashboard-stats.ts` | Create | React Query hook |
| `src/components/dashboard/KpiCard.tsx` | Create | KPI card component |
| `src/components/dashboard/CampaignList.tsx` | Create | Campaign list |
| `src/components/dashboard/CreditPanel.tsx` | Create | Credit usage panel |
| `src/components/dashboard/ActivityFeed.tsx` | Create | Activity feed |
| `src/components/dashboard/CreditChart.tsx` | Create | Recharts bar chart |
| `src/components/dashboard/QuickActions.tsx` | Create | Quick action chips |
| `src/app/(dashboard)/page.tsx` | Replace | New dashboard page |
| `messages/pt-BR.json` / `en.json` | Modify | i18n keys |
| 6 legacy components | Delete | Remove old dashboard |

---

**Plan saved to:** `docs/plans/2026-05-23-dashboard-redesign-implementation.md`

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?
