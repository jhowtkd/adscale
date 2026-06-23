# Painel Administrativo da Plataforma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/feedback` em hub `/admin` com sidebar, dashboard de KPIs, gestão de usuários/workspaces (espelho read-only + audit log) e reorganização das ferramentas de qualidade/operações já existentes.

**Architecture:** Route group `(admin)` com `AdminShell` (sidebar fixa, sem link na nav principal). Auth server-side via `isPlatformOwnerEmail` → `notFound()` para não-owners. Novas APIs em `/api/admin/*` com `requirePlatformOwner`. Componentes existentes (`OwnerAnalyticsPanel`, `BetaSessionsPanel`, triage de feedbacks) movem para rotas dedicadas; `HumanQualityCorpusPanel` é fatiado em views por rota.

**Tech Stack:** Next.js App Router (RSC + client components), Drizzle ORM, TanStack Query, Vitest, next-intl, Tailwind CSS vars do design system existente.

**Spec:** `docs/superpowers/specs/2026-06-21-admin-panel-design.md`

---

## File Map

### Created

| File | Responsibility |
|------|----------------|
| `app/src/app/(admin)/admin/layout.tsx` | Auth gate 404 + `AdminShell` wrapper |
| `app/src/app/(admin)/admin/page.tsx` | Dashboard page |
| `app/src/app/(admin)/admin/users/page.tsx` | User list |
| `app/src/app/(admin)/admin/users/[id]/page.tsx` | User detail + mirror |
| `app/src/app/(admin)/admin/workspaces/[id]/page.tsx` | Workspace detail |
| `app/src/app/(admin)/admin/quality/layout.tsx` | Shared quality filters (scope/cohort) |
| `app/src/app/(admin)/admin/quality/page.tsx` | Redirect → queue |
| `app/src/app/(admin)/admin/quality/queue/page.tsx` | Corpus queue view |
| `app/src/app/(admin)/admin/quality/candidates/page.tsx` | Candidates view |
| `app/src/app/(admin)/admin/quality/calibration/page.tsx` | Calibration view |
| `app/src/app/(admin)/admin/quality/impact/page.tsx` | Impact view |
| `app/src/app/(admin)/admin/quality/reports/page.tsx` | Quality improvement view |
| `app/src/app/(admin)/admin/quality/coverage/page.tsx` | Coverage view |
| `app/src/app/(admin)/admin/quality/trends/page.tsx` | Trend view |
| `app/src/app/(admin)/admin/feedbacks/page.tsx` | Feedback triage (moved) |
| `app/src/app/(admin)/admin/analytics/page.tsx` | Owner analytics |
| `app/src/app/(admin)/admin/sessions/page.tsx` | Beta sessions |
| `app/src/components/admin/AdminShell.tsx` | Sidebar + content area layout |
| `app/src/components/admin/AdminSidebar.tsx` | Nav groups (4 blocos) |
| `app/src/components/admin/DashboardSummary.tsx` | KPI cards + attention list |
| `app/src/components/admin/UserListTable.tsx` | Paginated user table |
| `app/src/components/admin/UserDetailPanel.tsx` | Profile, workspaces, billing |
| `app/src/components/admin/UserActionsPanel.tsx` | Admin write actions + confirm dialogs |
| `app/src/components/admin/UserMirrorPanel.tsx` | Read-only user snapshot |
| `app/src/components/admin/WorkspaceDetailPanel.tsx` | Workspace members + actions |
| `app/src/components/admin/quality/QualityScopeHeader.tsx` | Global/workspace toggle + cohort |
| `app/src/components/admin/quality/CorpusQueueView.tsx` | Extracted from HumanQualityCorpusPanel |
| `app/src/components/admin/quality/CorpusCandidatesView.tsx` | Extracted |
| `app/src/components/admin/quality/CalibrationView.tsx` | Extracted |
| `app/src/components/admin/quality/ImpactView.tsx` | Extracted |
| `app/src/components/admin/quality/QualityReportsView.tsx` | Extracted |
| `app/src/components/admin/quality/CoverageView.tsx` | Extracted |
| `app/src/components/admin/quality/TrendView.tsx` | Extracted |
| `app/src/components/admin/quality/quality-context.tsx` | Shared scope/cohort state from URL |
| `app/drizzle/0051_admin_audit_log.sql` | Migration |
| `app/src/server/repositories/admin-audit.ts` | Audit log writes |
| `app/src/server/repositories/admin-audit.test.ts` | Tests |
| `app/src/server/repositories/admin-users.ts` | User search, detail, mirror |
| `app/src/server/repositories/admin-users.test.ts` | Tests |
| `app/src/server/repositories/admin-dashboard.ts` | KPI aggregations |
| `app/src/server/repositories/admin-dashboard.test.ts` | Tests |
| `app/src/app/api/admin/dashboard/summary/route.ts` | Dashboard API |
| `app/src/app/api/admin/dashboard/summary/route.test.ts` | Tests |
| `app/src/app/api/admin/users/route.ts` | User list API |
| `app/src/app/api/admin/users/route.test.ts` | Tests |
| `app/src/app/api/admin/users/[id]/route.ts` | User detail + PATCH |
| `app/src/app/api/admin/users/[id]/route.test.ts` | Tests |
| `app/src/app/api/admin/users/[id]/mirror/route.ts` | Mirror snapshot API |
| `app/src/app/api/admin/users/[id]/mirror/route.test.ts` | Tests |
| `app/src/app/api/admin/workspaces/[id]/route.ts` | Workspace detail + PATCH |
| `app/src/app/api/admin/workspaces/[id]/route.test.ts` | Tests |
| `app/src/app/(dashboard)/feedback/page.tsx` | Replace with redirect to `/admin/feedbacks` |

### Modified

| File | Change |
|------|--------|
| `app/src/server/db/schema.ts` | Add `adminAuditLog` table |
| `app/src/components/feedback/OwnerAnalyticsPanel.tsx` | Remove embedded `HumanQualityCorpusPanel` |
| `app/src/components/feedback/HumanQualityCorpusPanel.tsx` | Thin re-export wrapper or delete after extraction |
| `app/messages/pt-BR.json` | Add `admin.*` namespace |
| `app/messages/en.json` | Add `admin.*` namespace |
| `app/src/components/feedback/OwnerAnalyticsPanel.test.tsx` | Update for removed corpus embed |
| `app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` | Point at extracted views |

### Removed (final phase)

| File | When |
|------|------|
| `app/src/components/feedback/HumanQualityCorpusPanel.tsx` | After all quality views extracted and tests pass |

---

## Task 1: Admin audit log migration

**Files:**
- Create: `app/drizzle/0051_admin_audit_log.sql`
- Modify: `app/src/server/db/schema.ts`

- [ ] **Step 1: Create migration SQL**

```sql
CREATE TABLE "adscale_app"."admin_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_email" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "payload" jsonb,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'success',
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_audit_log_target_idx" ON "adscale_app"."admin_audit_log" USING btree ("target_type", "target_id");
--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_at_idx" ON "adscale_app"."admin_audit_log" USING btree ("created_at");
```

- [ ] **Step 2: Add table to `schema.ts`** (near other operational tables)

```typescript
export const adminAuditLog = adscaleSchema.table(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    payload: jsonb("payload"),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("success"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("admin_audit_log_target_idx").on(table.targetType, table.targetId),
    index("admin_audit_log_created_at_idx").on(table.createdAt),
  ]
);

export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLog.$inferInsert;
```

- [ ] **Step 3: Run migration**

```bash
cd app && npm run db:migrate
```

Expected: `0051_admin_audit_log` applied without error.

- [ ] **Step 4: Commit**

```bash
git add app/drizzle/0051_admin_audit_log.sql app/src/server/db/schema.ts
git commit -m "feat(admin): add admin_audit_log table"
```

---

## Task 2: Audit log repository

**Files:**
- Create: `app/src/server/repositories/admin-audit.ts`
- Create: `app/src/server/repositories/admin-audit.test.ts`

- [ ] **Step 1: Write failing tests**

`app/src/server/repositories/admin-audit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: { insert: vi.fn() },
}));

import { db } from "@/server/db";
import { recordAdminAuditLog } from "./admin-audit";

describe("recordAdminAuditLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts audit row with required fields", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "audit-1" }]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const id = await recordAdminAuditLog({
      actorEmail: "owner@example.com",
      action: "credits.adjust",
      targetType: "workspace",
      targetId: "ws-1",
      payload: { before: 10, after: 20, delta: 10 },
      reason: "Beta support grant",
      status: "success",
    });

    expect(id).toBe("audit-1");
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: "owner@example.com",
        action: "credits.adjust",
        reason: "Beta support grant",
      })
    );
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd app && npm test -- src/server/repositories/admin-audit.test.ts
```

- [ ] **Step 3: Implement repository**

`app/src/server/repositories/admin-audit.ts`:

```typescript
import { db } from "@/server/db";
import { adminAuditLog, type NewAdminAuditLog } from "@/server/db/schema";

export type RecordAdminAuditInput = Omit<NewAdminAuditLog, "id" | "createdAt"> & {
  reason: string;
};

export async function recordAdminAuditLog(input: RecordAdminAuditInput): Promise<string> {
  const [row] = await db
    .insert(adminAuditLog)
    .values({
      actorEmail: input.actorEmail,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      payload: input.payload ?? null,
      reason: input.reason,
      status: input.status ?? "success",
    })
    .returning({ id: adminAuditLog.id });

  return row.id;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd app && npm test -- src/server/repositories/admin-audit.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/src/server/repositories/admin-audit.ts app/src/server/repositories/admin-audit.test.ts
git commit -m "feat(admin): add audit log repository"
```

---

## Task 3: AdminShell + auth gate + sidebar

**Files:**
- Create: `app/src/components/admin/AdminSidebar.tsx`
- Create: `app/src/components/admin/AdminShell.tsx`
- Create: `app/src/app/(admin)/admin/layout.tsx`
- Create: `app/src/app/(admin)/admin/page.tsx` (placeholder)

- [ ] **Step 1: Create `AdminSidebar.tsx`**

Sidebar client component with 4 nav groups per spec. Use `usePathname()` for active state. Links:

```typescript
const NAV_GROUPS = [
  {
    labelKey: "admin.nav.overview",
    items: [{ href: "/admin", labelKey: "admin.nav.dashboard", icon: LayoutDashboard }],
  },
  {
    labelKey: "admin.nav.platform",
    items: [{ href: "/admin/users", labelKey: "admin.nav.users", icon: Users }],
  },
  {
    labelKey: "admin.nav.quality",
    items: [
      { href: "/admin/quality/queue", labelKey: "admin.nav.qualityQueue" },
      { href: "/admin/quality/candidates", labelKey: "admin.nav.qualityCandidates" },
      { href: "/admin/quality/calibration", labelKey: "admin.nav.qualityCalibration" },
      { href: "/admin/quality/impact", labelKey: "admin.nav.qualityImpact" },
      { href: "/admin/quality/reports", labelKey: "admin.nav.qualityReports" },
      { href: "/admin/quality/coverage", labelKey: "admin.nav.qualityCoverage" },
      { href: "/admin/quality/trends", labelKey: "admin.nav.qualityTrends" },
    ],
  },
  {
    labelKey: "admin.nav.operations",
    items: [
      { href: "/admin/feedbacks", labelKey: "admin.nav.feedbacks" },
      { href: "/admin/analytics", labelKey: "admin.nav.analytics" },
      { href: "/admin/sessions", labelKey: "admin.nav.sessions" },
    ],
  },
] as const;
```

Width: `w-56 shrink-0`, border-right `border-[var(--border-dim)]`, bg `var(--surface-base)`.

- [ ] **Step 2: Create `AdminShell.tsx`**

```typescript
"use client";

import AdminSidebar from "./AdminSidebar";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--deep-bg)]">
      <AdminSidebar />
      <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
    </div>
  );
}
```

No `AppShell`, no `TopBar` nav links — only optional small "ADScale Admin" text in sidebar header.

- [ ] **Step 3: Create auth layout** `app/src/app/(admin)/admin/layout.tsx`

```typescript
import { notFound } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import { getSession } from "@/server/auth/session";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user?.email || !isPlatformOwnerEmail(session.user.email)) {
    notFound();
  }

  return <AdminShell>{children}</AdminShell>;
}
```

- [ ] **Step 4: Placeholder dashboard page** `app/src/app/(admin)/admin/page.tsx`

```typescript
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";

export default function AdminDashboardPage() {
  return (
    <PageFrame width="operational" className="py-8">
      <PageHeader title="Admin" description="Platform owner dashboard" />
    </PageFrame>
  );
}
```

- [ ] **Step 5: Manual smoke**

```bash
cd app && npm run dev
```

Visit `/admin` as `dev@adscale.local` (DEV_ADMIN_EMAIL) → sidebar visible.  
Visit `/admin` logged out or as non-owner → 404 page.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/admin/ app/src/app/\(admin\)/
git commit -m "feat(admin): add AdminShell with platform-owner auth gate"
```

---

## Task 4: `/feedback` redirect

**Files:**
- Modify: `app/src/app/(dashboard)/feedback/page.tsx`

- [ ] **Step 1: Replace page content with permanent redirect**

```typescript
import { permanentRedirect } from "next/navigation";

export default function FeedbackLegacyRedirect() {
  permanentRedirect("/admin/feedbacks");
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/app/\(dashboard\)/feedback/page.tsx
git commit -m "feat(admin): redirect /feedback to /admin/feedbacks"
```

---

## Task 5: Dashboard API + UI

**Files:**
- Create: `app/src/server/repositories/admin-dashboard.ts`
- Create: `app/src/server/repositories/admin-dashboard.test.ts`
- Create: `app/src/app/api/admin/dashboard/summary/route.ts`
- Create: `app/src/app/api/admin/dashboard/summary/route.test.ts`
- Create: `app/src/components/admin/DashboardSummary.tsx`
- Modify: `app/src/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Write repository with KPI queries**

`admin-dashboard.ts` exports `getAdminDashboardSummary()` returning:

```typescript
export type AdminDashboardSummary = {
  activeUsers7d: number;
  pendingFeedbacks: number;
  corpusPending: number;
  failedDerivations24h: number;
  attention: {
    criticalFeedbacks: Array<{ id: string; message: string; createdAt: string }>;
    zeroCreditUsers: Array<{ userId: string; email: string; workspaceId: string }>;
    staleCorpusItems: Array<{ id: string; selectedAt: string }>;
  };
};
```

Query sources:
- `activeUsers7d`: distinct `session.userId` where `updatedAt > now() - 7 days`
- `pendingFeedbacks`: count from `feedbackReports` where status in `new`, `reviewing`
- `corpusPending`: reuse existing human-quality progress query (global scope)
- `failedDerivations24h`: count `derivations` where `status = 'failed'` and `createdAt > now() - 24h`
- `attention.criticalFeedbacks`: last 5 with `severity = critical`, status not `archived`
- `attention.zeroCreditUsers`: users whose primary workspace has `getWorkspaceBillingAccess().creditBalance === 0`
- `attention.staleCorpusItems`: corpus items pending > 7 days, limit 5

- [ ] **Step 2: Write route** `GET /api/admin/dashboard/summary`

```typescript
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { getAdminDashboardSummary } from "@/server/repositories/admin-dashboard";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const summary = await getAdminDashboardSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error, "admin.dashboard.summary.GET");
  }
}
```

- [ ] **Step 3: Write route test** — mock `requirePlatformOwner`, assert 403 for non-owner and 200 shape for owner.

- [ ] **Step 4: Create `DashboardSummary.tsx`**

Client component with `useQuery` on `/api/admin/dashboard/summary`. Four KPI cards (clickable `Link`s per spec). Below: three attention lists (max 5 each).

- [ ] **Step 5: Wire dashboard page**

```typescript
"use client";

import { useTranslations } from "next-intl";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import DashboardSummary from "@/components/admin/DashboardSummary";

export default function AdminDashboardPage() {
  const t = useTranslations("admin.dashboard");
  return (
    <PageFrame width="operational" className="space-y-6 py-8">
      <PageHeader title={t("title")} description={t("description")} />
      <DashboardSummary />
    </PageFrame>
  );
}
```

- [ ] **Step 6: Run tests**

```bash
cd app && npm test -- src/server/repositories/admin-dashboard.test.ts src/app/api/admin/dashboard/summary/route.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add app/src/server/repositories/admin-dashboard* app/src/app/api/admin/dashboard/ app/src/components/admin/DashboardSummary.tsx app/src/app/\(admin\)/admin/page.tsx
git commit -m "feat(admin): add dashboard summary API and KPI cards"
```

---

## Task 6: Migrate operations pages

**Files:**
- Create: `app/src/app/(admin)/admin/feedbacks/page.tsx`
- Create: `app/src/app/(admin)/admin/analytics/page.tsx`
- Create: `app/src/app/(admin)/admin/sessions/page.tsx`
- Modify: `app/src/components/feedback/OwnerAnalyticsPanel.tsx`

- [ ] **Step 1: Move feedback triage**

Copy content from `app/src/app/(dashboard)/feedback/page.tsx` (before redirect replacement) into new `feedbacks/page.tsx`. Remove `OwnerAnalyticsPanel` and `BetaSessionsPanel` imports — only triage grid remains. Keep `PageFrame` + `PageHeader` with `feedback.triage` translations.

- [ ] **Step 2: Analytics page**

```typescript
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { OwnerAnalyticsPanel } from "@/components/feedback/OwnerAnalyticsPanel";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import { useTranslations } from "next-intl";

export default function AdminAnalyticsPage() {
  const t = useTranslations("admin.analytics");
  // sessionOptions query copied from old feedback/page.tsx
  const sessionsQuery = useQuery({ /* ... */ });
  const sessionOptions = useMemo(() => /* ... */, [sessionsQuery.data]);

  return (
    <PageFrame width="operational" className="space-y-6 py-8">
      <PageHeader title={t("title")} description={t("description")} />
      <OwnerAnalyticsPanel sessionOptions={sessionOptions} />
    </PageFrame>
  );
}
```

- [ ] **Step 3: Remove corpus embed from `OwnerAnalyticsPanel.tsx`**

Delete lines at bottom of component:

```typescript
// REMOVE this line from return:
<HumanQualityCorpusPanel />
```

Remove import of `HumanQualityCorpusPanel`.

- [ ] **Step 4: Sessions page**

```typescript
"use client";

import { BetaSessionsPanel } from "@/components/feedback/BetaSessionsPanel";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import { useTranslations } from "next-intl";

export default function AdminSessionsPage() {
  const t = useTranslations("admin.sessions");
  return (
    <PageFrame width="operational" className="space-y-6 py-8">
      <PageHeader title={t("title")} description={t("description")} />
      <BetaSessionsPanel />
    </PageFrame>
  );
}
```

- [ ] **Step 5: Update `OwnerAnalyticsPanel.test.tsx`** — remove assertions about embedded corpus panel if any.

- [ ] **Step 6: Run tests**

```bash
cd app && npm test -- src/components/feedback/OwnerAnalyticsPanel.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add app/src/app/\(admin\)/admin/feedbacks/ app/src/app/\(admin\)/admin/analytics/ app/src/app/\(admin\)/admin/sessions/ app/src/components/feedback/OwnerAnalyticsPanel.tsx app/src/components/feedback/OwnerAnalyticsPanel.test.tsx
git commit -m "feat(admin): migrate feedbacks, analytics and sessions to admin routes"
```

---

## Task 7: Extract quality views from HumanQualityCorpusPanel

**Files:**
- Create: `app/src/components/admin/quality/quality-context.tsx`
- Create: `app/src/components/admin/quality/QualityScopeHeader.tsx`
- Create: 7 view files under `app/src/components/admin/quality/`
- Create: quality route pages + layout
- Modify: `app/src/components/feedback/HumanQualityCorpusPanel.tsx`

This is the largest task. Work **one tab at a time** to avoid a big-bang refactor.

- [ ] **Step 1: Create `quality-context.tsx`**

Client context reading/writing URL search params:

```typescript
"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createContext, useContext, useCallback, type ReactNode } from "react";

export type CorpusScope = "global" | "workspace";

type QualityContextValue = {
  scope: CorpusScope;
  workspaceId: string;
  cohort: string;
  setScope: (scope: CorpusScope) => void;
  setWorkspaceId: (id: string) => void;
  setCohort: (cohort: string) => void;
};

const QualityContext = createContext<QualityContextValue | null>(null);

export function QualityProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const scope = (searchParams.get("scope") as CorpusScope) || "global";
  const workspaceId = searchParams.get("workspaceId") ?? "";
  const cohort = searchParams.get("cohort") ?? "";

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const value: QualityContextValue = {
    scope,
    workspaceId,
    cohort,
    setScope: (s) => updateParams({ scope: s, workspaceId: s === "global" ? null : workspaceId }),
    setWorkspaceId: (id) => updateParams({ workspaceId: id || null }),
    setCohort: (c) => updateParams({ cohort: c || null }),
  };

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

export function useQualityContext() {
  const ctx = useContext(QualityContext);
  if (!ctx) throw new Error("useQualityContext requires QualityProvider");
  return ctx;
}
```

- [ ] **Step 2: Create `QualityScopeHeader.tsx`**

Renders Global/Workspace segmented control, workspace ID input (workspace mode), cohort select. Uses `useQualityContext()`.

- [ ] **Step 3: Create quality layout** `app/src/app/(admin)/admin/quality/layout.tsx`

```typescript
"use client";

import { Suspense } from "react";
import PageFrame from "@/components/layout/PageFrame";
import { QualityProvider } from "@/components/admin/quality/quality-context";
import QualityScopeHeader from "@/components/admin/quality/QualityScopeHeader";

export default function AdminQualityLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFrame width="operational" className="space-y-6 py-8">
      <Suspense fallback={null}>
        <QualityProvider>
          <QualityScopeHeader />
          {children}
        </QualityProvider>
      </Suspense>
    </PageFrame>
  );
}
```

- [ ] **Step 4: Extract `CorpusQueueView.tsx`**

Move queue tab JSX + hooks from `HumanQualityCorpusPanel.tsx` (the `activeTab === "queue"` branch and its state: `selectedItem`, evaluation form, filters). Import `useQualityContext()` for scope/workspaceId. Export as named component.

- [ ] **Step 5: Create queue page**

`app/src/app/(admin)/admin/quality/queue/page.tsx`:

```typescript
"use client";
import { CorpusQueueView } from "@/components/admin/quality/CorpusQueueView";

export default function AdminQualityQueuePage() {
  return <CorpusQueueView />;
}
```

- [ ] **Step 6: Repeat extraction for remaining tabs**

| View file | Source tab | Inner components to move |
|-----------|-----------|--------------------------|
| `CorpusCandidatesView.tsx` | candidates | candidates list + promote |
| `CalibrationView.tsx` | calibration | `CalibrationTabContent` |
| `ImpactView.tsx` | impact | `ImpactTabContent` |
| `QualityReportsView.tsx` | quality | quality improvement content |
| `CoverageView.tsx` | coverage | coverage tab (global only guard) |
| `TrendView.tsx` | trend | trend dashboard content |

Each gets a thin page under `app/src/app/(admin)/admin/quality/<name>/page.tsx`.

- [ ] **Step 7: Quality index redirect**

`app/src/app/(admin)/admin/quality/page.tsx`:

```typescript
import { redirect } from "next/navigation";
export default function AdminQualityIndex() {
  redirect("/admin/quality/queue");
}
```

- [ ] **Step 8: Update `HumanQualityCorpusPanel.tsx`**

Option A (preferred for backward compat during migration): re-export composition that renders all tabs (for any remaining tests).  
Option B: delete file and update `HumanQualityCorpusPanel.test.tsx` to import `CorpusQueueView` directly.

- [ ] **Step 9: Run corpus tests**

```bash
cd app && npm test -- src/components/feedback/HumanQualityCorpusPanel.test.tsx
```

- [ ] **Step 10: Commit per view or one commit**

```bash
git commit -m "feat(admin): extract quality views into dedicated admin routes"
```

---

## Task 8: Admin users repository + list API

**Files:**
- Create: `app/src/server/repositories/admin-users.ts`
- Create: `app/src/server/repositories/admin-users.test.ts`
- Create: `app/src/app/api/admin/users/route.ts`
- Create: `app/src/app/api/admin/users/route.test.ts`
- Create: `app/src/components/admin/UserListTable.tsx`
- Create: `app/src/app/(admin)/admin/users/page.tsx`

- [ ] **Step 1: Implement `searchAdminUsers`**

```typescript
export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
  lastActivityAt: string | null;
  primaryWorkspace: {
    id: string;
    name: string;
    planKey: string | null;
    creditBalance: number;
  } | null;
};

export type AdminUserSearchParams = {
  search?: string;
  page?: number;
  pageSize?: number;
  active7d?: boolean;
  creditsZero?: boolean;
  onboardingIncomplete?: boolean;
  emailUnverified?: boolean;
};
```

Join `user` → `workspaceMembers` (priority owner first, reuse pattern from `getWorkspaceForUser`) → `workspaces`. Credit balance via `getWorkspaceBillingAccess`. Search: `ilike` on email and name.

- [ ] **Step 2: Route `GET /api/admin/users`**

Parse query params, call `searchAdminUsers`, return `{ users, total, page, pageSize }`.

- [ ] **Step 3: `UserListTable.tsx`**

Search input (debounced), filter chips, paginated table with links to `/admin/users/[id]`.

- [ ] **Step 4: Users page**

Wire `PageHeader` + `UserListTable`.

- [ ] **Step 5: Tests + commit**

```bash
cd app && npm test -- src/server/repositories/admin-users.test.ts src/app/api/admin/users/route.test.ts
git commit -m "feat(admin): add user search API and list page"
```

---

## Task 9: User detail, mirror, and write actions

**Files:**
- Create: `app/src/app/api/admin/users/[id]/route.ts`
- Create: `app/src/app/api/admin/users/[id]/mirror/route.ts`
- Create: `app/src/components/admin/UserDetailPanel.tsx`
- Create: `app/src/components/admin/UserActionsPanel.tsx`
- Create: `app/src/components/admin/UserMirrorPanel.tsx`
- Create: `app/src/app/(admin)/admin/users/[id]/page.tsx`

- [ ] **Step 1: `getAdminUserDetail(userId)` in `admin-users.ts`**

Returns profile, all workspace memberships with billing access, recent campaigns (limit 10), recent derivations (limit 10), last session timestamp.

- [ ] **Step 2: `getAdminUserMirror(userId)` in `admin-users.ts`**

Returns sanitized snapshot:

```typescript
export type AdminUserMirror = {
  user: { name: string; email: string };
  workspace: { id: string; name: string; creditBalance: number; remainingAds: number | null };
  recentCampaigns: Array<{ id: string; name: string; status: string; derivationCount: number }>;
};
```

**Must NOT include:** `password`, `accessToken`, `prompt`, `inputPrompt`, `modelResponse`, storage keys.

- [ ] **Step 3: Mirror route test — assert forbidden fields absent**

```typescript
it("does not expose sensitive fields", async () => {
  // ...
  const body = await res.json();
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/password|accessToken|inputPrompt|modelResponse/i);
});
```

- [ ] **Step 4: `PATCH /api/admin/users/[id]`**

Zod schema for actions:

```typescript
const patchUserSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify_email"), reason: z.string().min(1) }),
  z.object({ action: z.literal("reset_onboarding"), reason: z.string().min(1) }),
  z.object({ action: z.literal("unlock_trial_notifications"), reason: z.string().min(1) }),
]);
```

Each action: execute DB update, `recordAdminAuditLog` on success/failure, return `{ ok: true }`.

- [ ] **Step 5: `UserActionsPanel.tsx`**

Buttons open confirm dialog with `reason` textarea (required). On submit: `PATCH` via `apiFetch`. Toast on success/error.

- [ ] **Step 6: `UserMirrorPanel.tsx`**

Banner + read-only cards for mirror data. Campaign links rendered as `<span>` (not clickable) or disabled with `aria-disabled`.

- [ ] **Step 7: User detail page — two-column grid**

```typescript
<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
  <div className="space-y-6">
    <UserDetailPanel userId={id} />
    <UserActionsPanel userId={id} />
  </div>
  <UserMirrorPanel userId={id} />
</div>
```

- [ ] **Step 8: Tests + commit**

```bash
cd app && npm test -- src/app/api/admin/users/\[id\]/
git commit -m "feat(admin): add user detail, mirror snapshot and admin actions"
```

---

## Task 10: Workspace detail + credit/plan actions

**Files:**
- Create: `app/src/app/api/admin/workspaces/[id]/route.ts`
- Create: `app/src/components/admin/WorkspaceDetailPanel.tsx`
- Create: `app/src/app/(admin)/admin/workspaces/[id]/page.tsx`

- [ ] **Step 1: `GET /api/admin/workspaces/[id]`**

Members list, campaigns count, billing access, recent credit transactions (limit 20).

- [ ] **Step 2: `PATCH /api/admin/workspaces/[id]`**

Actions:

```typescript
z.discriminatedUnion("action", [
  z.object({
    action: z.literal("adjust_credits"),
    delta: z.number().int(),
    reason: z.string().min(1),
  }),
  z.object({
    action: z.literal("override_plan"),
    planKey: z.enum(["starter", "growth", "scale"]),
    reason: z.string().min(1),
  }),
]);
```

`adjust_credits`: insert into `creditGrants` or use existing credit adjustment helper if one exists in `app/src/server/billing/credits.ts` — prefer reusing `grantCredits` if available rather than duplicating logic.

`override_plan`: update beta entitlement or subscription record per existing billing patterns in `app/src/server/repositories/billing.ts`.

Always `recordAdminAuditLog`.

- [ ] **Step 3: Workspace detail page**

Reuse `WorkspaceDetailPanel` with members table + action forms.

- [ ] **Step 4: Tests + commit**

```bash
git commit -m "feat(admin): add workspace detail and billing override actions"
```

---

## Task 11: i18n

**Files:**
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

- [ ] **Step 1: Add `admin` namespace** with keys for:

- `admin.nav.*` — all sidebar labels
- `admin.dashboard.*` — title, KPI labels, attention section
- `admin.users.*` — list, detail, actions, mirror banner
- `admin.workspaces.*` — detail, actions
- `admin.analytics.*`, `admin.sessions.*` — page headers
- `admin.actions.*` — confirm dialogs, reason placeholder, success/error toasts

- [ ] **Step 2: Replace hardcoded strings** in all new admin components with `useTranslations("admin.*")`.

- [ ] **Step 3: Commit**

```bash
git add app/messages/pt-BR.json app/messages/en.json
git commit -m "feat(admin): add i18n for admin panel"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd app && npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run build**

```bash
cd app && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Manual smoke checklist**

| Check | Expected |
|-------|----------|
| `/admin` as platform owner | Dashboard KPIs load |
| `/admin` as regular user | 404 |
| `/feedback` | Redirects to `/admin/feedbacks` |
| `/admin/users` | Search returns users |
| `/admin/users/[id]` | Mirror shows campaigns, no sensitive fields |
| Credit adjust with reason | Audit log row created |
| `/admin/quality/queue` | Queue works as before |
| `/admin/analytics` | No corpus panel at bottom |
| TopBar | No admin link visible |

- [ ] **Step 4: Final commit if any fixups**

```bash
git commit -m "chore(admin): fix verification issues"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| `/admin` route group + sidebar | Task 3 |
| 404 for non-owner | Task 3 |
| `/feedback` → `/admin/feedbacks` | Task 4 |
| Dashboard KPIs + attention | Task 5 |
| User list + search + filters | Task 8 |
| User detail + mirror read-only | Task 9 |
| Workspace detail | Task 10 |
| Admin write actions + reason | Tasks 9, 10 |
| `admin_audit_log` | Tasks 1, 2 |
| Quality views per route | Task 7 |
| Operations migration | Task 6 |
| Remove corpus from analytics | Task 6 |
| i18n `admin.*` | Task 11 |
| Tests per spec §11 | Tasks 2, 5, 8, 9, 12 |

**Out of scope (confirmed not in plan):** TopBar link, real impersonation, Stripe manual sync, feature flags, `/api/feedback/*` rename.
