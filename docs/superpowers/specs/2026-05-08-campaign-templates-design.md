# Design Doc: Templates de Campanha

**Date:** 2026-05-08  
**Feature:** Campaign Templates  
**Goal:** Eliminate repetitive briefing entry by allowing users to save and reuse campaign briefings as templates.

---

## 1. Overview

Users can save the briefing configuration of an existing campaign as a reusable template. When creating a new campaign, they can select a template to pre-populate the briefing form. Templates contain only briefing metadata — no assets, derivations, plans, or status.

### Out of Scope
- Categories/tags for templates (future)
- System-provided default templates (future)
- Cross-workspace template sharing (future)
- Template versioning or editing after creation (future)

---

## 2. Data Model

### New Table: `campaign_templates`

```sql
campaign_templates
  id              uuid PK
  workspaceId     uuid FK → workspaces.id
  name            text not null
  description     text
  
  -- Briefing fields (mirror campaign table)
  client          text
  product         text
  objective       text
  audience        text
  platforms       text[] default '{}'
  tone            text
  offer           text
  constraints     text
  notes           text
  generationMode  text default 'art_variation'
  creativeLevel   text default 'balanced'
  styleIntensity  text default 'medium'
  ctaVariants     text[]
  targetFormats   text[]
  
  createdAt       timestamp default now()
  updatedAt       timestamp default now()
```

### Rationale
- Mirrors the `campaigns` table briefing fields exactly for straightforward copy/paste logic
- No status, no asset/derivation references — templates are pure configuration
- Workspace-scoped for multi-tenant isolation
- No editing after creation (delete and recreate if needed) — keeps scope minimal

---

## 3. API Design

### Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/templates` | Create template from existing campaign |
| GET | `/api/templates` | List all templates for workspace |
| GET | `/api/templates/[id]` | Get single template by ID |
| DELETE | `/api/templates/[id]` | Delete template |

### Request/Response Schemas

**POST /api/templates**
```typescript
// Request
{
  campaignId: string (uuid),
  name: string (1-255 chars),
  description?: string
}

// Response
{
  id: string,
  name: string,
  description?: string,
  // ... all briefing fields
  createdAt: string
}
```

**GET /api/templates**
```typescript
// Response
{
  templates: Array<{
    id: string,
    name: string,
    description?: string,
    client?: string,
    generationMode: string,
    createdAt: string
  }>
}
```

### Validation Rules
- `campaignId` must exist and belong to the same workspace
- `name` must be unique within the workspace
- All briefing fields copied from campaign; no additional input required

---

## 4. UI/UX Design

### 4.1 Templates List Page (`/templates`)

- **Sidebar entry:** "Templates" icon (below Campaigns)
- **Layout:** Grid of cards
- **Card content:**
  - Template name (bold)
  - Description (if present)
  - Source info: "Baseado em: [Campaign Name]" (muted text)
  - Key fields summary: "Cliente: X | Modo: Variar arte"
  - Generation mode badge
  - Actions: "Usar" button, "Deletar" icon button
- **Empty state:** "Nenhum template ainda. Salve o briefing de uma campanha como template para reutilizá-lo."
- **CTA:** "Criar template" button → opens modal to select campaign

### 4.2 "Salvar como template" Action

- **Location:** Campaign dropdown menu (CampaignTableRow, CampaignCard)
- **Flow:**
  1. User clicks "Salvar como template"
  2. Modal opens with:
     - Campaign name shown (read-only, for context)
     - Template name input (required)
     - Description textarea (optional)
  3. On submit: POST to `/api/templates`
  4. Success: toast "Template criado", modal closes, invalidate templates query

### 4.3 Template Selection in New Campaign

- **Location:** `NewCampaignModal`
- **Flow:**
  1. Step 1 of modal shows template selector (optional)
  2. Dropdown/select: "Usar template (opcional)"
  3. On selection: briefing fields pre-populated
  4. User can edit any field before creating
  5. "Criar campanha" creates campaign normally

### 4.4 BriefingStep Indicator

- When briefing is pre-filled from template, show subtle badge:
  - "Preencido via template: [Template Name]"
  - Dismissible or auto-hides on any field edit

---

## 5. State Management

### New Hooks

```typescript
// use-templates.ts
function useTemplates() // GET /api/templates
function useCreateTemplate() // POST mutation
function useDeleteTemplate() // DELETE mutation
function useTemplate(id: string) // GET single
```

### Cache Strategy
- `['templates']` — list query
- `['template', id]` — single item query
- On create/delete: invalidate `['templates']`

---

## 6. Error Handling

| Error | UI Behavior |
|-------|-------------|
| Duplicate template name | Inline validation error on name field |
| Campaign not found | Toast "Campanha não encontrada" |
| Workspace mismatch | 403, toast "Acesso negado" |
| Delete fails (in use?) | Toast "Não foi possível deletar o template" |

---

## 7. Testing Strategy

### Unit Tests
- Template repository: create, list, get, delete
- API route validation: duplicate name, workspace isolation
- Hook tests: create invalidates cache, delete removes from list

### Integration Tests
- Create template from campaign → verify all fields copied
- Use template in new campaign → verify briefing pre-populated
- Delete template → verify removed from list

### E2E Scenarios
1. Save campaign as template → see in templates list
2. Create campaign from template → verify briefing fields
3. Delete template → confirm removed

---

## 8. Migration Plan

```sql
-- Add campaign_templates table
CREATE TABLE campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
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
  generation_mode TEXT DEFAULT 'art_variation',
  creative_level TEXT DEFAULT 'balanced',
  style_intensity TEXT DEFAULT 'medium',
  cta_variants TEXT[],
  target_formats TEXT[],
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(workspace_id, name)
);

CREATE INDEX idx_campaign_templates_workspace ON campaign_templates(workspace_id);
```

---

## 9. Open Questions

None — all decisions locked during brainstorming.

---

## 10. Success Criteria

1. User can save any campaign briefing as a template
2. Templates appear in a dedicated list page
3. Creating a campaign from template pre-populates all briefing fields
4. Template names are unique per workspace
5. Templates are workspace-isolated
6. Build passes, new tests green

---

*Approved during brainstorming session on 2026-05-08.*
