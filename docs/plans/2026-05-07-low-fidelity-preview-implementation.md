# Low-Fidelity Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar preview de baixa resolução antes da geração em lote de derivações, permitindo validação visual por menor custo.

**Architecture:** Nova coluna `isPreview` em `derivations`. Job detecta `isPreview` e gera em resolução reduzida (512px no maior lado). API aceita `preview: true` e cria apenas 1 derivation. UI diferencia preview com badge e controle de fluxo.

**Tech Stack:** Next.js, TypeScript, Drizzle ORM, Inngest, OpenAI SDK

---

## Contexto

- Design aprovado em: `docs/plans/2026-05-07-low-fidelity-preview-design.md`
- Arquivos principais: schema.ts, derivation.ts (job), derivations/route.ts (API), DerivationCard.tsx, DerivationStep.tsx

---

### Task 1: Adicionar coluna `isPreview` ao schema

**Files:**
- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0006_add_is_preview_to_derivations.sql`
- Test: `app/tests/unit/repositories/derivation.test.ts`

**Step 1: Ler schema atual**

Ler `app/src/server/db/schema.ts` e encontrar a definição da tabela `derivations`.

**Step 2: Adicionar coluna**

Localizar a tabela `derivations` e adicionar após a coluna `regenerationSuggestion`:

```typescript
    isPreview: boolean("is_preview").notNull().default(false),
```

**Step 3: Criar migration**

```sql
-- Migration: Add isPreview column to derivations
ALTER TABLE adscale_app.derivations ADD COLUMN is_preview boolean NOT NULL DEFAULT false;
```

Salvar em `app/drizzle/0006_add_is_preview_to_derivations.sql`.

**Step 4: Atualizar type inference**

Verificar que o type `typeof derivations.$inferSelect` já inclui `isPreview` automaticamente (Drizzle faz isso).

**Step 5: Commit**

```bash
git add app/src/server/db/schema.ts app/drizzle/0006_add_is_preview_to_derivations.sql
git commit -m "feat(schema): add isPreview column to derivations"
```

---

### Task 2: Atualizar repositório de derivações para suportar isPreview

**Files:**
- Modify: `app/src/server/repositories/derivation.ts`
- Test: `app/tests/unit/repositories/derivation.test.ts`

**Step 1: Ler repositório atual**

Ler `app/src/server/repositories/derivation.ts` para entender `CreateDerivationInput`.

**Step 2: Adicionar isPreview ao input**

Localizar `CreateDerivationInput` e adicionar:

```typescript
export interface CreateDerivationInput {
  // ... existing fields ...
  isPreview?: boolean;
}
```

**Step 3: Usar isPreview no insert**

No `createDerivation`, adicionar:

```typescript
      isPreview: data.isPreview ?? false,
```

**Step 4: Commit**

```bash
git add app/src/server/repositories/derivation.ts
git commit -m "feat(repositories): add isPreview to createDerivation"
```

---

### Task 3: Modificar API de derivações para aceitar preview

**Files:**
- Modify: `app/src/app/api/campaigns/[id]/derivations/route.ts`
- Test: `app/tests/integration/derivation-job.test.ts`

**Step 1: Ler API atual**

Ler `app/src/app/api/campaigns/[id]/derivations/route.ts` para entender o fluxo atual.

**Step 2: Adicionar parâmetro preview**

No handler POST, após extrair `campaignId`, extrair `preview` do body:

```typescript
const body = await request.json();
const isPreview = body.preview === true;
```

**Step 3: Limitar a 1 derivation quando preview**

Quando `isPreview` é true:
- Criar apenas 1 derivation (a primeira do array de jobs)
- Adicionar `isPreview: true` na criação
- Enviar `isPreview: true` no evento Inngest

Localizar o loop `for (const job of jobs)` e modificar:

```typescript
    const jobsToCreate = isPreview ? [jobs[0]] : jobs;

    for (const job of jobsToCreate) {
      const derivation = await createDerivation({
        // ... existing fields ...
        isPreview,
      });
      // ...
      await inngest.send({
        name: "derivation.generate",
        data: {
          // ... existing fields ...
          isPreview,
        },
      });
    }
```

**Step 4: Commit**

```bash
git add app/src/app/api/campaigns/[id]/derivations/route.ts
git commit -m "feat(api): add preview parameter to derivations route"
```

---

### Task 4: Modificar job de derivação para resolução de preview

**Files:**
- Modify: `app/src/server/jobs/derivation.ts`
- Test: `app/tests/unit/format-to-openai-size.test.ts` (novo)

**Step 1: Modificar formatToOpenAISize**

Localizar `formatToOpenAISize` (linha 38) e modificar para aceitar `isPreview`:

```typescript
function formatToOpenAISize(format: string, isPreview?: boolean): "512x512" | "1024x1024" | "512x768" | "1024x1536" | "1536x1024" {
  if (isPreview) {
    switch (format) {
      case "9:16":
        return "512x768";
      case "4:5":
        return "512x640";
      case "1:1":
      default:
        return "512x512";
    }
  }
  
  switch (format) {
    case "9:16":
    case "4:5":
      return "1024x1536";
    case "1:1":
    default:
      return "1024x1024";
  }
}
```

**Step 2: Usar isPreview no job**

Localizar onde `formatToOpenAISize` é chamado (dentro do step "generate-and-store-output") e passar `isPreview`:

```typescript
const isPreview = event.data.isPreview ?? false;
// ...
const openaiSize = formatToOpenAISize(targetFormat, isPreview);
```

**Step 3: Commit**

```bash
git add app/src/server/jobs/derivation.ts
git commit -m "feat(job): support preview mode with reduced resolution"
```

---

### Task 5: Adicionar badge de Preview na DerivationCard

**Files:**
- Modify: `app/src/components/workspace/DerivationCard.tsx`

**Step 1: Adicionar prop isPreview**

Localizar `DerivationCardProps` e adicionar:

```typescript
interface DerivationCardProps {
  // ... existing props ...
  isPreview?: boolean;
}
```

**Step 2: Renderizar badge quando isPreview**

No componente, quando `isPreview` é true:
- Adicionar badge laranja "Preview" no canto superior direito
- Adicionar borda tracejada laranja no card
- Desabilitar botão de download (mostrar tooltip)

Localizar a área do card e adicionar condicionalmente:

```tsx
{isPreview && (
  <div className="absolute top-2 right-2 z-10 bg-orange-100 text-orange-700 text-xs font-medium px-2 py-1 rounded-full border border-dashed border-orange-400">
    Preview
  </div>
)}
```

**Step 3: Commit**

```bash
git add app/src/components/workspace/DerivationCard.tsx
git commit -m "feat(ui): add preview badge to DerivationCard"
```

---

### Task 6: Modificar DerivationsStep para controle de preview

**Files:**
- Modify: `app/src/components/workspace/DerivationsStep.tsx` (ou equivalente)

**Step 1: Ler componente atual**

Identificar qual componente renderiza os botões de geração e modificar.

**Step 2: Adicionar estado de preview**

- `previewStatus`: 'none' | 'generating' | 'completed'
- `previewDerivation`: Derivation | null

**Step 3: Modificar botões**

Quando `previewStatus === 'none'`:
- Mostrar "Gerar Preview" (primário) e "Gerar Todas" (desabilitado)

Quando `previewStatus === 'completed'`:
- Mostrar card de preview com ações: "Aprovar e Gerar Todas", "Novo Preview", "Editar Brief"

**Step 4: Commit**

```bash
git add app/src/components/workspace/DerivationsStep.tsx
git commit -m "feat(ui): add preview flow to DerivationsStep"
```

---

### Task 7: Build e testes

**Step 1: Build**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```

**Expected:** Build passa sem erros.

**Step 2: Testes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run test
```

**Expected:** Todos os testes existentes passam.

**Step 3: Lint**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run lint
```

**Expected:** Sem erros.

---

### Task 8: Commit final

```bash
git add -A
git commit -m "feat: implement low-fidelity preview before batch generation

- Add isPreview column to derivations schema
- Support preview param in derivations API
- Job generates at reduced resolution (512px) when preview
- UI shows preview badge and controls flow
- REST-06 complete"
```

---

## Checklist de Sucesso

- [ ] Coluna `isPreview` existe no schema
- [ ] API aceita `preview: true` e cria 1 derivation
- [ ] Job usa resolução reduzida quando `isPreview: true`
- [ ] UI diferencia preview com badge
- [ ] "Gerar Todas" habilita após preview
- [ ] Build passa
- [ ] Testes passam
- [ ] Lint limpo

---

## Notas

- O type do OpenAI `images.edit` aceita `"512x512"`, `"512x768"`, e `"512x640"` não é padrão. Verificar se precisamos ajustar para tamanhos suportados (possivelmente `"512x512"` para todos os previews, ou usar `"512x768"` para 9:16 e `"512x512"` para 1:1/4:5).
- Se `"512x640"` não for suportado pela API, usar `"512x512"` para 4:5 e depois normalizar com sharp para as proporções corretas.
