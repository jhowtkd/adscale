# Ajustes de Fluxo de Geração, Galeria e Configurações — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar single-format obrigatório, controle de criatividade por campanha, revisão inline na galeria, cards com object-contain, e ajustes na tela de configurações.

**Architecture:** Schema-first (migration + Drizzle), depois API com validação Zod, depois prompt-builder + job, depois UI. Wizard passa de 4 para 3 passos. ReviewStep desvinculado mas não removido do disco.

**Tech Stack:** Next.js 14 App Router, TypeScript, Drizzle ORM, PostgreSQL, Inngest, Zod, TanStack Query, Tailwind CSS, next-intl.

---

## Prerequisites

- Banco PostgreSQL acessível e rodando.
- Variáveis de ambiente configuradas em `app/.env.local`.
- Dependências instaladas: `cd app && npm install`.

---

## Task 1: Migration do banco — `creative_level` em campaigns

**Files:**
- Create: `app/drizzle/XXXX_add_creative_level_to_campaigns.sql`
- Modify: `app/src/server/db/schema.ts`

**Step 1: Escrever migration SQL**

```sql
ALTER TABLE "adscale_app"."campaigns"
ADD COLUMN "creative_level" text DEFAULT 'balanced' NOT NULL;
```

**Step 2: Aplicar migration**

```bash
cd app && npx drizzle-kit push
```

Expected: sucesso, coluna adicionada.

**Step 3: Atualizar schema Drizzle**

Em `app/src/server/db/schema.ts`, na tabela `campaigns`, adicionar:

```ts
creativeLevel: text("creative_level").notNull().default("balanced"),
```

**Step 4: Commit**

```bash
git add app/drizzle/ app/src/server/db/schema.ts
git commit -m "feat(db): add creative_level column to campaigns with default balanced"
```

---

## Task 2: Atualizar repositório de campanha — `creativeLevel`

**Files:**
- Modify: `app/src/server/repositories/campaign.ts`

**Step 1: Verificar tipos e queries**

Abrir `app/src/server/repositories/campaign.ts`. Localizar `insert` e `update`.

**Step 2: Garantir que `creativeLevel` é repassado**

No `insert` (create), garantir que `creativeLevel` do input é usado:
```ts
creativeLevel: input.creativeLevel ?? "balanced",
```

No `update` (patch), garantir que `creativeLevel` só é atualizado se presente:
```ts
...(input.creativeLevel !== undefined && { creativeLevel: input.creativeLevel }),
```

**Step 3: Commit**

```bash
git add app/src/server/repositories/campaign.ts
git commit -m "feat(repo): support creativeLevel in campaign create/update"
```

---

## Task 3: Validar API — targetFormats max 1 e creativeLevel

**Files:**
- Modify: `app/src/app/api/campaigns/route.ts`
- Modify: `app/src/app/api/campaigns/[id]/route.ts`

**Step 1: Atualizar schema Zod em POST /api/campaigns**

```ts
const createCampaignSchema = z.object({
  name: z.string().min(1),
  client: z.string().optional(),
  product: z.string().optional(),
  objective: z.string().optional(),
  audience: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  tone: z.string().optional(),
  offer: z.string().optional(),
  constraints: z.string().optional(),
  notes: z.string().optional(),
  generationMode: z.enum(["art_variation", "format_adaptation"]).optional(),
  ctaVariants: z.array(z.string()).optional(),
  targetFormats: z.array(z.enum(["1:1", "4:5", "9:16"])).max(1).optional(),
  creativeLevel: z.enum(["conservative", "balanced", "bold"]).optional().default("balanced"),
})
.refine(
  (data) => {
    const mode = data.generationMode ?? "art_variation";
    return mode !== "format_adaptation" || (data.targetFormats?.length === 1);
  },
  { message: "format_adaptation requires exactly 1 targetFormat", path: ["targetFormats"] }
);
```

**Step 2: Atualizar schema Zod em PATCH /api/campaigns/[id]**

Igual ao acima, mas **sem `.default("balanced")`** em `creativeLevel`:
```ts
creativeLevel: z.enum(["conservative", "balanced", "bold"]).optional(),
```

**Step 3: Rodar testes de integração de campaign CRUD**

```bash
cd app && npm test -- --run tests/integration/campaign-crud.test.ts
```

Expected: PASS. Se houver teste que envia targetFormats com >1 item, ele deve começar a falhar (corrigir no Task 5).

**Step 4: Commit**

```bash
git add app/src/app/api/campaigns/route.ts app/src/app/api/campaigns/[id]/route.ts
git commit -m "feat(api): enforce max 1 targetFormat and creativeLevel validation"
```

---

## Task 4: Prompt Builder — CREATIVITY LEVEL

**Files:**
- Modify: `app/src/server/ai/prompt-builder.ts`

**Step 1: Adicionar templates de criatividade**

Adicionar no topo do arquivo (após imports):

```ts
const CREATIVITY_TEMPLATES: Record<string, string> = {
  conservative: `CREATIVITY LEVEL: conservative.
Stay close to the reference creative. Produce a fresh but restrained variation: refine composition, spacing, background treatment, CTA module placement, and hierarchy without changing the visual universe. Preserve the same brand palette, typography style, main subject/photo treatment, logo behavior, offer structure, and overall campaign recognition. Avoid experimental layouts, new scenes, unrelated motifs, or major copy/typography shifts.`,

  balanced: `CREATIVITY LEVEL: balanced.
Create a clearly new ad from the same campaign system. Keep brand identity, offer, main subject, typography style, logo behavior, and key message recognizable, but rebuild the composition with noticeable variation in layout, background, visual hierarchy, CTA module placement, supporting shapes, and rhythm. The result should feel like a sibling creative from the same campaign, not a near-copy.`,

  bold: `CREATIVITY LEVEL: bold.
Push the creative further while staying on-brand. Reinterpret the reference into a more distinctive composition with stronger changes to layout, background structure, visual hierarchy, scale, CTA module placement, decorative tokens, and energy. Preserve the core brand assets, campaign message, offer, logo behavior, and recognizable visual tokens. Do not invent a new brand, unrelated scene, or incompatible style.`,
};
```

**Step 2: Modificar `buildDerivationPrompt`**

Localizar a função `buildDerivationPrompt`. Adicionar parâmetro `creativeLevel?: string`.

Após a seção de regras de modo e antes dos dados da campanha, inserir:

```ts
if (generationMode === "art_variation" && creativeLevel) {
  const template = CREATIVITY_TEMPLATES[creativeLevel];
  if (template) {
    parts.push(template);
  }
}
```

**Step 3: Escrever teste unitário para prompt-builder**

Criar ou modificar `app/tests/unit/prompt-builder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDerivationPrompt } from "@/server/ai/prompt-builder";

describe("buildDerivationPrompt creativity", () => {
  it("includes conservative creativity for art_variation", () => {
    const prompt = buildDerivationPrompt({ generationMode: "art_variation", creativeLevel: "conservative", /* ... outros params mínimos ... */ });
    expect(prompt).toContain("CREATIVITY LEVEL: conservative");
  });

  it("includes balanced creativity for art_variation", () => {
    const prompt = buildDerivationPrompt({ generationMode: "art_variation", creativeLevel: "balanced", /* ... */ });
    expect(prompt).toContain("CREATIVITY LEVEL: balanced");
  });

  it("includes bold creativity for art_variation", () => {
    const prompt = buildDerivationPrompt({ generationMode: "art_variation", creativeLevel: "bold", /* ... */ });
    expect(prompt).toContain("CREATIVITY LEVEL: bold");
  });

  it("does NOT include creativity text for format_adaptation", () => {
    const prompt = buildDerivationPrompt({ generationMode: "format_adaptation", creativeLevel: "bold", /* ... */ });
    expect(prompt).not.toContain("CREATIVITY LEVEL");
  });

  it("defaults to balanced when creativeLevel is omitted in art_variation", () => {
    const prompt = buildDerivationPrompt({ generationMode: "art_variation", /* ... */ });
    expect(prompt).toContain("CREATIVITY LEVEL: balanced");
  });
});
```

> **Nota:** ajustar a assinatura real de `buildDerivationPrompt` conforme o código atual.

**Step 4: Rodar teste unitário**

```bash
cd app && npm test -- --run tests/unit/prompt-builder.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/server/ai/prompt-builder.ts app/tests/unit/prompt-builder.test.ts
git commit -m "feat(ai): add creativity level prompt injection for art_variation"
```

---

## Task 5: Job de derivação — single format + criatividade

**Files:**
- Modify: `app/src/server/jobs/derivation.ts`
- Modify: `app/src/app/api/campaigns/[id]/derivations/route.ts`

**Step 1: Ajustar criação de jobs em derivations API**

Em `app/src/app/api/campaigns/[id]/derivations/route.ts`:

- Carregar campanha com `creativeLevel` e `targetFormats`.
- Se `generationMode === "format_adaptation"`:
  - Validar `targetFormats?.length === 1` (fail-fast).
  - Criar exatamente **1 job**.
  - Passar `format: targetFormats[0]`.
- Se `generationMode === "art_variation"`:
  - Criar jobs conforme lógica atual (ou 1 job se for o padrão).
  - Passar `creativeLevel: campaign.creativeLevel ?? "balanced"`.

**Step 2: Ajustar worker para repassar creativeLevel**

Em `app/src/server/jobs/derivation.ts`:

- No handler do job, buscar campanha (ou receber no evento).
- Chamar `buildDerivationPrompt` com `creativeLevel: campaign.creativeLevel ?? "balanced"`.

**Step 3: Atualizar teste de integração de derivation job**

Em `app/tests/integration/derivation-job.test.ts`:

- Adicionar teste: `format_adaptation` com `targetFormats: ["4:5"]` cria exatamente 1 derivação com `format === "4:5"`.
- Adicionar teste: `targetFormats` com > 1 item retorna erro 400.

**Step 4: Rodar testes de integração**

```bash
cd app && npm test -- --run tests/integration/derivation-job.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/app/api/campaigns/[id]/derivations/route.ts app/src/server/jobs/derivation.ts app/tests/integration/derivation-job.test.ts
git commit -m "feat(jobs): enforce single targetFormat for format_adaptation and pass creativeLevel"
```

---

## Task 6: UI — Seletor de criatividade no briefing

**Files:**
- Modify: `app/src/components/workspace/BriefingStep.tsx`
- Modify: `app/messages/pt-BR.json`

**Step 1: Adicionar campo creativeLevel no BriefingStep**

Localizar onde `generationMode` é selecionado. Adicionar, condicionalmente quando `generationMode === "art_variation"`, um seletor (radio group ou select) com 3 opções:

```tsx
{generationMode === "art_variation" && (
  <div className="space-y-2">
    <Label>{t("creativeLevel.label")}</Label>
    <RadioGroup value={creativeLevel} onValueChange={setCreativeLevel}>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="conservative" id="cl-conservative" />
        <Label htmlFor="cl-conservative">{t("creativeLevel.conservative")}</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="balanced" id="cl-balanced" />
        <Label htmlFor="cl-balanced">{t("creativeLevel.balanced")}</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="bold" id="cl-bold" />
        <Label htmlFor="cl-bold">{t("creativeLevel.bold")}</Label>
      </div>
    </RadioGroup>
  </div>
)}
```

Default do state: `"balanced"`.

**Step 2: Adicionar traduções em pt-BR**

Em `app/messages/pt-BR.json`:

```json
{
  "briefing": {
    "creativeLevel": {
      "label": "Nível de criatividade",
      "conservative": "Conservador",
      "balanced": "Equilibrado",
      "bold": "Ousado"
    }
  }
}
```

**Step 3: Commit**

```bash
git add app/src/components/workspace/BriefingStep.tsx app/messages/pt-BR.json
git commit -m "feat(ui): add creative level selector in briefing step"
```

---

## Task 7: UI — Aprovar/Rejeitar inline nos cards da galeria

**Files:**
- Modify: `app/src/components/workspace/DerivationCard.tsx`
- Modify: `app/src/components/workspace/DerivationsStep.tsx` <!-- VERIFY: app/src/components/workspace/DerivationsStep.tsx — see verification in .planning/tmp/ -->

**Step 1: Atualizar DerivationCard**

Adicionar props:

```ts
interface DerivationCardProps {
  derivation: Derivation;
  onPreview: () => void;
  onDownload: () => void;
  onRegenerate: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  isApproving?: boolean;
  isRejecting?: boolean;
}
```

No corpo do card, quando `derivation.status === "completed"`, renderizar botões:

```tsx
<div className="flex gap-2 mt-2">
  <Button size="sm" variant="outline" onClick={onApprove} disabled={isApproving}>
    <Check className="w-4 h-4 mr-1" />
    {t("approve")}
  </Button>
  <Button size="sm" variant="outline" onClick={onReject} disabled={isRejecting}>
    <X className="w-4 h-4 mr-1" />
    {t("reject")}
  </Button>
</div>
```

Quando `status === "approved"` ou `"rejected"`, mostrar badge correspondente sem ações.

**Step 2: Atualizar DerivationsStep**

Remover `onReviewAll` das props.

Adicionar:
```ts
onApprove?: (id: string) => void;
onReject?: (id: string) => void;
approvingId?: string | null;
rejectingId?: string | null;
```

Passar callbacks para cada `DerivationCard`:
```tsx
<DerivationCard
  key={d.id}
  derivation={d}
  onPreview={() => onPreview(d.id)}
  onDownload={() => onDownload(d.id)}
  onRegenerate={() => onRegenerate(d.id)}
  onApprove={() => onApprove?.(d.id)}
  onReject={() => onReject?.(d.id)}
  isApproving={approvingId === d.id}
  isRejecting={rejectingId === d.id}
/>
```

**Step 3: Commit**

```bash
git add app/src/components/workspace/DerivationCard.tsx app/src/components/workspace/DerivationsStep.tsx
git commit -m "feat(ui): add approve/reject actions inline in derivation cards"
```

---

## Task 8: UI — Cards com object-contain e proporção por formato

**Files:**
- Modify: `app/src/components/workspace/DerivationCard.tsx`

**Step 1: Ajustar container da imagem**

Substituir classe de aspecto fixo por lógica condicional:

```tsx
const aspectClass = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
}[derivation.format] ?? "aspect-square";
```

```tsx
<div className={cn("relative overflow-hidden rounded-lg bg-muted", aspectClass)}>
  <img
    src={derivation.imageUrl}
    alt={...}
    className="w-full h-full object-contain"
  />
</div>
```

**Step 2: Commit**

```bash
git add app/src/components/workspace/DerivationCard.tsx
git commit -m "feat(ui): use object-contain and aspect ratio based on derivation format"
```

---

## Task 9: UI — Wizard de 3 passos, remover ReviewStep do fluxo

**Files:**
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx`

**Step 1: Ajustar tipos e steps**

Localizar `StepKey` / `steps` array. Alterar de:
```ts
type StepKey = "briefing" | "plan" | "derivations" | "review";
```
Para:
```ts
type StepKey = "briefing" | "plan" | "derivations";
```

Atualizar `steps` array removendo o objeto de review.

**Step 2: Remover renderização de ReviewStep**

Remover import:
```ts
import ReviewStep from "@/components/workspace/ReviewStep"; <!-- VERIFY: app/src/components/workspace/ReviewStep.tsx — see verification in .planning/tmp/ -->
```

Remover case de renderização:
```tsx
{currentStep === "review" && (
  <ReviewStep ... />
)}
```

Remover transição de "derivations" → "review".

**Step 3: Commit**

```bash
git add app/src/app/(dashboard)/campaigns/[id]/page.tsx
git commit -m "feat(ui): reduce campaign wizard from 4 to 3 steps, remove ReviewStep from flow"
```

---

## Task 10: UI — Configurações: Equipe + Integrações inativa

**Files:**
- Modify: `app/messages/pt-BR.json`
- Modify: `app/src/app/(dashboard)/settings/page.tsx`

**Step 1: Alterar tradução pt-BR**

```json
{
  "settings": {
    "teamTab": "Equipe"
  }
}
```

**Step 2: Desabilitar aba Integrações**

Em `settings/page.tsx`, localizar a aba "Integrações". Adicionar:

```tsx
<button
  disabled
  className="opacity-50 cursor-not-allowed flex items-center gap-2"
>
  {t("integrationsTab")}
  <Badge variant="secondary">{tCommon("comingSoon")}</Badge>
</button>
```

**Step 3: Commit**

```bash
git add app/messages/pt-BR.json app/src/app/(dashboard)/settings/page.tsx
git commit -m "feat(ui): rename team tab to Equipe and disable Integrations with coming soon badge"
```

---

## Task 11: Fix — Invalidar cache campaign-assets após upload

**Files:**
- Modify: `app/src/lib/hooks/use-assets.ts` (ou hook equivalente)

**Step 1: Localizar invalidação atual**

Buscar `queryClient.invalidateQueries` após upload.

**Step 2: Adicionar invalidação de campaign-assets**

```ts
queryClient.invalidateQueries({ queryKey: ["campaign-assets", campaignId] });
```

**Step 3: Commit**

```bash
git add app/src/lib/hooks/use-assets.ts
git commit -m "fix(cache): invalidate campaign-assets after upload so reference appears in preview"
```

---

## Task 12: QA — TypeScript, Lint e testes finais

**Step 1: Type check**

```bash
cd app && npx tsc --noEmit --pretty false
```

Expected: 0 erros.

**Step 2: Lint**

```bash
cd app && npm run lint
```

Expected: 0 erros / apenas warnings preexistentes.

**Step 3: Rodar suite de testes unitários**

```bash
cd app && npm test -- --run tests/unit/prompt-builder.test.ts
```

Expected: PASS.

**Step 4: Rodar suite de testes de integração**

```bash
cd app && npm test -- --run tests/integration/derivation-job.test.ts tests/integration/campaign-crud.test.ts
```

Expected: PASS.

**Step 5: Commit final de QA**

```bash
git commit --allow-empty -m "qa: typescript, lint and integration tests pass"
```

---

## Manual QA Checklist

Após implementação completa, validar manualmente:

- [ ] "Variar formato" + `4:5` gera só 1 card.
- [ ] "Variar arte" + "Ousado" injeta o prompt correto.
- [ ] Cards exibem a peça inteira (sem crop).
- [ ] Aprovar/rejeitar na galeria persiste após reload.
- [ ] "Equipe" aparece na aba e "Integrações" fica inativo com "Em breve".
- [ ] Upload de referência faz imagem aparecer no preview/comparativo.
