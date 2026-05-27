---
wave: 1
dependsOn: []
filesModified: []
autonomous: false
requirements: [TPL-01, TPL-02, TPL-03, TPL-04, TPL-05, TPL-06]
---

# Plan: Phase 27 — Templates de Campanha

## Goal

Permitir salvar campanhas como templates e criar novas campanhas a partir de templates existentes, com isolates por workspace e gerência completa (criar, renomear, deletar).

## Tasks

### Wave 1: Rename Template (TPL-06)

**Task 1.1 — Add `renameTemplate` to repository**
- File: `app/src/server/repositories/template.ts`
- Add `renameTemplate(id: string, workspaceId: string, name: string)` function
- Uses `db.update().set().where()` with `and(eq(id, ...), eq(workspaceId, ...))`
- Returns the updated template or null if not found

**Task 1.2 — Add PATCH handler to API route**
- File: `app/src/app/api/templates/[id]/route.ts`
- Add `PATCH` export that accepts `{ name: string }` body
- Zod schema validation: `z.object({ name: z.string().min(1).max(255) })`
- Returns `{ template: CampaignTemplate }`
- Uses `requireWorkspaceAccess` and `handleApiError` pattern

**Task 1.3 — Add `useRenameTemplate` hook**
- File: `app/src/lib/hooks/use-templates.ts`
- Add `renameTemplate(id: string, name: string)` async function
- Add `useRenameTemplate()` mutation hook with query invalidation

**Task 1.4 — Add rename UI to TemplateCard**
- File: `app/src/components/templates/TemplateCard.tsx`
- Add inline rename on card name: renders as `<Input>` when `isRenaming` prop is true
- Add `onRename: (id: string, newName: string) => void` to props interface
- Add pencil/edit icon button next to card title
- Use Lucide `Pencil` icon with tooltip for edit action
- On blur or Enter key: calls `onRename` and exits rename mode
- On Escape: cancels rename, reverts to original name

---

### Wave 2: Template Selector Modal (TPL-02, TPL-04, TPL-05)

**Task 2.1 — Create `TemplateSelectorModal` component**
- File: `app/src/components/templates/TemplateSelectorModal.tsx`
- Props:
    - `open: boolean`, `onOpenChange: (open: boolean) => void`
    - `onSelectTemplate: (template: CampaignTemplate) => void`
    - `onStartFromScratch: () => void`
- Layout:
    - Dialog with header "Nova Campanha" + subtitle
    - Two action cards stacked: "Começar do zero" and "Usar um template"
    - When "Usar um template" selected, shows grid of `TemplateCard` components
    - Empty state when no templates: icon + message from i18n
    - Footer: "Voltar" button when in template selection mode, primary "Criar" disabled in scratch mode until form filled (or just call `onStartFromScratch` immediately)
- Implementation notes:
    - Use framer-motion for entrance animations
    - Reuse existing `TemplateCard` components via `onUse` prop
    - Pass `index` prop to `TemplateCard` for staggered animation
    - On "Começar do zero" click: call `onStartFromScratch()`
    - Template cards call `onSelectTemplate(template)` on "Usar template" click

**Task 2.2 — Add `useRenameTemplate` i18n strings**
- File: `app/messages/pt-BR.json` (template namespace)
- Add `renaming` key for aria-label/tooltip
- Add `renameSuccess` and `renameError` toast keys

---

### Wave 3: Template Pre-fill + Integration (TPL-02, TPL-03, TPL-05)

**Task [CORRECTED: merged into 3.1-3.4 below — no separate 3.3]**

**Task 3.1 — Add `template` prop to `BriefingStep`**
- File: `app/src/components/workspace/BriefingStep.tsx`
- Extend interface: add optional `template?: CampaignTemplate | null` prop
- When `template` prop provided (and campaign is new/empty), pre-fill form:
    - `client` from `template.client`
    - `objective` from `template.objective`
    - `audience` from `template.audience`
    - `platforms` from `template.platforms`
    - `tone` from `template.tone`
    - `offer` from `template.offer`
    - `constraints` from `template.constraints`
    - `notes` from `template.notes`
- Show info banner: "Preencido via template: {name}" (from i18n `template.prefilledFromTemplate`)
- User CAN still edit any pre-filled field

**Task 3.2 — Create `useTemplatePreFill` hook / URL state handler**
- File: `app/src/lib/hooks/use-templates.ts` (or new file)
- Add optional `useTemplateFromUrl()` hook that reads `?template=<base64>` param
- Decode template object from URL and return as `CampaignTemplate` or null
- Alternative: `newcampaign.tsx` page reads template from search params on mount

**Task 3.3 — Create NewCampaign page with template support**
- File: `app/src/app/(dashboard)/novo-campanha/page.tsx` (if new route) or integrate into campaign creation flow
- On mount: check for `?template=` param
- If template param present: decode and pass to `BriefingStep` as `template` prop
- If no param: `BriefingStep` receives no `template` prop

**Task 3.4 — Integrate `TemplateSelectorModal` into "Nova Campanha" flow**
- File: `app/src/components/campaigns/NewCampaignModal.tsx` (or wherever "Nova Campanha" button opens modal)
- Change entry point: "Nova Campanha" button does NOT open `NewCampaignModal` directly
- Instead: opens `TemplateSelectorModal`
- If "Começar do zero": then opens existing `NewCampaignModal` → standard flow
- If template selected: navigates to `/novo-campanha?template=<encoded>` or passes template object to a `NewCampaignPage` component that shows `BriefingStep` pre-filled

**Task 3.5 — Update i18n for template selector**
- File: `app/messages/pt-BR.json`
- Add keys under `template` namespace:
    - `startFromScratch`: "Começar do zero"
    - `startFromScratchDesc`: "Criar uma campanha do zero com brief vazio"
    - `useTemplateOption`: "Usar um template"
    - `useTemplateOptionDesc`: "Usar brief de um template existente"
    - `prefilledFromTemplate`: "Preencido via template: {name}"
    - `templateCount`: "{count, plural, =0{Nenhum template} =1{1 template} other{# templates}}"
    - `selectTemplateTitle`: "Selecionar template"
    - `selectTemplateSubtitle`: "Escolha um template para pré-preencher o briefing"

---

## Verification

1. **TPL-01** (Save as template): Open a campaign → click "Salvar como template" → `SaveTemplateModal` appears → fill name/description → save → template appears in `/templates` page
2. **TPL-02** (Create from template): Click "Nova Campanha" → `TemplateSelectorModal` shows → click a template → `BriefingStep` opens pre-filled with template data → continue creates campaign
3. **TPL-03** (Brief fields preserved): After TPL-02 verification, inspect pre-filled fields match template: client, objective, audience, platforms, tone, offer, constraints, notes
4. **TPL-04** (Template gallery): Click "Nova Campanha" → gallery of existing templates shown in `TemplateSelectorModal`
5. **TPL-05** (Workspace isolation): Login as different workspace user → templates page empty → templates from other workspace NOT visible
6. **TPL-06** (Rename + delete): Go to `/templates` → click pencil icon on a card → name becomes editable → type new name → blur/Enter → name updated in DB and UI → delete button still works

---

## File Impact

| File | Change |
|------|--------|
| `app/src/server/repositories/template.ts` | Add `renameTemplate` |
| `app/src/app/api/templates/[id]/route.ts` | Add `PATCH` handler |
| `app/src/lib/hooks/use-templates.ts` | Add `useRenameTemplate` hook |
| `app/src/components/templates/TemplateCard.tsx` | Add inline rename UI |
| `app/src/components/templates/TemplateSelectorModal.tsx` | New component |
| `app/src/components/workspace/BriefingStep.tsx` | Add `template` prop + pre-fill logic |
| `app/src/app/(dashboard)/novo-campanha/page.tsx` | New page or extend existing |
| `app/messages/pt-BR.json` | Add template selector i18n keys |
