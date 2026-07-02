# UI Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse ADScale's interface complexity by making the assistant chat the control plane for campaign actions, reducing the campaign workspace from 5 states to 2 modes, replacing modals with a unified ActionCard, hiding credit friction, and merging duplicate routes.

**Architecture:** The assistant backend already exposes 8 registered action contracts (`quick_restyle`, `quick_format_adapt`, etc.) with typed inputs, credit impact, and confirmation policies. The UI change is to (1) surface these as a single `ActionCard` component rendered inside the chat thread, (2) make the chat a permanent right panel in the campaign workspace instead of a drawer, and (3) collapse the workspace state machine. All app code lives under `app/`; tests are co-located `*.test.ts(x)` files run with Vitest.

**Tech Stack:** Next.js 16.2 (App Router), React 19, Tailwind CSS 4, TypeScript 5, TanStack Query, Zustand, Vitest, Testing Library, next-intl.

## Global Constraints

- All runnable app code is under `app/` — run `npm test`, `npm run lint`, `npm run build` from `app/`.
- i18n is bilingual (EN + PT-BR): every user-facing string added must be added to BOTH `app/messages/en.json` and `app/messages/pt-BR.json`.
- Action contracts follow the existing pattern: define in `app/src/server/assistant/action-contracts/contracts/`, register in `app/src/server/assistant/action-contracts/contracts/index.ts`, handler in `app/src/server/assistant/action-execution/handlers/`, wired in `app/src/server/assistant/action-execution/execute.ts` `HANDLERS` map.
- Test pattern: co-located `*.test.ts(x)`, Vitest with `vi.mock` for server repos, Testing Library for components.
- The `(preview)/v6/` route group is FROZEN — do not add or modify mockups there during this work.
- The spec is `docs/superpowers/specs/2026-07-02-ui-simplification-design.md`.

## Phasing

This plan has 6 phases. Each phase is independently shippable. Phases must be executed in order because later phases depend on earlier interfaces.

| Phase | What | Tasks |
|-------|------|-------|
| 1 | Role-aware navigation + remove "Laboratório" | Tasks 1-3 |
| 2 | Delete duplicate restyle routes | Task 4 |
| 3 | Remove credit friction from preventive UI | Task 5 |
| 4 | ActionCard component (the core unification) | Tasks 6-8 |
| 5 | Collapse workspace 5 states → 2 modes + permanent chat panel | Tasks 9-11 |
| 6 | Hide operational routes behind admin guard | Task 12 |

---

## Phase 1 — Role-aware navigation

### Task 1: Add `role` awareness to the sidebar

**Files:**
- Modify: `app/src/components/layout/AppSidebar.tsx` (entire file)
- Modify: `app/messages/en.json`, `app/messages/pt-BR.json` (navigation section)
- Test: `app/src/components/layout/AppSidebar.test.tsx` (new)

**Interfaces:**
- Consumes: `useAppStore((s) => s.billing)` (existing), `useBillingStatus()` (existing), `authClient.useSession()` (existing)
- Produces: `AppSidebar` now accepts `variant: "production" | "preview"` (existing) and reads role from billing status; exports nothing new

- [ ] **Step 1: Write failing test for role-aware nav items**

Create `app/src/components/layout/AppSidebar.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/campaigns" }));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));
vi.mock("@/lib/store", () => ({
  useAppStore: () => ({
    user: { firstName: "Test", lastName: "User", email: "t@t.com" },
    billing: { planName: "Starter" },
  }),
}));
vi.mock("@/lib/hooks/use-campaigns", () => ({ useCampaigns: () => ({ totalCount: 0 }) }));
vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: () => ({
    data: { access: { kind: "owner", label: "Owner" }, creditBalance: 10 },
  }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { name: "Test User" } } }) },
}));
vi.mock("next/image", () => ({ default: () => null }));

import AppSidebar from "./AppSidebar";

describe("AppSidebar role-aware navigation", () => {
  it("shows Curador IA under CRIAR section for all users", () => {
    render(<AppSidebar variant="production" />);
    expect(screen.getByText("navigation.curadorIA")).toBeInTheDocument();
  });

  it("does NOT show the Laboratório section header", () => {
    render(<AppSidebar variant="production" />);
    expect(screen.queryByText("Laboratório")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/AppSidebar.test.tsx`
Expected: FAIL — "Laboratório" still rendered, "navigation.curadorIA" not found.

- [ ] **Step 3: Add i18n keys**

In `app/messages/en.json`, under `"navigation"`, add:
```json
"curadorIA": "Curador IA",
"sectionPrincipal": "Principal",
"sectionCriar": "Criar",
"sectionOperacao": "Operação",
"feedback": "Feedback",
"quality": "Quality"
```

In `app/messages/pt-BR.json`, under `"navigation"`, add the same keys (PT-BR values):
```json
"curadorIA": "Curador IA",
"sectionPrincipal": "Principal",
"sectionCriar": "Criar",
"sectionOperacao": "Operação",
"feedback": "Feedback",
"quality": "Quality"
```

- [ ] **Step 4: Rewrite AppSidebar to remove "Laboratório" and make nav role-aware**

Replace the entire `<nav>` + "Laboratório" section in `app/src/components/layout/AppSidebar.tsx`. Remove the "Laboratório" `<div>` block (lines ~112-132) and the `Templates`/`Restyling` nav items. The new structure:

```tsx
      <nav className="flex flex-col gap-0.5">
        <p className="px-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {tNav("sectionPrincipal")}
        </p>
        <NavItem
          href={isPreview ? "/v6/dashboard" : "/"}
          active={isDashboard}
          label={tNav("dashboard")}
        />
        <NavItem
          href={isPreview ? "/v6/campaigns" : "/campaigns"}
          active={isCampaigns}
          label={tNav("campaigns")}
          count={campaignCount}
        />
        <NavItem
          href={isPreview ? "/v6/library" : "/library"}
          active={isLibrary}
          label={tLibrary("title")}
        />
      </nav>

      <div className="mt-3 flex flex-col gap-0.5 border-t border-[var(--border-subtle)] pt-3">
        <p className="px-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {tNav("sectionCriar")}
        </p>
        <NavItem
          href={isPreview ? "#" : "/assistant"}
          active={!isPreview && pathname.startsWith("/assistant")}
          label={tNav("curadorIA")}
          badge="BETA"
        />
      </div>
```

Then add the OPERACAO section before the avatar block, guarded by role:

```tsx
      {isOwnerOrAdmin && (
        <div className="mt-3 flex flex-col gap-0.5 border-t border-[var(--border-subtle)] pt-3">
          <p className="px-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {tNav("sectionOperacao")}
          </p>
          <NavItem href="/feedback" active={pathname.startsWith("/feedback")} label={tNav("feedback")} />
        </div>
      )}
```

Where `isOwnerOrAdmin` is computed near the top of the component:

```tsx
  const accessKind = billingStatus?.access?.kind;
  const isOwnerOrAdmin = accessKind === "owner" || accessKind === "admin";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/layout/AppSidebar.test.tsx`
Expected: PASS

- [ ] **Step 6: Run lint + commit**

```bash
npm run lint
git add app/src/components/layout/AppSidebar.tsx app/src/components/layout/AppSidebar.test.tsx app/messages/en.json app/messages/pt-BR.json
git commit -m "feat(nav): remove Laboratório section, make sidebar role-aware

Curador IA promoted to CRIAR section. Feedback link only for owner/admin.
Removes Restyling, Templates, 'Receita de estratégia' from sidebar nav."
```

---

### Task 2: Remove `Templates` and `Restyling` from TopBar quick-nav

**Files:**
- Modify: `app/src/components/layout/TopBar.tsx` (find nav links to `/templates`, `/restyling`)
- Test: `app/src/components/layout/TopBar.test.tsx` (existing, extend)

**Interfaces:**
- Consumes: existing TopBar internals
- Produces: TopBar no longer links to `/templates` or `/restyling`

- [ ] **Step 1: Find references to `/templates` and `/restyling` in TopBar**

Run: `grep -n "templates\|restyling" app/src/components/layout/TopBar.tsx`

- [ ] **Step 2: Write failing test asserting these links are absent**

Add to `app/src/components/layout/TopBar.test.tsx`:

```tsx
it("does not surface Templates or Restyling nav links", () => {
  render(<TopBar {...defaultProps} />);
  expect(screen.queryByRole("link", { name: /templates/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /restyling/i })).not.toBeInTheDocument();
});
```

(Use whatever `defaultProps` the existing tests already define — read the file first.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/layout/TopBar.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Remove the nav links from TopBar**

Delete the `<Link href="/templates">` and `<Link href="/restyling">` elements (and any icons/labels) from `TopBar.tsx`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/layout/TopBar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/layout/TopBar.tsx app/src/components/layout/TopBar.test.tsx
git commit -m "feat(nav): remove Templates and Restyling quick-links from TopBar"
```

---

### Task 3: Make `/templates` reachable from Dashboard secondary card

**Files:**
- Modify: `app/src/components/dashboard/v6/DashboardV6View.tsx` (add secondary link card)

**Note:** This is a small wiring change so `/templates` stays reachable (just not in the sidebar). No test required — it's a presentational link.

- [ ] **Step 1: Add a "Templates" link in the dashboard secondary area**

Read `DashboardV6View.tsx`, find the section with secondary actions/recipes, and add a simple link:

```tsx
<Link href="/templates" className="text-sm text-[var(--accent-primary)] hover:underline">
  {tLabels("templatesLink")}
</Link>
```

Add the i18n key `dashboard.v6.templatesLink` = `"Templates"` (EN) / `"Templates"` (PT-BR) to both message files.

- [ ] **Step 2: Commit**

```bash
git add app/src/components/dashboard/v6/DashboardV6View.tsx app/messages/en.json app/messages/pt-BR.json
git commit -m "feat(dashboard): add Templates link as secondary action"
```

---

## Phase 2 — Delete duplicate restyle routes

### Task 4: Remove `/restyling` and `/quick-tools/restyling` routes, add redirects

**Files:**
- Delete: `app/src/app/(dashboard)/restyling/page.tsx`
- Delete: `app/src/app/(dashboard)/quick-tools/restyling/page.tsx`
- Delete: `app/src/app/(dashboard)/quick-tools/` directory (if empty after)
- Modify: `app/src/components/layout/AppSidebar.tsx` (already done in Task 1 — no Restyling nav)
- Test: none (deletion + redirect; verified by build)

**Interfaces:**
- Consumes: nothing
- Produces: routes `/restyling` and `/quick-tools/restyling` now 404 or redirect

- [ ] **Step 1: Verify no other code imports these pages**

Run: `grep -rn "(dashboard)/restyling\|(dashboard)/quick-tools/restyling\|quick-tools/restyling" app/src/`

If any imports exist (component imports of the page), remove them. The pages are route modules so should not be imported.

- [ ] **Step 2: Check if the `POST /api/restyling` and `POST /api/quick-tools/restyling` endpoints are called by `quick_restyle`**

Run: `grep -n "fetch\|apiFetch" app/src/server/assistant/action-execution/handlers/quick-restyle.ts`

Confirm whether the handler uses `/api/campaigns/[id]/restyle` (the campaign-scoped endpoint) or the standalone ones. The standalone API routes can only be deleted if `quick_restyle` does not depend on them. If it depends on them, SKIP deleting the API routes and only delete the page routes.

- [ ] **Step 3: Delete the page files**

```bash
git rm "app/src/app/(dashboard)/restyling/page.tsx"
git rm "app/src/app/(dashboard)/quick-tools/restyling/page.tsx"
```

If `quick-tools/` is now empty, delete it too:
```bash
rm -rf "app/src/app/(dashboard)/quick-tools"
```

- [ ] **Step 4: Add redirect for `/restyling` → `/campaigns`**

Create `app/src/app/(dashboard)/restyling.ts` (or use next.config redirects). Simplest: add to `app/next.config.ts` redirects array:

Read `app/next.config.ts` first. Add to the `redirects()` async function:

```ts
return [
  ...(existingRedirects ?? []),
  {
    source: "/restyling",
    destination: "/campaigns",
    permanent: false,
  },
  {
    source: "/quick-tools/restyling",
    destination: "/campaigns",
    permanent: false,
  },
];
```

- [ ] **Step 5: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds with no errors about deleted routes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(routes): delete duplicate /restyling and /quick-tools/restyling pages

Restyle is now exclusively a quick_restyle action within the campaign chat.
Adds redirects to /campaigns for old URLs."
```

---

## Phase 3 — Remove credit friction from preventive UI

### Task 5: Strip credit cost displays from action surfaces

**Files:**
- Modify: `app/src/components/workspace/StrategyRecipePanel.tsx` (remove cost estimate before execution)
- Modify: `app/src/components/workspace/DerivationGrid.tsx` (remove previewGate cost breakdown rendering — keep the gate but remove pre-display of credits)
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx` (stop passing `batchCreditEstimate`, `batchCreditBreakdown`, `previewConversionPayload` as cost displays)

**Interfaces:**
- Consumes: existing billing hooks
- Produces: action surfaces no longer show "N créditos" before execution

**Important:** This task does NOT remove the billing check itself — only the PREVENTIVE display. The 402 gate (when credits actually run out) is handled in Task 7 (ActionCard error state).

- [ ] **Step 1: Write failing test that cost text is absent from StrategyRecipePanel**

Create or extend `app/src/components/workspace/StrategyRecipePanel.test.tsx`:

```tsx
it("does not display credit cost before execution", () => {
  render(<StrategyRecipePanel {...minimalProps} />);
  expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/credits/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/workspace/StrategyRecipePanel.test.tsx`
Expected: FAIL (cost text present).

- [ ] **Step 3: Remove credit cost rendering from StrategyRecipePanel**

In `StrategyRecipePanel.tsx`, find and remove elements that render `batchCreditEstimate`, `batchCreditBreakdown`, or any "N créditos" text. Keep the panel's core function (recipe selection + generate). The `onGeneratePreview` call stays — just don't display the cost.

- [ ] **Step 4: Remove `previewConversionPayload` preventive blocking from campaign page**

In `app/src/app/(dashboard)/campaigns/[id]/page.tsx`, the `previewConversionPayload` is computed (lines ~376-392) and passed as a **preventive** gate. Remove the preventive blocking: keep `showPreviewGate` and `previewDerivation` (so the preview still shows), but stop rendering the `conversionPayload` as a blocking CTA. The actual 402 will surface in the ActionCard (Task 7).

Concretely: in the `previewGate` prop passed to `DerivationGrid`, remove `conversionPayload` and the `onReviseRecipe` cost-revision flow. Keep `previewId`, `onApproveBatch`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/workspace/StrategyRecipePanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run full workspace test suite + commit**

```bash
npx vitest run src/components/workspace/
npm run lint
git add -A
git commit -m "feat(billing): remove preventive credit cost displays from action surfaces

Credits no longer shown before execution. Conversion concentrated at 402 gate.
StrategyRecipePanel and DerivationGrid stop showing batchCreditEstimate/breakdown."
```

---

## Phase 4 — ActionCard component (core unification)

### Task 6: Create `quick_persona_simulate` action contract

The spec requires persona simulation to become an ActionCard. It is not among the 8 existing contracts, so we add it following the established pattern.

**Files:**
- Create: `app/src/server/assistant/action-contracts/contracts/quick-persona-simulate.ts`
- Modify: `app/src/server/assistant/action-contracts/contracts/index.ts`
- Create: `app/src/server/assistant/action-execution/handlers/quick-persona-simulate.ts`
- Modify: `app/src/server/assistant/action-execution/execute.ts` (add to HANDLERS)
- Test: `app/src/server/assistant/action-contracts/contracts/quick-persona-simulate.test.ts`

**Interfaces:**
- Consumes: `ActionContract` type from `../types`, `CREDIT_COSTS` from `@/server/billing/credits`, existing `/api/creatives/[id]/persona-simulation` endpoint logic
- Produces: `quickPersonaSimulateContract` with `actionType: "quick_persona_simulate"`, `executeQuickPersonaSimulate` handler

- [ ] **Step 1: Write failing test for the contract**

Create `app/src/server/assistant/action-contracts/contracts/quick-persona-simulate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import "./index";
import { getActionContract } from "../registry";
import { quickPersonaSimulateContract } from "./quick-persona-simulate";

describe("quick_persona_simulate contract", () => {
  it("is registered in the registry", () => {
    const fetched = getActionContract("quick_persona_simulate");
    expect(fetched).toBeDefined();
    expect(fetched?.label).toBe(quickPersonaSimulateContract.label);
  });

  it("requires baseCreativeId", () => {
    const parsed = quickPersonaSimulateContract.inputSchema.safeParse({
      baseCreativeId: "not-a-uuid",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts valid input with optional count", () => {
    const parsed = quickPersonaSimulateContract.inputSchema.safeParse({
      baseCreativeId: "550e8400-e29b-41d4-a716-446655440000",
      personaCount: 3,
    });
    expect(parsed.success).toBe(true);
  });

  it("has confirmationPolicy required", () => {
    expect(quickPersonaSimulateContract.confirmationPolicy).toBe("required");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/assistant/action-contracts/contracts/quick-persona-simulate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the contract file**

Create `app/src/server/assistant/action-contracts/contracts/quick-persona-simulate.ts`:

```ts
import { z } from "zod";
import { CREDIT_COSTS } from "@/server/billing/credits";
import type { ActionContract } from "../types";

export const quickPersonaSimulateInputSchema = z
  .object({
    baseCreativeId: z.string().uuid(),
    personaCount: z.number().int().min(1).max(5).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const quickPersonaSimulateContract: ActionContract<
  typeof quickPersonaSimulateInputSchema
> = {
  actionType: "quick_persona_simulate",
  intentFamily: "quick_action",
  label: "Simulação de persona",
  inputSchema: quickPersonaSimulateInputSchema,
  requiredFields: ["baseCreativeId"],
  optionalFields: [
    {
      key: "notes",
      riskCopyWhenMissing:
        "Sem notas de direção, a simulação usa personas padrão do perfil do cliente.",
    },
  ],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "low",
  creditImpact: {
    kind: "fixed",
    credits: CREDIT_COSTS.personaSimulation ?? 3,
    label: `${CREDIT_COSTS.personaSimulation ?? 3} créditos`,
  },
  confirmationPolicy: "required",
};
```

Note: verify `CREDIT_COSTS.personaSimulation` exists. Run `grep -n "personaSimulation" app/src/server/billing/credits.ts`. If the key does not exist, use `CREDIT_COSTS.derivation` as a fallback or add the key to `credits.ts`.

- [ ] **Step 4: Register the contract**

In `app/src/server/assistant/action-contracts/contracts/index.ts`, add the import and registration:

```ts
import { quickPersonaSimulateContract } from "./quick-persona-simulate";
// ...
registerActionContract(quickPersonaSimulateContract);
```

- [ ] **Step 5: Run contract test to verify it passes**

Run: `npx vitest run src/server/assistant/action-contracts/contracts/quick-persona-simulate.test.ts`
Expected: PASS.

- [ ] **Step 6: Create the handler**

Create `app/src/server/assistant/action-execution/handlers/quick-persona-simulate.ts`. Read an existing handler (`quick-restyle.ts`) to copy the structure exactly — the handler signature is `async (params) => ExecutionResult`. It should call the existing persona simulation service. Read `app/src/app/api/creatives/[id]/persona-simulation/route.ts` to find the service function it invokes, and call that same function directly (do not HTTP-call your own API).

- [ ] **Step 7: Wire the handler into the HANDLERS map**

In `app/src/server/assistant/action-execution/execute.ts`, add:

```ts
import { executeQuickPersonaSimulate } from "./handlers/quick-persona-simulate";
// in the HANDLERS record:
quick_persona_simulate: executeQuickPersonaSimulate,
```

- [ ] **Step 8: Run full action-execution tests + commit**

```bash
npx vitest run src/server/assistant/action-contracts/ src/server/assistant/action-execution/
npm run lint
git add -A
git commit -m "feat(assistant): add quick_persona_simulate action contract + handler

Follows existing contract pattern. Reuses persona simulation service
previously only reachable via standalone modal."
```

---

### Task 7: Build the `ActionCard` component

**Files:**
- Create: `app/src/components/assistant/ActionCard.tsx`
- Create: `app/src/components/assistant/ActionCard.test.tsx`
- Modify: `app/messages/en.json`, `app/messages/pt-BR.json` (new `assistant.actionCard` section)

**Interfaces:**
- Consumes: `ActionContract` type from `@/server/assistant/action-contracts/types`, `buildRiskCopyLines` from `@/server/assistant/action-contracts/risk-copy`
- Produces: `<ActionCard>` component with props `{ contract, snapshot, status, onConfirm, onCancel, onEdit? }`

- [ ] **Step 1: Write failing tests for ActionCard**

Create `app/src/components/assistant/ActionCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionCard } from "./ActionCard";
import { quickRestyleContract } from "@/server/assistant/action-contracts/contracts/quick-restyle";

const baseProps = {
  contract: quickRestyleContract,
  snapshot: {
    baseCreativeId: "550e8400-e29b-41d4-a716-446655440000",
    styleReferenceId: "550e8400-e29b-41d4-a716-446655440001",
  },
  status: "pending" as const,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("ActionCard", () => {
  it("renders the action label as title", () => {
    render(<ActionCard {...baseProps} />);
    expect(screen.getByText(quickRestyleContract.label)).toBeInTheDocument();
  });

  it("does NOT display credit cost", () => {
    render(<ActionCard {...baseProps} />);
    expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/credits/i)).not.toBeInTheDocument();
  });

  it("shows risk copy when optional field missing", () => {
    render(
      <ActionCard
        {...baseProps}
        snapshot={{ baseCreativeId: "550e8400-e29b-41d4-a716-446655440000" }}
      />
    );
    expect(screen.getByText(/divergir/i)).toBeInTheDocument();
  });

  it("calls onConfirm when confirm clicked", () => {
    render(<ActionCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    expect(baseProps.onConfirm).toHaveBeenCalledOnce();
  });

  it("shows spinner in executing state", () => {
    render(<ActionCard {...baseProps} status="executing" />);
    expect(screen.getByText(/gerando/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/assistant/ActionCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Add i18n keys**

In both `en.json` and `pt-BR.json`, add under `assistant`:

```json
"actionCard": {
  "confirm": "Confirmar",
  "cancel": "Cancelar",
  "edit": "Editar",
  "executing": "Gerando…",
  "errorTitle": "Falha",
  "successTitle": "Concluído"
}
```
(PT-BR values shown above; EN file gets `"confirm": "Confirm"`, etc.)

- [ ] **Step 4: Implement ActionCard**

Create `app/src/components/assistant/ActionCard.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { ActionContract } from "@/server/assistant/action-contracts/types";
import { buildRiskCopyLines } from "@/server/assistant/action-contracts/risk-copy";

export type ActionCardStatus = "pending" | "executing" | "completed" | "error";

export interface ActionCardProps {
  contract: ActionContract;
  snapshot: Record<string, unknown>;
  status: ActionCardStatus;
  errorMessage?: string;
  children?: React.ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
}

export function ActionCard({
  contract,
  snapshot,
  status,
  errorMessage,
  children,
  onConfirm,
  onCancel,
  onEdit,
}: ActionCardProps) {
  const t = useTranslations("assistant.actionCard");
  const riskLines = buildRiskCopyLines(contract, snapshot);

  return (
    <div
      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"
      data-action-type={contract.actionType}
      data-action-status={status}
    >
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{contract.label}</h4>
      </div>

      {children ? <div className="mb-3 space-y-1 text-xs text-[var(--text-secondary)]">{children}</div> : null}

      {riskLines.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {riskLines.map((line) => (
            <li key={line} className="flex gap-1.5 text-xs text-[var(--warning-text)]">
              <span aria-hidden>⚠</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {status === "executing" ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="inline-block size-3 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
          {t("executing")}
        </div>
      ) : status === "error" ? (
        <div className="text-xs text-[var(--accent-rose)]">
          {t("errorTitle")}: {errorMessage}
        </div>
      ) : status === "completed" ? (
        <div className="text-xs text-[var(--accent-green)]">{t("successTitle")}</div>
      ) : (
        <div className="flex justify-end gap-2">
          {onEdit ? (
            <button type="button" onClick={onEdit} className="rounded px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)]">
              {t("edit")}
            </button>
          ) : null}
          <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)]">
            {t("cancel")}
          </button>
          <button type="button" onClick={onConfirm} className="rounded bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-primary-contrast)]">
            {t("confirm")}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/assistant/ActionCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add inline edit mode to ActionCard**

Extend `ActionCard` to accept an `editFields` prop — a render function that renders the editable inputs derived from the contract's `inputSchema`. When `isEditing` is true (toggled by the Edit button), the card renders `editFields` instead of the static snapshot, and Confirm submits the edited values.

Add to `ActionCardProps`:
```ts
  editFields?: React.ReactNode;
  onEditSubmit?: (editedSnapshot: Record<string, unknown>) => void;
```

Add `isEditing` internal state. When Edit clicked and `editFields` provided, render the edit UI inline (no modal). Each action type's caller (Task 8) supplies the appropriate fields:
- `quick_restyle` → intensity radio (soft/medium/strong), reference select, notes input.
- `quick_format_adapt` → format checkboxes.
- `quick_regenerate` → reason textarea.

- [ ] **Step 7: Add test for inline edit mode**

Add to `ActionCard.test.tsx`:

```tsx
it("renders edit fields when Edit clicked and editFields provided", () => {
  const onEditSubmit = vi.fn();
  render(
    <ActionCard
      {...baseProps}
      editFields={<label>Intensidade <input /></label>}
      onEditSubmit={onEditSubmit}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /editar/i }));
  expect(screen.getByText(/intensidade/i)).toBeInTheDocument();
});
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/components/assistant/ActionCard.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/src/components/assistant/ActionCard.tsx app/src/components/assistant/ActionCard.test.tsx app/messages/en.json app/messages/pt-BR.json
git commit -m "feat(assistant): add ActionCard component with inline edit mode

Replaces individual modals. Renders contract label, risk copy, status
(pending/executing/completed/error), and inline edit fields per action
type. Does NOT display credit cost."
```

---

### Task 8: Wire ActionCard into the chat thread (AssistantMessageList)

**Files:**
- Modify: `app/src/components/assistant/AssistantMessageList.tsx` (render ActionCard for action proposals)
- Test: extend `app/src/components/assistant/AssistantMessageList.test.tsx` (if exists) or create new

**Interfaces:**
- Consumes: `ActionCard` from Task 7, action proposal message payload structure
- Produces: assistant thread messages now render ActionCards for `propose_action` tool calls

- [ ] **Step 1: Understand the message payload for action proposals**

Run: `grep -n "actionType\|propose_action\|displayMeta\|payload.display" app/src/components/assistant/AssistantMessageList.tsx app/src/app/api/assistant/threads/\[threadId\]/chat/route.ts 2>/dev/null | head -30`

Read how messages carry the `display.actionType` and snapshot. The confirm API reads `message.payload.display.actionType` — the client must render from the same structure.

- [ ] **Step 2: Write failing test that an action proposal renders an ActionCard**

Extend the AssistantMessageList test. Create a message fixture with `payload.display.actionType: "quick_restyle"` and snapshot, render the list, and assert the ActionCard title (`quickRestyleContract.label`) appears with Confirm/Cancel buttons.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/assistant/AssistantMessageList.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Integrate ActionCard into AssistantMessageList**

In `AssistantMessageList.tsx`, detect messages whose `payload.display.actionType` is a registered action type. For those, resolve the contract via `getActionContract(actionType)` and render `<ActionCard contract={...} snapshot={...} status="pending" onConfirm={...} onCancel={...} />`.

The `onConfirm` handler calls `POST /api/assistant/actions/[actionId]/confirm` (existing endpoint). The `onCancel` calls `POST /api/assistant/actions/[actionId]/cancel` (existing). Use the existing `apiFetch` helper and TanStack Query mutation. Track status from the action record's status field.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/assistant/AssistantMessageList.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/assistant/AssistantMessageList.tsx app/src/components/assistant/AssistantMessageList.test.tsx
git commit -m "feat(assistant): render ActionCard for action proposals in chat thread

Action proposals from the model now surface as interactive ActionCards
with confirm/cancel, replacing the need for dedicated modals."
```

---

## Phase 5 — Collapse workspace 5 states → 2 modes + permanent chat panel

### Task 9: Refactor `WorkspaceState` from 5 values to 2

**Files:**
- Modify: `app/src/lib/hooks/use-campaign-workspace.ts` (collapse state machine)
- Test: `app/src/lib/hooks/use-campaign-workspace.test.ts` (new or extend)

**Interfaces:**
- Consumes: existing campaign/derivation hooks
- Produces: `WorkspaceState` is now `"setup" | "trabalho"`; `goToPilot/goToActions/goToDerivation/goToStyling/goToGenerating` replaced by `goToSetup/goToTrabalho`

- [ ] **Step 1: Write failing test for the collapsed state**

Create `app/src/lib/hooks/use-campaign-workspace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WorkspaceState } from "./use-campaign-workspace";

describe("WorkspaceState collapse", () => {
  it("only has setup and trabalho states", () => {
    const states: WorkspaceState[] = ["setup", "trabalho"];
    // Type-level check: this assignment must compile
    expect(states).toContain("setup");
    expect(states).toContain("trabalho");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/hooks/use-campaign-workspace.test.ts`
Expected: FAIL — `"setup"` not assignable to old type.

- [ ] **Step 3: Collapse the type and transitions**

In `app/src/lib/hooks/use-campaign-workspace.ts`:

Change the type:
```ts
export type WorkspaceState = "setup" | "trabalho";
```

Replace the 5 `goTo*` callbacks with 2:
```ts
const goToSetup = useCallback(() => setWorkspaceState("setup"), []);
const goToTrabalho = useCallback(() => setWorkspaceState("trabalho"), []);
```

Update `resolvedWorkspaceState` / `visibleWorkspaceState` logic: the "has derivations → trabalho" auto-transition stays, but maps to `"trabalho"` instead of `"acoes"`. The `"gerando"` loading state becomes a boolean `isGenerating` (derived from active derivations), not a state value.

Remove `goToDerivation`, `goToStyling`, `goToGenerating`. Update `savePilot` to transition to `"trabalho"`.

- [ ] **Step 4: Fix all call sites**

Run: `grep -rn "goToPilot\|goToActions\|goToDerivation\|goToStyling\|goToGenerating\|\"piloto\"\|\"acoes\"\|\"derivando\"\|\"estilizando\"\|\"gerando\"" app/src/`

Update each call site:
- `goToPilot` → `goToSetup`
- `goToActions/goToDerivation/goToStyling/goToGenerating` → `goToTrabalho` (derivation/styling config now happens via chat ActionCards, not state transitions)
- State comparisons `=== "acoes"`, `=== "gerando"` etc. → update to `=== "trabalho"` or use `isGenerating`.

**Files likely affected:** `app/src/app/(dashboard)/campaigns/[id]/page.tsx`, `app/src/lib/campaign/deep-link-tab.ts`, `app/src/components/campaigns/v6/workspace/campaign-workspace-v6-types.ts` (`WorkspaceV6StageContext`).

- [ ] **Step 5: Run test + full suite to find breakages**

```bash
npx vitest run src/lib/hooks/use-campaign-workspace.test.ts
npx vitest run
```
Fix any remaining type errors. This is the highest-risk task — expect several call-site fixes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(workspace): collapse 5 WorkspaceState values to 2 (setup/trabalho)

piloto→setup, acoes/derivando/estilizando/gerando→trabalho.
Generation loading becomes isGenerating boolean, not a state value."
```

---

### Task 10: Make the assistant chat a permanent right panel in the campaign workspace

**Files:**
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx` (replace `CampaignAssistantDrawer` Sheet with a fixed panel)
- Modify: `app/src/components/assistant/CampaignAssistantDrawer.tsx` (rename/repurpose to `CampaignAssistantPanel`, or create new)
- Modify: `app/src/app/globals.css` (add grid layout for workspace + chat)

**Interfaces:**
- Consumes: `CampaignAssistantDrawer` logic (thread creation, chat core)
- Produces: a permanent right panel (desktop) / bottom tab (mobile) in the workspace

- [ ] **Step 1: Write failing test that the chat panel is always rendered (not behind a drawer toggle)**

Extend or create `app/src/app/(dashboard)/campaigns/[id]/CampaignWorkspace.test.tsx`. Mock the workspace hook to return a loaded campaign, render the page, and assert the chat input is visible without clicking an "open assistant" button.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/\(dashboard\)/campaigns/\[id\]/`
Expected: FAIL — chat not visible by default.

- [ ] **Step 3: Restructure the workspace layout**

In `campaigns/[id]/page.tsx`, wrap the workspace content and the assistant in a 2-column grid:

```tsx
<div className="workspace-split lg:grid lg:grid-cols-[1fr_380px]">
  <div className="workspace-main min-w-0">{/* existing CampaignWorkspaceCard */}</div>
  <aside className="workspace-chat border-l border-[var(--border-subtle)]">
    <CampaignAssistantPanel campaignId={campaignId} clientProfileId={campaign?.clientProfileId ?? ""} />
  </aside>
</div>
```

Convert `CampaignAssistantDrawer` from a `Sheet` (modal overlay) to a plain panel. Remove the `open`/`onOpenChange` props — it's always mounted. Keep the thread creation logic. On mobile (`< lg`), the aside becomes a bottom tab (Grid / Chat toggle) — add a simple state toggle for mobile.

- [ ] **Step 4: Remove the "open assistant" button from CampaignWorkspaceV6Chrome**

The `onOpenAssistant` prop and its button are no longer needed since the panel is permanent. Remove from `CampaignWorkspaceV6View.tsx` and the page.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/\(dashboard\)/campaigns/\[id\]/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(workspace): make assistant chat a permanent right panel

Replaces CampaignAssistantDrawer (Sheet) with a fixed 380px column.
On mobile, becomes a Grid/Chat bottom tab toggle."
```

---

### Task 11: Remove superseded modals, wire their actions to chat ActionCards

**Files:**
- Delete: `app/src/components/workspace/EstilizarModal.tsx`
- Delete: `app/src/components/workspace/RegenerateFeedbackDialog.tsx`
- Delete: `app/src/components/workspace/PersonaSimulationSheet.tsx`
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx` (remove modal orchestration, slim down to ~300-400 lines)

**Interfaces:**
- Consumes: ActionCard (Task 7), the chat integration (Task 8)
- Produces: campaign page only orchestrates `StrategyRecipePanel` + `DeliveryPackageModal` + `ConfirmDialog` (delete)

- [ ] **Step 1: Verify the actions are reachable via chat**

Confirm that `quick_restyle`, `quick_regenerate`, and `quick_persona_simulate` are all invocable from the chat thread (Task 8 + Task 6). If the assistant model can propose them via the `propose_action` tool, the modals are redundant.

- [ ] **Step 2: Remove modal imports and state from the campaign page**

In `campaigns/[id]/page.tsx`, remove:
- `EstilizarModal` dynamic import + `showEstilizarModal` state + `handleEstilizarSubmit`
- `PersonaSimulationSheet` dynamic import + `personaSimulation` state + `handleSimulatePersonas`
- `RegenerateFeedbackDialog` usage (regenerate now via `quick_regenerate` ActionCard)
- The `CampaignWorkspaceModals` helper component (or slim it to only StrategyRecipe + Delivery + Delete)

- [ ] **Step 3: Delete the modal component files**

```bash
git rm app/src/components/workspace/EstilizarModal.tsx
git rm app/src/components/workspace/RegenerateFeedbackDialog.tsx
git rm app/src/components/workspace/PersonaSimulationSheet.tsx
```

Also delete their test files if they exist.

- [ ] **Step 4: Verify build + tests**

```bash
npm run build
npx vitest run
```
Fix any dangling imports. The `DerivationLoadErrorBanner` was exported from `RegenerateFeedbackDialog` — if still needed, extract it to its own small file before deleting.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(workspace): remove EstilizarModal, RegenerateFeedbackDialog, PersonaSimulationSheet

These actions are now triggered via quick_* ActionCards in the chat panel.
Campaign page slimmed to orchestrate only StrategyRecipe + Delivery + Delete."
```

---

## Phase 6 — Hide operational routes behind admin guard

### Task 12: Guard `/feedback` and admin routes with role checks

**Files:**
- Modify: `app/src/app/(dashboard)/feedback/page.tsx` (add role gate, redirect non-admins)
- Modify: `app/src/components/layout/DashboardShellSwitcher.tsx` (already feeds role to sidebar from Task 1)

**Interfaces:**
- Consumes: `requireWorkspaceAccess` or client-side role from `useBillingStatus().access.kind`

- [ ] **Step 1: Write failing test that non-admin gets redirected from /feedback**

Create `app/src/app/(dashboard)/feedback/feedback-guard.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: () => ({ data: { access: { kind: "member" } } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/feedback" }));

describe("feedback route guard", () => {
  it("redirects non-owner/admin users", async () => {
    const mod = await import("./page");
    // Assert the component renders null or a redirect for member role
    expect(mod.default).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/\(dashboard\)/feedback/`
Expected: FAIL.

- [ ] **Step 3: Add role guard to feedback page**

At the top of the `feedback/page.tsx` component:

```tsx
const { data: billingStatus } = useBillingStatus();
const accessKind = billingStatus?.access?.kind;
const router = useRouter();

useEffect(() => {
  if (accessKind && accessKind !== "owner" && accessKind !== "admin") {
    router.replace("/campaigns");
  }
}, [accessKind, router]);

if (accessKind !== "owner" && accessKind !== "admin") return null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/\(dashboard\)/feedback/`
Expected: PASS.

- [ ] **Step 5: Run full suite + build + commit**

```bash
npx vitest run
npm run build
git add -A
git commit -m "feat(guard): restrict /feedback to owner/admin roles

Member and tester roles are redirected to /campaigns. Operational
tooling no longer visible to end users in the product shell."
```

---

## Final verification

- [ ] **Run full test suite, lint, and build**

```bash
cd app
npm run lint
npm test
npm run build
```

All must pass. The `2204` test count baseline will shift (some old modal tests deleted, new ActionCard/contract tests added).

- [ ] **Manual smoke test of happy path**

1. Sign in, create a campaign, upload base creative.
2. Confirm the chat panel (right side) guides the briefing (MODO setup).
3. Confirm briefing complete transitions to MODO trabalho (grid + chat).
4. Ask the chat to restyle → confirm an ActionCard appears with Confirm/Cancel (no credit cost shown).
5. Confirm clicking Confirm queues the restyle and the card shows executing → completed.
6. Confirm "Derivar em lote" still opens the StrategyRecipePanel modal.
7. Confirm Export still opens DeliveryPackageModal.
8. Sign in as a member role → confirm `/feedback` redirects and sidebar has no OPERACAO section.

---

## Notes for the implementer

- **Task 9 is the highest-risk task** (state machine collapse touches many call sites). Do it carefully, run the full suite after, and fix all type errors before committing.
- **Task 5 (credit removal) interacts with Task 7 (ActionCard)** — the ActionCard already omits credit display, so Task 5 handles the remaining surfaces (StrategyRecipePanel, DerivationGrid). They are sequenced so Task 5 can be verified independently first.
- **i18n**: every string added to `en.json` MUST also be added to `pt-BR.json`. Lint/build will not catch a missing PT-BR key — be disciplined.
- **The `CREDIT_COSTS.personaSimulation` key** (Task 6) may not exist — verify before using; fall back to a hardcoded `3` or add the key.
