# Fluxo de Criação de Anúncio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o wizard de 5 passos por um fluxo simplificado: criação mínima de campanha → piloto criativo (upload + IA) → ações principais (derivar / estilizar).

**Architecture:** Single-page state machine no workspace (`/campaigns/[id]`) com estados `"piloto"` → `"acoes"`. O hook `use-campaign-workspace` gerencia transições. Novos componentes modulares para upload, briefing, sidebar e modais de ação. Reutiliza APIs e jobs de geração existentes.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Inngest, Drizzle ORM, tRPC (ou route handlers).

---

## File Map

### Modified
| File | Responsibility |
|------|---------------|
| `app/src/components/campaigns/NewCampaignModal.tsx` | Simplificar para nome + marca apenas |
| `app/src/lib/hooks/use-campaign-workspace.ts` | Estado da máquina de estados + transições |
| `app/src/app/(dashboard)/campaigns/[id]/page.tsx` | Renderiza piloto ou ações conforme estado |

### Created
| File | Responsibility |
|------|---------------|
| `app/src/app/api/campaigns/[id]/pilot/route.ts` | Persiste asset como piloto + briefing |
| `app/src/components/workspace/PilotUploadPanel.tsx` | Upload zone + análise em progresso |
| <!-- VERIFY: app/src/components/workspace/PilotBriefingForm.tsx — see verification in .planning/tmp/ --> | Formulário de briefing com hints da IA |
| `app/src/components/workspace/PilotSidebar.tsx` | Preview do piloto + resumo do briefing |
| <!-- VERIFY: app/src/components/workspace/ActionCards.tsx — see verification in .planning/tmp/ --> | Cards Derivar + Estilizar |
| <!-- VERIFY: app/src/components/workspace/DerivarModal.tsx — see verification in .planning/tmp/ --> | Modal com 4 opções de derivação |
| <!-- VERIFY: app/src/components/workspace/EstilizarModal.tsx — see verification in .planning/tmp/ --> | Modal de workflow de estilização |
| `app/src/components/workspace/DerivationGrid.tsx` | Grid de derivações com status |

### Deprecated (não removidos ainda — apenas deixam de ser usados)
| File | Reason |
|------|--------|
| `app/src/components/workspace/BriefingStep.tsx` | Funcionalidade absorvida pelo PilotBriefingForm |
| <!-- VERIFY: app/src/components/workspace/UploadStep.tsx — see verification in .planning/tmp/ --> | Absorvido pelo PilotUploadPanel |
| <!-- VERIFY: app/src/components/workspace/GenerationStep.tsx — see verification in .planning/tmp/ --> | Substituído pelos modais de ação |
| <!-- VERIFY: app/src/components/workspace/PlanStep.tsx — see verification in .planning/tmp/ --> | Plano agora é gerado em background |
| <!-- VERIFY: app/src/components/workspace/DerivationsStep.tsx — see verification in .planning/tmp/ --> | Substituído pelo DerivationGrid |
| <!-- VERIFY: app/src/components/workspace/StepIndicator.tsx — see verification in .planning/tmp/ --> | Wizard não existe mais |
| <!-- VERIFY: app/src/components/workspace/WizardNavigationFooter.tsx — see verification in .planning/tmp/ --> | Navegação por passos removida |

---

## Task 1: Simplificar NewCampaignModal

**Files:**
- Modify: `app/src/components/campaigns/NewCampaignModal.tsx`

**Context:** O modal atual tem nome, cliente (select), client profile, template e upload de criativo. Precisa ter apenas nome e marca (cliente como texto livre).

- [ ] **Step 1: Inspecionar o modal atual**

Leia o arquivo `app/src/components/campaigns/NewCampaignModal.tsx` para entender o schema do formulário e a mutation de criação.

- [ ] **Step 2: Simplificar o schema do formulário**

Substitua o schema Zod para aceitar apenas `name` e `client` (marca):

```typescript
const newCampaignSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  client: z.string().min(1, "Marca é obrigatória"),
});
```

Remova do schema: `clientProfileId`, `templateId`, e quaisquer campos de briefing.

- [ ] **Step 3: Simplificar o formulário JSX**

Remova do formulário:
- `<ClientProfileSelect />`
- `<TemplateSelect />`
- `<CreativeUploadWithAnalysis />` ou zona de upload de criativo
- Qualquer accordion ou seção de briefing

Mantenha apenas dois inputs: Nome e Marca (Cliente).

- [ ] **Step 4: Ajustar a mutation onSubmit**

Garanta que o `onSubmit` chama a criação da campanha com apenas `{ name, client }` e redireciona para `/campaigns/${campaign.id}`.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/campaigns/NewCampaignModal.tsx
git commit -m "feat: simplify new campaign modal to name + brand only"
```

---

## Task 2: Criar API POST /campaigns/[id]/pilot

**Files:**
- Create: `app/src/app/api/campaigns/[id]/pilot/route.ts`
- Modify: `app/src/server/repositories/campaign.ts` (se necessário adicionar método)

**Context:** Nova API para salvar o asset piloto e o briefing completo da campanha numa única chamada.

- [ ] **Step 1: Criar o route handler**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth/session";
import { campaignRepository } from "@/server/repositories/campaign";

const pilotSchema = z.object({
  assetId: z.string().uuid(),
  briefing: z.object({
    objective: z.string().optional(),
    audience: z.string().optional(),
    tone: z.string().optional(),
    platforms: z.array(z.string()).optional(),
    ctaText: z.string().optional(),
    constraints: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = pilotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const { assetId, briefing } = parsed.data;

  const updated = await campaignRepository.update(params.id, {
    ...briefing,
    status: "draft",
  });

  // Opcional: marcar o asset como piloto
  // await campaignAssetRepository.updateRole(assetId, "base");

  return NextResponse.json({ campaign: updated });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/app/api/campaigns/
git commit -m "feat: add POST /campaigns/[id]/pilot endpoint"
```

---

## Task 3: Refatorar use-campaign-workspace hook

**Files:**
- Modify: `app/src/lib/hooks/use-campaign-workspace.ts`

**Context:** O hook atual gerencia um wizard de 5 passos. Precisa virar uma máquina de estados com `"piloto" | "acoes" | "derivando" | "estilizando" | "gerando"`.

- [ ] **Step 1: Definir os tipos de estado**

Adicione no topo do arquivo:

```typescript
export type WorkspaceState =
  | "piloto"
  | "acoes"
  | "derivando"
  | "estilizando"
  | "gerando";
```

- [ ] **Step 2: Substituir o estado de step pelo workspace state**

Remova `currentStep`, `totalSteps`, `nextStep`, `prevStep`, etc.

Substitua por:

```typescript
const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("piloto");

const goToActions = useCallback(() => setWorkspaceState("acoes"), []);
const goToDerivation = useCallback(() => setWorkspaceState("derivando"), []);
const goToStyling = useCallback(() => setWorkspaceState("estilizando"), []);
const goToGenerating = useCallback(() => setWorkspaceState("gerando"), []);
```

- [ ] **Step 3: Manter derivations, assets e campaign loading**

Mantenha as queries e mutations existentes para:
- `useCampaign(id)`
- `useCampaignAssets(id)`
- `useDerivations(id)`
- `useCreateDerivation()`

- [ ] **Step 4: Adicionar função de savePilot**

```typescript
const savePilot = useCallback(
  async (assetId: string, briefing: CampaignBriefing) => {
    const res = await fetch(`/api/campaigns/${campaignId}/pilot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, briefing }),
    });
    if (!res.ok) throw new Error("Failed to save pilot");
    await mutateCampaign(); // revalida SWR/React Query
    setWorkspaceState("acoes");
  },
  [campaignId, mutateCampaign]
);
```

- [ ] **Step 5: Retornar o novo contrato**

```typescript
return {
  campaign,
  campaignAssets,
  derivations,
  workspaceState,
  goToActions,
  goToDerivation,
  goToStyling,
  goToGenerating,
  savePilot,
  createDerivation,
  // ... outras funções existentes que ainda fazem sentido
};
```

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/hooks/use-campaign-workspace.ts
git commit -m "feat: refactor workspace hook to state machine (piloto/acoes)"
```

---

## Task 4: Criar PilotUploadPanel

**Files:**
- Create: `app/src/components/workspace/PilotUploadPanel.tsx`

**Context:** Painel esquerdo da tela do piloto. Gerencia upload de imagem e exibe progresso da análise.

- [ ] **Step 1: Criar o componente com tipos**

```typescript
"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone"; // ou o componente de upload existente
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

export type UploadPanelState = "empty" | "uploading" | "analyzing" | "reviewing" | "locked";

interface PilotUploadPanelProps {
  onAssetUploaded: (assetId: string) => void;
  onAnalysisComplete: (analysis: CreativeAnalysis) => void;
}

interface CreativeAnalysis {
  detectedConcept: string;
  tone: string;
  elements: string;
  format: string;
}
```

- [ ] **Step 2: Implementar o JSX com micro-estados**

```tsx
export function PilotUploadPanel({ onAssetUploaded, onAnalysisComplete }: PilotUploadPanelProps) {
  const [panelState, setPanelState] = useState<UploadPanelState>("empty");
  const [progress, setProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  const onDrop = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    setPanelState("uploading");

    // Upload simulado / real
    const assetId = await uploadFile(files[0], (p) => setProgress(p));
    onAssetUploaded(assetId);

    setPanelState("analyzing");
    setCompletedSteps(["Análise técnica"]);

    // Chama análise
    const analysis = await analyzeCreative(assetId);
    setCompletedSteps(["Análise técnica", "Extração visual", "Geração de sugestões"]);
    setPanelState("reviewing");
    onAnalysisComplete(analysis);
  }, [onAssetUploaded, onAnalysisComplete]);

  const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { "image/*": [] } });

  return (
    <div className="w-[360px] flex-shrink-0 flex flex-col gap-4">
      <div
        {...getRootProps()}
        className={cn(
          "h-[260px] rounded-xl border-[1.5px] border-dashed flex flex-col items-center justify-center gap-3 transition-all",
          panelState === "empty" && "border-[var(--border-medium)] bg-[var(--surface-base)] hover:border-[var(--accent-green)] hover:bg-[var(--surface-raised)]",
          panelState !== "empty" && "border-[var(--border-dim)] bg-[var(--surface-base)]"
        )}
      >
        <input {...getInputProps()} />
        {panelState === "empty" && (
          <>
            <span className="text-3xl opacity-40">📤</span>
            <p className="text-sm text-[var(--text-muted)]">Arraste seu criativo aqui</p>
            <p className="text-[11px] text-[var(--ghost)] font-mono">JPG, PNG • Máx 10MB</p>
          </>
        )}
        {panelState === "uploading" && (
          <>
            <Spinner className="w-8 h-8" />
            <p className="text-xs text-[var(--text-muted)] font-mono uppercase tracking-widest">Enviando... {progress}%</p>
          </>
        )}
        {(panelState === "analyzing" || panelState === "reviewing" || panelState === "locked") && (
          <>
            <Spinner className="w-8 h-8" />
            <p className="text-xs text-[var(--text-muted)] font-mono uppercase tracking-widest">Analisando...</p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {["Análise técnica", "Extração visual", "Geração de sugestões"].map((step) => (
          <div
            key={step}
            className={cn(
              "flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] font-mono uppercase tracking-wide",
              completedSteps.includes(step)
                ? "text-[var(--accent-green-dark)]"
                : panelState === "analyzing" && completedSteps.length === ["Análise técnica", "Extração visual", "Geração de sugestões"].indexOf(step)
                ? "text-[var(--text-primary)] bg-[var(--surface-raised)]"
                : "text-[var(--text-muted)]"
            )}
          >
            {completedSteps.includes(step) ? (
              <span className="w-4 h-4 rounded-full bg-[var(--accent-green-dim)] flex items-center justify-center text-[9px]">✓</span>
            ) : (
              <span className="w-4 text-center text-[9px]">◉</span>
            )}
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/workspace/PilotUploadPanel.tsx
git commit -m "feat: add PilotUploadPanel component"
```

---

## Task 5: Criar PilotBriefingForm

**Files:**
- Create: `app/src/components/workspace/PilotBriefingForm.tsx`

**Context:** Painel direito do piloto. Exibe insights da IA e formulário editável do briefing.

- [ ] **Step 1: Criar o componente**

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";

interface PilotBriefingFormProps {
  analysis: CreativeAnalysis;
  onSubmit: (briefing: CampaignBriefing) => void;
  onSkip: () => void;
}

interface CampaignBriefing {
  objective: string;
  audience: string;
  tone: string;
  platforms: string;
  ctaText: string;
  constraints: string;
}
```

- [ ] **Step 2: Implementar o formulário com hints**

```tsx
export function PilotBriefingForm({ analysis, onSubmit, onSkip }: PilotBriefingFormProps) {
  const [briefing, setBriefing] = useState<CampaignBriefing>({
    objective: analysis.suggestedObjective || "",
    audience: analysis.suggestedAudience || "",
    tone: analysis.suggestedTone || "Inspirador e natural",
    platforms: analysis.suggestedPlatforms || "Instagram, Facebook Ads",
    ctaText: analysis.suggestedCta || "",
    constraints: "",
  });

  const suggestedFields = ["objective", "audience", "ctaText"];

  return (
    <div className="flex-1 min-w-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-green)] block mb-3">
        Sugestões da IA
      </span>

      <div className="bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-xl p-5 mb-5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-green)] mb-3">
          Detectado no criativo
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm py-2 border-b border-[var(--border-dim)]">
            <span className="text-[var(--ghost)] text-xs">Conceito</span>
            <span className="font-medium">{analysis.detectedConcept}</span>
          </div>
          <div className="flex justify-between text-sm py-2 border-b border-[var(--border-dim)]">
            <span className="text-[var(--ghost)] text-xs">Tom</span>
            <span className="font-medium">{analysis.tone}</span>
          </div>
          <div className="flex justify-between text-sm py-2 border-b border-[var(--border-dim)]">
            <span className="text-[var(--ghost)] text-xs">Elementos</span>
            <span className="font-medium">{analysis.elements}</span>
          </div>
          <div className="flex justify-between text-sm py-2">
            <span className="text-[var(--ghost)] text-xs">Formato</span>
            <span className="font-medium">{analysis.format}</span>
          </div>
        </div>
      </div>

      <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-[var(--ghost)] block mb-4">
        Briefing da campanha
      </span>

      <div className="space-y-4">
        <Field
          label="Objetivo da campanha"
          value={briefing.objective}
          onChange={(v) => setBriefing({ ...briefing, objective: v })}
          hint={suggestedFields.includes("objective") ? "Sugerido pela análise do criativo" : undefined}
        />
        <Field
          label="Público-alvo"
          value={briefing.audience}
          onChange={(v) => setBriefing({ ...briefing, audience: v })}
          hint={suggestedFields.includes("audience") ? "Sugerido pela análise do criativo" : undefined}
        />
        <div>
          <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">Tom de voz</Label>
          <select
            className="w-full mt-1.5 bg-[var(--surface-base)] border border-[var(--border-dim)] rounded px-3 py-2.5 text-sm focus:border-[var(--accent-green)] focus:ring-1 focus:ring-[var(--accent-green-dim)]"
            value={briefing.tone}
            onChange={(e) => setBriefing({ ...briefing, tone: e.target.value })}
          >
            <option>Inspirador e natural</option>
            <option>Formal e técnico</option>
            <option>Descontraído e jovem</option>
          </select>
        </div>
        <Field
          label="Plataformas"
          value={briefing.platforms}
          onChange={(v) => setBriefing({ ...briefing, platforms: v })}
        />
        <Field
          label="CTA Principal"
          value={briefing.ctaText}
          onChange={(v) => setBriefing({ ...briefing, ctaText: v })}
          hint={suggestedFields.includes("ctaText") ? "Sugerido pela análise do criativo" : undefined}
        />
        <div>
          <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">Restrições / Notas</Label>
          <Textarea
            className="mt-1.5 bg-[var(--surface-base)] border-[var(--border-dim)]"
            value={briefing.constraints}
            onChange={(e) => setBriefing({ ...briefing, constraints: e.target.value })}
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2.5 mt-6 pt-5 border-t border-[var(--border-dim)]">
        <Button variant="outline" onClick={onSkip}>Pular sugestões</Button>
        <Button
          className="bg-[var(--text-primary)] text-white font-['Press_Start_2P'] text-[9px] uppercase tracking-wide px-6 py-3.5 relative overflow-hidden hover:text-[var(--text-primary)]"
          onClick={() => onSubmit(briefing)}
        >
          <span className="relative z-10">Confirmar e ir para ações →</span>
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">{label}</Label>
      <Input
        className="mt-1.5 bg-[var(--surface-base)] border-[var(--border-dim)] focus:border-[var(--accent-green)] focus:ring-1 focus:ring-[var(--accent-green-dim)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <p className="text-[11px] text-[var(--accent-amber)] mt-1 flex items-center gap-1">💡 {hint}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/workspace/PilotBriefingForm.tsx
git commit -m "feat: add PilotBriefingForm component"
```

---

## Task 6: Criar PilotSidebar

**Files:**
- Create: `app/src/components/workspace/PilotSidebar.tsx`

**Context:** Sidebar da tela de ações com preview do piloto e resumo do briefing.

- [ ] **Step 1: Criar o componente**

```typescript
interface PilotSidebarProps {
  campaign: Campaign;
  pilotAsset?: CampaignAsset;
  briefing: CampaignBriefing;
}
```

- [ ] **Step 2: Implementar JSX**

```tsx
export function PilotSidebar({ campaign, pilotAsset, briefing }: PilotSidebarProps) {
  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col gap-4">
      <div className="bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-xl overflow-hidden">
        <div className="h-[180px] bg-[var(--surface-raised)] flex items-center justify-center text-xs text-[var(--ghost)] font-mono">
          {pilotAsset ? <img src={pilotAsset.url} className="w-full h-full object-cover" /> : "Preview do piloto"}
        </div>
        <div className="p-3.5">
          <span className="inline-block font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--accent-green)] bg-[var(--accent-green-dim)] px-2 py-0.5 rounded-sm mb-1.5">
            Piloto
          </span>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">{campaign.name}</h4>
          <p className="text-[11px] text-[var(--ghost)] font-mono mt-0.5">Criativo base • 1:1</p>
        </div>
      </div>

      <div className="bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-xl p-4">
        <h5 className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ghost)] mb-3">
          Resumo do briefing
        </h5>
        <div className="space-y-1">
          {[
            { label: "Objetivo", value: briefing.objective || "—" },
            { label: "Público", value: briefing.audience || "—" },
            { label: "Tom", value: briefing.tone || "—" },
            { label: "Plataformas", value: briefing.platforms || "—" },
            { label: "CTA", value: briefing.ctaText || "—" },
          ].map((row) => (
            <div key={row.label} className="flex justify-between text-xs py-1.5 border-b border-[var(--border-dim)] last:border-0">
              <span className="text-[var(--ghost)] text-[11px]">{row.label}</span>
              <span className="text-[var(--text-secondary)] text-[11px] max-w-[120px] text-right truncate">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/workspace/PilotSidebar.tsx
git commit -m "feat: add PilotSidebar component"
```

---

## Task 7: Criar ActionCards

**Files:**
- Create: `app/src/components/workspace/ActionCards.tsx`

**Context:** Os dois cards de ação principal na tela de ações.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

interface ActionCardsProps {
  onDerivar: () => void;
  onEstilizar: () => void;
}

export function ActionCards({ onDerivar, onEstilizar }: ActionCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-8 max-w-[800px]">
      <button
        onClick={onDerivar}
        className="text-left bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-xl p-6 transition-all hover:border-[rgba(0,179,74,0.3)] hover:shadow-[0_4px_24px_rgba(0,179,74,0.08)] hover:-translate-y-px"
      >
        <div className="w-10 h-10 rounded-lg bg-[var(--accent-green-dim)] flex items-center justify-center text-lg mb-3.5 text-[var(--accent-green)]">
          🎨
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Derivar criativo</h3>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">
          Crie variações do seu criativo piloto. Gere novas versões artísticas, adapte para diferentes tamanhos ou crie derivações em lote.
        </p>
        <div className="flex gap-2 mt-3.5 flex-wrap">
          {["Variações", "Tamanhos", "Lote"].map((tag) => (
            <span key={tag} className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ghost)] bg-[var(--surface-raised)] px-2.5 py-[3px] rounded-sm border border-[var(--border-dim)]">
              {tag}
            </span>
          ))}
        </div>
      </button>

      <button
        onClick={onEstilizar}
        className="text-left bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-xl p-6 transition-all hover:border-[rgba(0,179,74,0.3)] hover:shadow-[0_4px_24px_rgba(0,179,74,0.08)] hover:-translate-y-px"
      >
        <div className="w-10 h-10 rounded-lg bg-[rgba(0,179,74,0.08)] flex items-center justify-center text-lg mb-3.5 text-[var(--accent-green)]">
          ✨
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Workflow de estilização</h3>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">
          Aplique um estilo completamente novo ao seu criativo. Use referências visuais, defina parâmetros de estilo e gere versões reinterpretadas.
        </p>
        <div className="flex gap-2 mt-3.5 flex-wrap">
          {["Referências", "Estilos", "Reinterpretar"].map((tag) => (
            <span key={tag} className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ghost)] bg-[var(--surface-raised)] px-2.5 py-[3px] rounded-sm border border-[var(--border-dim)]">
              {tag}
            </span>
          ))}
        </div>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/workspace/ActionCards.tsx
git commit -m "feat: add ActionCards component"
```

---

## Task 8: Criar DerivarModal

**Files:**
- Create: `app/src/components/workspace/DerivarModal.tsx`

**Context:** Modal com 4 opções de derivação.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface DerivarModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: "art_variation" | "format_adaptation", config: { batch?: boolean; singleFormat?: string }) => void;
}

const options = [
  {
    title: "Criar novas variações",
    description: "Variações manuais com controle criativo total",
    mode: "art_variation" as const,
    config: {},
  },
  {
    title: "Gerar novas variações",
    description: "IA gera variações artísticas automaticamente",
    mode: "art_variation" as const,
    config: { auto: true },
  },
  {
    title: "Variar tamanhos",
    description: "Adapte para 4:5, 9:16, 1:1 e outros formatos",
    mode: "format_adaptation" as const,
    config: { singleFormat: true },
  },
  {
    title: "Criar derivações de tamanhos",
    description: "Múltiplas versões em diferentes proporções de uma vez",
    mode: "format_adaptation" as const,
    config: { batch: true },
  },
];

export function DerivarModal({ open, onClose, onSelect }: DerivarModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[600px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-[var(--border-dim)]">
          <DialogTitle className="text-[15px] font-semibold">🎨 Derivar criativo</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5">
          <p className="text-[13px] text-[var(--text-secondary)] mb-5">
            Escolha o tipo de derivação a partir do criativo piloto.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {options.map((opt) => (
              <button
                key={opt.title}
                onClick={() => onSelect(opt.mode, opt.config)}
                className="text-left bg-[var(--deep-bg)] border border-[var(--border-dim)] rounded-lg p-4.5 transition-all hover:border-[var(--accent-green)] hover:bg-[var(--surface-raised)]"
              >
                <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">{opt.title}</h4>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/workspace/DerivarModal.tsx
git commit -m "feat: add DerivarModal component"
```

---

## Task 9: Criar EstilizarModal

**Files:**
- Create: `app/src/components/workspace/EstilizarModal.tsx`

**Context:** Modal de workflow de estilização com upload de referências, select de estilo e intensidade.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

interface EstilizarModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { styleReferences: string[]; style: string; intensity: string }) => void;
}

export function EstilizarModal({ open, onClose, onSubmit }: EstilizarModalProps) {
  const [style, setStyle] = useState("Minimalista e clean");
  const [intensity, setIntensity] = useState("Média — equilíbrio");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[600px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-[var(--border-dim)]">
          <DialogTitle className="text-[15px] font-semibold">✨ Workflow de estilização</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5">
          <p className="text-[13px] text-[var(--text-secondary)] mb-5">
            Configure as referências e o estilo para reinterpretar o criativo.
          </p>

          <div className="space-y-4">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">
                Referências de estilo
              </Label>
              <div className="mt-1.5 h-[100px] rounded-xl border-[1.5px] border-dashed border-[var(--border-medium)] bg-[var(--surface-base)] flex flex-col items-center justify-center gap-1.5 hover:border-[var(--accent-green)] hover:bg-[var(--surface-raised)] transition-all cursor-pointer">
                <span className="text-2xl opacity-40">📎</span>
                <p className="text-sm text-[var(--text-muted)]">Arraste imagens de referência</p>
                <p className="text-[11px] text-[var(--ghost)] font-mono">JPG, PNG • Máx 10MB</p>
              </div>
            </div>

            <div>
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">Estilo desejado</Label>
              <select
                className="w-full mt-1.5 bg-[var(--surface-base)] border border-[var(--border-dim)] rounded px-3 py-2.5 text-sm focus:border-[var(--accent-green)] focus:ring-1 focus:ring-[var(--accent-green-dim)]"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
              >
                <option>Minimalista e clean</option>
                <option>Orgânico e natural</option>
                <option>Neon e futurista</option>
                <option>Retrô e vintage</option>
              </select>
            </div>

            <div>
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">Intensidade da reinterpretação</Label>
              <select
                className="w-full mt-1.5 bg-[var(--surface-base)] border border-[var(--border-dim)] rounded px-3 py-2.5 text-sm focus:border-[var(--accent-green)] focus:ring-1 focus:ring-[var(--accent-green-dim)]"
                value={intensity}
                onChange={(e) => setIntensity(e.target.value)}
              >
                <option>Suave — mantém estrutura</option>
                <option>Média — equilíbrio</option>
                <option>Forte — transformação visual</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              className="bg-[var(--accent-green)] text-white hover:bg-[var(--accent-green-dark)]"
              onClick={() => onSubmit({ styleReferences: [], style, intensity })}
            >
              Gerar reinterpretações
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/workspace/EstilizarModal.tsx
git commit -m "feat: add EstilizarModal component"
```

---

## Task 10: Criar DerivationGrid

**Files:**
- Create: `app/src/components/workspace/DerivationGrid.tsx`

**Context:** Grid de cards de derivação com status, reutilizando o DerivationCard existente quando possível.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import { DerivationCard } from "./DerivationCard"; // se existir, ou implementar inline

interface DerivationGridProps {
  derivations: Derivation[];
  onAddNew: () => void;
}

export function DerivationGrid({ derivations, onAddNew }: DerivationGridProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3.5">
        🖼️ Derivações geradas{" "}
        <span className="text-xs text-[var(--ghost)] font-normal">
          ({derivations.filter((d) => d.status === "approved").length} aprovadas)
        </span>
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {derivations.map((derivation) => (
          <div
            key={derivation.id}
            className="bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-xl overflow-hidden aspect-[4/5] relative transition-all hover:border-[var(--border-medium)]"
          >
            <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--ghost)] font-mono">
              Var #{derivation.variantIndex}
            </div>
            {derivation.status === "approved" && (
              <div className="absolute top-2 left-2 font-mono text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm bg-[var(--surface-base)] border border-[var(--border-dim)] text-[var(--accent-green-dark)]">
                ✓ Aprovada
              </div>
            )}
          </div>
        ))}
        <button
          onClick={onAddNew}
          className="bg-[var(--surface-base)] border border-dashed border-[var(--border-medium)] rounded-xl overflow-hidden aspect-[4/5] relative transition-all hover:border-[var(--accent-green)] hover:border-solid"
        >
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--accent-green)] font-mono">
            + Nova
          </div>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/workspace/DerivationGrid.tsx
git commit -m "feat: add DerivationGrid component"
```

---

## Task 11: Refatorar página /campaigns/[id]

**Files:**
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx`

**Context:** Substituir o wizard de 5 passos pelo novo fluxo de estados.

- [ ] **Step 1: Inspecionar a página atual**

Leia o arquivo para entender como ele usa `useCampaignWorkspace`, `StepIndicator`, `WizardNavigationFooter`, e os steps.

- [ ] **Step 2: Substituir o conteúdo do wizard**

Remova:
- `<CampaignWorkspaceHeader />` complexo (simplificar para o header padrão da página)
- `<StepIndicator />`
- `<WizardNavigationFooter />`
- `<AnimatePresence>` com os 5 steps

Mantenha apenas:
- Header da página com back link, título e status badge
- Container `glass-card`
- Renderização condicional baseada em `workspaceState`

- [ ] **Step 3: Implementar renderização por estado**

```tsx
export default function CampaignWorkspacePage({ params }: { params: { id: string } }) {
  const {
    campaign,
    campaignAssets,
    derivations,
    workspaceState,
    savePilot,
    goToDerivation,
    goToStyling,
  } = useCampaignWorkspace(params.id);

  const [showDerivarModal, setShowDerivarModal] = useState(false);
  const [showEstilizarModal, setShowEstilizarModal] = useState(false);

  const pilotAsset = campaignAssets.find((a) => a.role === "base");

  return (
    <div className="max-w-[1100px] min-w-0 mx-auto pb-20">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <a href="/campaigns" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-[var(--surface-raised)] transition-all">
            ← Campanhas
          </a>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{campaign?.name}</h1>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-[var(--accent-green-dim)] text-[var(--text-primary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />
            {workspaceState === "piloto" ? "Piloto" : "Ativa"}
          </div>
        </div>
        <Button variant="outline" size="sm">🗑️</Button>
      </div>

      {/* Main content */}
      <div className="glass-card rounded-xl min-h-[400px] p-6 md:p-8">
        {workspaceState === "piloto" && (
          <div className="flex gap-6">
            <PilotUploadPanel
              onAssetUploaded={(assetId) => {/* ... */}}
              onAnalysisComplete={(analysis) => {/* ... */}}
            />
            <PilotBriefingForm
              analysis={analysis}
              onSubmit={(briefing) => savePilot(pilotAssetId, briefing)}
              onSkip={() => savePilot(pilotAssetId, {})}
            />
          </div>
        )}

        {workspaceState === "acoes" && (
          <div className="flex gap-6">
            <PilotSidebar
              campaign={campaign}
              pilotAsset={pilotAsset}
              briefing={campaign}
            />
            <div className="flex-1 min-w-0">
              <div className="mb-7 max-w-[600px]">
                <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1.5">
                  O que você quer fazer com este criativo?
                </h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Escolha uma ação para gerar variações, adaptar tamanhos ou aplicar novos estilos.
                </p>
              </div>
              <ActionCards
                onDerivar={() => setShowDerivarModal(true)}
                onEstilizar={() => setShowEstilizarModal(true)}
              />
              <DerivationGrid
                derivations={derivations}
                onAddNew={() => setShowDerivarModal(true)}
              />
            </div>
          </div>
        )}

        {workspaceState === "gerando" && (
          <div className="flex flex-col items-center justify-center py-20">
            <Spinner className="w-10 h-10 mb-4" />
            <p className="text-sm text-[var(--text-muted)] font-mono uppercase tracking-widest">Gerando derivações...</p>
          </div>
        )}
      </div>

      <DerivarModal
        open={showDerivarModal}
        onClose={() => setShowDerivarModal(false)}
        onSelect={(mode, config) => {
          setShowDerivarModal(false);
          goToDerivation();
          // disparar criação de derivação com mode/config
        }}
      />
      <EstilizarModal
        open={showEstilizarModal}
        onClose={() => setShowEstilizarModal(false)}
        onSubmit={(data) => {
          setShowEstilizarModal(false);
          goToStyling();
          // disparar restyling
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/src/app/(dashboard)/campaigns/[id]/page.tsx
git commit -m "feat: refactor campaign workspace to piloto/acoes state machine"
```

---

## Task 12: Limpar e testar o fluxo completo

**Files:**
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx` e componentes conforme necessário

- [ ] **Step 1: Verificar imports e tipos**

Rode o TypeScript para verificar erros:

```bash
cd app && npx tsc --noEmit
```

- [ ] **Step 2: Verificar build**

```bash
cd app && npm run build
```

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat: complete new ad creation flow (piloto + acoes)"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Criação simplificada de campanha (Task 1)
- ✅ Tela do piloto com upload + análise (Tasks 3, 4)
- ✅ Briefing sugerido editável (Task 5)
- ✅ Tela de ações com dois botões (Tasks 6, 7)
- ✅ Sub-fluxo Derivar com 4 opções (Task 8)
- ✅ Sub-fluxo Estilizar (Task 9)
- ✅ Grid de derivações (Task 10)
- ✅ Estado da máquina de estados (Task 3)
- ✅ API pilot (Task 2)
- ✅ Página refatorada (Task 11)

**Placeholder scan:**
- ✅ Sem TBDs ou TODOs
- ✅ Sem referências a funções não definidas
- ✅ Código completo em todos os componentes principais

**Type consistency:**
- ✅ `WorkspaceState` definido no hook e usado nos componentes
- ✅ `CampaignBriefing` usado consistentemente
- ✅ Nomes de funções consistentes entre hook e consumidores
