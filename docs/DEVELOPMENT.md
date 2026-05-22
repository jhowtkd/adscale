# Development Guide

This guide covers the day-to-day development workflow for the ADScale application. It assumes you have already completed project setup (see [README.md](../README.md)) and understand the high-level architecture (see [ARCHITECTURE.md](./ARCHITECTURE.md)).

---

## Table of Contents

- [Development Environment Overview](#development-environment-overview)
- [Available npm Scripts](#available-npm-scripts)
- [Code Organization](#code-organization)
- [Adding New API Routes](#adding-new-api-routes)
- [Adding New Database Schema / Migrations](#adding-new-database-schema--migrations)
- [Adding New Components](#adding-new-components)
- [Authentication & Authorization Patterns](#authentication--authorization-patterns)
- [Working with Background Jobs (Inngest)](#working-with-background-jobs-inngest)
- [Working with i18n](#working-with-i18n)
- [Debugging Tips](#debugging-tips)
- [Code Style & Linting](#code-style--linting)
- [Git Workflow](#git-workflow)

---

## Development Environment Overview

The application lives in the `app/` directory. All development commands should be run from there.

### Required Services

| Service | Local Command / URL | Notes |
|---------|---------------------|-------|
| Next.js dev server | `npm run dev` | Runs on `http://localhost:3000` |
| PostgreSQL | `docker-compose up postgres` | Or use a Neon cloud database |
| Inngest dev server | Bundled in `npm run dev` | Available at `http://localhost:8288` |

### Quick Start (Daily)

```bash
cd app

# 1. Ensure database is running (Docker or cloud)
docker-compose up -d postgres

# 2. Apply any new migrations
npm run db:migrate

# 3. Start dev server (Next.js + Inngest)
npm run dev
```

The dev script (`scripts/dev-with-inngest.mjs`) starts both the Next.js dev server and the Inngest CLI in a single terminal. If either process crashes, both shut down cleanly.

---

## Available npm Scripts

| Script | What It Does |
|--------|--------------|
| `npm run dev` | Starts Next.js **and** Inngest dev server together |
| `npm run dev:next` | Starts Next.js dev server only (port 3000, all interfaces) |
| `npm run build` | Production build with standalone output |
| `npm start` | Starts production server (requires `npm run build` first) |
| `npm run lint` | Runs ESLint across the codebase |
| `npm test` | Runs Vitest test suite once (passes with no tests) |
| `npm run inngest:dev` | Starts Inngest CLI manually (points to `/api/inngest`) |
| `npm run db:generate` | Generates Drizzle migration files from schema changes |
| `npm run db:migrate` | Runs pending migrations against the database |
| `npm run db:push` | Pushes schema changes directly (development only, use with caution) |
| `npm run db:studio` | Opens Drizzle Studio for browsing the database |

### Watch Mode Testing

```bash
npx vitest --config config/vitest.config.ts
```

---

## Code Organization

```
app/src/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Protected route group
│   │   ├── campaigns/            # Campaign list & workspace
│   │   ├── templates/            # Campaign templates
│   │   ├── restyling/            # Quick restyling tool
│   │   ├── settings/             # User & workspace settings
│   │   ├── layout.tsx            # Dashboard shell layout
│   │   └── page.tsx              # Dashboard home
│   ├── api/                      # API routes
│   │   ├── auth/[...all]/        # Better Auth catch-all
│   │   ├── campaigns/            # Campaign CRUD
│   │   ├── derivations/          # Derivation operations
│   │   ├── billing/              # Stripe integration
│   │   ├── client-profiles/      # Client reference library
│   │   ├── templates/            # Template API
│   │   ├── exports/              # Export API
│   │   ├── dashboard/            # Dashboard metrics
│   │   ├── inngest/              # Inngest webhook handler
│   │   └── health/               # Health check
│   ├── login/                    # Login page
│   ├── signup/                   # Signup page
│   ├── layout.tsx                # Root layout (i18n, providers)
│   └── globals.css               # Global styles
│
├── components/                   # React components
│   ├── ui/                       # shadcn/ui primitives + custom UI atoms
│   ├── campaigns/                # Campaign list & creation
│   ├── workspace/                # Campaign workspace (brief, plan, derivations, review)
│   ├── templates/                # Template cards & modals
│   ├── restyling/                # Restyling upload & form
│   ├── settings/                 # Settings tabs
│   ├── auth/                     # Auth UI components
│   ├── layout/                   # AppShell, Sidebar, TopBar
│   └── providers/                # React context providers
│
├── server/                       # Server-only code
│   ├── auth/                     # Auth config, session, workspace access
│   ├── db/                       # Drizzle schema & database client
│   ├── repositories/             # Data access layer (per domain)
│   ├── services/                 # Business logic services
│   ├── ai/                       # AI prompt builders & analyzers
│   ├── billing/                  # Stripe integration
│   ├── jobs/                     # Inngest job definitions
│   ├── storage/                  # R2 / S3 storage operations
│   └── validation/               # Environment variable validation
│
├── lib/                          # Shared client utilities
│   ├── hooks/                    # TanStack Query custom hooks
│   ├── api-client.ts             # Authenticated fetch wrapper
│   ├── api-response.ts           # API response helpers
│   ├── auth-client.ts            # Better Auth client
│   ├── store.ts                  # Zustand app store
│   └── utils.ts                  # General utilities
│
└── i18n/                         # i18n configuration
    └── config.ts                 # Locale definitions
```

---

## Adding New API Routes

API routes follow Next.js App Router conventions under `src/app/api/`. Each domain gets its own directory.

### Standard Route Structure

```typescript
// src/app/api/widgets/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createWidget, getWidgets } from "@/server/repositories/widget";

const createWidgetSchema = z.object({
  name: z.string().min(1).max(255),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const widgets = await getWidgets(workspace.id);
    return NextResponse.json({ widgets });
  } catch (error) {
    return handleApiError(error, "widgets.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = createWidgetSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const widget = await createWidget(workspace.id, parsed.data);
    return NextResponse.json({ widget }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "widgets.POST");
  }
}
```

### Checklist for New Routes

1. **Create the route file** at the appropriate path under `src/app/api/`
2. **Call `requireWorkspaceAccess(request)`** as the first step in every handler
3. **Validate request bodies** with Zod schemas
4. **Use repositories** for all database operations — do not write raw Drizzle queries in route handlers
5. **Return using `NextResponse.json()`**
6. **Wrap handlers in `try/catch`** and use `handleApiError(error, "domain.METHOD")`
7. **Add tests** in `tests/` or alongside the repository code

### Nested / Dynamic Routes

For sub-resources, use dynamic segments:

```
api/widgets/[id]/route.ts          → GET /api/widgets/:id, PATCH, DELETE
api/widgets/[id]/items/route.ts    → GET /api/widgets/:id/items, POST
```

---

## Adding New Database Schema / Migrations

The schema is defined in a single file: `src/server/db/schema.ts`.

### 1. Add the Table Definition

```typescript
// src/server/db/schema.ts
export const widgets = adscaleSchema.table(
  "widgets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("widgets_workspace_id_idx").on(table.workspaceId),
  ]
);
```

### 2. Generate the Migration

```bash
npm run db:generate
```

This creates a new `.sql` file under `drizzle/` and updates the migration journal.

### 3. Apply the Migration

```bash
npm run db:migrate
```

### 4. Add a Repository

Create `src/server/repositories/widget.ts`:

```typescript
import { db } from "@/server/db";
import { widgets } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";

export async function getWidgets(workspaceId: string) {
  return db
    .select()
    .from(widgets)
    .where(eq(widgets.workspaceId, workspaceId));
}

export async function createWidget(
  workspaceId: string,
  data: { name: string }
) {
  const result = await db
    .insert(widgets)
    .values({ workspaceId, name: data.name })
    .returning();
  return result[0];
}
```

### Important Rules

- **All tables must be scoped to `workspaceId`** for tenant isolation.
- **Always add indexes** on foreign keys and frequently queried columns.
- **Use `uuid` primary keys** with `crypto.randomUUID()` defaults.
- **Never use `db:push` in production** — always generate and commit migrations.

---

## Adding New Components

### UI Primitives

UI primitives (buttons, inputs, dialogs, etc.) live in `src/components/ui/`. They are built on top of `@base-ui/react` or Radix UI primitives and use `class-variance-authority` (CVA) for variants.

Example pattern:

```typescript
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full ...",
  {
    variants: { variant: { default: "...", secondary: "..." } },
    defaultVariants: { variant: "default" },
  }
);
```

### Domain Components

Feature-specific components are organized by domain:

```
src/components/campaigns/       # Campaign list, cards, creation modal
src/components/workspace/       # Briefing form, plan viewer, derivation gallery
src/components/settings/        # Profile, billing, team tabs
src/components/templates/       # Template cards, template builder
```

### Server vs Client Components

- **Default to Server Components** — no `"use client"` directive needed.
- **Use Client Components** only when you need:
  - Browser APIs (`window`, `localStorage`)
  - React hooks (`useState`, `useEffect`)
  - Event handlers (`onClick`, `onSubmit`)
  - Third-party client-only libraries

Place the `"use client"` directive at the top of the file:

```typescript
"use client";

import { useState } from "react";

export function CampaignForm() {
  const [name, setName] = useState("");
  // ...
}
```

### Component Checklist

1. Use TypeScript interfaces for all props
2. Import UI primitives from `@/components/ui/*`
3. Use Tailwind CSS utility classes; avoid arbitrary values when possible
4. Wrap data fetching in custom hooks under `lib/hooks/`
5. Add tests for complex interactive components

---

## Authentication & Authorization Patterns

### Authentication

The app uses **Better Auth** with email/password and required email verification.

- **Auth handler:** `src/app/api/auth/[...all]/route.ts`
- **Auth config:** `src/server/auth/index.ts`
- **Client:** `src/lib/auth-client.ts`

### Session Validation

API routes should always call `requireWorkspaceAccess(request)`:

```typescript
import { requireWorkspaceAccess } from "@/server/auth/workspace";

export async function GET(request: Request) {
  const { user, workspace } = await requireWorkspaceAccess(request);
  // All subsequent queries are scoped to workspace.id
}
```

### Middleware Protection

`src/middleware.ts` protects dashboard routes by checking for the session cookie before the request reaches the page:

```typescript
const PROTECTED_PREFIXES = ["/campaigns", "/settings"];
const PROTECTED_EXACT = ["/"];
```

If no session cookie is found, the user is redirected to `/login`.

### Workspace Auto-Creation

On user signup, a database hook in `src/server/auth/index.ts` automatically creates a personal workspace and assigns the user as `owner`.

### Auth Error Handling

```typescript
import { isWorkspaceAuthError } from "@/server/auth/workspace";

if (isWorkspaceAuthError(error)) {
  // error.code === "unauthorized" | "no_workspace"
}
```

---

## Working with Background Jobs (Inngest)

Inngest handles durable background execution. The main job is derivation generation, but the pattern applies to any new background work.

### Architecture

- **Client:** `src/server/jobs/client.ts`
- **Job Definitions:** `src/server/jobs/*.ts`
- **Route Handler:** `src/app/api/inngest/route.ts`

### Creating a New Job

```typescript
// src/server/jobs/email-report.ts
import { inngest } from "./client";

export const emailReportJob = inngest.createFunction(
  {
    id: "send-email-report",
    retries: 3,
    onFailure: async ({ event, error }) => {
      console.error("Email report failed:", error);
    },
  },
  { event: "report.email" },
  async ({ event, step }) => {
    const { workspaceId, userId } = event.data;

    const report = await step.run("generate-report", async () => {
      return generateWeeklyReport(workspaceId);
    });

    await step.run("send-email", async () => {
      await sendEmail({ to: userId, subject: "Weekly Report", body: report });
    });

    return { sent: true };
  }
);
```

### Register the Job

Add the new function to the serve array in `src/app/api/inngest/route.ts`:

```typescript
import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/client";
import { derivationJob } from "@/server/jobs/derivation";
import { emailReportJob } from "@/server/jobs/email-report";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [derivationJob, emailReportJob],
});
```

### Sending Events

```typescript
import { inngest } from "@/server/jobs/client";

await inngest.send({
  name: "report.email",
  data: { workspaceId, userId },
});
```

### Local Development

The `npm run dev` command starts the Inngest dev server at `http://localhost:8288`. Use the Inngest Dev UI to inspect events, replay failed jobs, and debug step outputs.

---

## Working with i18n

The app supports **Brazilian Portuguese** (default) and **English** via `next-intl`.

### Configuration

- **Locales:** `src/i18n/config.ts`
- **Request config:** `src/i18n.ts`
- **Messages:** `messages/pt-BR.json`, `messages/en.json`

### Resolution Order

1. Cookie (`locale`)
2. `Accept-Language` header
3. Default (`pt-BR`)

### Adding Translations

Add keys to both message files:

```json
// messages/en.json
{
  "campaigns": {
    "title": "Campaigns",
    "create": "Create Campaign"
  }
}

// messages/pt-BR.json
{
  "campaigns": {
    "title": "Campanhas",
    "create": "Criar Campanha"
  }
}
```

### Using in Components

```typescript
import { useTranslations } from "next-intl";

export function CampaignHeader() {
  const t = useTranslations("campaigns");
  return <h1>{t("title")}</h1>;
}
```

### Using in Server Components / API Routes

```typescript
import { getTranslations } from "next-intl/server";

const t = await getTranslations("errors");
return t("unauthorized");
```

### Changing Locale

The locale is toggled via a UI control that sets the `locale` cookie and refreshes the page. The `src/app/api/user/locale/route.ts` endpoint handles persistence.

---

## Debugging Tips

### Next.js Dev Server

- **Fast Refresh** is enabled. If styles or components do not update, restart the dev server.
- **Console warnings** about hydration mismatches usually mean a server/client prop mismatch. Check for `typeof window` or `Date` differences.

### Database Queries

Use Drizzle Studio to inspect the database in real time:

```bash
npm run db:studio
```

### Background Jobs

1. Open `http://localhost:8288` (Inngest Dev UI)
2. Find the failed or running function
3. Inspect each step's input/output and error traces
4. Use "Replay" to retry a specific event

### API Errors

Every API error is logged with a unique `errorId`:

```
[api-error] { errorId: "uuid", context: "campaigns.POST", error: { ... } }
```

Search logs for the `errorId` to find the root cause.

### Environment Validation

If the app fails to start with a Zod error, check `src/server/validation/env.ts`. Missing or malformed environment variables throw immediately on the first server-side import.

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `401` on all API calls | Missing session cookie | Log in; check `better-auth.session_token` |
| `403` / "No workspace" | User has no workspace | Check database; normally auto-created on signup |
| Images not loading | R2 misconfiguration | Verify `R2_PUBLIC_BASE_URL` and bucket permissions |
| Derivations stuck at "queued" | Inngest not connected | Confirm `npm run dev` started Inngest; check `localhost:8288` |
| Build fails with TypeScript errors | Strict mode violations | Fix `any` types and null checks |

---

## Code Style & Linting

### ESLint

The project uses the Next.js ESLint preset. Run checks with:

```bash
npm run lint
```

### TypeScript

- **Strict mode is enabled.** Avoid `any`. Use `unknown` with type guards when necessary.
- **Path alias:** Use `@/` for all imports from `src/`.

### Tailwind CSS

- Use utility classes directly in components.
- Avoid inline styles except for dynamic values (e.g., image aspect ratios).
- Custom theme tokens (colors, radii) are defined in `globals.css` as CSS variables.

### General Conventions

| Rule | Convention |
|------|------------|
| File naming | `kebab-case.ts` for utilities, `PascalCase.tsx` for components |
| Exports | Prefer named exports for utilities; default exports for page components |
| Async functions | Use `async/await`; avoid `.then()` chains in route handlers |
| Error messages | Use English for log messages; use `next-intl` for user-facing errors |
| Database queries | Always filter by `workspaceId`; never return cross-tenant data |

---

## Git Workflow

### Branch Naming

```
feature/campaign-filters
fix/derivation-timeout
chore/update-dependencies
```

### Commit Messages

Use conventional commits for clarity:

```
feat: add creative diagnosis to campaign brief
fix: handle missing parent derivation in format adaptation
refactor: extract prompt builder into reusable module
docs: update API route examples in DEVELOPMENT.md
```

### Pre-Commit Checklist

Before opening a PR or merging:

1. `npm run lint` passes
2. `npm test` passes
3. `npm run db:generate` produces no unexpected migrations (if schema changed)
4. New features include tests or manual verification steps
5. Environment variables are documented in `docs/CONFIGURATION.md` (if added)

### Pull Request Template (Informal)

- What changed and why
- Link to related planning docs or issues
- Screenshots (for UI changes)
- Testing steps

---

*Document generated from codebase exploration. Last updated: 2026-05-22.*
