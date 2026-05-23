# Creative Plan Wizard Integration — Design Doc

> **Status:** Approved  
> **Scope:** Connect the existing orphaned `PlanStep` into the campaign wizard as step 3, making the creative plan visible, approvable, and skippable.

---

## 1. Goal

Transform the campaign wizard from a 3-step flow (Brief → Upload → Gallery) into a 4-step flow (Brief → Upload → **Plan** → Gallery) where:
- Users see an AI-generated creative plan after uploading their base creative
- They can approve, reject, regenerate, or skip the plan
- Derivation generation is triggered from the Plan step (not Upload)
- Existing campaigns without plans auto-generate one when entering the Plan step

---

## 2. UX Flow

```
┌─────────┐     ┌─────────┐     ┌─────────────┐     ┌─────────┐
│ Brief   │ ──► │ Upload  │ ──► │ Plan        │ ──► │ Gallery │
│ (1)     │     │ (2)     │     │ (3)         │     │ (4)     │
└─────────┘     └─────────┘     └─────────────┘     └─────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │ Aprovar      │  │ Regenerar    │  │ Pular Plano  │
            │ → Gerar      │  │ → Novo plano │  │ → Gallery    │
            └──────────────┘  └──────────────┘  └──────────────┘
```

### Step 2 (Upload) — New Footer
- **Primary:** "Continuar para Plano" → goes to step 3
- **Secondary:** "Gerar sem Plano" (fast path) → skips plan, triggers derivations, goes to step 4
- **Tertiary:** "Gerar Preview" → optional preview generation (keeps current behavior, stays on step 2)

### Step 3 (Plan) — States

#### State A: Loading (auto-generating)
- Shows full-screen spinner: "Gerando plano criativo com IA..."
- Triggered automatically when:
  - User enters step 3 and no plan exists
  - User clicks "Regenerar"

#### State B: Plan Ready
- Shows `CreativePlanCard` with real plan data
- Actions:
  - **Aprovar Plano** → enables "Gerar Derivações" button
  - **Rejeitar Plano** → marks plan as rejected, offers regenerate
  - **Regenerar Plano** → triggers new generation (spends credits again)
  - **Editar** → toggles editable mode on the card (existing prop)
- After approval, sticky footer shows:
  - **Gerar Derivações** → triggers derivations, goes to step 4
  - **Voltar ao Upload** → goes back to step 2

#### State C: Error
- Shows error message with retry button

#### State D: Fast Path (Skip)
- Button "Pular e Gerar" visible at top right
- Clicking skips plan approval, triggers derivations directly, goes to step 4

### Step 4 (Gallery)
- Unchanged from current behavior
- Derivation generation is already triggered from Plan step

---

## 3. Component Changes

### StepIndicator
- Change `StepKey` from `1 | 2 | 3` to `1 | 2 | 3 | 4`
- Add step 3: `{ key: 3, label: t("plan"), icon: Sparkles }`
- Rename current step 3 (gallery) to step 4: `{ key: 4, label: t("gallery"), icon: LayoutGrid }`
- Connector lines update automatically (4 connectors instead of 3)

### useCampaignWorkspace hook
- Change `WizardStep` from `1 | 2 | 3` to `1 | 2 | 3 | 4`
- Update `handleNext`: goes 1→2→3→4
- Update `handlePrev`: goes 4→3→2→1
- Update `goToStep`: accepts `1 | 2 | 3 | 4`
- Update initial step detection: if derivations exist, jump to step 4 (not 3)
- Update `handleUploadContinue`:
  - Old: calls `handleGenerateDerivations()` directly
  - New: calls `goToStep(3)`
- Add `handleSkipPlan`:
  - Calls `handleGenerateDerivations()` → goes to step 4
- Add `handlePlanApproveAndGenerate`:
  - Calls `updatePlanStatus("approved")` → then `handleGenerateDerivations()`
- Update `getStepNavLabel`:
  - Step 2 next: "continueToPlan"
  - Step 3 prev: "backToUpload" / next: "generateDerivations"
  - Step 4 prev: "backToPlan"

### UploadStep
- Footer buttons change:
  - Remove/rename "Generate All" → "Continuar para Plano"
  - Add "Gerar sem Plano" (secondary, fast path)
  - Keep "Gerar Preview" (tertiary)
- Props change:
  - Remove `onContinue` that triggers generation
  - Add `onContinueToPlan` → goes to step 3
  - Add `onSkipPlan` → triggers generation, goes to step 4

### PlanStep (refactor)
- **Remove** simulated loading (`setIsLoading` state with fake delay)
- **Connect** to real hooks:
  - `usePlan(campaignId)` → fetch existing plan
  - `useGeneratePlan(campaignId)` → generate new plan
  - `useUpdatePlanStatus(campaignId)` → approve/reject
- **Auto-generate** on mount if no plan exists:
  ```
  useEffect(() => {
    if (!plan && !generatePlan.isPending && !generatePlan.isError) {
      generatePlan.mutate();
    }
  }, [plan, generatePlan]);
  ```
- **Props**:
  ```typescript
  interface PlanStepProps {
    campaignId: string;
    onApproveAndGenerate: () => void;
    onSkipPlan: () => void;
    onBack: () => void;
  }
  ```
- **Remove** old props: `plan`, `onApprove`, `onGenerateDerivations`, `approved`, `isGenerating`
- **Keep** `CreativePlanCard` as-is (it already renders plan data well)

### Campaign Page (`campaigns/[id]/page.tsx`)
- Import `PlanStep`
- Add step 3 rendering:
  ```tsx
  {currentStep === 3 && <PlanStep ... />}
  ```
- Update step 4 (was 3) to render `DerivationsStep`
- Wire new handlers from `useCampaignWorkspace`

---

## 4. Data Flow

```
User clicks "Continuar para Plano" (step 2)
    │
    ▼
Page goes to step 3
    │
    ▼
PlanStep mounts → usePlan query executes
    │
    ├── Plan exists → show CreativePlanCard
    │
    └── Plan null → useGeneratePlan.mutate() → POST /api/campaigns/:id/plan
            │
            ├── Success → invalidate query → card appears
            │
            └── Error → show error state with retry
    │
User clicks "Aprovar"
    │
    ▼
useUpdatePlanStatus.mutate("approved")
    │
    ▼
Sticky footer enables "Gerar Derivações" button
    │
User clicks "Gerar Derivações"
    │
    ▼
handlePlanApproveAndGenerate → createDerivations.mutate()
    │
    ▼
Go to step 4 (Gallery), campaign status → "generating"
```

---

## 5. i18n Keys

### New keys in `steps` namespace:
```json
"steps": {
  "brief": "Briefing",
  "upload": "Upload",
  "plan": "Plano Criativo",
  "gallery": "Galeria"
}
```

### New keys in `campaign` namespace:
```json
"campaign": {
  "continueToPlan": "Continuar para Plano",
  "backToUpload": "Voltar ao Upload",
  "backToPlan": "Voltar ao Plano",
  "generateWithoutPlan": "Gerar sem Plano",
  "skipPlan": "Pular Plano",
  "generateDerivations": "Gerar Derivações",
  "generatingPlan": "Gerando plano criativo com IA..."
}
```

---

## 6. Visual System

Apply the existing **Flat Dimension** design system (dark theme, 4px radius, border-left accent):
- Plan step uses the same card style as other wizard steps
- `CreativePlanCard` styling is already consistent with the app (left accent border, rounded cards)
- No visual redesign needed — the component is well-styled already

---

## 7. Responsive

- Plan step is the same width as other steps (`max-w-[960px] mx-auto`)
- `CreativePlanCard` already handles overflow/scrolling for hooks and CTAs
- No changes needed

---

## 8. Accessibility

- Step indicator now has 4 steps with proper ARIA labels
- Plan generation loading state announces "Carregando plano criativo"
- Approve/reject buttons have clear labels
- Keyboard navigation preserved (tab order through card → action bar)

---

## 9. Edge Cases

| Case | Behavior |
|------|----------|
| Campaign without plan (existing) | Auto-generate when entering step 3 |
| Plan generation fails | Show error with "Tentar novamente" button |
| User rejects plan | Show "Plano rejeitado" badge + "Regenerar" button |
| User refreshes on step 3 | Re-fetch plan, auto-generate if needed |
| User goes back from Gallery to Plan | Show approved plan state (read-only) |
| Fast path (skip plan) | Trigger derivations without plan consumption |
| Insufficient credits for plan | Show credit alert, block generation |

---

## 10. Files to Touch

| File | Action | Description |
|------|--------|-------------|
| `src/components/workspace/StepIndicator.tsx` | Modify | 4 steps, new Sparkles icon for plan |
| `src/lib/hooks/use-campaign-workspace.ts` | Modify | 4-step navigation, new handlers |
| `src/components/workspace/UploadStep.tsx` | Modify | New footer buttons (continue to plan / skip) |
| `src/components/workspace/PlanStep.tsx` | **Replace** | Connect to real hooks, auto-generate |
| `src/app/(dashboard)/campaigns/[id]/page.tsx` | Modify | Render PlanStep as step 3,DerivationsStep as step 4 |
| `messages/pt-BR.json` | Modify | New step and navigation keys |
| `messages/en.json` | Modify | English translations |

**No backend changes needed** — the plan API, repository, and hooks are already fully functional.

---

## 11. Testing Strategy

1. **Unit test** `StepIndicator` with 4 steps
2. **Unit test** `PlanStep` auto-generation logic
3. **Integration test** wizard navigation (1→2→3→4 and back)
4. **Manual smoke**:
   - Create campaign → brief → upload → plan auto-generates → approve → derivations generate
   - Create campaign → brief → upload → skip plan → derivations generate directly
   - Open old campaign → enter plan step → auto-generates

---

*Design approved. Next: invoke `writing-plans` skill for implementation.*
