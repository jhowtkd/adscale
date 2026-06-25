# Phase 180: Action Contracts - Research

**Researched:** 2026-06-25
**Domain:** Assistant execution grammar — intent classification, typed action contract registry, Zod validation in `propose_action`, confirmation policy (EXEC-01)
**Confidence:** HIGH

## Summary

Phase 180 closes the gap between Phase 179’s deny-by-default tool policy and executable assistant actions. Today `propose_action` accepts any `actionType` string and persists a pending card via `createAssistantAction` without contract checks [VERIFIED: `propose-action.ts:8-37`]. Tool policy already enforces Zod on the tool envelope, workspace role, thread scope, and `requiresConfirmation: true` [VERIFIED: `policy.ts:54-104`, `propose-action.ts:45-52`], but there is no per-action input grammar, risk copy, or credit metadata.

This phase introduces a **central typed action-contract registry** (mirroring `TOOL_REGISTRY` in `tools/registry.ts` [VERIFIED: `registry.ts:32-43`]), a **binary intent classifier** (`quick_action` | `complete_campaign`) invoked from the orchestrator before the model tool loop, and **contract validation** inside `handleProposeAction` plus **light revalidation on confirm**. Two example contracts (`quick_restyle`, `start_complete_campaign`) prove the quick vs. campaign paths; Phase 182 registers the remaining ACT-04 actions without registry refactor.

Credit impact should reference existing `CREDIT_COSTS` (`restyling: 5`, `creative_plan: 1`, etc.) [VERIFIED: `credits.ts:27-36`] rather than inventing parallel pricing. Optional-input risk copy uses **static templates** on each contract field (not LLM-generated) per CONTEXT. Confirm route currently only transitions `pending → confirmed` [VERIFIED: `confirm/route.ts:19`] — EXEC-01 revalidation belongs in the confirm path before transition.

**Primary recommendation:** Add `app/src/server/assistant/action-contracts/` with registry + per-contract Zod input schemas, pure `classifyUserIntent()` called from `runAssistantTurn` before streaming, enrich `handleProposeAction` with contract validation and display metadata (`riskLabel`, `creditImpact`, `riskCopyLines`), and extend confirm to revalidate contract + `pending` status — all covered by colocated Vitest tests.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Classificação de intent (ACT-01)

- Taxonomia **binária:** `quick_action` | `complete_campaign`.
- **Server-side primeiro:** heurísticas/keywords no servidor; fallback para o modelo quando heurística não resolver.
- Classificar **quando o usuário pedir algo que pareça uma ação** — não na primeira mensagem genérica de boas-vindas, mas **antes** de coletar inputs específicos do contrato.
- Intent **ambíguo** → uma pergunta curta de clarificação (ex.: "ação pontual ou campanha completa?") antes de seguir.
- Classificação deve orientar qual família de contrato aplicar; não substitui escolha do `actionType` concreto dentro da família.

### Registry de contratos (ACT-02)

- **Registry central** tipado em `app/src/server/assistant/action-contracts/registry.ts` (ou caminho equivalente).
- Cada contrato declara: `actionType`, inputs obrigatórios, opcionais, `allowedRoles`, `riskLabel`, `creditImpact`, `confirmationPolicy`, e metadados para copy de risco.
- **Fase 180:** gramática completa + **2 contratos exemplo:**
  - `quick_restyle` — prova do caminho quick (inputs mínimos; briefing completo não exigido)
  - `start_complete_campaign` — prova do caminho campanha (briefing mínimo mais forte)
- Demais contratos ACT-04 (format adapt, regenerate, review, save-reference, package) → **Fase 182**, mas o registry já deve suportar extensão sem refactor.

### Validação e confirmação (EXEC-01, ACT-02)

- **`propose_action` valida contra o registry** antes de criar action card: schema Zod por contrato, role gate, inputs obrigatórios presentes.
- Ações que **escrevem dados, gastam créditos, criam jobs, persistem memória ou exportam/empacotam** exigem action card confirmado — política já travada em v13.5; contrato expõe `confirmationPolicy: "required"`.
- Inputs opcionais ausentes **não bloqueiam** propose — contrato gera **copy de risco honesta** (template por campo opcional no contrato, não LLM inventando risco nesta fase).
- Revalidação leve no **confirm** da action (inputs ainda válidos, estado `pending`) — sem segundo formulário.

### Integração com Fases 178–179

- Usar `createAssistantAction` existente após validação do contrato.
- Tool policy (179) continua deny-by-default; `propose_action` ganha camada de contrato.
- Intent classifier pode ser módulo chamado pelo orchestrator antes de invocar tools de coleta/propose.

### Claude's Discretion

- Heurísticas exatas do classificador server-side e lista de keywords.
- Formato de `creditImpact` (número fixo vs. estimativa via billing existente).
- Estrutura interna de tipos (`ActionContract`, `IntentClassificationResult`).
- Se classificador roda como função pura ou tool interna não exposta ao provider.

### Deferred Ideas (OUT OF SCOPE)

- Implementação executável de restyling, format adapt, etc. — Fase 182 (ACT-03, ACT-04)
- UI de action cards e chat — Fase 181
- Happy path ideia → pacote final — Fase 183 (ACT-05, EXEC-04)
- Classificação direta para cada `actionType` sem passo binário — fora do escopo ACT-01
- Risk copy gerada dinamicamente pelo LLM — usar templates nesta fase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACT-01 | System classifies user intent as quick action or complete campaign flow before asking for inputs. | `classifyUserIntent()` pure function in orchestrator pre-stream; heuristics + system-prompt hint; ambiguous → deterministic clarification message; skip on generic greetings. |
| ACT-02 | Each supported action declares required inputs, optional inputs, allowed roles, risk copy, credit impact, and confirmation policy. | `ActionContract` type + `ACTION_CONTRACT_REGISTRY`; per-contract Zod `inputSchema`; `registerActionContract()` for Phase 182; display metadata on action card. |
| EXEC-01 | Actions that write data, spend credits, create jobs, persist memory, or export/package outputs require a confirmed action card. | Both example contracts use `confirmationPolicy: "required"`; `propose_action` only creates `pending` cards; confirm route revalidates before `confirmed`; execution deferred to Phase 182+. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Intent classification (ACT-01) | API / Backend (orchestrator) | — | Must run server-side before model collects contract inputs; never trust client or provider-only classification. |
| Action contract registry (ACT-02) | API / Backend | — | Single source of truth for validation, risk copy, and credit metadata; consumed by propose + confirm paths. |
| `propose_action` contract validation | API / Backend (tool handler) | — | Runs inside deny-by-default tool policy after envelope parse; blocks unregistered `actionType`. |
| Role gate (per contract) | API / Backend | — | Tool-level roles in `proposeActionTool` are coarse; contract `allowedRoles` narrows per action type using existing `requireRole` [VERIFIED: `workspace.ts:31-52`]. |
| Risk copy for missing optionals | API / Backend (contract templates) | — | Deterministic strings from contract definitions; not UI or LLM responsibility in Phase 180. |
| Action card persistence | API / Backend | Database | Unchanged `createAssistantAction` / `assistantActionRecords` from Phase 178 [VERIFIED: `assistant-action.ts:68-126`]. |
| Confirm revalidation (EXEC-01) | API / Backend (confirm route) | — | User confirmation is an API boundary; must re-check `pending` + input schema before `confirmed`. |
| Credit display on card | API / Backend (contract metadata) | — | Values sourced from `CREDIT_COSTS`; actual spend remains Phase 182+ via `recordUsage` [VERIFIED: `credits.ts`]. |
| Action card UI | Browser / Client | — | Phase 181 renders `display` payload; Phase 180 only populates fields. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.25.76 installed [VERIFIED: package-lock.json] | Per-contract `inputSchema`, tool envelope | Project-wide boundary validation; `.strict()` already used on tools [VERIFIED: `propose-action.ts:8-14`, `get-thread-context.ts:9`]. |
| vitest | ^4.1.5 installed [VERIFIED: package.json] | Unit tests for classifier, registry, propose, confirm | `npm test` via `config/vitest.config.ts` [VERIFIED: vitest run policy.test.ts passed]. |
| drizzle-orm | 0.45.2 [VERIFIED: package.json] | Action record reads on confirm | Existing `assistantActionRecords` — no new tables required for contracts. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/server/billing/credits` `CREDIT_COSTS` | in-repo [VERIFIED: `credits.ts:27-36`] | `creditImpact` resolution | Map `quick_restyle` → `restyling` (5 credits); campaign draft → `creative_plan` (1) + documented preview estimate. |
| `@/server/auth/workspace` `requireRole` | in-repo [VERIFIED: `workspace.ts`] | Contract role gate | Reuse inside contract validator — same pattern as tool policy. |
| `@/server/assistant/context/sanitize` | in-repo [VERIFIED: `sanitize.ts`] | `inputSnapshot` sanitization | Already strips denied keys before persist [VERIFIED: `propose-action.ts:21-28`]. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-repo registry + Zod | JSON Schema + AJV | Project already standardizes on Zod for tools; dual schema stacks add drift. |
| Pure-function classifier | Exposed provider tool `classify_intent` | Exposes internal taxonomy to model and bypasses server-first policy; CONTEXT prefers server-side. |
| LLM-generated risk copy | Static templates | CONTEXT defers LLM risk copy; templates are auditable and testable. |
| New `action_type` DB column | `display.actionType` + `inputSnapshot` | Phase 178 schema already stores `display` on action card message [VERIFIED: `assistant-action.ts:79-83`]; avoid migration in 180. |

**Installation:** No new packages required.

**Version verification:** zod 3.25.76 locked in `package-lock.json`; npm registry latest 4.4.3 — project stays on Zod 3.x [VERIFIED: package-lock.json, npm view].

## Architecture Patterns

### System Architecture Diagram

```
User message (HTTP SSE chat)
        │
        ▼
┌───────────────────┐
│  runAssistantTurn   │  orchestrator.ts
└─────────┬─────────┘
          │ 1. persist user message
          ▼
┌───────────────────┐     skip if generic greeting
│ classifyUserIntent │◄──── heuristics (keywords, length)
└─────────┬─────────┘     fallback: inject hint in systemPrompt
          │
    ┌─────┴─────┬──────────────┐
    │           │              │
 ambiguous    classified      none (no action signal)
    │           │              │
    ▼           ▼              ▼
 short        augment         normal
 clarify      systemPrompt    systemPrompt
 message      with intent     (no intent block)
 (no model)   family
    │           │
    └─────┬─────┘
          ▼
┌───────────────────┐
│  Model tool loop   │  propose_action / get_thread_context
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  evaluateToolCall  │  policy.ts — deny-by-default
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ handleProposeAction│
│  • lookup contract │
│  • Zod inputSchema │
│  • role gate       │
│  • risk copy       │
└─────────┬─────────┘
          ▼
┌───────────────────┐
│createAssistantAction│  pending card + inputSnapshot
└─────────┬─────────┘
          ▼
     User confirms (Phase 181 UI → API)
          ▼
┌───────────────────┐
│ POST .../confirm   │
│  • status pending  │
│  • revalidate      │
│  • transition      │
└───────────────────┘
```

### Recommended Project Structure

```
app/src/server/assistant/
├── action-contracts/
│   ├── types.ts                 # ActionContract, IntentFamily, CreditImpact, etc.
│   ├── registry.ts              # ACTION_CONTRACT_REGISTRY, registerActionContract
│   ├── validate.ts              # validateProposeAction, revalidateOnConfirm
│   ├── risk-copy.ts             # buildRiskCopyLines(contract, snapshot)
│   ├── intent-classifier.ts     # classifyUserIntent (pure)
│   └── contracts/
│       ├── quick-restyle.ts
│       └── start-complete-campaign.ts
├── orchestrator.ts              # + intent hook before stream
└── tools/stubs/propose-action.ts  # + contract validation layer
```

### Pattern 1: Typed Action Contract Registry

**What:** Mirror `TOOL_REGISTRY` — record map keyed by `actionType`, with `registerActionContract()` for Phase 182 extension.

**When to use:** Any new assistant action type.

**Example:**

```typescript
// Source: project pattern from tools/registry.ts + Zod strict objects [CITED: github.com/colinhacks/zod]
import { z } from "zod";
import type { WorkspaceMemberRole } from "@/server/auth/workspace";
import type { CreditAction } from "@/server/billing/credits";

export type ConfirmationPolicy = "required" | "none";
export type RiskLabel = "low" | "medium" | "high";

export type CreditImpact =
  | { kind: "fixed"; credits: number; label?: string }
  | { kind: "creditAction"; action: CreditAction; label?: string };

export interface OptionalFieldMeta {
  key: string;
  riskCopyWhenMissing: string; // static template, pt-BR
}

export interface ActionContract<T extends z.ZodType = z.ZodType> {
  actionType: string;
  intentFamily: "quick_action" | "complete_campaign";
  label: string;
  inputSchema: T;
  requiredFields: readonly string[];
  optionalFields: readonly OptionalFieldMeta[];
  allowedRoles: WorkspaceMemberRole[];
  riskLabel: RiskLabel;
  creditImpact: CreditImpact;
  confirmationPolicy: ConfirmationPolicy;
}

export const ACTION_CONTRACT_REGISTRY: Record<string, ActionContract> = {};

export function registerActionContract(contract: ActionContract): void {
  ACTION_CONTRACT_REGISTRY[contract.actionType] = contract;
}

export function getActionContract(actionType: string): ActionContract | undefined {
  return ACTION_CONTRACT_REGISTRY[actionType];
}
```

### Pattern 2: Binary Intent Classifier (Server-Side First)

**What:** Pure function returning classification, clarification, or skip — no DB, no provider call in the happy path.

**When to use:** After user message persisted, before `toAssistantModelRequest`.

**Recommended heuristics (discretion resolved):**

| Signal | `quick_action` keywords (pt/en) | `complete_campaign` keywords |
|--------|--------------------------------|------------------------------|
| Strong | restyle, restyling, reestilizar, adaptar formato, redimensionar, regenerar, pontual, quick | campanha completa, nova campanha, lançar campanha, brief completo, estratégia de campanha, pacote final |
| Skip | `^(oi|olá|ola|hello|hi|hey|bom dia|boa tarde)\b` and length < 40 | same |
| Ambiguous | Both families match with confidence within threshold | — |

**Return shape:**

```typescript
export type IntentClassificationResult =
  | { kind: "skip" }
  | { kind: "classified"; intent: "quick_action" | "complete_campaign"; source: "heuristic" | "model_hint" }
  | { kind: "clarify"; question: string };
```

**Orchestrator integration:** If `kind === "clarify"`, persist a short `assistant` message and yield `done` without streaming (deterministic). If `classified`, append to `buildSystemPrompt`: `Intent family: quick_action — prefer contracts in that family when proposing actions.` If heuristics return `skip` but message has action verbs, add model hint only (fallback path).

### Pattern 3: Contract Validation in `propose_action`

**What:** After tool envelope parse, resolve contract, parse `inputSnapshot` with contract schema, check roles, build risk copy.

**Example:**

```typescript
// Source: propose-action.ts integration point [VERIFIED: codebase]
const contract = getActionContract(parsed.actionType);
if (!contract) {
  throw new AssistantActionValidationError("unknown_action_type");
}

await requireRole(ctx.workspaceId, ctx.userId, contract.allowedRoles);

const inputResult = contract.inputSchema.safeParse(inputSnapshot);
if (!inputResult.success) {
  throw new AssistantActionValidationError("invalid_action_inputs");
}

const riskCopyLines = buildRiskCopyLines(contract, inputSnapshot);
const display = {
  label: parsed.label,
  actionType: parsed.actionType,
  riskLabel: contract.riskLabel,
  creditImpact: contract.creditImpact,
  riskCopyLines,
  confirmationPolicy: contract.confirmationPolicy,
};
```

**Policy enhancement:** Wrap `tool.handler` in `evaluateToolCall` with try/catch mapping `AssistantActionValidationError` → `deny("contract_validation_failed")` so orchestrator yields `error` instead of uncaught exception [VERIFIED: orchestrator.ts:64-81 has no handler try/catch today].

### Pattern 4: Light Confirm Revalidation

**What:** Before `confirmAssistantAction`, load action + message display, ensure `pending`, re-run `inputSchema.safeParse` on stored `inputSnapshot`.

**Where:** `app/src/app/api/assistant/actions/[actionId]/confirm/route.ts` or extracted `revalidateActionOnConfirm()` in `action-contracts/validate.ts`.

### Anti-Patterns to Avoid

- **Free-form `actionType`:** Current behavior — must reject unregistered types (breaking change for tests using `"restyle"` — update to `"quick_restyle"`).
- **Blocking on optional fields:** Violates ACT-02/CONTEXT — only `requiredFields` gate propose.
- **LLM risk copy in Phase 180:** Use `optionalFields[].riskCopyWhenMissing` templates only.
- **Duplicating role checks only in contract:** Keep tool-level `allowedRoles` as superset; contract may further restrict.
- **Mutating `inputSnapshot` on confirm:** Repository forbids patch while `pending` [VERIFIED: `assistant-action.ts:150-154`] — revalidation is read-only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input validation per action | Ad-hoc `if (!snapshot.foo)` chains | Zod `inputSchema` per contract + `.strict()` | Consistent errors, type inference, matches tool policy [CITED: zod.dev strict objects]. |
| Role authorization | Custom membership queries | `requireRole` from `@/server/auth/workspace` | Already used in tool policy; same error type. |
| Credit amounts | Hardcoded magic numbers in contracts | `CREDIT_COSTS` / `CreditAction` keys | Single billing source of truth [VERIFIED: `credits.ts`]. |
| Persistence denylist | New denylist | `stripDeniedFields` + `containsDeniedPersistenceKeys` | Phase 178/179 persistence rules [VERIFIED: `assistant-types.ts:41-47`]. |
| Intent taxonomy beyond binary | Per-actionType classifier | Binary family + concrete `actionType` at propose time | Locked in CONTEXT (ACT-01). |

**Key insight:** The registry is the execution grammar — hand-rolled validation in the handler becomes unmaintainable when Phase 182 adds five more contracts.

## Common Pitfalls

### Pitfall 1: Handler Throws Crash the Turn

**What goes wrong:** `handleProposeAction` throws on contract failure; `evaluateToolCall` and `runAssistantTurn` do not catch handler errors.

**Why it happens:** Phase 179 policy assumes handlers succeed after schema parse.

**How to avoid:** Catch `AssistantActionValidationError` in `evaluateToolCall`; return `deny("contract_validation_failed")`.

**Warning signs:** Vitest orchestrator test throws instead of yielding `error` event.

### Pitfall 2: Test Fixtures Use Invalid `actionType`

**What goes wrong:** `policy.test.ts` and `orchestrator.test.ts` use `actionType: "restyle"` [VERIFIED: `policy.test.ts:108-111`, `orchestrator.test.ts:118`] — will fail after registry enforcement.

**How to avoid:** Update fixtures to `quick_restyle` with minimal valid `inputSnapshot`; add dedicated contract validation tests.

### Pitfall 3: Intent Classification on Every Message

**What goes wrong:** Classifier runs on "Olá" and annoys user with campaign vs. quick questions.

**How to avoid:** `kind: "skip"` for greeting heuristic; only classify when action verbs detected.

### Pitfall 4: Missing `actionType` on Confirm

**What goes wrong:** Confirm cannot revalidate without knowing which contract applied.

**How to avoid:** Persist `actionType` in `display` (already partially done [VERIFIED: `propose-action.ts:30`]) and treat as authoritative.

### Pitfall 5: `confirmationPolicy: "none"` on Write Actions

**What goes wrong:** EXEC-01 violation — writes execute without card.

**How to avoid:** Both Phase 180 example contracts use `"required"`; Phase 182 scaffold defaults to `"required"` unless explicitly read-only.

## Code Examples

### Example Contract: `quick_restyle`

```typescript
import { z } from "zod";
import { CREDIT_COSTS } from "@/server/billing/credits";

export const quickRestyleInputSchema = z
  .object({
    baseCreativeId: z.string().uuid(),
    styleReferenceId: z.string().uuid().optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const quickRestyleContract = {
  actionType: "quick_restyle",
  intentFamily: "quick_action" as const,
  label: "Restyle rápido",
  inputSchema: quickRestyleInputSchema,
  requiredFields: ["baseCreativeId"] as const,
  optionalFields: [
    {
      key: "styleReferenceId",
      riskCopyWhenMissing:
        "Sem referência de estilo, o resultado pode divergir mais da marca.",
    },
  ],
  allowedRoles: ["owner", "admin", "member"] as const,
  riskLabel: "medium" as const,
  creditImpact: { kind: "creditAction" as const, action: "restyling" as const, label: `${CREDIT_COSTS.restyling} créditos` },
  confirmationPolicy: "required" as const,
};
```

### Example Contract: `start_complete_campaign`

```typescript
export const startCompleteCampaignInputSchema = z
  .object({
    productOffer: z.string().min(1),
    audience: z.string().min(1),
    objective: z.string().min(1),
    cta: z.string().min(1),
    platformOrFormat: z.string().min(1),
    constraints: z.string().min(1),
    baseCreativeId: z.string().uuid(),
    styleReferenceId: z.string().uuid().optional(),
  })
  .strict();

// clientProfileId comes from thread scope — not repeated in snapshot
export const startCompleteCampaignContract = {
  actionType: "start_complete_campaign",
  intentFamily: "complete_campaign" as const,
  label: "Iniciar campanha completa",
  inputSchema: startCompleteCampaignInputSchema,
  requiredFields: [
    "productOffer",
    "audience",
    "objective",
    "cta",
    "platformOrFormat",
    "constraints",
    "baseCreativeId",
  ] as const,
  optionalFields: [
    {
      key: "styleReferenceId",
      riskCopyWhenMissing:
        "Sem referência de estilo, a direção visual inicial pode precisar de mais revisões.",
    },
  ],
  allowedRoles: ["owner", "admin", "member"] as const,
  riskLabel: "high" as const,
  creditImpact: {
    kind: "creditAction" as const,
    action: "creative_plan" as const,
    label: `A partir de ${CREDIT_COSTS.creative_plan} crédito (planejamento); geração adicional conforme uso`,
  },
  confirmationPolicy: "required" as const,
};
```

### Risk Copy Builder

```typescript
export function buildRiskCopyLines(
  contract: ActionContract,
  snapshot: Record<string, unknown>
): string[] {
  return contract.optionalFields
    .filter((field) => snapshot[field.key] === undefined || snapshot[field.key] === null || snapshot[field.key] === "")
    .map((field) => field.riskCopyWhenMissing);
}
```

### Intent Classifier Sketch

```typescript
export function classifyUserIntent(userMessage: string): IntentClassificationResult {
  const trimmed = userMessage.trim();
  if (/^(oi|olá|ola|hello|hi|hey|bom dia|boa tarde)\b/i.test(trimmed) && trimmed.length < 40) {
    return { kind: "skip" };
  }

  const quick = /\b(restyle|restyling|reestilizar|regenerar|pontual|quick|adaptar formato)\b/i.test(trimmed);
  const campaign = /\b(campanha completa|nova campanha|lançar campanha|brief completo|estratégia de campanha)\b/i.test(trimmed);

  if (quick && campaign) {
    return { kind: "clarify", question: "Você quer uma ação pontual ou montar uma campanha completa?" };
  }
  if (quick) return { kind: "classified", intent: "quick_action", source: "heuristic" };
  if (campaign) return { kind: "classified", intent: "complete_campaign", source: "heuristic" };
  return { kind: "skip" };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Any `actionType` string in `propose_action` | Registry-enforced typed contracts | Phase 180 | Tests and assistant prompts must use registered types only. |
| Tool policy only validation | Tool envelope + contract `inputSchema` | Phase 180 | Two-layer validation: tool args + business inputs. |
| Confirm without input check | Revalidate on confirm | Phase 180 (EXEC-01) | Stale/invalid snapshots cannot reach `confirmed`. |
| No intent family | Binary classifier pre-stream | Phase 180 (ACT-01) | System prompt guides model toward correct contract family. |

**Deprecated/outdated:**
- `actionType: "restyle"` in tests — replace with `quick_restyle`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `display.actionType` is sufficient for confirm revalidation (no DB migration) | Pattern 4 | Low — can add column in 182 if display payload truncated |
| A2 | `CREDIT_COSTS.restyling` is correct mapping for `quick_restyle` | Example contracts | Medium — user may want preview-only estimate; adjust label in 182 |
| A3 | Deterministic clarify short-circuits model turn | Pattern 2 | Low — UX preference; could instead inject model instruction |

**Resolved during research:** A2 — use `creditAction: "restyling"` for quick restyle [VERIFIED: `credits.ts:31`]. A3 — deterministic clarify recommended for ambiguous heuristic collision (clearer EXEC-01 path, faster UX).

## Open Questions

1. **Should `evaluateToolCall` map all handler errors to deny, or only `AssistantActionValidationError`?**
   - What we know: Only validation errors are expected from propose handler.
   - **RESOLVED:** Catch `AssistantActionValidationError` explicitly → `deny("contract_validation_failed")`; rethrow unexpected errors for observability.

2. **Where to register contracts — side-effect import vs. explicit `initActionContracts()`?**
   - What we know: Tools use static `TOOL_REGISTRY` object.
   - **RESOLVED:** `contracts/index.ts` exports registrations called once from `registry.ts` bottom (mirror tool barrel pattern) — keeps Phase 182 add-only.

3. **Model fallback when heuristics skip but user clearly wants an action?**
   - What we know: CONTEXT allows model fallback when heuristics don't resolve.
   - **RESOLVED:** Append system prompt instruction: "If the user requests an executable action and intent is unclear, ask one clarifying question: quick action vs. complete campaign." No extra provider tool.

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. Phase uses existing Node.js, Vitest, Zod, and Drizzle stack already verified in workspace.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vitest / Next | ✓ | (project runtime) | — |
| Vitest | Unit tests | ✓ | ^4.1.5 | — |
| zod | Contract schemas | ✓ | 3.25.76 | — |
| PostgreSQL | Confirm integration tests (optional) | optional | — | Mock repos like existing assistant tests |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.5 [VERIFIED: package.json] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- --run src/server/assistant/action-contracts/` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACT-01 | Classifier skips greetings | unit | `npm test -- --run src/server/assistant/action-contracts/intent-classifier.test.ts -x` | ❌ Wave 0 |
| ACT-01 | Classifier returns quick_action for restyle keywords | unit | same file `::test quick keywords` | ❌ Wave 0 |
| ACT-01 | Ambiguous keywords → clarify question | unit | same file `::test ambiguous` | ❌ Wave 0 |
| ACT-01 | Orchestrator injects intent into system prompt | unit | `npm test -- --run src/server/assistant/orchestrator.test.ts -x` | ✅ extend |
| ACT-02 | Registry contains both example contracts | unit | `npm test -- --run src/server/assistant/action-contracts/registry.test.ts -x` | ❌ Wave 0 |
| ACT-02 | Unknown actionType rejected | unit | `npm test -- --run src/server/assistant/tools/policy.test.ts -x` | ✅ extend |
| ACT-02 | Missing optional generates risk copy, does not block | unit | `npm test -- --run src/server/assistant/action-contracts/validate.test.ts -x` | ❌ Wave 0 |
| ACT-02 | Missing required input blocks propose | unit | same validate test file | ❌ Wave 0 |
| EXEC-01 | Both contracts `confirmationPolicy: "required"` | unit | registry test | ❌ Wave 0 |
| EXEC-01 | Confirm revalidates pending + schema | unit | `npm test -- --run src/server/repositories/assistant-action.test.ts` or confirm route test | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- --run src/server/assistant/action-contracts/`
- **Per wave merge:** `cd app && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `app/src/server/assistant/action-contracts/intent-classifier.test.ts` — ACT-01
- [ ] `app/src/server/assistant/action-contracts/registry.test.ts` — ACT-02
- [ ] `app/src/server/assistant/action-contracts/validate.test.ts` — ACT-02, EXEC-01
- [ ] Extend `app/src/server/assistant/tools/policy.test.ts` — unknown `actionType`, valid `quick_restyle`
- [ ] Extend `app/src/server/assistant/orchestrator.test.ts` — intent injection + clarify short-circuit
- [ ] Confirm revalidation test (route or `validate.ts`) — EXEC-01

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireWorkspaceAccess` on confirm route [VERIFIED: `confirm/route.ts:14-17`] |
| V3 Session Management | no | Confirm uses same session as workspace APIs |
| V4 Access Control | yes | `requireRole` tool + per-contract `allowedRoles` |
| V5 Input Validation | yes | Zod strict schemas per contract + `stripDeniedFields` |
| V6 Cryptography | no | No new crypto in this phase |

### Known Threat Patterns for Assistant Action Contracts

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unregistered action type bypass | Elevation of privilege | Registry lookup — reject unknown types |
| Role escalation via propose | Spoofing | `requireRole` at tool and contract level |
| Persistence key injection in snapshot | Information disclosure | `containsDeniedPersistenceKeys` + denylist [VERIFIED: `assistant-types.ts`] |
| Confirmed action with tampered snapshot | Tampering | Revalidate schema + `pending` gate on confirm |
| Credit spend without confirmation | Repudiation | `confirmationPolicy: "required"` + pending card before Phase 182 execution |

## Project Constraints (from .cursor/rules/)

No `.cursor/rules/` directory found in workspace root [VERIFIED: glob]. Follow existing project patterns: colocated Vitest tests, Zod at boundaries, repositories in `app/src/server/repositories/`, no secrets in source, Render ephemeral FS N/A for this server-only phase.

## Sources

### Primary (HIGH confidence)

- Codebase: `propose-action.ts`, `orchestrator.ts`, `registry.ts`, `policy.ts`, `assistant-action.ts`, `credits.ts`, `workspace.ts`, `assistant-types.ts`
- Context7 `/colinhacks/zod` — strict objects, discriminated unions, superRefine
- Phase 180 `180-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)

- Phase 179 `179-RESEARCH.md` — tool registry mirror pattern
- `.planning/ROADMAP.md` — Phase 180 success criteria

### Tertiary (LOW confidence)

- None — implementation recommendations derived from verified codebase state

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; Zod/Vitest already in use
- Architecture: HIGH — clear integration points in existing orchestrator, propose handler, confirm route
- Pitfalls: HIGH — verified test fixtures and missing try/catch in policy

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 (stable domain; classifier keywords may tune in 182)

## RESEARCH COMPLETE

**Phase:** 180 - action-contracts
**Confidence:** HIGH

### Key Findings

- `propose_action` is the integration point — add registry lookup, per-contract Zod, risk copy, and enriched `display` before `createAssistantAction`.
- Mirror `TOOL_REGISTRY` for `ACTION_CONTRACT_REGISTRY` with `registerActionContract()` so Phase 182 is add-only.
- Binary intent classifier runs in orchestrator pre-stream; ambiguous heuristic collision returns deterministic Portuguese clarification.
- `creditImpact` should reference `CREDIT_COSTS` (`restyling: 5`, `creative_plan: 1`) — not parallel pricing.
- Policy needs try/catch for `AssistantActionValidationError`; existing tests use invalid `actionType: "restyle"` and must be updated.

### File Created

`.planning/milestones/v13.5-phases/180-action-contracts/180-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | In-repo Zod 3.25.76 + Vitest; no new packages |
| Architecture | HIGH | Integration points verified in orchestrator, propose, confirm, policy |
| Pitfalls | HIGH | Test fixture breakage and handler error propagation confirmed in code |

### Open Questions

All open questions resolved inline — see **Open Questions** section.

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
