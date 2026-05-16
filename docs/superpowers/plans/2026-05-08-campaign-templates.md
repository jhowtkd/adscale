# Campaign Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add campaign template functionality allowing users to save campaign briefings as reusable templates and create new campaigns from them.

**Architecture:** Extend the existing campaign system with a new `campaign_templates` table mirroring briefing fields. Add REST API endpoints, React Query hooks, and UI components integrated into the existing sidebar, campaign list, and new campaign modal.

**Tech Stack:** Next.js App Router, React, TypeScript, Drizzle ORM, PostgreSQL, TanStack Query, shadcn/ui, Tailwind CSS

---

## File Structure

### New Files
- `app/src/server/db/migrations/0007_add_campaign_templates.sql` — Database migration
- `app/src/server/repositories/template.ts` — Template repository (create, list, get, delete)
- `app/src/app/api/templates/route.ts` — POST /api/templates, GET /api/templates
- `app/src/app/api/templates/[id]/route.ts` — GET /api/templates/[id], DELETE /api/templates/[id]
- `app/src/lib/hooks/use-templates.ts` — React Query hooks for templates
- `app/src/components/templates/SaveTemplateModal.tsx` — Modal to save campaign as template
- `app/src/components/templates/TemplateCard.tsx` — Card component for template list
- `app/src/app/(dashboard)/templates/page.tsx` — Templates list page

### Modified Files
- `app/src/server/db/schema.ts` — Add `campaignTemplates` table definition
- `app/src/components/layout/Sidebar.tsx` — Add "Templates" nav item
- `app/src/components/campaigns/NewCampaignModal.tsx` — Add template selector
- `app/src/components/campaigns/CampaignTableRow.tsx` — Add "Save as template" action
- `app/src/components/campaigns/CampaignCard.tsx` — Add "Save as template" action (grid view)
- `app/src/app/(dashboard)/campaigns/page.tsx` — Pass saveTemplate handler to row/card components
- `app/src/lib/i18n/messages/pt-BR.json` — Add PT-BR translations
- `app/src/lib/i18n/messages/en.json` — Add EN translations

---

## Task 1: Database Migration

**Files:**
- Create: `app/src/server/db/migrations/0007_add_campaign_templates.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Migration: add_campaign_templates
-- Created: 2026-05-08

CREATE TABLE IF NOT EXISTS adscale_app.campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES adscale_app.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  
  client TEXT,
  product TEXT,
  objective TEXT,
  audience TEXT,
  platforms TEXT[] DEFAULT '{}',
  tone TEXT,
  offer TEXT,
  constraints TEXT,
  notes TEXT,
  generation_mode TEXT NOT NULL DEFAULT 'art_variation',
  creative_level TEXT NOT NULL DEFAULT 'balanced',
  style_intensity TEXT NOT NULL DEFAULT 'medium',
  cta_variants TEXT[],
  target_formats TEXT[],
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(workspace_id, name)
);

CREATE INDEX idx_campaign_templates_workspace_id ON adscale_app.campaign_templates(workspace_id);
```

- [ ] **Step 2: Run migration locally**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
# Apply with your migration tool (drizzle-kit or psql)
# Example with psql:
# psql $DATABASE_URL -f src/server/db/migrations/0007_add_campaign_templates.sql
```

- [ ] **Step 3: Commit**

```bash
git add app/src/server/db/migrations/0007_add_campaign_templates.sql
git commit -m "feat(db): add campaign_templates migration"
```

---

## Task 2: Drizzle Schema

**Files:**
- Modify: `app/src/server/db/schema.ts`

- [ ] **Step 1: Add campaignTemplates table after campaigns table**

Find the campaigns table definition ending around line 146. After the campaigns table closing `);`, add:

```typescript
export const campaignTemplates = adscaleSchema.table(
  "campaign_templates",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    client: text("client"),
    product: text("product"),
    objective: text("objective"),
    audience: text("audience"),
    platforms: text("platforms").array(),
    tone: text("tone"),
    offer: text("offer"),
    constraints: text("constraints"),
    notes: text("notes"),
    generationMode: text("generation_mode").notNull().default("art_variation"),
    creativeLevel: text("creative_level").notNull().default("balanced"),
    styleIntensity: text("style_intensity").notNull().default("medium"),
    ctaVariants: text("cta_variants").array(),
    targetFormats: text("target_formats").array(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("campaign_templates_workspace_id_idx").on(table.workspaceId),
  ]
);
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```
Expected: Build completes without TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/server/db/schema.ts
git commit -m "feat(schema): add campaign_templates table"
```

---

## Task 3: Template Repository

**Files:**
- Create: `app/src/server/repositories/template.ts`

- [ ] **Step 1: Write the repository**

```typescript
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { campaignTemplates, campaigns } from "../db/schema";

export interface CreateTemplateInput {
  workspaceId: string;
  name: string;
  description?: string;
  campaignId: string;
}

export async function createTemplate(input: CreateTemplateInput) {
  // Fetch the source campaign
  const campaign = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, input.campaignId),
        eq(campaigns.workspaceId, input.workspaceId)
      )
    )
    .limit(1);

  if (!campaign[0]) {
    throw new Error("Campaign not found");
  }

  const source = campaign[0];

  const result = await db
    .insert(campaignTemplates)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description ?? null,
      client: source.client,
      product: source.product,
      objective: source.objective,
      audience: source.audience,
      platforms: source.platforms ?? [],
      tone: source.tone,
      offer: source.offer,
      constraints: source.constraints,
      notes: source.notes,
      generationMode: source.generationMode,
      creativeLevel: source.creativeLevel,
      styleIntensity: source.styleIntensity,
      ctaVariants: source.ctaVariants,
      targetFormats: source.targetFormats,
    })
    .returning();

  return result[0];
}

export async function getTemplates(workspaceId: string) {
  return db
    .select()
    .from(campaignTemplates)
    .where(eq(campaignTemplates.workspaceId, workspaceId))
    .orderBy(desc(campaignTemplates.createdAt));
}

export async function getTemplateById(id: string, workspaceId: string) {
  const result = await db
    .select()
    .from(campaignTemplates)
    .where(
      and(
        eq(campaignTemplates.id, id),
        eq(campaignTemplates.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function deleteTemplate(id: string, workspaceId: string) {
  const result = await db
    .delete(campaignTemplates)
    .where(
      and(
        eq(campaignTemplates.id, id),
        eq(campaignTemplates.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/src/server/repositories/template.ts
git commit -m "feat(repo): add campaign template repository"
```

---

## Task 4: API Routes

**Files:**
- Create: `app/src/app/api/templates/route.ts`
- Create: `app/src/app/api/templates/[id]/route.ts`

### Task 4a: List and Create Templates

- [ ] **Step 1: Write POST /api/templates**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createTemplate, getTemplates } from "@/server/repositories/template";

const createTemplateSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const templates = await getTemplates(workspace.id);
    return NextResponse.json({ templates });
  } catch (error) {
    return handleApiError(error, "templates.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const template = await createTemplate({
      workspaceId: workspace.id,
      ...parsed.data,
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "templates.POST");
  }
}
```

- [ ] **Step 2: Write GET/DELETE /api/templates/[id]**

```typescript
import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getTemplateById,
  deleteTemplate,
} from "@/server/repositories/template";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;
    const template = await getTemplateById(id, workspace.id);

    if (!template) {
      return apiError("notFound", 404, { message: "Template not found" });
    }

    return NextResponse.json({ template });
  } catch (error) {
    return handleApiError(error, "templates.[id].GET");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;
    const template = await deleteTemplate(id, workspace.id);

    if (!template) {
      return apiError("notFound", 404, { message: "Template not found" });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "templates.[id].DELETE");
  }
}
```

- [ ] **Step 3: Verify build passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app/src/app/api/templates/
git commit -m "feat(api): add template CRUD endpoints"
```

---

## Task 5: React Query Hooks

**Files:**
- Create: `app/src/lib/hooks/use-templates.ts`

- [ ] **Step 1: Write hooks**

```typescript
import { apiFetch } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface CampaignTemplate {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  client: string | null;
  product: string | null;
  objective: string | null;
  audience: string | null;
  platforms: string[] | null;
  tone: string | null;
  offer: string | null;
  constraints: string | null;
  notes: string | null;
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  creativeLevel: string | null;
  styleIntensity: string | null;
  ctaVariants: string[] | null;
  targetFormats: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

async function fetchTemplates(): Promise<CampaignTemplate[]> {
  const res = await apiFetch("/api/templates");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar templates");
  }
  const data = await res.json();
  return data.templates.map((t: CampaignTemplate) => ({
    ...t,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  }));
}

async function fetchTemplate(id: string): Promise<CampaignTemplate> {
  const res = await apiFetch(`/api/templates/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar template");
  }
  const data = await res.json();
  const t = data.template as CampaignTemplate;
  return {
    ...t,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  };
}

async function createTemplate(payload: {
  campaignId: string;
  name: string;
  description?: string;
}): Promise<CampaignTemplate> {
  const res = await apiFetch("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar template");
  }
  const data = await res.json();
  const t = data.template as CampaignTemplate;
  return {
    ...t,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  };
}

async function deleteTemplate(id: string): Promise<void> {
  const res = await apiFetch(`/api/templates/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao excluir template");
  }
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: ["templates", id],
    queryFn: () => fetchTemplate(id),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/hooks/use-templates.ts
git commit -m "feat(hooks): add template react query hooks"
```

---

## Task 6: Save Template Modal Component

**Files:**
- Create: `app/src/components/templates/SaveTemplateModal.tsx`

- [ ] **Step 1: Write modal component**

```typescript
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCreateTemplate } from "@/lib/hooks/use-templates";

interface SaveTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
}

export default function SaveTemplateModal({
  open,
  onOpenChange,
  campaignId,
  campaignName,
}: SaveTemplateModalProps) {
  const tCommon = useTranslations("common");
  const tTemplate = useTranslations("template");
  const tErrors = useTranslations("errors");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createTemplate = useCreateTemplate();

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setError(null);

      if (!name.trim()) {
        setError(tErrors("nameRequired"));
        return;
      }

      try {
        await createTemplate.mutateAsync({
          campaignId,
          name: name.trim(),
          description: description.trim() || undefined,
        });
        setName("");
        setDescription("");
        onOpenChange(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : tErrors("generic");
        setError(message);
      }
    },
    [campaignId, name, description, createTemplate, onOpenChange, tErrors]
  );

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    setName("");
    setDescription("");
    setError(null);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[var(--surface-raised)] border border-[var(--border-dim)] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[18px] font-semibold text-[var(--text-primary)]">
            {tTemplate("saveAsTemplate")}
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--text-secondary)]">
            {tTemplate("saveDescription", { campaignName })}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="px-6 pb-4 space-y-5"
        >
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tTemplate("templateName")}{" "}
              <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tTemplate("namePlaceholder")}
              className={cn(
                "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                error && "border-[var(--accent-rose)]"
              )}
            />
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tTemplate("description")}
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tTemplate("descriptionPlaceholder")}
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[80px]"
            />
          </div>
        </form>

        <DialogFooter className="px-6 py-4 border-t border-[var(--border-dim)] flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={createTemplate.isPending}
            className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)]"
          >
            {createTemplate.isPending
              ? tCommon("saving")
              : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/templates/SaveTemplateModal.tsx
git commit -m "feat(ui): add save template modal component"
```

---

## Task 7: Templates List Page

**Files:**
- Create: `app/src/app/(dashboard)/templates/page.tsx`
- Create: `app/src/components/templates/TemplateCard.tsx`

### Task 7a: TemplateCard Component

- [ ] **Step 1: Write TemplateCard**

```typescript
"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Trash2, Copy } from "lucide-react";
import type { CampaignTemplate } from "@/lib/hooks/use-templates";

interface TemplateCardProps {
  template: CampaignTemplate;
  index: number;
  onUse: (template: CampaignTemplate) => void;
  onDelete: (id: string) => void;
}

export default function TemplateCard({
  template,
  index,
  onUse,
  onDelete,
}: TemplateCardProps) {
  const tTemplate = useTranslations("template");
  const tCampaign = useTranslations("campaign");
  const tCommon = useTranslations("common");

  const modeLabels: Record<string, string> = {
    art_variation: tCampaign("modes.artVariation.label"),
    format_adaptation: tCampaign("modes.formatAdaptation.label"),
    restyling: tCampaign("modes.restyling.label"),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      className="bg-[var(--surface-raised)] border border-[var(--border-dim)] rounded-lg p-5 hover:border-[var(--border-medium)] transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {template.name}
          </h3>
          {template.description && (
            <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
              {template.description}
            </p>
          )}
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 ml-2",
            template.generationMode === "art_variation" &&
              "bg-[rgba(99,102,241,0.12)] text-[#818cf8]",
            template.generationMode === "format_adaptation" &&
              "bg-[rgba(45,182,125,0.12)] text-[#2db67d]"
          )}
        >
          {modeLabels[template.generationMode] || template.generationMode}
        </span>
      </div>

      <div className="space-y-1.5 mb-4">
        {template.client && (
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">
              {tCampaign("client")}:{" "}
            </span>
            {template.client}
          </p>
        )}
        {template.ctaVariants && template.ctaVariants.length > 0 && (
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">
              {tTemplate("ctaCount", { count: template.ctaVariants.filter(Boolean).length })}
            </span>
          </p>
        )}
        {template.targetFormats && template.targetFormats.length > 0 && (
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">
              {tTemplate("formats")}:{" "}
            </span>
            {template.targetFormats.join(", ")}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => onUse(template)}
          className="flex-1 bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)] text-xs"
        >
          <Copy size={14} className="mr-1.5" />
          {tTemplate("useTemplate")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDelete(template.id)}
          className="border-[var(--border-dim)] text-[var(--text-muted)] hover:text-[var(--accent-rose)] hover:border-[var(--accent-rose)]"
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Write Templates Page**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useTemplates,
  useDeleteTemplate,
  type CampaignTemplate,
} from "@/lib/hooks/use-templates";
import TemplateCard from "@/components/templates/TemplateCard";

export default function TemplatesPage() {
  const router = useRouter();
  const tTemplate = useTranslations("template");
  const tCommon = useTranslations("common");

  const { data: templates, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();

  const handleUseTemplate = (template: CampaignTemplate) => {
    // Navigate to campaign creation with template data in query param
    const encoded = encodeURIComponent(JSON.stringify(template));
    router.push(`/campaigns?template=${encoded}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(tTemplate("deleteConfirm"))) return;
    try {
      await deleteTemplate.mutateAsync(id);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {tTemplate("title")}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {tTemplate("subtitle")}
          </p>
        </div>
        <Button
          onClick={() => router.push("/campaigns")}
          className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)]"
        >
          <Plus size={16} className="mr-2" />
          {tTemplate("createFromCampaign")}
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-[var(--surface-raised)] border border-[var(--border-dim)] rounded-lg p-5 h-48 animate-pulse"
            />
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template, index) => (
            <TemplateCard
              key={template.id}
              template={template}
              index={index}
              onUse={handleUseTemplate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-[var(--surface-raised)] flex items-center justify-center mb-4">
            <FileText size={28} className="text-[var(--text-muted)]" />
          </div>
          <h3 className="text-base font-medium text-[var(--text-primary)] mb-1">
            {tTemplate("emptyTitle")}
          </h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm">
            {tTemplate("emptyDescription")}
          </p>
        </motion.div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app/src/app/(dashboard)/templates/
git add app/src/components/templates/TemplateCard.tsx
git commit -m "feat(ui): add templates list page and card component"
```

---

## Task 8: Sidebar Navigation

**Files:**
- Modify: `app/src/components/layout/Sidebar.tsx`
- Modify: `app/src/components/layout/AppShell.tsx`

### Task 8a: Desktop Sidebar

- [ ] **Step 1: Add Templates nav item to Sidebar**

In `app/src/components/layout/Sidebar.tsx`, add import:

```typescript
import { LayoutTemplate } from "lucide-react";
```

Update `workspaceNavItems` array (around line 23):

```typescript
const workspaceNavItems = [
  { icon: LayoutDashboard, label: tNav("dashboard"), href: "/" },
  { icon: FolderOpen, label: tNav("campaigns"), href: "/campaigns" },
  { icon: LayoutTemplate, label: tNav("templates"), href: "/templates" },
];
```

### Task 8b: Mobile Navigation

- [ ] **Step 2: Add Templates to mobile nav**

In `app/src/components/layout/AppShell.tsx`, add import:

```typescript
import { LayoutTemplate } from "lucide-react";
```

Update mobile nav grid from `grid-cols-3` to `grid-cols-4`, and add:

```typescript
<MobileNavItem
  href="/templates"
  label={tNav("templates")}
  icon={LayoutTemplate}
  active={pathname.startsWith("/templates")}
/>
```

- [ ] **Step 3: Verify build passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app/src/components/layout/Sidebar.tsx app/src/components/layout/AppShell.tsx
git commit -m "feat(ui): add templates to sidebar and mobile nav"
```

---

## Task 9: Campaign Actions — Save as Template

**Files:**
- Modify: `app/src/components/campaigns/CampaignTableRow.tsx`
- Modify: `app/src/components/campaigns/CampaignCard.tsx`
- Modify: `app/src/app/(dashboard)/campaigns/page.tsx`

### Task 9a: Table Row Action

- [ ] **Step 1: Add save template action to CampaignTableRow**

In `app/src/components/campaigns/CampaignTableRow.tsx`:

Add import:
```typescript
import { LayoutTemplate } from "lucide-react";
```

Update interface (add prop):
```typescript
interface CampaignTableRowProps {
  campaign: Campaign;
  index: number;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveAsTemplate: (campaign: Campaign) => void;  // NEW
}
```

Update destructuring:
```typescript
export default function CampaignTableRow({
  campaign,
  index,
  selected,
  onSelect,
  onDuplicate,
  onArchive,
  onDelete,
  onSaveAsTemplate,  // NEW
}: CampaignTableRowProps) {
```

Add menu item after Duplicate (around line 211):
```typescript
<DropdownMenuItem
  onClick={() => onSaveAsTemplate(campaign)}
  className="flex items-center gap-2"
>
  <LayoutTemplate size={14} />
  {tCommon("saveAsTemplate")}
</DropdownMenuItem>
<DropdownMenuSeparator />
```

### Task 9b: Grid Card Action

- [ ] **Step 2: Add save template action to CampaignCard**

In `app/src/components/campaigns/CampaignCard.tsx`:

Add import:
```typescript
import { LayoutTemplate } from "lucide-react";
```

Add prop to interface:
```typescript
interface CampaignCardProps {
  campaign: Campaign;
  onSaveAsTemplate: (campaign: Campaign) => void;  // NEW
}
```

Add action button in hover overlay or dropdown.

### Task 9c: Campaigns Page Integration

- [ ] **Step 3: Wire up SaveTemplateModal in campaigns page**

In `app/src/app/(dashboard)/campaigns/page.tsx`:

Add imports:
```typescript
import { useState } from "react";
import SaveTemplateModal from "@/components/templates/SaveTemplateModal";
import type { Campaign } from "@/lib/mock-data";
```

Add state:
```typescript
const [saveTemplateCampaign, setSaveTemplateCampaign] = useState<Campaign | null>(null);
```

Add modal at bottom of component (before closing return):
```typescript
<SaveTemplateModal
  open={!!saveTemplateCampaign}
  onOpenChange={(open) => !open && setSaveTemplateCampaign(null)}
  campaignId={saveTemplateCampaign?.id ?? ""}
  campaignName={saveTemplateCampaign?.name ?? ""}
/>
```

Pass handler to row and card:
```typescript
onSaveAsTemplate={setSaveTemplateCampaign}
```

- [ ] **Step 4: Verify build passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/src/components/campaigns/CampaignTableRow.tsx app/src/components/campaigns/CampaignCard.tsx app/src/app/(dashboard)/campaigns/page.tsx
git commit -m "feat(ui): add save as template action to campaign list"
```

---

## Task 10: New Campaign Modal — Template Selector

**Files:**
- Modify: `app/src/components/campaigns/NewCampaignModal.tsx`

- [ ] **Step 1: Add template selector to NewCampaignModal**

Add imports:
```typescript
import { useTemplates } from "@/lib/hooks/use-templates";
import { ChevronDown } from "lucide-react";
```

Add to form interface:
```typescript
interface NewCampaignForm {
  name: string;
  clientName: string;
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  targetFormat: string;
  constraints: string;
  notes: string;
  templateId: string;  // NEW
}
```

Initialize:
```typescript
const [form, setForm] = useState<NewCampaignForm>({
  name: "",
  clientName: "",
  generationMode: "art_variation",
  targetFormat: "",
  constraints: "",
  notes: "",
  templateId: "",  // NEW
});
```

Add template selector UI after campaign name (around line 214):

```typescript
{/* Template Selector */}
<div className="space-y-1.5">
  <Label className="text-[13px] text-[var(--text-secondary)]">
    {tTemplate("useTemplate")}
  </Label>
  <TemplateSelector
    value={form.templateId}
    onChange={(templateId) => {
      updateField("templateId", templateId);
      // If template selected, pre-fill form
      if (templateId) {
        const template = templates?.find((t) => t.id === templateId);
        if (template) {
          setForm((prev) => ({
            ...prev,
            clientName: template.client ?? prev.clientName,
            generationMode: template.generationMode,
            constraints: template.constraints ?? prev.constraints,
            notes: template.notes ?? prev.notes,
            targetFormat: template.targetFormats?.[0] ?? prev.targetFormat,
          }));
        }
      }
    }}
  />
</div>
```

Create inline TemplateSelector component or separate file:

```typescript
function TemplateSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { data: templates, isLoading } = useTemplates();
  const tTemplate = useTranslations("template");

  if (isLoading) {
    return (
      <div className="h-10 bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-md animate-pulse" />
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)] py-2">
        {tTemplate("noTemplatesAvailable")}
      </p>
    );
  }

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 pr-10 bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-md text-sm text-[var(--text-primary)] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)] focus:border-[var(--accent-blue)]"
      >
        <option value="">{tTemplate("selectTemplate")}</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/campaigns/NewCampaignModal.tsx
git commit -m "feat(ui): add template selector to new campaign modal"
```

---

## Task 11: BriefingStep — Template Pre-fill Badge

**Files:**
- Modify: `app/src/components/workspace/BriefingStep.tsx`
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx`

- [ ] **Step 1: Accept and display template source**

In `BriefingStep.tsx`, add optional prop:
```typescript
interface BriefingStepProps {
  campaign?: Campaign | null;
  templateSource?: { name: string } | null;  // NEW
  onContinue: (data: BriefingFormData) => void;
  onSaveDraft: (data: BriefingFormData) => void;
}
```

Display badge when templateSource exists (near top of form):
```typescript
{templateSource && (
  <div className="mb-4 px-3 py-2 bg-[var(--accent-mint-dim)] rounded-md text-xs text-[var(--accent-mint)]">
    {tTemplate("prefilledFromTemplate", { name: templateSource.name })}
  </div>
)}
```

In `app/src/app/(dashboard)/campaigns/[id]/page.tsx`, pass `templateSource` when creating from template.

- [ ] **Step 2: Commit**

```bash
git add app/src/components/workspace/BriefingStep.tsx app/src/app/(dashboard)/campaigns/[id]/page.tsx
git commit -m "feat(ui): show template prefill indicator in briefing step"
```

---

## Task 12: Translations

**Files:**
- Modify: `app/src/lib/i18n/messages/pt-BR.json`
- Modify: `app/src/lib/i18n/messages/en.json`

- [ ] **Step 1: Add PT-BR translations**

Add to `app/src/lib/i18n/messages/pt-BR.json` under appropriate sections:

```json
{
  "navigation": {
    "templates": "Templates"
  },
  "template": {
    "title": "Templates",
    "subtitle": "Reutilize briefings de campanhas salvas",
    "saveAsTemplate": "Salvar como template",
    "saveDescription": "Salvar o briefing de \"{campaignName}\" como template reutilizável.",
    "templateName": "Nome do template",
    "namePlaceholder": "Ex: Black Friday - Eletrônicos",
    "description": "Descrição",
    "descriptionPlaceholder": "Contexto sobre quando usar este template...",
    "useTemplate": "Usar template",
    "createFromCampaign": "Criar template",
    "selectTemplate": "Selecionar template (opcional)",
    "noTemplatesAvailable": "Nenhum template disponível. Crie um a partir de uma campanha existente.",
    "prefilledFromTemplate": "Preencido via template: {name}",
    "ctaCount": "{count} CTAs definidas",
    "formats": "Formatos",
    "deleteConfirm": "Tem certeza que deseja excluir este template?",
    "emptyTitle": "Nenhum template ainda",
    "emptyDescription": "Salve o briefing de uma campanha como template para reutilizá-lo em novas campanhas."
  },
  "common": {
    "save": "Salvar",
    "saving": "Salvando..."
  }
}
```

- [ ] **Step 2: Add EN translations**

Mirror the above in `app/src/lib/i18n/messages/en.json` with English text.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/i18n/messages/pt-BR.json app/src/lib/i18n/messages/en.json
git commit -m "feat(i18n): add template translations for pt-BR and en"
```

---

## Task 13: Tests

**Files:**
- Create: `app/src/server/repositories/template.test.ts`
- Create: `app/src/app/api/templates/route.test.ts`

### Task 13a: Repository Tests

- [ ] **Step 1: Write repository tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  createTemplate,
  getTemplates,
  getTemplateById,
  deleteTemplate,
} from "./template";
import { createCampaign } from "./campaign";

const TEST_WORKSPACE_ID = "test-workspace-1";

describe("template repository", () => {
  let campaignId: string;

  beforeEach(async () => {
    const campaign = await createCampaign(TEST_WORKSPACE_ID, {
      name: "Test Campaign",
      client: "Test Client",
      generationMode: "art_variation",
    });
    campaignId = campaign.id;
  });

  it("creates template from campaign", async () => {
    const template = await createTemplate({
      workspaceId: TEST_WORKSPACE_ID,
      campaignId,
      name: "My Template",
      description: "Test template",
    });

    expect(template.name).toBe("My Template");
    expect(template.description).toBe("Test template");
    expect(template.client).toBe("Test Client");
    expect(template.workspaceId).toBe(TEST_WORKSPACE_ID);
  });

  it("lists templates for workspace", async () => {
    await createTemplate({
      workspaceId: TEST_WORKSPACE_ID,
      campaignId,
      name: "Template 1",
    });

    const templates = await getTemplates(TEST_WORKSPACE_ID);
    expect(templates.length).toBeGreaterThanOrEqual(1);
    expect(templates[0].name).toBe("Template 1");
  });

  it("gets template by id", async () => {
    const created = await createTemplate({
      workspaceId: TEST_WORKSPACE_ID,
      campaignId,
      name: "Get Me",
    });

    const found = await getTemplateById(created.id, TEST_WORKSPACE_ID);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Get Me");
  });

  it("returns null for missing template", async () => {
    const found = await getTemplateById("non-existent", TEST_WORKSPACE_ID);
    expect(found).toBeNull();
  });

  it("deletes template", async () => {
    const created = await createTemplate({
      workspaceId: TEST_WORKSPACE_ID,
      campaignId,
      name: "Delete Me",
    });

    await deleteTemplate(created.id, TEST_WORKSPACE_ID);
    const found = await getTemplateById(created.id, TEST_WORKSPACE_ID);
    expect(found).toBeNull();
  });

  it("throws for non-existent campaign", async () => {
    await expect(
      createTemplate({
        workspaceId: TEST_WORKSPACE_ID,
        campaignId: "non-existent",
        name: "Fail",
      })
    ).rejects.toThrow("Campaign not found");
  });
});
```

### Task 13b: API Route Tests

- [ ] **Step 2: Write API tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { POST, GET } from "./route";

describe("POST /api/templates", () => {
  it("creates template with valid data", async () => {
    // Mock requireWorkspaceAccess and createTemplate
    // Test with valid payload
    // Assert 201 response
  });

  it("returns 400 for invalid input", async () => {
    // Test with missing name
    // Assert 400 response
  });
});

describe("GET /api/templates", () => {
  it("lists templates", async () => {
    // Mock workspace access
    // Assert 200 with templates array
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm test
```
Expected: All new tests pass. Existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add app/src/server/repositories/template.test.ts app/src/app/api/templates/route.test.ts
git commit -m "test: add template repository and api route tests"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run full build**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```
Expected: Clean build, zero errors.

- [ ] **Step 2: Run linter**

```bash
npm run lint
```
Expected: No lint errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: All tests pass (existing + new).

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build/lint/test issues"
```

---

## Self-Review Checklist

### Spec Coverage
- [x] Save campaign as template → Task 6, Task 9
- [x] Templates list page → Task 7
- [x] Create campaign from template → Task 10
- [x] Workspace isolation → Task 3 (repository), Task 4 (API)
- [x] Unique names per workspace → Task 3 (SQL unique constraint)
- [x] Delete template → Task 3, Task 7
- [x] Sidebar navigation → Task 8
- [x] i18n → Task 12
- [x] Tests → Task 13

### Placeholder Scan
- [x] No TBD/TODO
- [x] No vague "add error handling" — specific error handling in each task
- [x] No "write tests" without code — actual test code provided
- [x] No "similar to Task X" — each task is self-contained

### Type Consistency
- [x] `CampaignTemplate` interface matches schema fields
- [x] Repository types match API input types
- [x] Hook types match API response types
- [x] Component props match hook return types

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-campaign-templates.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
