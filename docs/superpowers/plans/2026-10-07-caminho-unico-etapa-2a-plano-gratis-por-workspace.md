# Caminho único, etapa 2A: as regras do plano grátis seguem o workspace (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma conta `free` cujo workspace paga deixa de receber os limites do plano grátis (teto vitalício de US$ 1
com reserva, card do plano, recusa de anexos), e o Estrategista dela passa a só conversar.

**Architecture:** Uma regra nova em `module/free-plan.ts`, `freePlanLimitsApply`, decide se os limites valem: só para
conta `free` e só enquanto o workspace não paga (conta paga de outra marca ou acesso pago clássico). O que a conta
`free` pode **fazer** (os comandos e os tipos de tarefa) continua seguindo o status. Os limites e os cards passam a
seguir a regra. O Estrategista ganha um terceiro modo, `talk`, e a porta de acesso pago clássico entra também nas
dependências dos jobs.

**Tech Stack:** TypeScript, Vitest 4 (store em memória do Equipe: `module/testing/deps.ts`), Next.js 16 (só o
`RailChat`).

**Spec:** `docs/superpowers/specs/2026-10-07-caminho-unico-design.md`, seção 3, "Plano grátis × status da conta", e
seção 5, etapa 2. Este plano e o da etapa 2B (`2026-10-07-caminho-unico-etapa-2b-marca-ativa.md`) dividem a etapa 2
em dois PRs. O 2A vem primeiro, porque as marcas da Dev Admin vão abrir contas `free` na etapa 2B.

## Global Constraints

- Nenhum `page.tsx` ou `route.ts` novo (trava de destinos).
- A palavra "Equipe" não aparece em texto novo para o cliente.
- Conta `free` em workspace que não paga: **nada muda**. Os testes atuais do plano grátis continuam passando sem
  ajuste, exceto a versão do prompt.
- O que a conta `free` pode fazer não muda: `FREE_ACCOUNT_COMMANDS`, a recusa `requires_plan` dos tipos de tarefa e as
  ferramentas sem leitura da conta.
- Valores da spec: workspace que paga = assinatura ativa, `past_due` na carência com fatura paga, testador ou membro
  dono da plataforma (`workspaceHasActivePaidAccess`), ou uma conta paga de qualquer marca do workspace.
- Sem a porta `hasClassicPaidAccess` nas dependências, a regra trata o workspace como **não pagante**. Assim a regra
  erra pelo lado do teto, nunca pelo do gasto.
- Node 22 (`$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin`). Antes de cada commit, rode
  `git checkout -- ../.planning/phases/128-evaluation-and-release-gate/` se a suíte tiver regravado esses arquivos.
- Commits no padrão do repositório, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisões deste plano

- **Versão do prompt:** sobe de `equipe-prompts/v5` para `equipe-prompts/v6`, porque entra o prompt da conversa
  `talk`. O texto dos prompts grátis e pago não muda.
- **Saldo grátis na correção de fonte:** `diagnosis_correct_source` só confere o saldo grátis quando os limites valem.
  Hoje ele confere o saldo vitalício para qualquer conta.
- **Chip de anexo:** o `RailChat` mostra o chip de anexo para a conta `free` de um workspace que paga. O estado vem do
  `useFreePlanAccount`, que já existe.

## Fora deste plano

- A abertura de contas por marca e a marca ativa ficam no plano da etapa 2B.
- Os crons e a tela do staff continuam olhando o status (`listEnabledAccounts`, avisos, parada global). Isso é por
  desenho: a conta `free` não tem serviço contratado.

## Mapa de arquivos

Caminhos relativos a `app/src/server/equipe/`, exceto quando indicado.

- **Modificar:**
  - `module/free-plan.ts` (regra nova) e `module/free-plan.test.ts`;
  - `jobs/shared.ts` (porta nos jobs) e `agents/agent-work.ts` (porta no worker de tarefas);
  - `agents/runner.ts` e `agents/free-budget.test.ts`;
  - `agents/prompts.ts`, `agents/strategist.ts`, `agents/free-context.ts`;
  - os testes `agents/strategist-prompt.test.ts`, `agents/strategist.test.ts`, `agents/free-context.test.ts`,
    `agents/ledger.test.ts` e `agents/vision-chain.test.ts`;
  - `agents/chat-turn.ts` e `agents/chat-turn.test.ts`;
  - `jobs/handoff-read.ts`, `module/diagnosis.ts` e `module/diagnosis.test.ts`;
  - `app/src/components/assistant/conversation/RailChat.tsx` e `RailChat.test.tsx`;
  - `docs/runbooks/fluxo-0-lancamento.md`, na raiz do repositório (versão do prompt).
- **Criar:** `jobs/module-deps.test.ts`.

## Como rodar

```bash
cd app
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
npm ci
```

Para testar um arquivo: `TZ=UTC npx vitest run --config config/vitest.config.ts <caminho>`.

---

### Task 0: Branch

- [ ] **Step 1: Criar a worktree a partir do branch dos planos**

```bash
git fetch origin
git worktree add ../.worktrees/caminho-unico-etapa-2a -b caminho-unico/etapa-2a origin/caminho-unico/etapa-2
```

O branch `caminho-unico/etapa-2` é a `main` em `b8a41ac0` mais os planos 2A e 2B, então o PR do 2A leva os dois
documentos.

---

### Task 1: A regra `freePlanLimitsApply`

**Files:**
- Modify: `module/free-plan.ts` (imports e o fim do arquivo)
- Test: `module/free-plan.test.ts` (import e dois `describe` no fim)

**Interfaces:**
- Consumes: `FreePlanReaders`, `accountsFromRepository` e `PAID_STATUS`, do mesmo arquivo.
- Produces:
  - `freePlanReadersFor(deps: Pick<EquipeModuleDeps, "uow" | "hasClassicPaidAccess">): FreePlanReaders`;
  - `freePlanLimitsApply(account: Pick<EquipeAccount, "status"> | null | undefined, workspaceId: string, readers: FreePlanReaders): Promise<boolean>`;
  - `accountOnFreePlan(deps: Pick<EquipeModuleDeps, "uow" | "hasClassicPaidAccess">, scope: { workspaceId: string; accountId: string }): Promise<boolean>`.

- [ ] **Step 1: Escrever os testes que falham**

Em `module/free-plan.test.ts`, troque a linha de import de `./free-plan` por:

```ts
import { accountOnFreePlan, accountsFromRepository, findFreePlanAccount, freePlanLimitsApply, usesEquipeProduct, type FreePlanReaders } from "./free-plan";
```

No fim do arquivo, acrescente:

```ts
describe("freePlanLimitsApply (spec 2026-10-07 §3)", () => {
  it("binds a free account while its workspace does not pay, with no pilot gate", async () => {
    const f = fixture();
    const free = await f.open(WORKSPACE, "free");
    expect(await freePlanLimitsApply(free, WORKSPACE, f.readers)).toBe(true);
  });

  it("is lifted by a classic paid access", async () => {
    const f = fixture(true);
    const free = await f.open(WORKSPACE, "free");
    expect(await freePlanLimitsApply(free, WORKSPACE, f.readers)).toBe(false);
  });

  it("is lifted by a paid account of another brand of the same workspace, never of another workspace", async () => {
    const f = fixture();
    const free = await f.open(WORKSPACE, "free");
    await f.open(OTHER_WORKSPACE, "active");
    expect(await freePlanLimitsApply(free, WORKSPACE, f.readers)).toBe(true);
    await f.open(WORKSPACE, "active");
    expect(await freePlanLimitsApply(free, WORKSPACE, f.readers)).toBe(false);
  });

  it("never binds an account that is not free, and reads nothing for it", async () => {
    const f = fixture();
    const paid = await f.open(WORKSPACE, "active");
    expect(await freePlanLimitsApply(paid, WORKSPACE, f.readers)).toBe(false);
    expect(await freePlanLimitsApply(null, WORKSPACE, f.readers)).toBe(false);
    expect(f.readAccounts).not.toHaveBeenCalled();
    expect(f.hasActivePaidAccess).not.toHaveBeenCalled();
  });
});

describe("accountOnFreePlan (spec 2026-10-07 §3)", () => {
  it("reads the account and its workspace through the module; without the classic port the workspace does not pay", async () => {
    const uow = createMemoryEquipeUnitOfWork(createMemoryEquipeStore());
    const account = await uow.repos.accounts.create(WORKSPACE, { clientProfileId: crypto.randomUUID(), status: "free" as never });
    const scope = { workspaceId: WORKSPACE, accountId: account.id };
    expect(await accountOnFreePlan({ uow }, scope)).toBe(true);
    expect(await accountOnFreePlan({ uow, hasClassicPaidAccess: async () => true }, scope)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/module/free-plan.test.ts`
Expected: FAIL, "freePlanLimitsApply is not a function" (e o mesmo para `accountOnFreePlan`).

- [ ] **Step 3: Implementar**

Em `module/free-plan.ts`, acrescente depois do import de `./equipe-enabled`:

```ts
import type { EquipeModuleDeps } from "./ports";
```

No fim do arquivo, acrescente:

```ts
/** The rule's readers over the module's own repositories and its classic paid access port; without the port, not paid. */
export function freePlanReadersFor(deps: Pick<EquipeModuleDeps, "uow" | "hasClassicPaidAccess">): FreePlanReaders {
  return {
    readAccounts: accountsFromRepository(deps.uow.repos.accounts),
    hasActivePaidAccess: deps.hasClassicPaidAccess ?? (async () => false),
  };
}

/**
 * Whether the free plan's limits bind an account (spec 2026-10-07 §3): the lifetime AI cap and its diagnosis reserve, the
 * plan card and the refused attachments. Only a `free` account, and only while its workspace does not pay: a paid account
 * of any brand of the workspace, or a classic paid access, lifts them, as both lift the classic gates
 * (`findFreePlanAccount`). Unlike that rule there is no pilot gate: an account exists only where the pilot opened it.
 * What a free account may DO (its commands and task kinds) is its status, not this.
 */
export async function freePlanLimitsApply(
  account: Pick<EquipeAccount, "status"> | null | undefined,
  workspaceId: string,
  readers: FreePlanReaders,
): Promise<boolean> {
  if (account?.status !== "free") return false;
  const accounts = await readers.readAccounts(workspaceId);
  if (accounts.some((entry) => PAID_STATUS.has(entry.status))) return false;
  return !(await readers.hasActivePaidAccess(workspaceId));
}

/** The same rule for one account of the module, read through its repositories. */
export async function accountOnFreePlan(
  deps: Pick<EquipeModuleDeps, "uow" | "hasClassicPaidAccess">,
  scope: { workspaceId: string; accountId: string },
): Promise<boolean> {
  const account = await deps.uow.repos.accounts.get(scope.workspaceId, scope.accountId);
  return freePlanLimitsApply(account, scope.workspaceId, freePlanReadersFor(deps));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: o comando do Step 2.
Expected: PASS, inclusive os testes antigos de `findFreePlanAccount` e `usesEquipeProduct`.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/equipe/module/free-plan.ts app/src/server/equipe/module/free-plan.test.ts
git commit -m "feat(caminho-unico): free-plan limits follow the workspace, not only the account status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Os jobs e o worker de tarefas conhecem o acesso pago clássico

**Files:**
- Modify: `jobs/shared.ts` (tipo `EquipeJobDeps`, `createProdJobDeps`, `moduleDepsFor`)
- Modify: `agents/agent-work.ts` (`buildModuleDeps`)
- Create: `jobs/module-deps.test.ts`

**Interfaces:**
- Consumes: `EquipeModuleDeps["hasClassicPaidAccess"]`.
- Produces: `EquipeJobDeps.hasClassicPaidAccess?: (workspaceId: string) => Promise<boolean>`, repassado por
  `moduleDepsFor`.

- [ ] **Step 1: Escrever o teste que falha**

`jobs/module-deps.test.ts`:

```ts
// Spec 2026-10-07 §3: a job reads the free plan as the request does, so the classic paid access travels into its module deps.
import { describe, expect, it, vi } from "vitest";
import { createMemoryEquipeStore, createMemoryEquipeUnitOfWork } from "../data";
import { fixedClock } from "../domain";
import { moduleDepsFor, type EquipeJobDeps } from "./shared";

function jobDeps(extra: Partial<EquipeJobDeps> = {}): EquipeJobDeps {
  return {
    uow: createMemoryEquipeUnitOfWork(createMemoryEquipeStore()),
    clock: fixedClock(new Date("2026-10-07T12:00:00.000Z")),
    isEnabledForWorkspace: () => true,
    gatewayFor: () => ({}) as never,
    ...extra,
  };
}

describe("moduleDepsFor (spec 2026-10-07 §3)", () => {
  it("passes the classic paid access on", async () => {
    const hasClassicPaidAccess = vi.fn(async () => true);
    const deps = moduleDepsFor(jobDeps({ hasClassicPaidAccess }), "ws-1");
    expect(await deps.hasClassicPaidAccess?.("ws-1")).toBe(true);
    expect(hasClassicPaidAccess).toHaveBeenCalledWith("ws-1");
  });

  it("leaves it out when the job deps have none", () => {
    expect(moduleDepsFor(jobDeps(), "ws-1").hasClassicPaidAccess).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/jobs/module-deps.test.ts`
Expected: FAIL. O primeiro teste recebe `undefined`, e o `tsc` reclama de `hasClassicPaidAccess` em `EquipeJobDeps`.

- [ ] **Step 3: Implementar**

Em `jobs/shared.ts`:
- acrescente o import `import { workspaceHasActivePaidAccess } from "@/server/billing/access";`;
- no tipo `EquipeJobDeps`, depois de `isPublishEnabled?: () => boolean;`, acrescente:

```ts
  /**
   * Whether the workspace pays for the classic product (spec 2026-10-07 §3): the free plan's limits follow it. Production
   * wires `workspaceHasActivePaidAccess`; tests leave it out, which reads as not paid.
   */
  hasClassicPaidAccess?: (workspaceId: string) => Promise<boolean>;
```

- em `createProdJobDeps`, depois de `publisher: createLivePublisher(uow),`, acrescente:

```ts
    hasClassicPaidAccess: (workspaceId) => workspaceHasActivePaidAccess(workspaceId),
```

- em `moduleDepsFor`, depois da linha do `isPublishEnabled`, acrescente:

```ts
    ...(deps.hasClassicPaidAccess ? { hasClassicPaidAccess: deps.hasClassicPaidAccess } : {}),
```

Em `agents/agent-work.ts`, acrescente o import `import { workspaceHasActivePaidAccess } from "@/server/billing/access";`.
Em `buildModuleDeps`, depois de `gateway: new LiveAdscaleGateway(workspaceId),`, acrescente:

```ts
    hasClassicPaidAccess: (id) => workspaceHasActivePaidAccess(id),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/jobs src/server/equipe/agents/agent-work`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/equipe/jobs/shared.ts app/src/server/equipe/jobs/module-deps.test.ts app/src/server/equipe/agents/agent-work.ts
git commit -m "feat(caminho-unico): jobs and agent work read the classic paid access

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: O runner cobra pelo teto mensal quem paga

**Files:**
- Modify: `agents/runner.ts:187-190`
- Test: `agents/free-budget.test.ts` (um `describe` no fim)

**Interfaces:**
- Consumes: `freePlanLimitsApply` e `freePlanReadersFor` (Task 1).
- Produces: nada novo. A variável local `free` do runner passa a significar "limites do plano grátis valem".

- [ ] **Step 1: Escrever os testes que falham**

No fim de `agents/free-budget.test.ts`, acrescente:

```ts
describe("a free account of a paying workspace (spec 2026-10-07 §3)", () => {
  it("runs on the monthly budget: last month's spend does not cap it and nothing is reserved", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const a = await freeAccount();
    a.t.deps.hasClassicPaidAccess = async () => true;
    const ledger = new MemoryLedgerStore();
    const old = await ledger.record({ ...a.scope, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: 99 });
    old.createdAt = new Date("2026-01-01T00:00:00Z");
    const client = new FakeModelClient([{ content: "ok" }]);
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
    const result = await agents.runTask(strategist(a));
    expect(result.ok).toBe(true);
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]!.noRetries).toBeUndefined();
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries[1]!.reservedCostUsdCents).toBeUndefined();
  });

  it("still delegates no engine work: what a free account may do is its status", async () => {
    const a = await freeAccount();
    a.t.deps.hasClassicPaidAccess = async () => true;
    const client = new FakeModelClient([]);
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger: new MemoryLedgerStore(), now: () => NOW });
    expect(await agents.runTask({ kind: "writing", input: { workItemId: "w" }, workspaceId: a.workspaceId, accountId: a.accountId }))
      .toEqual({ ok: false, error: "requires_plan" });
    expect(client.requests).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/agents/free-budget.test.ts`
Expected: FAIL no primeiro teste novo, com `{ ok: false, error: BUDGET_EXCEEDED_ERROR }`, porque o gasto antigo ainda
conta no teto vitalício. O segundo já passa e prova que a capacidade não muda.

- [ ] **Step 3: Implementar**

Em `agents/runner.ts`, acrescente o import `import { freePlanLimitsApply, freePlanReadersFor } from "../module/free-plan";`
e troque:

```ts
      const account = await options.moduleDeps.uow.repos.accounts.get(task.workspaceId, task.accountId);
      const free = account?.status === "free";
      // Engine work bypasses this ledger, so a free account never delegates it.
      if (free && kind !== "strategist_turn" && kind !== "research" && kind !== "diagnosis") return invalidTask("requires_plan");
```

por:

```ts
      const account = await options.moduleDeps.uow.repos.accounts.get(task.workspaceId, task.accountId);
      // Engine work bypasses this ledger, so a free account never delegates it: that is what its status allows.
      if (account?.status === "free" && kind !== "strategist_turn" && kind !== "research" && kind !== "diagnosis") return invalidTask("requires_plan");
      // The lifetime cap is the free plan's (spec 2026-10-07 §3): it binds a free account only while its workspace does not pay.
      const free = await freePlanLimitsApply(account, task.workspaceId, freePlanReadersFor(options.moduleDeps));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/agents/free-budget.test.ts src/server/equipe/agents/runner.test.ts`
Expected: PASS em todos, inclusive os testes antigos do teto vitalício.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/equipe/agents/runner.ts app/src/server/equipe/agents/free-budget.test.ts
git commit -m "feat(caminho-unico): a paying workspace's free brand runs on the monthly budget

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: O Estrategista ganha o modo `talk`

**Files:**
- Modify: `agents/prompts.ts` (versão, tipo `StrategistMode`, `strategistSystemPrompt`)
- Modify: `agents/strategist.ts` (`strategistModeOf`, `buildStrategistTools`, a checagem de `oferecer_plano`, `runStrategistTurn`)
- Modify: `agents/free-context.ts` (`freeAccountContext` com modo)
- Modify: `docs/runbooks/fluxo-0-lancamento.md:31`
- Test:
  - `agents/strategist-prompt.test.ts` (arquivo inteiro);
  - `agents/strategist.test.ts` (linhas 381-388 e três testes novos);
  - `agents/free-context.test.ts` (um teste novo);
  - `agents/ledger.test.ts:43`;
  - `agents/vision-chain.test.ts:134-138`.

**Interfaces:**
- Consumes: `freePlanLimitsApply`, `freePlanReadersFor` e `accountOnFreePlan` (Task 1).
- Produces:
  - `type StrategistMode = "free" | "talk" | "paid"`, exportado de `agents/prompts.ts`;
  - `strategistModeOf(ctx: StrategistToolContext): Promise<StrategistMode>`;
  - `buildStrategistTools(ctx, mode: StrategistMode = "paid")`;
  - `strategistSystemPrompt(mode: StrategistMode = "paid")`;
  - `freeAccountContext(repos, scope, mode: "free" | "talk" = "free")`;
  - `EQUIPE_PROMPT_VERSION = "equipe-prompts/v6"`.

- [ ] **Step 1: Escrever os testes que falham**

`agents/strategist-prompt.test.ts` (arquivo inteiro):

```ts
// The strategist's system prompt: the answer travels in `resposta`; the free plan and the talk conversation read their context
// (ticket 15), and only the free plan offers the plan (spec 2026-10-07 §3).

import { describe, expect, it } from "vitest";
import { EQUIPE_PROMPT_VERSION, strategistSystemPrompt } from "./prompts";

const MODES = ["free", "talk", "paid"] as const;

describe("strategistSystemPrompt", () => {
  it("is version v6 and says so in every conversation", () => {
    expect(EQUIPE_PROMPT_VERSION).toBe("equipe-prompts/v6");
    for (const mode of MODES) expect(strategistSystemPrompt(mode)).toContain("equipe-prompts/v6");
  });

  it("tells every conversation to put the answer in `resposta` of sugerir_proximos_passos", () => {
    for (const mode of MODES) {
      const prompt = strategistSystemPrompt(mode);
      expect(prompt).toContain("sugerir_proximos_passos");
      expect(prompt).toContain("`resposta`");
    }
  });

  it("tells the free plan its first message is the account context, that no tool reads the account, and how to offer the plan", () => {
    const prompt = strategistSystemPrompt("free");
    expect(prompt).toMatch(/first message of the conversation is the account context/);
    expect(prompt).toMatch(/no\s+tool to read the account/);
    expect(prompt).not.toContain("get_account_state");
    expect(prompt).not.toMatch(/call get_|use get_|read it with/i);
    expect(prompt).toContain("oferecer_plano");
  });

  it("tells a free brand of a paying workspace the same, without the plan and with the way to create", () => {
    const prompt = strategistSystemPrompt("talk");
    expect(prompt).toMatch(/first message of the conversation is the account context/);
    expect(prompt).toMatch(/no\s+tool to read the account/);
    expect(prompt).not.toContain("oferecer_plano");
    expect(prompt).not.toContain("Conta grátis");
    expect(prompt).toContain("Criações");
  });

  it("does not mention the account context nor the free-only rules to the paid account", () => {
    const prompt = strategistSystemPrompt("paid");
    expect(prompt).not.toMatch(/account context/i);
    expect(prompt).not.toContain("oferecer_plano");
    expect(prompt).not.toContain("Conta grátis");
    expect(strategistSystemPrompt()).toBe(prompt);
  });
});
```

Em `agents/strategist.test.ts`:
- No import de `./strategist`, acrescente `strategistModeOf` e `STRATEGIST_MAX_TOKENS`.
- No teste "restricts the free account to the two closing tools…" (linhas 381-388), troque o segundo argumento `true`
  por `"free"`.
- Acrescente, logo depois desse teste:

```ts
  it("tells the three conversations apart from the account and its workspace (spec 2026-10-07 §3)", async () => {
    const free = await freeAccount();
    const freeCtx = { deps: free.t.deps, workspaceId: free.workspaceId, accountId: free.accountId };
    expect(await strategistModeOf(freeCtx)).toBe("free");
    free.t.deps.hasClassicPaidAccess = async () => true;
    expect(await strategistModeOf(freeCtx)).toBe("talk");
    const t = makeTestDeps();
    const paid = await openTestAccount(t);
    expect(await strategistModeOf({ deps: t.deps, workspaceId: paid.workspaceId, accountId: paid.accountId })).toBe("paid");
  });

  it("gives the talk conversation only the answer tool: no plan offer, no account reads", async () => {
    const free = await freeAccount();
    free.t.deps.hasClassicPaidAccess = async () => true;
    const tools = buildStrategistTools({ deps: free.t.deps, workspaceId: free.workspaceId, accountId: free.accountId }, "talk");
    expect(tools.map((tool) => tool.name)).toEqual(["sugerir_proximos_passos"]);
  });

  it("runs a talk turn with the brand context, the paid token limit and no plan tool", async () => {
    const free = await freeAccount();
    free.t.deps.hasClassicPaidAccess = async () => true;
    const client = new FakeModelClient([{
      content: "Sua marca está pronta para criar.",
      toolCalls: [{ id: "call-1", name: "sugerir_proximos_passos", argumentsJson: JSON.stringify({ itens: ["Quero criar uma peça"] }) }],
    }]);
    const result = await runStrategistTurn({ client, ctx: { deps: free.t.deps, workspaceId: free.workspaceId, accountId: free.accountId }, message: "Oi" });
    const request = client.requests[0]!;
    expect(String(request.messages[0]!.content)).not.toContain("oferecer_plano");
    expect(JSON.stringify(request.messages[1])).toContain("Account: a brand of a client workspace, with no contracted service");
    expect(request.tools?.map((tool) => tool.name)).toEqual(["sugerir_proximos_passos"]);
    expect(request.maxTokens).toBe(STRATEGIST_MAX_TOKENS);
    expect(result.planOffered).toBeFalsy();
  });
```

Em `agents/free-context.test.ts`, dentro do `describe("freeAccountContext with a pilot-shaped account")`, acrescente:

```ts
  it("says which conversation it is: the free plan counts readings, a paying workspace's brand does not (spec 2026-10-07 §3)", async () => {
    const f = await pilotAccount();
    const talk = (await freeAccountContext(f.t.deps.uow.repos, f.scope, "talk")).split("\n");
    expect(talk).toContain("Account: a brand of a client workspace, with no contracted service");
    expect(talk.some((line) => line.startsWith("Account: free"))).toBe(false);
    expect(talk).toContain('Brand: "Café Aurora"');
  });
```

Troque a versão nos testes que a fixam:
- `agents/ledger.test.ts:43`: `"equipe-prompts/v5"` por `"equipe-prompts/v6"`;
- `agents/vision-chain.test.ts:134` e `:138`: `equipe-prompts/v5` por `equipe-prompts/v6` (no título e no `toMatchObject`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/agents/strategist-prompt.test.ts src/server/equipe/agents/strategist.test.ts src/server/equipe/agents/free-context.test.ts src/server/equipe/agents/ledger.test.ts src/server/equipe/agents/vision-chain.test.ts`
Expected: FAIL. A versão ainda é v5, `strategistModeOf` não existe, e `freeAccountContext` ignora o modo.

- [ ] **Step 3: Prompt e versão**

Em `agents/prompts.ts`:
- troque `export const EQUIPE_PROMPT_VERSION = "equipe-prompts/v5";` por
  `export const EQUIPE_PROMPT_VERSION = "equipe-prompts/v6";`;
- antes de `export function strategistSystemPrompt`, acrescente:

```ts
/**
 * The three conversations of the Estrategista (spec 2026-10-07 §3): `free`, the free plan (diagnosis and conversation,
 * with the plan offer); `talk`, a free brand of a workspace that pays (conversation only, no plan offer); `paid`, a
 * contracted account (every tool).
 */
export type StrategistMode = "free" | "talk" | "paid";
```

- troque a assinatura `export function strategistSystemPrompt(free = false): string {` por
  `export function strategistSystemPrompt(mode: StrategistMode = "paid"): string {`;
- troque `...(free ? [` por `...(mode === "free" ? [`;
- logo depois do fechamento desse bloco grátis (`] : []),`) e antes de `].join("\n");`, acrescente:

```ts
    ...(mode === "talk" ? [
      "",
      "Conversa da marca: this brand has no contracted service yet, and its workspace is already a client.",
      "The first message of the conversation is the account context: the confirmed brand and, when there is one, the",
      "recorded diagnosis. Answer from it; you have no tool to read the account again. Never make a diagnosis up.",
      "Do not produce pieces, calendars, ideas or plans. To create a piece, point the client to Criações, where Criar",
      "opens the composer.",
      "Never offer a plan, a free plan or a price.",
    ] : []),
```

- [ ] **Step 4: Contexto com modo**

Em `agents/free-context.ts`:
- troque a assinatura por
  `export async function freeAccountContext(repos: EquipeRepositories, scope: AccountScope, mode: "free" | "talk" = "free"): Promise<string> {`;
- troque a linha ``    `Account: free · readings used: ${handoff?.readsUsed ?? 0} of ${DIAGNOSIS_READ_LIMIT}`,`` por:

```ts
    mode === "free"
      ? `Account: free · readings used: ${handoff?.readsUsed ?? 0} of ${DIAGNOSIS_READ_LIMIT}`
      : "Account: a brand of a client workspace, with no contracted service",
```

- [ ] **Step 5: Modos no Estrategista**

Em `agents/strategist.ts`:
- Acrescente os imports `import { accountOnFreePlan, freePlanLimitsApply, freePlanReadersFor } from "../module/free-plan";`
  e `import type { StrategistMode } from "./prompts";`. Se `./prompts` já é importado, junte `type StrategistMode` a
  esse import.
- Antes de `export function buildStrategistTools`, acrescente:

```ts
/** Which of the three conversations an account gets (spec 2026-10-07 §3): its status, then whether its workspace pays. */
export async function strategistModeOf(ctx: StrategistToolContext): Promise<StrategistMode> {
  const account = await ctx.deps.uow.repos.accounts.get(ctx.workspaceId, ctx.accountId);
  if (account?.status !== "free") return "paid";
  return (await freePlanLimitsApply(account, ctx.workspaceId, freePlanReadersFor(ctx.deps))) ? "free" : "talk";
}
```

- Troque a assinatura `export function buildStrategistTools(ctx: StrategistToolContext, free = false): StrategistTool[] {`
  por `export function buildStrategistTools(ctx: StrategistToolContext, mode: StrategistMode = "paid"): StrategistTool[] {`.
- No `run` de `OFFER_PLAN_TOOL`, troque:

```ts
      const account = await ctx.deps.uow.repos.accounts.get(ctx.workspaceId, ctx.accountId);
      if (account?.status !== "free" || !(await hasRecordedDiagnostic(ctx.deps.uow.repos, ctx))) {
```

por:

```ts
      if (!(await accountOnFreePlan(ctx.deps, ctx)) || !(await hasRecordedDiagnostic(ctx.deps.uow.repos, ctx))) {
```

- Troque o filtro final:

```ts
  // The free account reads its brand and diagnosis from the context message (free-context.ts), so it has no tool that
  // reads the account: a model that has everything it needs answers in one call.
  return tools.filter((tool) => free
    ? isClosingTool(tool.name)
    : tool.name !== OFFER_PLAN_TOOL).map((tool) => ({
```

por:

```ts
  // The free plan and the talk conversation read the brand from the context message (free-context.ts), so they have no
  // tool that reads the account: a model that has everything it needs answers in one call. Only the free plan offers it.
  return tools.filter((tool) => mode === "paid"
    ? tool.name !== OFFER_PLAN_TOOL
    : mode === "free" ? isClosingTool(tool.name) : tool.name === SUGGEST_TOOL).map((tool) => ({
```

- Em `runStrategistTurn`, troque as duas primeiras linhas:

```ts
  const account = await input.ctx.deps.uow.repos.accounts.get(input.ctx.workspaceId, input.ctx.accountId);
  const free = account?.status === "free";
```

por:

```ts
  const mode = await strategistModeOf(input.ctx);
  const free = mode === "free";
```

- Troque `const tools = buildStrategistTools(input.ctx, free);` por `const tools = buildStrategistTools(input.ctx, mode);`.
- Troque `const accountContext = free ? await freeAccountContext(input.ctx.deps.uow.repos, input.ctx) : null;` por
  `const accountContext = mode === "paid" ? null : await freeAccountContext(input.ctx.deps.uow.repos, input.ctx, mode);`.
- Troque `{ role: "system", content: strategistSystemPrompt(free) },` por
  `{ role: "system", content: strategistSystemPrompt(mode) },`.

- [ ] **Step 6: Runbook**

Em `docs/runbooks/fluxo-0-lancamento.md`, linha 31, troque o trecho:

```
o prompt (versão `equipe-prompts/v5`; do v4 para o v5 só mudou uma frase da visão do site, ver "Fundo do logo", e o prompt do Estrategista medido acima é o mesmo)
```

por:

```
o prompt (versão `equipe-prompts/v6`; do v5 para o v6 entrou só a conversa da marca de um workspace pagante, e os prompts grátis e pago medidos acima são os mesmos; do v4 para o v5 só mudou uma frase da visão do site, ver "Fundo do logo")
```

- [ ] **Step 7: Rodar e ver passar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/agents src/server/equipe/module/execution-authorization.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/src/server/equipe/agents docs/runbooks/fluxo-0-lancamento.md
git commit -m "feat(caminho-unico): the Estrategista only talks for a paying workspace's free brand (prompts v6)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: A conversa tira card do plano e recusa de anexo de quem paga

**Files:**
- Modify: `agents/chat-turn.ts`, nos seis pontos que leem `status === "free"`:
  - `diagnosisBudgetExit` (~linha 240);
  - `closesFreeConversation` (~312);
  - `stuckWithDiagnosis` (~340);
  - anexos (~364);
  - `BUDGET_EXCEEDED` (~445);
  - `planOffered` (~467).
- Test: `agents/chat-turn.test.ts` (um `describe` novo)

**Interfaces:**
- Consumes: `accountOnFreePlan` (Task 1).
- Produces: nada novo.

- [ ] **Step 1: Escrever os testes que falham**

Em `agents/chat-turn.test.ts`, depois do `describe` que contém o teste "refuses free attachments with a clear persisted
answer and no AI call", acrescente:

```ts
describe("runEquipeStrategistTurn — a free brand of a paying workspace (spec 2026-10-07 §3)", () => {
  async function payingFreeAccount() {
    const free = await freeAccount();
    await completeHandoff(free.t, free.workspaceId, free.accountId);
    free.t.deps.hasClassicPaidAccess = async () => true;
    return free;
  }

  it("takes attachments to the strategist instead of refusing them", async () => {
    const free = await payingFreeAccount();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "Vi a imagem." } });
    await collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, workspaceId: free.workspaceId, accountId: free.accountId,
      threadId: "thread-1", userMessage: "Analise esta imagem", attachments: [ATTACHMENT], executionPausedMessage: "pausa",
    }));
    expect(agents.tasks).toHaveLength(1);
    expect(messages.posts.some((post) => /conta grátis/.test(post.content))).toBe(false);
  });

  it("answers an exceeded budget with the monthly line, never the plan card", async () => {
    const free = await payingFreeAccount();
    await free.t.deps.uow.repos.events.create({ workspaceId: free.workspaceId, accountId: free.accountId }, {
      actorType: "system", actorId: "diag", actorRole: "system", eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: uuid() }, occurredAt: new Date(),
    });
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    const events = await collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, workspaceId: free.workspaceId, accountId: free.accountId,
      threadId: "thread-1", userMessage: "e aí?", executionPausedMessage: "pausa",
    }));
    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    expect(messages.posts.find((post) => post.type === "assistant")?.content).toContain("limite de IA deste mês");
  });

  it("ignores a plan offer from the model", async () => {
    const free = await payingFreeAccount();
    await free.t.deps.uow.repos.events.create({ workspaceId: free.workspaceId, accountId: free.accountId }, {
      actorType: "system", actorId: "diag", actorRole: "system", eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: uuid() }, occurredAt: new Date(),
    });
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "Posso ajudar com a marca.", planOffered: true } });
    const events = await collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, workspaceId: free.workspaceId, accountId: free.accountId,
      threadId: "thread-1", userMessage: "quero mais", executionPausedMessage: "pausa",
    }));
    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    expect(messages.posts.find((post) => post.type === "assistant")?.content).toBe("Posso ajudar com a marca.");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/agents/chat-turn.test.ts`
Expected: FAIL nos três testes novos. O anexo é recusado com o texto da conta grátis, o orçamento estourado vira card
do plano e o `planOffered` vira card.

- [ ] **Step 3: Implementar**

Em `agents/chat-turn.ts`:
- Acrescente o import `import { accountOnFreePlan } from "../module/free-plan";`.
- Acrescente, logo antes de `async function diagnosisBudgetExit`:

```ts
/** Spec 2026-10-07 §3: the free plan's cards and refusals bind a free account only while its workspace does not pay. */
function onFreePlan(input: EquipeChatTurnInput): Promise<boolean> {
  return accountOnFreePlan(input.deps, input);
}
```

- Em `diagnosisBudgetExit`, troque
  `return (await repos.accounts.get(input.workspaceId, input.accountId))?.status === "free"` por
  `return await onFreePlan(input)`. A linha seguinte, que começa com `&& !(await hasRecordedDiagnostic`, continua igual.
- No bloco `closesFreeConversation`, troque
  `&& (await input.deps.uow.repos.accounts.get(input.workspaceId, input.accountId))?.status === "free") {` por
  `&& await onFreePlan(input)) {`.
- Em `stuckWithDiagnosis`, troque
  `&& (await input.deps.uow.repos.accounts.get(input.workspaceId, input.accountId))?.status === "free"` por
  `&& await onFreePlan(input)`.
- No bloco dos anexos, troque
  `if (attachments.length > 0 && (await input.deps.uow.repos.accounts.get(input.workspaceId, input.accountId))?.status === "free") {`
  por `if (attachments.length > 0 && await onFreePlan(input)) {`.
- No bloco `if (!result.ok) {`, troque as duas linhas:

```ts
    const account = await input.deps.uow.repos.accounts.get(input.workspaceId, input.accountId);
    const free = account?.status === "free";
```

por:

```ts
    const free = await onFreePlan(input);
```

- No bloco `if (output?.planOffered) {`, troque:

```ts
    const account = await input.deps.uow.repos.accounts.get(input.workspaceId, input.accountId);
    if (account?.status === "free" && await hasRecordedDiagnostic(input.deps.uow.repos, input)) {
```

por:

```ts
    if (await onFreePlan(input) && await hasRecordedDiagnostic(input.deps.uow.repos, input)) {
```

- [ ] **Step 4: Rodar e ver passar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/agents`
Expected: PASS, inclusive os blocos antigos da conta grátis: recusa de anexo, card no orçamento esgotado e bloqueio do
diagnóstico.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/equipe/agents/chat-turn.ts app/src/server/equipe/agents/chat-turn.test.ts
git commit -m "feat(caminho-unico): no plan card nor attachment refusal for a paying workspace's free brand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Leitura de marca e correção de fonte seguem a regra

**Files:**
- Modify: `jobs/handoff-read.ts` (o `visionClient`, ~linha 32)
- Modify: `module/diagnosis.ts` (a checagem de saldo de `diagnosis_correct_source`, ~linhas 71-72)
- Test: `module/diagnosis.test.ts` (um teste no `describe("diagnosis_correct_source — balance and re-reserve")`)

**Interfaces:**
- Consumes: `freePlanLimitsApply`, `freePlanReadersFor` e `accountOnFreePlan` (Task 1); `moduleDepsFor` com a porta (Task 2).
- Produces: nada novo.

- [ ] **Step 1: Escrever o teste que falha**

Em `module/diagnosis.test.ts`, dentro de `describe("diagnosis_correct_source — balance and re-reserve")`, acrescente:

```ts
  it("does not ask a paying workspace's free brand for the free balance (spec 2026-10-07 §3)", async () => {
    const f = await insufficientFixture();
    f.t.deps.hasClassicPaidAccess = async () => true;
    balance(f, 0);
    expect((await run(f, f.approver, "diagnosis_correct_source")).ok).toBe(true);
    expect((await snapshot(f)).handoff.step).toBe("source");
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/module/diagnosis.test.ts`
Expected: FAIL, com `insufficient_balance`.

- [ ] **Step 3: Implementar**

Em `module/diagnosis.ts`, acrescente o import `import { accountOnFreePlan } from "./free-plan";` e troque:

```ts
        const remaining = await deps.freeBudget?.remainingUsdCents(scope);
        if (remaining === undefined || remaining < sourceCorrectionRequirementUsdCents()) return err("insufficient_balance", "The free AI balance does not cover a new reading and diagnosis.");
```

por:

```ts
        // The lifetime balance is the free plan's (spec 2026-10-07 §3): a paying workspace's brand reads on its monthly budget.
        if (await accountOnFreePlan(deps, scope)) {
          const remaining = await deps.freeBudget?.remainingUsdCents(scope);
          if (remaining === undefined || remaining < sourceCorrectionRequirementUsdCents()) return err("insufficient_balance", "The free AI balance does not cover a new reading and diagnosis.");
        }
```

Em `jobs/handoff-read.ts`, acrescente o import `import { freePlanLimitsApply, freePlanReadersFor } from "../module/free-plan";`
e troque `const free = account?.status === "free";` por:

```ts
    // The lifetime admission is the free plan's (spec 2026-10-07 §3); a paying workspace's brand records on its monthly ledger.
    const free = await freePlanLimitsApply(account, context.workspaceId, freePlanReadersFor(moduleDepsFor(deps, context.workspaceId)));
```

`moduleDepsFor` já é importado nesse arquivo; confira o import de `./shared`.

- [ ] **Step 4: Rodar e ver passar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/module/diagnosis.test.ts src/server/equipe/agents/vision-chain.test.ts src/server/equipe/handoff`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/equipe/module/diagnosis.ts app/src/server/equipe/module/diagnosis.test.ts app/src/server/equipe/jobs/handoff-read.ts
git commit -m "feat(caminho-unico): brand reading and source correction follow the workspace's plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: O chip de anexo aparece para quem paga

**Files:**
- Modify: `app/src/components/assistant/conversation/RailChat.tsx:21-23`
- Test: `app/src/components/assistant/conversation/RailChat.test.tsx`

**Interfaces:**
- Consumes: `useFreePlanAccount()` de `@/lib/equipe/use-equipe`. Ele devolve `undefined` enquanto o estado é
  desconhecido, `null` fora do plano grátis e um objeto no plano grátis.
- Produces: nada.

- [ ] **Step 1: Escrever o teste que falha**

Em `RailChat.test.tsx`, logo depois do mock de `@/lib/equipe/use-conversation-context`, acrescente:

```tsx
let freePlan: { accountId: string | null } | null | undefined;
vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => freePlan }));
```

No `beforeEach`, acrescente `freePlan = { accountId: "acc-1" };`. Depois do teste "offers attachments once the account
is on a plan", acrescente:

```tsx
  it("offers attachments to a free brand of a paying workspace (spec 2026-10-07 §3)", () => {
    freePlan = null;
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().attachmentsEnabled).toBe(true);
  });

  it("keeps them hidden for a free brand while the plan is unknown", () => {
    freePlan = undefined;
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().attachmentsEnabled).toBe(false);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/components/assistant/conversation/RailChat.test.tsx`
Expected: FAIL no primeiro teste novo.

- [ ] **Step 3: Implementar**

Em `RailChat.tsx`, acrescente o import `import { useFreePlanAccount } from "@/lib/equipe/use-equipe";` e troque:

```tsx
  // Attachments are refused for a free account (with a notice, by the server), so the screen does not offer them.
  // Until the account is known the button stays hidden: it must never flash and then disappear.
  const attachmentsEnabled = conversation.accountStatus !== null && conversation.accountStatus !== "free";
```

por:

```tsx
  // Attachments are refused on the free plan (with a notice, by the server), so the screen does not offer them. A free brand
  // of a paying workspace is not on it (spec 2026-10-07 §3). Until both are known the button stays hidden: it must never
  // flash and then disappear.
  const freePlan = useFreePlanAccount();
  const attachmentsEnabled = conversation.accountStatus !== null
    && (conversation.accountStatus !== "free" || freePlan === null);
```

- [ ] **Step 4: Rodar e ver passar**

Run: o comando do Step 2.
Expected: PASS em todos, inclusive "offers no attachments to a free account" (com `freePlan` preenchido) e "keeps
attachments hidden until the account is known".

- [ ] **Step 5: Commit**

```bash
git add app/src/components/assistant/conversation/RailChat.tsx app/src/components/assistant/conversation/RailChat.test.tsx
git commit -m "feat(caminho-unico): the conversation offers attachments to a paying workspace's free brand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verificação completa e PR

- [ ] **Step 1: Lint, tipos e suíte**

```bash
rm -rf .next/dev
npm run lint
npm run typecheck
TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe src/components/assistant src/lib/equipe
```

Expected:
- `lint` sem erros;
- `tsc` sem erros;
- testes em PASS.

Rode também os `*.pg.test.ts` do Equipe num banco próprio terminado em `_test`, migrado:

```bash
TEST_DATABASE_URL=… npx vitest run --config config/vitest.config.ts src/server/equipe .pg.test.ts --no-file-parallelism --maxWorkers=1
```

- [ ] **Step 2: Gates de convergência**

```bash
npm run convergence:inventory
npm run convergence:test
npm run convergence:gate
```

Commite o inventário se ele mudar.

- [ ] **Step 3: PR (com a confirmação do dono)**

Com o ok do dono, rode `git push -u origin caminho-unico/etapa-2a` e abra o PR contra `main` usando a skill `pr`. A
seção Merge Danger conta:
- **Porta:** two-way, sem migração.
- **Raio:** só contas `free` de workspaces pagantes. Hoje são a Dev Admin e os testadores, se tiverem conta.

Depois, vincule o PR com `ccd_pr` (`get_status`/`bind_pr`).
