# Phase 27 Research: Templates de Campanha

## Context

Phase 27 goal: Allow users to save campaigns as templates and create new campaigns from existing templates.

**Decisions Locked:**
- Schema: `campaign_templates` table with FK to workspace
- Preserved fields: complete brief (objective, audience, tone, offer, platforms)
- NOT preserved: campaign name, images, derivations
- UI: selection modal when clicking "Nova Campanha" with "Usar Template" option

---

## 1. Database

### Schema (Already Implemented)

The `campaign_templates` table exists in `app/src/server/db/schema.ts:365-394`:

```typescript
export const campaignTemplates = adscaleSchema.table(
  "campaign_templates",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
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
  (table) => [index("campaign_templates_workspace_id_idx").on(table.workspaceId)]
);
```

### Indexing Strategy
- Primary: `workspaceId` - all queries filter by workspace for isolation
- No additional indexes needed; template count per workspace is expected to be small

### Gap: `renameTemplate` function

The repository (`app/src/server/repositories/template.ts`) has:
- `createTemplate` - copies brief fields from campaign
- `getTemplates` - list by workspace, ordered by createdAt desc
- `getTemplateById` - single by id + workspace
- `deleteTemplate` - delete by id + workspace

**Missing:** `renameTemplate(id, workspaceId, newName)` - needed for TPL-06

---

## 2. API

### Existing Endpoints

| Method | Path | Implementation | Status |
|--------|------|----------------|--------|
| GET | `/api/templates` | `app/src/app/api/templates/route.ts:13` - lists templates | ✅ exists |
| POST | `/api/templates` | `app/src/app/api/templates/route.ts:23` - creates from campaign | ✅ exists |
| GET | `/api/templates/[id]` | `app/src/app/api/templates/[id]/route.ts:9` - single template | ✅ exists |
| DELETE | `/api/templates/[id]` | `app/src/app/api/templates/[id]/route.ts:28` - delete template | ✅ exists |

### Missing Endpoints

1. **PATCH `/api/templates/[id]`** - rename template (TPL-06)
   - Body: `{ name: string }`
   - Returns: `{ template: CampaignTemplate }`

### API Pattern

All endpoints use:
- `requireWorkspaceAccess(request)` for auth/workspace context
- `handleApiError(error, context)` for error formatting
- Zod schema validation

---

## 3. UI/UX

### Existing Components

| Component | Path | Purpose |
|-----------|------|---------|
| `SaveTemplateModal.tsx` | `app/src/components/templates/SaveTemplateModal.tsx` | Modal to save campaign as template |
| `TemplateCard.tsx` | `app/src/components/templates/TemplateCard.tsx` | Card displaying template with use/delete actions |
| `TemplatesPage` | `app/src/app/(dashboard)/templates/page.tsx` | Full page listing all templates |

### Template Selection Modal (TPL-04) - MISSING

The requirement states: "galeria/modal de templates na criação" (gallery/modal of templates when creating)

**Current flow:** "Nova Campanha" button → `NewCampaignModal.tsx` opens directly

**Required flow:** "Nova Campanha" → Template selection modal (with "Criar do zero" option) → `NewCampaignModal.tsx`

**Design needed:**
1. New component: `TemplateSelectorModal` (or integrate into `NewCampaignModal`)
2. Two tabs/options: "Começar do zero" vs "Usar template"
3. Template gallery grid with `TemplateCard` (reuse existing component)
4. On template selection: pre-fill campaign form with template's brief fields

### Pre-filling Behavior (TPL-03)

When a user selects a template and creates a campaign:
- Pre-fill all brief fields from template
- `clientProfileId` is NOT in template (not copied)
- User can still override any field before submitting

### Template Management UI

Templates page (`/templates`) already exists with:
- Grid of `TemplateCard` components
- Delete functionality (via `TemplateCard`)
- "Use template" navigates to `/campaigns?template=<encoded>` with full template object

**Missing for TPL-06:**
- Inline rename (click to edit name on card)
- Rename modal (alternative)

---

## 4. Tech Stack

### Framework & Libraries

| Category | Technology | Notes |
|----------|------------|-------|
| Framework | Next.js 16.2.6 | App Router |
| UI Library | React 19.2.4 + Base UI | `@base-ui/react` for headless components |
| Styling | Tailwind CSS 4 | CSS variables for theming |
| Animation | Framer Motion 12.38 | `motion` components |
| Data Fetching | TanStack Query 5 | React Query hooks |
| i18n | next-intl 4.9.1 | PT-BR translations |
| Auth | better-auth 1.6.9 | Session management |
| DB/ORM | Drizzle ORM 0.45 + Neon | PostgreSQL via `@neondatabase/serverless` |
| Validation | Zod 3 | Schema validation |
| Icons | Lucide React | Icon system |

### Existing Patterns

**Hook Pattern (TanStack Query):**
- `useTemplates()` - fetches all templates for workspace
- `useTemplate(id)` - fetches single template
- `useCreateTemplate()` - mutation with query invalidation
- `useDeleteTemplate()` - mutation with query invalidation

**Component Pattern:**
- Props interface defined above component
- `cn()` utility for conditional classes
- `useTranslations()` for i18n
- Framer Motion for animations

### Project Structure

```
app/
├── src/
│   ├── app/api/
│   │   └── templates/
│   │       ├── route.ts          # GET, POST
│   │       └── [id]/route.ts     # GET, DELETE
│   ├── components/
│   │   └── templates/
│   │       ├── TemplateCard.tsx
│   │       └── SaveTemplateModal.tsx
│   ├── lib/hooks/
│   │   └── use-templates.ts
│   └── server/
│       ├── repositories/
│       │   ├── template.ts
│       │   └── template.test.ts
│       └── db/schema.ts          # campaign_templates table
└── messages/
    ├── pt-BR.json                # template namespace
    └── en.json
```

---

## 5. Dependencies & Integration

### Brief Fields to Preserve (from `campaigns` table)

The `createTemplate` function in `template.ts:31-51` copies these fields:
- `client`, `product`, `objective`, `audience`
- `platforms`, `tone`, `offer`, `constraints`, `notes`
- `generationMode`, `creativeLevel`, `styleIntensity`
- `ctaVariants`, `targetFormats`

### Integration Points

1. **BriefingStep** (`app/src/components/workspace/BriefingStep.tsx`)
   - `BriefingFormData` interface matches template fields
   - Form pre-fill from template data when `campaign` prop is provided

2. **NewCampaignModal** (`app/src/components/campaigns/NewCampaignModal.tsx`)
   - Currently has 4 fields: name, clientName, clientProfileId, optional file
   - Needs: template selection step before this form

3. **Campaign creation** (`useCreateCampaign` in `use-campaigns.ts`)
   - `createCampaign` function accepts all brief fields
   - Template data maps directly to campaign creation payload

### Migration/Database

No migration needed - schema already has `campaign_templates` table defined.

---

## 6. Gaps & Recommendations

### Missing Implementation

| Gap | File | Action |
|-----|------|--------|
| `renameTemplate` function | `app/src/server/repositories/template.ts` | Add `renameTemplate(id, name, workspaceId)` |
| PATCH endpoint | `app/src/app/api/templates/[id]/route.ts` | Add `PATCH` handler for rename |
| Template selector modal | New component | Create `TemplateSelectorModal.tsx` or integrate into `NewCampaignModal` |
| Template pre-fill in form | `BriefingStep.tsx` | Accept template prop and pre-fill form |

### Recommended Implementation Order

1. **Repository:** Add `renameTemplate` function
2. **API:** Add PATCH handler for rename
3. **UI - Template Selector:** Create modal with template gallery + "start from scratch" option
4. **UI - Pre-fill:** Pass template data to `BriefingStep` when creating from template
5. **Integration:** Connect template selector to campaign creation flow

### Testing

Existing test file: `app/src/server/repositories/template.test.ts` covers:
- `createTemplate` from campaign
- `getTemplates` listing
- `getTemplateById` fetching
- `deleteTemplate` deletion
- Error case for non-existent campaign

**Need to add:**
- Test for `renameTemplate`
- Integration tests for template selection flow

---

## Research Complete

### Key Files Reference

| File | Purpose |
|------|---------|
| `app/src/server/db/schema.ts:365-394` | `campaign_templates` table definition |
| `app/src/server/repositories/template.ts` | Repository functions (CRUD missing rename) |
| `app/src/app/api/templates/route.ts` | GET/POST endpoints |
| `app/src/app/api/templates/[id]/route.ts` | GET/DELETE endpoints (missing PATCH) |
| `app/src/lib/hooks/use-templates.ts` | React Query hooks |
| `app/src/components/campaigns/NewCampaignModal.tsx` | Campaign creation modal (needs template flow) |
| `app/src/components/workspace/BriefingStep.tsx` | Brief form (template pre-fill target) |
| `app/src/components/templates/TemplateCard.tsx` | Template display card (reusable) |
| `app/src/components/templates/SaveTemplateModal.tsx` | Save as template modal |
| `app/src/app/(dashboard)/templates/page.tsx` | Templates management page |

### Open Questions for Planning

1. **Rename UX:** Should rename be inline (click-to-edit on card) or via modal?
2. **Template thumbnail:** Should templates show any visual preview? Currently they don't.
3. **Template limit:** Any limit on templates per workspace?
4. **Default template name:** Auto-generate from campaign name or let user choose?