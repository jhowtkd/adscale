# Caminho único, etapa 2B: marca ativa, seletor no trilho e uma conta por marca (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na casca nova, a marca escolhida no topo do trilho decide tudo: a conversa, a Biblioteca, Criações,
Pipeline, Ideias, Metas e o composer. Cada marca abre a sua própria conta na primeira visita: uma marca com Brand Kit
entra direto na conversa, e uma marca nova passa pelo handoff.

**Architecture:**
- **No servidor:** a marca ativa vem de um cookie que o servidor confere contra as marcas do workspace; sem cookie ou
  com cookie inválido, vale a mais antiga, e no plano grátis vale sempre a marca da conta grátis. O layout e `/` leem
  essa marca, e `open_free_account` passa a receber a marca e abrir a conta dela.
- **No cliente:** um provider leva a marca às telas da casca nova, e o seletor do trilho troca o cookie e volta à
  conversa da marca.
- **Fora da casca nova:** fora do provider, as telas fazem o que fazem hoje.

**Tech Stack:** Next.js 16.2 (App Router, `cookies()` de `next/headers`, `cache` do React), React 19.2,
TypeScript, Vitest 4, Drizzle e next-intl 4.

**Spec:** `docs/superpowers/specs/2026-10-07-caminho-unico-design.md`, seção 3 ("Marca ativa", "Uma conta por
marca", "Casos de borda") e seção 5, etapa 2. A posição aprovada do seletor está nos quadros
`docs/design/pen/telas-caminho-unico/c8-seletor-de-marca.png` e `c8b-seletor-conta-gratis.png`: topo do trilho,
abaixo do logo, monograma da marca ativa. Este plano depende do 2A
(`2026-10-07-caminho-unico-etapa-2a-plano-gratis-por-workspace.md`) já estar na `main`.

## Global Constraints

- Nenhum `page.tsx` ou `route.ts` novo (trava de destinos).
- A palavra "Equipe" não aparece em texto novo para o cliente, nem em pt-BR nem em en.
- O servidor confere se a marca do cookie é do workspace. Sem cookie ou com marca inválida, vale a mais antiga (por
  `createdAt`, depois `id`).
- No plano grátis há uma marca só. A marca ativa é a da conta grátis, adicionar outra marca mostra o card do plano, e
  o `POST /api/client-profiles` recusa com 402.
- Marca com Brand Kit (logo ou cores no `client_profile`) entra direto na conversa: handoff em `done` por importação e
  conversa principal nova. Marca sem identidade passa pelo handoff do zero.
- Uma marca que tem conta não pode ser apagada, nem pelo seletor nem pela API.
- Na casca clássica nada muda. Lá não há provider de marca, e cada tela faz o que faz hoje. Os pagantes sem conta
  continuam na casca clássica até a etapa 3.
- Toda tela nova é conferida contra os quadros c8 e c8b, com prints lado a lado no PR.
- Node 22 e `git checkout -- ../.planning/phases/128-evaluation-and-release-gate/` antes de commitar, se a suíte tiver
  regravado esses arquivos. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisões deste plano

- **O monograma substitui o botão "+":** os quadros aprovados não têm o "+" de nova conversa no trilho. A nova
  conversa paralela continua no painel de conversas (`ConversationList`), que já abre o mesmo diálogo para a marca da
  conversa.
- **Conversa nova para marca importada:** uma marca com Brand Kit ganha uma "Conversa principal" nova, e uma conversa
  antiga do Assistente clássico dessa marca não é adotada. As conversas antigas continuam no banco.
- **Marca nova e marca importada:** a regra é a identidade. Sem logo e sem cores, a marca passa pelo handoff do zero;
  é o caso de "Adicionar marca", que cria só o nome. Com Brand Kit, entra por importação.
- **Link de outra marca:** `?account=` de uma conta de outra marca, num link de aviso ou numa URL compartilhada, troca
  a marca ativa para ela sem sair da tela. O trilho e a tela mostram sempre a mesma marca.
- **Seletor por tela:** o seletor de conta de cada tela (`EquipeAccountSwitcher`) some da casca nova, porque quem
  escolhe é o trilho. Na casca clássica ele continua.

## Fora deste plano

- **A isca opcional "Ler o site e o Instagram", para marcas importadas (spec §3):** ligar a leitura a uma marca sem
  leitura anterior exige uma transição nova no handoff (`done` → `source`) e um caminho de volta. Fica para depois; a
  marca importada entra com a identidade do Brand Kit.
- **A linha de abertura do Estrategista para marca importada:** a conversa começa vazia, com as iscas fixas da tela.
- **A jornada E2E "três marcas, cada uma com sua conversa":** hoje só um workspace pagante tem várias marcas, e ele
  continua na casca clássica até a etapa 3. A jornada vai para o plano da etapa 3. Aqui ela fica coberta por testes
  de módulo e de componente e pela conferência manual da Task 10.
- **Link para uma conversa de outra marca (`/assistant?threadId=…`):** a conversa abre com a conta da marca dela,
  como hoje, mas o trilho continua na marca ativa até a pessoa trocar. Os links de tela com `?account=` já trocam a
  marca (Task 7). Os de conversa ficam para a etapa 3, junto com o endereço das conversas.
- **A virada dos pagantes e a remoção do `classic_paid_access`:** etapa 3.

## Mapa de arquivos

Caminhos relativos a `app/`.

**Criar:**
- `src/lib/brands/active-brand.ts`: o cookie, o tipo `ActiveBrand` e a escolha pura `pickActiveBrand`.
- `src/lib/brands/active-brand.test.ts`.
- `src/server/brands/active-brand.ts`: `resolveActiveBrand`, uma vez por requisição.
- `src/lib/brands/active-brand-context.tsx`: o provider, `useActiveBrand` e `useSwitchActiveBrand`.
- `src/lib/brands/active-brand-context.test.tsx`.
- `src/components/layout/rail/BrandSwitcher.tsx` e `BrandSwitcher.test.tsx`.

**Modificar:**
- **Abertura de conta:**
  - `src/server/equipe/module/envelope.ts`, `module/open-free-account.ts`, `module/threads.ts`;
  - `src/server/equipe/module/ports.ts`, `agents/gateway.ts`, `domain/handoff.ts`;
  - `src/server/equipe/data/repositories.ts`, `data/conversations.ts`, `data/memory.ts`;
  - os testes `module/open-free-account.test.ts` e `module/open-free-account.pg.test.ts`.
- **Guardas de marca:** `src/server/repositories/client-reference.ts` (com `equipe/module/handoff.pg.test.ts`) e
  `src/app/api/client-profiles/route.ts` (com `route.test.ts`).
- **Página inicial, layout e casca:** `src/app/(dashboard)/page.tsx`, `layout.tsx` e os testes deles;
  `src/components/layout/DashboardShellSwitcher.tsx` e `rail/RailShell.tsx`.
- **Trilho:** `rail/Rail.tsx`, `rail/RailHeader.tsx` e os testes deles; `messages/pt-BR.json` e `messages/en.json`.
- **Telas que seguem a marca:**
  - `src/lib/equipe/use-equipe.ts` e o teste;
  - `src/components/equipe/EquipeEmptyScreen.tsx` e o teste;
  - `src/app/(dashboard)/library/page.tsx` e o teste;
  - `src/components/equipe/IdeasView.tsx`, `GoalsView.tsx` e `PipelineView.tsx`.
- **Criações por marca:**
  - `src/server/creative-work/canonical/queries.ts`;
  - `src/server/repositories/campaign.ts` e `src/server/repositories/creative-work.ts`;
  - `src/app/api/creative-work/route.ts` e o teste;
  - `src/lib/hooks/use-canonical-works.ts`;
  - `src/app/(dashboard)/campaigns/page.tsx`.
- **Palco:** `src/components/dashboard/DashboardHomeActions.tsx` e o teste.

## Como rodar

```bash
cd app
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
npm ci
```

Para testar um arquivo: `TZ=UTC npx vitest run --config config/vitest.config.ts <caminho>`. Os `*.pg.test.ts` pedem
`TEST_DATABASE_URL` apontando para um banco próprio terminado em `_test`, já migrado.

---

### Task 0: Branch

- [ ] **Step 1:** Depois que o PR do 2A entrar na `main`:

```bash
git fetch origin
git worktree add ../.worktrees/caminho-unico-etapa-2b -b caminho-unico/etapa-2b origin/main
```

---

### Task 1: Escolher a marca ativa

**Files:**
- Create: `src/lib/brands/active-brand.ts`, `src/lib/brands/active-brand.test.ts`
- Create: `src/server/brands/active-brand.ts`

**Interfaces:**
- Produces:
  - `ACTIVE_BRAND_COOKIE = "adscale_active_brand"`;
  - `type ActiveBrand = { id: string; name: string }`;
  - `pickActiveBrand(brands: Array<{ id: string; name: string; createdAt: Date }>, cookieValue: string | undefined, freePlanBrandId: string | null): ActiveBrand | null`;
  - `writeActiveBrandCookie(clientProfileId: string): void`, que roda só no navegador;
  - `resolveActiveBrand(workspaceId: string): Promise<ActiveBrand | null>`, com cache por requisição.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/brands/active-brand.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { ACTIVE_BRAND_COOKIE, pickActiveBrand, writeActiveBrandCookie } from "./active-brand";

const brand = (id: string, name: string, day: number) => ({ id, name, createdAt: new Date(Date.UTC(2026, 0, day)) });
const CAFE = brand("b-cafe", "Café Aurora", 2);
const LIVRARIA = brand("b-livraria", "Livraria Norte", 1);
const STUDIO = brand("b-studio", "Studio Lume", 3);

describe("pickActiveBrand (spec 2026-10-07 §3)", () => {
  it("is null without brands", () => {
    expect(pickActiveBrand([], "b-cafe", null)).toBeNull();
  });

  it("takes the cookie's brand when it is one of the workspace's", () => {
    expect(pickActiveBrand([CAFE, LIVRARIA, STUDIO], "b-studio", null)).toEqual({ id: "b-studio", name: "Studio Lume" });
  });

  it("falls back to the oldest brand without a cookie or with one from elsewhere", () => {
    expect(pickActiveBrand([CAFE, LIVRARIA, STUDIO], undefined, null)).toEqual({ id: "b-livraria", name: "Livraria Norte" });
    expect(pickActiveBrand([CAFE, LIVRARIA, STUDIO], "b-other-workspace", null)).toEqual({ id: "b-livraria", name: "Livraria Norte" });
  });

  it("keeps the free plan on its account's brand, whatever the cookie says", () => {
    expect(pickActiveBrand([CAFE, LIVRARIA], "b-livraria", "b-cafe")).toEqual({ id: "b-cafe", name: "Café Aurora" });
  });
});

describe("writeActiveBrandCookie", () => {
  afterEach(() => { document.cookie = `${ACTIVE_BRAND_COOKIE}=; path=/; max-age=0`; });

  it("leaves the brand where the next server render reads it", () => {
    writeActiveBrandCookie("b-cafe");
    expect(document.cookie).toContain(`${ACTIVE_BRAND_COOKIE}=b-cafe`);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/lib/brands/active-brand.test.ts`
Expected: FAIL, "Failed to resolve import "./active-brand"".

- [ ] **Step 3: Implementar o módulo puro**

`src/lib/brands/active-brand.ts`:

```ts
/**
 * The active brand of the rail (spec 2026-10-07 §3). It lives in a cookie the server reads, and the server never trusts it
 * without the workspace's own brands.
 */
export const ACTIVE_BRAND_COOKIE = "adscale_active_brand";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type ActiveBrand = { id: string; name: string };
type BrandRow = { id: string; name: string; createdAt: Date };

/**
 * The brand every screen of the rail is about. On the free plan, the brand of its account: the plan has one. Otherwise the
 * cookie's brand when it is one of the workspace's, else the oldest. Null for a workspace with no brand yet.
 */
export function pickActiveBrand(brands: BrandRow[], cookieValue: string | undefined, freePlanBrandId: string | null): ActiveBrand | null {
  const byAge = [...brands].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const chosen = (freePlanBrandId ? byAge.find((brand) => brand.id === freePlanBrandId) : undefined)
    ?? (cookieValue ? byAge.find((brand) => brand.id === cookieValue) : undefined)
    ?? byAge[0];
  return chosen ? { id: chosen.id, name: chosen.name } : null;
}

/** Writes the active brand for the next server render (the rail, `/`, the screens). Browser only. */
export function writeActiveBrandCookie(clientProfileId: string): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${ACTIVE_BRAND_COOKIE}=${encodeURIComponent(clientProfileId)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${secure}`;
}
```

- [ ] **Step 4: Implementar o leitor do servidor**

`src/server/brands/active-brand.ts`:

```ts
import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAccounts } from "@/server/db/equipe-schema";
import { getClientProfiles } from "@/server/repositories/client-reference";
import { findFreePlanAccount } from "@/server/equipe/module/free-plan";
import { ACTIVE_BRAND_COOKIE, pickActiveBrand, type ActiveBrand } from "@/lib/brands/active-brand";

async function freePlanBrandId(workspaceId: string): Promise<string | null> {
  const plan = await findFreePlanAccount(workspaceId);
  if (!plan?.accountId) return null;
  const [row] = await db
    .select({ clientProfileId: equipeAccounts.clientProfileId })
    .from(equipeAccounts)
    .where(eq(equipeAccounts.id, plan.accountId))
    .limit(1);
  return row?.clientProfileId ?? null;
}

async function readActiveBrandCookie(): Promise<string | undefined> {
  try {
    return (await cookies()).get(ACTIVE_BRAND_COOKIE)?.value;
  } catch {
    return undefined; // no request cookie store (a script or a unit caller)
  }
}

/** The active brand (spec 2026-10-07 §3), once per request: the layout and the page ask the same question. */
export const resolveActiveBrand = cache(async (workspaceId: string): Promise<ActiveBrand | null> => {
  const [profiles, cookieValue, lockedBrand] = await Promise.all([
    getClientProfiles(workspaceId),
    readActiveBrandCookie(),
    freePlanBrandId(workspaceId),
  ]);
  return pickActiveBrand(profiles.map(({ id, name, createdAt }) => ({ id, name, createdAt })), cookieValue, lockedBrand);
});
```

- [ ] **Step 5: Rodar e ver passar**

Run: o comando do Step 2.
Expected: PASS. O `tsc` (`npm run typecheck`) passa com o módulo do servidor.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/brands app/src/server/brands
git commit -m "feat(caminho-unico): the active brand, read by the server from a checked cookie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `open_free_account` abre a conta da marca

**Files:**
- Modify:
  - `src/server/equipe/module/envelope.ts:45` (payload);
  - `src/server/equipe/module/ports.ts:12-17` (`AdscaleClientProfileRef`);
  - `src/server/equipe/agents/gateway.ts:38` (`getClientProfile`);
  - `src/server/equipe/domain/handoff.ts` (`HandoffDecisions.imported` e a ação `import` de `transitionHandoff`);
  - `src/server/equipe/data/repositories.ts:93` (`createPrimary`);
  - `src/server/equipe/data/conversations.ts` e `src/server/equipe/data/memory.ts` (`createPrimary`);
  - `src/server/equipe/module/threads.ts` (`ensurePrimaryThreadInTx` com `fresh`);
  - `src/server/equipe/module/open-free-account.ts` (arquivo inteiro).
- Test: `domain/handoff.test.ts`, `module/open-free-account.test.ts` (um `describe` novo em cada) e
  `module/open-free-account.pg.test.ts` (um teste novo)

**Interfaces:**
- Consumes: `freePlanLimitsApply` e `FreePlanReaders` de `module/free-plan.ts` (2A).
- Produces:
  - payload `{ userId: string; clientProfileId?: string }`;
  - `BRAND_IMPORTED_EVENT = "account.brand_imported"`;
  - `hasBrandIdentity(profile)` e `importedIdentity(profile)`;
  - a ação `"import"` de `transitionHandoff`, que leva um handoff novo com identidade direto para `done`;
  - `ensurePrimaryThreadInTx(ctx, assistantThreadId?, options?: { fresh?: boolean })`;
  - `EquipeConversationRepository.createPrimary(workspaceId, clientProfileId)`;
  - o resultado do comando com `data: { accountId, threadId, assistantThreadId, created, imported? }`.

- [ ] **Step 1: Escrever os testes que falham**

Só a máquina do domínio escreve o `step` do handoff (comentário em `db/equipe-schema.ts:179`). Por isso a importação
entra como uma ação de `transitionHandoff`. Em `domain/handoff.test.ts`, acrescente no fim (o arquivo já tem o helper
`state(overrides)`):

```ts
describe("transitionHandoff: import (spec 2026-10-07 §3)", () => {
  const identity = { name: { id: "n", value: "CENBRAP", origin: "user" as const }, logo: null, colors: [], fonts: [], paletteChoice: "user" as const };

  it("takes a new handoff that already has an identity (the Brand Kit) straight to done", () => {
    const result = transitionHandoff(state({ step: "source", version: 1, decisions: { identity } }), "import");
    expect(result).toMatchObject({ ok: true, value: { step: "done", version: 2 } });
  });

  it("refuses without an identity, after a reading or once the handoff has moved", () => {
    expect(transitionHandoff(state({ step: "source", version: 1 }), "import").ok).toBe(false);
    expect(transitionHandoff(state({ step: "source", version: 1, readingId: "r1", decisions: { identity } }), "import").ok).toBe(false);
    expect(transitionHandoff(state({ step: "reading", version: 2, decisions: { identity } }), "import").ok).toBe(false);
  });
});
```

Em `module/open-free-account.test.ts`, acrescente no fim:

```ts
describe("open_free_account for a brand (spec 2026-10-07 §3)", () => {
  const openBrand = (t: ReturnType<typeof makeTestDeps>, workspaceId: string, userId: string, clientProfileId: string) =>
    executeCommand(t.deps, { actor: SYSTEM, workspaceId }, { type: "open_free_account", payload: { userId, clientProfileId } });

  it("enters a brand with a Brand Kit directly: identity confirmed by import, a new conversation, no opening line", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const brand = uuid();
    t.gateway.addProfile({ id: brand, workspaceId, name: "CENBRAP", logoAssetKey: "logos/cenbrap.png", brandColors: ["#123456"], brandFonts: ["Inter"] });
    t.store.assistantThreads.rows.set("old-classic", { id: "old-classic", workspaceId, clientProfileId: brand, campaignId: null });

    const opened = await openBrand(t, workspaceId, userId, brand);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.data).toMatchObject({ created: true, imported: true });
    const scope = { workspaceId, accountId: opened.value.accountId! };
    expect(await t.deps.uow.repos.accounts.get(workspaceId, scope.accountId)).toMatchObject({ clientProfileId: brand, status: "free" });
    const [handoff] = await t.deps.uow.repos.handoffs.list(scope);
    expect(handoff).toMatchObject({ step: "done", readingId: null });
    expect(handoff!.decisions).toMatchObject({
      imported: true,
      identity: { name: { value: "CENBRAP", origin: "user" }, logo: { key: "logos/cenbrap.png" }, colors: [{ value: "#123456" }], fonts: [{ value: "Inter" }] },
    });
    expect(opened.value.data).not.toMatchObject({ assistantThreadId: "old-classic" });
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "account.brand_imported" })).toHaveLength(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: FREE_INTRO_EVENT })).toHaveLength(0);
    expect(t.store.assistantMessages.rows.size).toBe(0); // no opening line and no handoff card: the conversation starts empty
  });

  it("sends a brand without an identity (a new one) through the handoff from the start", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const brand = uuid();
    t.gateway.addProfile({ id: brand, workspaceId, name: "Nova marca" });
    const opened = await openBrand(t, workspaceId, userId, brand);
    if (!opened.ok) throw new Error(opened.error.code);
    const scope = { workspaceId, accountId: opened.value.accountId! };
    expect(await t.deps.uow.repos.handoffs.list(scope)).toEqual([expect.objectContaining({ step: "source", clientProfileId: brand })]);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: FREE_INTRO_EVENT })).toHaveLength(1);
    expect(t.store.adscaleProfiles.rows.size).toBe(0); // no "Minha marca" was created
  });

  it("gives each brand its own account and returns it on the next visit", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const [a, b] = [uuid(), uuid()];
    t.gateway.addProfile({ id: a, workspaceId, name: "A", brandColors: ["#111111"] });
    t.gateway.addProfile({ id: b, workspaceId, name: "B", brandColors: ["#222222"] });
    // The first brand opens before the workspace pays (a classic payer with no live account stays classic); once it
    // pays, a second brand may open.
    const first = await openBrand(t, workspaceId, userId, a);
    t.deps.hasClassicPaidAccess = async () => true;
    const second = await openBrand(t, workspaceId, userId, b);
    const again = await openBrand(t, workspaceId, userId, a);
    if (!first.ok || !second.ok || !again.ok) throw new Error("open failed");
    expect(second.value.accountId).not.toBe(first.value.accountId);
    expect(again.value.accountId).toBe(first.value.accountId);
    expect(again.value.data).toMatchObject({ created: false });
  });

  it("keeps the free plan on one brand: another one asks for the plan", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const [a, b] = [uuid(), uuid()];
    t.gateway.addProfile({ id: a, workspaceId, name: "A" });
    t.gateway.addProfile({ id: b, workspaceId, name: "B" });
    expect((await openBrand(t, workspaceId, userId, a)).ok).toBe(true);
    const refused = await openBrand(t, workspaceId, userId, b);
    expect(!refused.ok && refused.error.code).toBe("requires_plan");
  });

  it("refuses a brand of another workspace", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const foreign = uuid();
    t.gateway.addProfile({ id: foreign, workspaceId: uuid(), name: "Outra" });
    const refused = await openBrand(t, workspaceId, userId, foreign);
    expect(!refused.ok && refused.error.code).toBe("unknown_client_profile");
  });
});
```

Em `module/open-free-account.pg.test.ts`, dentro do `describe.skipIf(!ENABLED)`, acrescente:

```ts
  it("two simultaneous openings of the SAME brand (two pools) create exactly ONE account for it (spec 2026-10-07 §3)", async () => {
    const { workspaceId, userId } = await seed();
    const [profile] = await A.db.insert(m.schema.clientProfiles).values({ workspaceId, name: "Marca real", brandColors: ["#123456"] }).returning();
    const gateway = new (await import("./testing/fakes")).FakeAdscaleGateway();
    gateway.addProfile({ id: profile!.id, workspaceId, name: "Marca real", brandColors: ["#123456"] });
    // Warm both pools first: a cold pool lets the first transaction finish before the second connection opens.
    await Promise.all([...Array.from({ length: 4 }, () => A.db.execute(sql`select pg_sleep(0.05)`)), ...Array.from({ length: 4 }, () => B.db.execute(sql`select pg_sleep(0.05)`))]);
    const openBrand = (h: typeof A) => m.commands.executeCommand(m.free.depsFor(h, undefined, { gateway }), { actor: SYSTEM, workspaceId },
      { type: "open_free_account", payload: { userId, clientProfileId: profile!.id } });
    const outcomes = await Promise.all([openBrand(A), openBrand(B)]);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    const rows = await A.db.select().from(m.equipeSchema.equipeAccounts).where(eq(m.equipeSchema.equipeAccounts.workspaceId, workspaceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientProfileId: profile!.id });
  });
```

Prove que esse teste tem dentes. Num banco local, comente temporariamente o `lockWorkspace` em `open-free-account.ts`
e rode o teste três vezes: ele precisa falhar em pelo menos uma. Depois restaure o arquivo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/module/open-free-account.test.ts`
Expected: FAIL. O payload com `clientProfileId` é recusado pelo `.strict()` do schema.

- [ ] **Step 3: Contrato e identidade da marca**

`module/envelope.ts:45`: troque a linha por:

```ts
export const openFreeAccountPayloadSchema = z.object({ userId: z.string().min(1).max(200), clientProfileId: uuid.optional() }).strict();
```

`module/ports.ts`: em `AdscaleClientProfileRef`, depois de `name?: string | null;`, acrescente:

```ts
  /** The brand's identity as its Brand Kit holds it (spec 2026-10-07 §3); absent in old fakes. */
  logoAssetKey?: string | null;
  brandColors?: string[];
  brandFonts?: string[];
```

`agents/gateway.ts:38`: troque o `return` por:

```ts
    return {
      id: profile.id, workspaceId: profile.workspaceId, name: profile.name,
      logoAssetKey: profile.logoAssetKey ?? null, brandColors: strings(profile.brandColors), brandFonts: strings(profile.brandFonts),
    };
```

As colunas `brand_colors` e `brand_fonts` são `jsonb` sem tipo, e o Brand Kit grava nelas listas de texto
(`repositories/brand-kit.ts`). Acima da classe, acrescente:

```ts
/** The Brand Kit's colors and fonts are untyped jsonb holding lists of text; anything else counts as none. */
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "") : [];
```

`domain/handoff.ts`:
- em `HandoffDecisions`, depois de `revising?: boolean;`, acrescente:

```ts
  /** Spec 2026-10-07 §3: the identity came from the brand's Brand Kit when its account opened; there was no reading. */
  imported?: true;
```

- na assinatura de `transitionHandoff`, acrescente `| "import"` à união de `action`;
- no `switch`, antes de `case "back":`, acrescente:

```ts
    // Spec 2026-10-07 §3: a brand whose Brand Kit already holds its identity enters the conversation without a reading.
    case "import":
      if (s.step !== "source" || s.source || s.readingId || !s.decisions.identity) return err("invalid_transition", "Only a new handoff with an identity can be imported.");
      step = "done"; break;
```

- [ ] **Step 4: Conversa principal nova**

`data/repositories.ts`, logo depois de `ensurePrimary(workspaceId: string, clientProfileId: string): Promise<ConversationThread>;`:

```ts
  /** A new main conversation for the brand, never an older thread of it (spec 2026-10-07 §3: an imported brand starts afresh). */
  createPrimary(workspaceId: string, clientProfileId: string): Promise<ConversationThread>;
```

`data/conversations.ts`, depois do método `ensurePrimary`:

```ts
    async createPrimary(workspaceId, clientProfileId) {
      const [created] = await executor.insert(assistantThreads).values({
        workspaceId, clientProfileId, name: "Conversa principal", isDefault: true,
      }).returning();
      return created;
    },
```

`data/memory.ts`, depois do `ensurePrimary` do repositório de conversas:

```ts
      async createPrimary(workspaceId, clientProfileId) {
        const row = { id: crypto.randomUUID(), workspaceId, clientProfileId, campaignId: null };
        store.assistantThreads.rows.set(row.id, row);
        return { ...row };
      },
```

Rode `grep -rn "ensurePrimary(" src/server/equipe --include='*.ts' | grep -v test`. Se aparecer outra implementação de
`EquipeConversationRepository`, acrescente o mesmo `createPrimary` nela.

`module/threads.ts`: troque a assinatura e a escolha da conversa de `ensurePrimaryThreadInTx`:

```ts
export async function ensurePrimaryThreadInTx(
  ctx: CommandContext,
  assistantThreadId?: string,
  options: { fresh?: boolean } = {},
): Promise<Result<Record<string, unknown>>> {
```

e:

```ts
  const thread = targetId
    ? await ctx.repos.conversations.get(ctx.workspaceId, targetId)
    : options.fresh
      ? await ctx.repos.conversations.createPrimary(ctx.workspaceId, account.clientProfileId)
      : await ctx.repos.conversations.ensurePrimary(ctx.workspaceId, account.clientProfileId);
```

- [ ] **Step 5: O comando**

Substitua o conteúdo inteiro de `module/open-free-account.ts` por:

```ts
import { z } from "zod";
import { err, ok } from "../domain";
import { transitionHandoff, type HandoffDecisions, type HandoffItem } from "../domain/handoff";
import type { AdscaleClientProfileRef, EquipeModuleDeps } from "./ports";
import { openFreeAccountPayloadSchema } from "./envelope";
import { freePlanLimitsApply, type FreePlanReaders } from "./free-plan";
import { appendEvent, scopeOf, transact, type TxBase } from "./shared";
import { ensurePrimaryThreadInTx } from "./threads";
import { FREE_INTRO_EVENT } from "../handoff/contract";

export const BRAND_IMPORTED_EVENT = "account.brand_imported";

/** A brand that already has an identity (its Brand Kit) enters the conversation without the handoff (spec 2026-10-07 §3). */
export function hasBrandIdentity(profile: AdscaleClientProfileRef): boolean {
  return Boolean(profile.logoAssetKey) || (profile.brandColors?.length ?? 0) > 0;
}

/** That identity as the handoff's confirmed decision: origin `user`, since the person entered it in the Brand Kit. */
export function importedIdentity(profile: AdscaleClientProfileRef): NonNullable<HandoffDecisions["identity"]> {
  const item = (value: string, key?: string): HandoffItem => ({ id: crypto.randomUUID(), value, origin: "user", ...(key ? { key } : {}) });
  const name = profile.name?.trim() || "Minha marca";
  return {
    name: item(name),
    logo: profile.logoAssetKey ? item(name, profile.logoAssetKey) : null,
    colors: (profile.brandColors ?? []).map((color) => item(color)),
    fonts: (profile.brandFonts ?? []).map((font) => item(font)),
    paletteChoice: "user",
  };
}

export async function runOpenFreeAccount(
  deps: EquipeModuleDeps, base: TxBase, payload: z.infer<typeof openFreeAccountPayloadSchema>,
) {
  // The brand is read through the gateway BEFORE the transaction (no external I/O inside), as open_account does.
  const profile = payload.clientProfileId ? await deps.gateway.getClientProfile(base.workspaceId, payload.clientProfileId) : null;
  if (payload.clientProfileId && (!profile || profile.workspaceId !== base.workspaceId)) {
    return err("unknown_client_profile", `unknown client profile ${payload.clientProfileId}`);
  }
  return transact(deps, base, async (ctx) => {
    await ctx.internal.lockWorkspace(ctx.workspaceId);
    const member = await ctx.internal.getVerifiedWorkspaceMember(ctx.workspaceId, payload.userId);
    if (!member) return err("forbidden_actor", "Opening requires a verified workspace member.");
    // Match the client account order; free→paid conversion keeps the entry account.
    const accounts = [...(await ctx.repos.accounts.list(ctx.workspaceId))].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    // A classic paying customer with no live account (none, or only closed ones) keeps the classic product (ticket 11,
    // part 2): no free account is opened for it and a closed one is not handed back, so opening the home never turns a
    // paid workspace into the free plan (the same test as `usesEquipeProduct`).
    const live = accounts.some((account) => account.status !== "closed");
    if (!live && await deps.hasClassicPaidAccess?.(ctx.workspaceId)) {
      return err("classic_paid_access", "This workspace pays for the classic product: no free account is opened.");
    }
    // Spec 2026-10-07 §3: one account per brand, opened the first time the brand is. Without a brand (a workspace that has
    // none yet), the oldest account, as before.
    const existing = profile ? accounts.find((account) => account.clientProfileId === profile.id) : accounts[0];
    if (existing) {
      ctx.accountId = existing.id;
      const thread = await ensurePrimaryThreadInTx(ctx);
      return thread.ok ? ok({ accountId: existing.id, ...thread.value, created: false }) : thread;
    }
    if (profile && live) {
      // The free plan has one brand: another one opens only for a workspace that pays.
      const readers: FreePlanReaders = { readAccounts: async () => accounts, hasActivePaidAccess: deps.hasClassicPaidAccess ?? (async () => false) };
      if (await freePlanLimitsApply({ status: "free" }, ctx.workspaceId, readers)) return err("requires_plan", "The free plan has one brand.");
    }
    const owner = await ctx.internal.getVerifiedWorkspaceOwner(ctx.workspaceId);
    if (!owner) return err("forbidden_actor", "Peça ao dono deste workspace para abrir o ADScale primeiro");
    const clientProfileId = profile?.id ?? (await ctx.internal.createClientProfile(ctx.workspaceId, "Minha marca")).id;
    const account = await ctx.repos.accounts.create(ctx.workspaceId, { clientProfileId, status: "free" });
    ctx.accountId = account.id;
    const scope = scopeOf(ctx);
    await ctx.repos.people.create(scope, { ...owner, role: "approver" });
    if (payload.userId !== owner.userId) {
      await ctx.repos.people.create(scope, { userId: payload.userId, role: "member", name: member.name, email: member.email });
    }
    const handoff = await ctx.repos.handoffs.create(scope, { clientProfileId });
    if (profile && hasBrandIdentity(profile)) {
      // A brand with a Brand Kit enters the conversation directly: its identity is the confirmed decision, and its main
      // conversation starts new (an old classic thread of the brand is not taken over).
      const imported = transitionHandoff({ ...handoff, decisions: { identity: importedIdentity(profile), imported: true } }, "import");
      if (!imported.ok) return imported;
      const { step, version, decisions } = imported.value;
      await ctx.repos.handoffs.update(scope, handoff.id, { step, version, decisions });
      const thread = await ensurePrimaryThreadInTx(ctx, undefined, { fresh: true });
      if (!thread.ok) return thread;
      await appendEvent(ctx, { eventType: BRAND_IMPORTED_EVENT, objectType: "account", objectId: account.id, payload: { clientProfileId } });
      return ok({ accountId: account.id, ...thread.value, created: true, imported: true });
    }
    const thread = await ensurePrimaryThreadInTx(ctx);
    if (!thread.ok) return thread;
    // The opening line goes first: the conversation reads "Oi! Sou o Estrategista…" and then the first card.
    await appendEvent(ctx, { eventType: FREE_INTRO_EVENT, objectType: "account", objectId: account.id, payload: {} });
    await appendEvent(ctx, { eventType: "account.free_opened", objectType: "account", objectId: account.id,
      payload: { clientProfileId } });
    return ok({ accountId: account.id, ...thread.value, created: true });
  });
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/domain src/server/equipe/module src/server/equipe/agents/gateway`
Expected: PASS. Os testes antigos de `open_free_account` sem marca continuam iguais. Rode também o `.pg.test.ts` com
`TEST_DATABASE_URL`.

- [ ] **Step 7: Commit**

```bash
git add app/src/server/equipe
git commit -m "feat(caminho-unico): each brand opens its own account; a Brand Kit brand enters by import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Guardas de marca

**Files:**
- Modify: `src/server/repositories/client-reference.ts` (`deleteEmptyClientProfile`)
- Modify: `src/app/api/client-profiles/route.ts` (`POST`)
- Test: `src/server/equipe/module/handoff.pg.test.ts`, onde já estão os testes de `deleteEmptyClientProfile` com banco
  real, e `src/app/api/client-profiles/route.test.ts`

**Interfaces:**
- Consumes: `refuseOnFreePlan(workspaceId)` de `@/server/billing/paywall`, que devolve `NextResponse | null`.
- Produces: `deleteEmptyClientProfile` responde `in_use` para uma marca com conta.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/server/equipe/module/handoff.pg.test.ts`, dentro do `describe.skipIf(!ENABLED)`, perto dos outros testes de
`deleteEmptyClientProfile`, acrescente. O `setup()` do arquivo abre uma conta grátis, e a marca dela não tem nada na
Biblioteca:

```ts
  it("spec 2026-10-07 §3 (real PG): a brand with an account is never deleted — the cascade would take its account, handoff and documents away", async () => {
    const f = await setup();
    const [handoff] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    const { deleteEmptyClientProfile, getClientProfile } = await import("@/server/repositories/client-reference");

    expect(await deleteEmptyClientProfile(f.workspaceId, handoff!.clientProfileId)).toEqual({ status: "in_use" });
    expect(await getClientProfile(f.workspaceId, handoff!.clientProfileId)).not.toBeNull();
  });
```

Hoje esse caso devolve `deleted` e leva a conta junto pela cascata. É isso que faz o teste falhar.

Em `src/app/api/client-profiles/route.test.ts`, acrescente junto dos outros mocks:

```ts
vi.mock("@/server/billing/paywall", () => ({ refuseOnFreePlan: vi.fn(async () => null) }));
```

e o import `import { refuseOnFreePlan } from "@/server/billing/paywall";`. Depois, no `describe` do `POST`, este teste:

```ts
  it("refuses a new brand on the free plan: it has one (spec 2026-10-07 §3)", async () => {
    vi.mocked(refuseOnFreePlan).mockResolvedValueOnce(NextResponse.json({ error: "free_plan" }, { status: 402 }));
    const res = await POST(requestWith({ name: "Outra" }));
    expect(res.status).toBe(402);
    expect(mockCreateClientProfile).not.toHaveBeenCalled();
  });
```

Importe `NextResponse` de `next/server` se o arquivo ainda não importa. `requestWith` e `mockCreateClientProfile` já
existem no arquivo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/app/api/client-profiles/route.test.ts` e
`src/server/equipe/module/handoff.pg.test.ts -t "never deleted"` com `TEST_DATABASE_URL`.
Expected: FAIL nos dois testes novos.

- [ ] **Step 3: Implementar**

Em `client-reference.ts`:
- importe `equipeAccounts` de `../db/equipe-schema`;
- nas condições do `delete` de `deleteEmptyClientProfile`, depois da linha de `workspaceAssets`, acrescente:

```ts
      // Spec 2026-10-07 §3: a brand with an account stays; its account, handoff and documents would cascade away.
      sql`not exists (select 1 from ${equipeAccounts} where ${equipeAccounts.clientProfileId} = ${clientProfiles.id})`,
```

Em `src/app/api/client-profiles/route.ts`:
- importe `import { refuseOnFreePlan } from "@/server/billing/paywall";`;
- no `POST`, logo depois de `const { workspace } = await requireWorkspaceAccess(request);`, acrescente:

```ts
    // Spec 2026-10-07 §3: the free plan has one brand; another one is part of the plan.
    const freePlanRefusal = await refuseOnFreePlan(workspace.id);
    if (freePlanRefusal) return freePlanRefusal;
```

- [ ] **Step 4: Rodar e ver passar**

Run: os comandos do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/repositories/client-reference.ts app/src/server/equipe/module/handoff.pg.test.ts app/src/app/api/client-profiles
git commit -m "feat(caminho-unico): a brand with an account is never deleted; the free plan adds no brand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Provider da marca ativa

**Files:**
- Create: `src/lib/brands/active-brand-context.tsx`, `src/lib/brands/active-brand-context.test.tsx`

**Interfaces:**
- Consumes: `writeActiveBrandCookie` e `ActiveBrand` (Task 1); `useAppStore` (`activeClientProfileId`,
  `setActiveClientProfileId`); o `QueryClientProvider` do app (`components/providers/QueryProvider.tsx`).
- Produces:
  - `ActiveBrandProvider({ brand, children })`;
  - `useActiveBrand(): ActiveBrand | null | undefined`, que devolve `undefined` fora da casca nova;
  - `useSwitchActiveBrand(): (clientProfileId: string, options?: { stay?: boolean }) => void`.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/brands/active-brand-context.test.tsx`:

```tsx
import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { useAppStore } from "@/lib/store";
import { ACTIVE_BRAND_COOKIE } from "./active-brand";
import { ActiveBrandProvider, useActiveBrand, useSwitchActiveBrand } from "./active-brand-context";

const CAFE = { id: "b-cafe", name: "Café Aurora" };
const LIVRARIA = { id: "b-livraria", name: "Livraria Norte" };
const wrapper = (brand: typeof CAFE | null, client = new QueryClient()) => function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}><ActiveBrandProvider brand={brand}>{children}</ActiveBrandProvider></QueryClientProvider>;
};

describe("active brand context (spec 2026-10-07 §3)", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    window.history.replaceState(null, "", "/library");
    useAppStore.setState({ activeClientProfileId: null });
  });

  it("is undefined outside the rail shell, so the classic screens keep their own choice", () => {
    expect(renderHook(() => useActiveBrand()).result.current).toBeUndefined();
  });

  it("gives the rail's brand and puts the composer's store on it", () => {
    const { result } = renderHook(() => useActiveBrand(), { wrapper: wrapper(CAFE) });
    expect(result.current).toEqual(CAFE);
    expect(useAppStore.getState().activeClientProfileId).toBe("b-cafe");
  });

  it("switching writes the cookie, moves the store and opens the brand's conversation", () => {
    const { result } = renderHook(() => useSwitchActiveBrand(), { wrapper: wrapper(CAFE) });
    act(() => result.current("b-livraria"));
    expect(document.cookie).toContain(`${ACTIVE_BRAND_COOKIE}=b-livraria`);
    expect(useAppStore.getState().activeClientProfileId).toBe("b-livraria");
    expect(push).toHaveBeenCalledWith("/");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("on the conversation itself, renders it again for the other brand", () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useSwitchActiveBrand(), { wrapper: wrapper(CAFE) });
    act(() => result.current("b-livraria"));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("can switch without leaving the screen (a link to another brand's account)", () => {
    const { result } = renderHook(() => useSwitchActiveBrand(), { wrapper: wrapper(CAFE) });
    act(() => result.current("b-studio", { stay: true }));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reads the account list again once the rail shows another brand: the server may have just opened its account", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const view = render(<div>conteúdo</div>, { wrapper: wrapper(CAFE, client) });
    expect(invalidate).not.toHaveBeenCalled();
    view.rerender(<QueryClientProvider client={client}><ActiveBrandProvider brand={LIVRARIA}><div>conteúdo</div></ActiveBrandProvider></QueryClientProvider>);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["equipe"] });
    expect(view.getByText("conteúdo")).toBeInTheDocument();
  });
});
```

O teste do `rerender` passa o provider por fora do `wrapper` de propósito: o `wrapper` de `render` não muda com
`rerender`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/lib/brands/active-brand-context.test.tsx`
Expected: FAIL, porque o módulo não existe.

- [ ] **Step 3: Implementar**

`src/lib/brands/active-brand-context.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { writeActiveBrandCookie, type ActiveBrand } from "./active-brand";

/** Undefined outside the rail shell: the classic shell has no active brand of its own (it keeps the composer's switcher). */
const ActiveBrandContext = createContext<ActiveBrand | null | undefined>(undefined);

export function ActiveBrandProvider({ brand, children }: { brand: ActiveBrand | null; children: ReactNode }) {
  const selected = useAppStore((state) => state.activeClientProfileId);
  const select = useAppStore((state) => state.setActiveClientProfileId);
  const queryClient = useQueryClient();
  const shown = useRef(brand?.id);
  // The composer and the classic screens read the store: they follow the brand the server rendered.
  useEffect(() => {
    if (brand && selected !== brand.id) select(brand.id);
  }, [brand, selected, select]);
  // The server opens a brand's account on its first visit. Once the rail shows another brand, the cached account list
  // (kept for a minute) is read again, so the screens find that account.
  useEffect(() => {
    if (shown.current === brand?.id) return;
    shown.current = brand?.id;
    void queryClient.invalidateQueries({ queryKey: ["equipe"] });
  }, [brand?.id, queryClient]);
  return <ActiveBrandContext.Provider value={brand}>{children}</ActiveBrandContext.Provider>;
}

/** The rail's brand (spec 2026-10-07 §3): null for a workspace with no brand yet, undefined outside the rail shell. */
export function useActiveBrand(): ActiveBrand | null | undefined {
  return useContext(ActiveBrandContext);
}

/**
 * Switches the active brand: the cookie for the server, the store for the composer, then the brand's own conversation.
 * The same screen is rendered again instead when the person is already on the conversation, or when a link to another
 * brand's account brought them where they are.
 */
export function useSwitchActiveBrand(): (clientProfileId: string, options?: { stay?: boolean }) => void {
  const router = useRouter();
  const select = useAppStore((state) => state.setActiveClientProfileId);
  return useCallback((clientProfileId: string, options?: { stay?: boolean }) => {
    writeActiveBrandCookie(clientProfileId);
    select(clientProfileId);
    // Read at the click, not through usePathname: this hook runs inside every screen's account selection, and their
    // tests mock next/navigation with the router alone.
    if (options?.stay || window.location.pathname === "/") router.refresh();
    else router.push("/");
  }, [router, select]);
}
```

`router.push("/")` pede ao servidor uma página nova, porque `/` lê cookies e é dinâmica. Isso já abre a conta da marca
nova. Por isso a lista de contas só é lida de novo quando o provider recebe a marca nova, e não no clique.

- [ ] **Step 4: Rodar e ver passar**

Run: o comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/brands/active-brand-context.tsx app/src/lib/brands/active-brand-context.test.tsx
git commit -m "feat(caminho-unico): active brand provider and switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `/` e o layout usam a marca ativa

**Files:**
- Modify:
  - `src/app/(dashboard)/page.tsx` (o ramo da conversa);
  - `src/app/(dashboard)/layout.tsx`;
  - `src/components/layout/DashboardShellSwitcher.tsx`;
  - `src/components/layout/rail/RailShell.tsx`.
- Test: `src/app/(dashboard)/page.test.tsx` e `src/app/(dashboard)/layout.test.tsx`

**Interfaces:**
- Consumes:
  - `resolveActiveBrand` (Task 1);
  - `ActiveBrandProvider` (Task 4).
- Produces:
  - `DashboardShellSwitcher` recebe `activeBrand?: ActiveBrand | null`;
  - `RailShell` recebe `activeBrand: ActiveBrand | null`.

- [ ] **Step 1: Escrever os testes que falham**

Em `page.test.tsx`:
- acrescente, junto dos outros mocks:

```ts
const BRAND_ID = "ff333333-3333-4333-8333-333333333333";
const mockResolveActiveBrand = vi.fn(async (): Promise<{ id: string; name: string } | null> => ({ id: BRAND_ID, name: "CENBRAP" }));
vi.mock("@/server/brands/active-brand", () => ({ resolveActiveBrand: () => mockResolveActiveBrand() }));
```

- no `describe("DashboardPage home conversation gate")`, acrescente:

```ts
  it("opens the active brand's account (spec 2026-10-07 §3)", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    await renderDashboardPage();
    const [, , command] = mockExecuteCommand.mock.calls[0];
    expect(command).toMatchObject({ type: "open_free_account", payload: { userId: "user-1", clientProfileId: BRAND_ID } });
  });

  it("sends no brand for a workspace that has none yet: the opening creates it", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    mockResolveActiveBrand.mockResolvedValueOnce(null);
    await renderDashboardPage();
    const [, , command] = mockExecuteCommand.mock.calls[0];
    expect(command).toEqual({ type: "open_free_account", payload: { userId: "user-1" } });
  });
```

Em `layout.test.tsx`:
- troque o mock de `DashboardShellSwitcher` por:

```tsx
vi.mock("@/components/layout/DashboardShellSwitcher", () => ({
  default: ({ children, homeConversationEnabled, activeBrand }: { children: ReactNode; homeConversationEnabled?: boolean; activeBrand?: { id: string } | null }) => (
    <main data-home-conversation-enabled={String(!!homeConversationEnabled)} data-active-brand={activeBrand?.id ?? ""}>{children}</main>
  ),
}));
vi.mock("@/server/brands/active-brand", () => ({ resolveActiveBrand: vi.fn(async () => ({ id: "brand-1", name: "Café Aurora" })) }));
```

- no teste "passes the workspace gate through to the shell switcher when signed in", acrescente no fim:

```tsx
    expect(screen.getByText("Dashboard content").closest("main")).toHaveAttribute("data-active-brand", "brand-1");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts "src/app/(dashboard)/page.test.tsx" "src/app/(dashboard)/layout.test.tsx"`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

`page.tsx`:
- importe `import { resolveActiveBrand } from "@/server/brands/active-brand";`;
- dentro do `if (await usesEquipeProduct(workspace.id)) {`, logo antes de `const opened = await executeCommand(`,
  acrescente `const activeBrand = await resolveActiveBrand(workspace.id);`;
- troque o payload do comando `{ type: "open_free_account", payload: { userId: user.id } }` por:

```ts
      { type: "open_free_account", payload: { userId: user.id, ...(activeBrand ? { clientProfileId: activeBrand.id } : {}) } },
```

`layout.tsx`:
- importe `import { resolveActiveBrand } from "@/server/brands/active-brand";` e
  `import type { ActiveBrand } from "@/lib/brands/active-brand";`;
- declare `let activeBrand: ActiveBrand | null = null;` ao lado de `let homeConversationEnabled = false;`;
- no `try`, logo depois de `homeConversationEnabled = await usesEquipeProduct(workspace.id);`, acrescente:

```ts
      // Spec 2026-10-07 §3: the rail's brand, read once per request (the page asks the same).
      if (homeConversationEnabled) activeBrand = await resolveActiveBrand(workspace.id);
```

- passe `activeBrand={activeBrand}` ao `<DashboardShellSwitcher>`.

`DashboardShellSwitcher.tsx`:
- acrescente a prop `activeBrand = null` (tipo `ActiveBrand | null`, importado de `@/lib/brands/active-brand`);
- troque `if (homeConversationEnabled) return <RailShell>{children}</RailShell>;` por
  `if (homeConversationEnabled) return <RailShell activeBrand={activeBrand}>{children}</RailShell>;`.

`RailShell.tsx`:
- acrescente a prop `activeBrand: ActiveBrand | null`;
- importe `ActiveBrandProvider` de `@/lib/brands/active-brand-context` (Task 4);
- envolva o `<RailSearchProvider>` inteiro com `<ActiveBrandProvider brand={activeBrand}>…</ActiveBrandProvider>`.

- [ ] **Step 4: Rodar e ver passar**

Run: o comando do Step 2 e também `TZ=UTC npx vitest run --config config/vitest.config.ts src/components/layout`.
Expected: PASS. Se algum teste renderiza `RailShell` sem a prop, passe `activeBrand={null}` nele.

- [ ] **Step 5: Commit**

```bash
git add "app/src/app/(dashboard)/page.tsx" "app/src/app/(dashboard)/page.test.tsx" "app/src/app/(dashboard)/layout.tsx" "app/src/app/(dashboard)/layout.test.tsx" app/src/components/layout/DashboardShellSwitcher.tsx app/src/components/layout/rail/RailShell.tsx
git commit -m "feat(caminho-unico): the home and the rail shell follow the active brand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: O seletor de marca no trilho (quadros c8 e c8b)

**Files:**
- Create: `src/components/layout/rail/BrandSwitcher.tsx`, `BrandSwitcher.test.tsx`
- Modify:
  - `src/components/layout/rail/Rail.tsx`: o seletor entra no lugar do "+", e o diálogo sai;
  - `src/components/layout/rail/Rail.test.tsx`;
  - `src/components/layout/rail/RailHeader.tsx`: o seletor no celular;
  - `messages/pt-BR.json` e `messages/en.json` (`navigation.rail`).

**Interfaces:**
- Consumes:
  - `useActiveBrand` e `useSwitchActiveBrand` (Task 4);
  - `useClientProfiles()` de `@/lib/hooks/use-client-profiles`, que devolve `data: Array<{ id; name }>`;
  - `useFreePlanAccount()`;
  - `FreePlanCta` com `variant="stage"`;
  - `AssistantCreateClientDialog({ open, onOpenChange, onSuccess(clientId) })`.
- Produces: `BrandSwitcher({ className? })` e `brandMonogram(name: string): string`.

- [ ] **Step 1: Mensagens**

Em `messages/pt-BR.json`, dentro de `navigation.rail`, acrescente:

```json
    "brandSwitcher": "Marca ativa: {name}. Trocar marca",
    "switchBrand": "Trocar marca",
    "activeBrand": "Marca ativa",
    "addBrand": "Adicionar marca",
    "addBrandLocked": "Outras marcas fazem parte do plano.",
    "seePlanCard": "Ver card do plano"
```

Em `messages/en.json`, no mesmo lugar:

```json
    "brandSwitcher": "Active brand: {name}. Switch brand",
    "switchBrand": "Switch brand",
    "activeBrand": "Active brand",
    "addBrand": "Add brand",
    "addBrandLocked": "Other brands are part of the plan.",
    "seePlanCard": "See the plan card"
```

- [ ] **Step 2: Escrever o teste que falha**

`src/components/layout/rail/BrandSwitcher.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";

const switchBrand = vi.fn();
let brand: { id: string; name: string } | null | undefined;
vi.mock("@/lib/brands/active-brand-context", () => ({
  useActiveBrand: () => brand,
  useSwitchActiveBrand: () => switchBrand,
}));
let freePlan: { accountId: string | null } | null | undefined;
vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => freePlan }));
vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => ({ data: [{ id: "b-cafe", name: "Café Aurora" }, { id: "b-livraria", name: "Livraria Norte" }, { id: "b-studio", name: "Studio Lume" }] }),
}));
vi.mock("@/components/assistant/AssistantCreateClientDialog", () => ({
  default: ({ open, onSuccess }: { open: boolean; onSuccess?: (id: string) => void }) =>
    open ? <button type="button" onClick={() => onSuccess?.("b-nova")}>criar marca</button> : null,
}));
vi.mock("@/components/billing/FreePlanCta", () => ({
  FreePlanCta: ({ intro }: { intro?: string }) => <div data-testid="free-plan-cta">{intro}</div>,
}));

import BrandSwitcher, { brandMonogram } from "./BrandSwitcher";

const renderSwitcher = () => render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><BrandSwitcher /></NextIntlClientProvider>);

describe("BrandSwitcher (spec 2026-10-07 §3, frames c8 and c8b)", () => {
  beforeEach(() => {
    switchBrand.mockClear();
    brand = { id: "b-cafe", name: "Café Aurora" };
    freePlan = null;
  });

  it("shows the active brand's monogram", () => {
    renderSwitcher();
    expect(screen.getByTestId("rail-brand-switcher")).toHaveTextContent("CA");
    expect(screen.getByRole("button", { name: "Marca ativa: Café Aurora. Trocar marca" })).toBeInTheDocument();
  });

  it("lists the brands, marks the active one and switches to another", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.getAllByTestId("rail-brand-option").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Café Aurora"), expect.stringContaining("Livraria Norte"), expect.stringContaining("Studio Lume"),
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: /Livraria Norte/ }));
    expect(switchBrand).toHaveBeenCalledWith("b-livraria");
  });

  it("adds a brand for a paying workspace and switches to it", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    fireEvent.click(screen.getByTestId("rail-add-brand"));
    fireEvent.click(screen.getByRole("button", { name: "criar marca" }));
    expect(switchBrand).toHaveBeenCalledWith("b-nova");
  });

  it("locks adding a brand on the free plan and leads to the plan card", () => {
    freePlan = { accountId: "acc-1" };
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.queryByTestId("rail-add-brand")).not.toBeInTheDocument();
    expect(screen.getByTestId("rail-add-brand-locked")).toHaveTextContent("Outras marcas fazem parte do plano.");
    fireEvent.click(screen.getByRole("button", { name: "Ver card do plano" }));
    expect(screen.getByTestId("free-plan-cta")).toHaveTextContent("Outras marcas fazem parte do plano.");
  });

  it("offers no add while the plan is unknown, and renders nothing without a brand", () => {
    freePlan = undefined;
    const { unmount } = renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.queryByTestId("rail-add-brand")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rail-add-brand-locked")).not.toBeInTheDocument();
    unmount();
    brand = null;
    renderSwitcher();
    expect(screen.queryByTestId("rail-brand-switcher")).not.toBeInTheDocument();
  });

  it("makes a monogram of two letters", () => {
    expect(brandMonogram("Café Aurora")).toBe("CA");
    expect(brandMonogram("CENBRAP")).toBe("CE");
    expect(brandMonogram("  ")).toBe("?");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/components/layout/rail/BrandSwitcher.test.tsx`
Expected: FAIL, porque o componente não existe.

- [ ] **Step 4: Implementar o seletor**

`src/components/layout/rail/BrandSwitcher.tsx`:

```tsx
"use client";

// The brand of the rail (spec 2026-10-07 §3, frames c8 and c8b): the active brand's monogram under the mark, a menu that
// switches brands, and "Adicionar marca", locked on the free plan, where the plan card is the way on.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Lock, Plus } from "lucide-react";
import AssistantCreateClientDialog from "@/components/assistant/AssistantCreateClientDialog";
import { FreePlanCta } from "@/components/billing/FreePlanCta";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActiveBrand, useSwitchActiveBrand } from "@/lib/brands/active-brand-context";
import { useFreePlanAccount } from "@/lib/equipe/use-equipe";
import { useClientProfiles } from "@/lib/hooks/use-client-profiles";
import { cn } from "@/lib/utils";

/** Two letters of the brand: the initials of its first two words, or its first two letters. */
export function brandMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

export default function BrandSwitcher({ className }: { className?: string }) {
  const t = useTranslations("navigation.rail");
  const brand = useActiveBrand();
  const switchBrand = useSwitchActiveBrand();
  const { data: profiles = [] } = useClientProfiles();
  const freePlan = useFreePlanAccount();
  const [creating, setCreating] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  if (!brand) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          aria-label={t("brandSwitcher", { name: brand.name })}
          title={brand.name}
          data-testid="rail-brand-switcher"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[11px] font-semibold text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            className,
          )}
        >
          <span className="flex flex-col items-center leading-none">
            {brandMonogram(brand.name)}
            <ChevronDown size={10} aria-hidden="true" className="mt-0.5 text-[var(--text-muted)]" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 border-[var(--border-subtle)] bg-[var(--surface-raised)]">
          <p className="px-2 pb-1 pt-1.5 text-sm font-semibold text-[var(--text-primary)]">{t("switchBrand")}</p>
          {profiles.map((profile) => (
            <DropdownMenuItem
              key={profile.id}
              data-testid="rail-brand-option"
              onClick={() => { if (profile.id !== brand.id) switchBrand(profile.id); }}
              className={cn("gap-3", profile.id === brand.id && "bg-white/6")}
            >
              <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--surface-inset)] text-[10px] font-semibold">
                {brandMonogram(profile.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{profile.name}</span>
              {profile.id === brand.id ? <Check size={14} aria-label={t("activeBrand")} /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {freePlan === null ? (
            <DropdownMenuItem data-testid="rail-add-brand" onClick={() => setCreating(true)} className="gap-2">
              <Plus size={14} aria-hidden="true" />
              {t("addBrand")}
            </DropdownMenuItem>
          ) : freePlan ? (
            <div data-testid="rail-add-brand-locked" className="flex flex-col gap-1 rounded-md bg-[var(--surface-inset)] px-2 py-2 text-sm">
              <span className="flex items-center gap-2 font-semibold text-[var(--text-primary)]"><Lock size={14} aria-hidden="true" />{t("addBrand")}</span>
              <span className="text-xs text-[var(--text-secondary)]">{t("addBrandLocked")}</span>
              <button type="button" onClick={() => setPlanOpen(true)} className="self-start text-xs font-medium text-[var(--text-primary)] underline-offset-2 hover:underline">
                {t("seePlanCard")}
              </button>
            </div>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AssistantCreateClientDialog open={creating} onOpenChange={setCreating} onSuccess={(id) => switchBrand(id)} />
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t("addBrand")}</DialogTitle></DialogHeader>
          <DialogBody>
            {freePlan ? <FreePlanCta accountId={freePlan.accountId} intro={t("addBrandLocked")} variant="stage" /> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

Se o `DropdownMenuItem` deste projeto não aceitar `data-testid`, ponha o `data-testid` num `<span>` interno e ajuste o
teste. O resto segue o padrão do `ActiveBrandSwitcher`: `onClick` no item e o menu aberto com `click` no gatilho.

- [ ] **Step 5: O trilho e o cabeçalho**

`Rail.tsx`:
- Remova o `<button ref={newConversationRef} … data-testid="rail-new-conversation" …>…</button>` e coloque no lugar
  `<BrandSwitcher className="mt-[33px]" />`.
- Remova o `<NewConversationDialog … />` do fim.
- Remova os imports e variáveis que ficarem sem uso: `Plus`, `NewConversationDialog`, `useRef`, `useState`,
  `defaultEquipeAccountId`, `useEquipeAccounts`, `accounts`, `list`, `account`, `creating` e `newConversationRef`.
- Acrescente `import BrandSwitcher from "./BrandSwitcher";`.
- Atualize o comentário do topo para: "the mark, the active brand, the six destinations, help and the account".

`RailHeader.tsx`:
- importe `BrandSwitcher`;
- antes de `<EquipeViewSelector …/>`, acrescente
  `<div className="md:hidden"><BrandSwitcher /></div>`. No celular o trilho não aparece, e o cabeçalho é a barra do
  topo.

`Rail.test.tsx`:
- Remova o mock de `./NewConversationDialog` e os dois testes do diálogo: "opens the new-conversation dialog bound to
  the default account and its brand" e o seguinte, que confere "no account while loading".
- Acrescente
  `vi.mock("./BrandSwitcher", () => ({ default: () => <button type="button" data-testid="rail-brand-switcher">CA</button> }));`.
- Acrescente este teste:

```tsx
  it("puts the active brand under the mark, where the new-conversation button was (frame c8)", () => {
    renderRail();
    expect(screen.getByTestId("rail-brand-switcher")).toBeInTheDocument();
    expect(screen.queryByTestId("rail-new-conversation")).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Rodar e ver passar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/components/layout/rail`
Expected: PASS. Se `RailHeader.test.tsx` quebrar porque o `BrandSwitcher` pede o provider, acrescente o mock
`vi.mock("./BrandSwitcher", () => ({ default: () => null }))`.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/layout/rail app/messages/pt-BR.json app/messages/en.json
git commit -m "feat(caminho-unico): brand switcher at the top of the rail (frames c8, c8b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: As telas seguem a marca ativa

**Files:**
- Modify:
  - `src/lib/equipe/use-equipe.ts` (`defaultEquipeAccountId` e `useEquipeAccountSelection`);
  - `src/lib/equipe/use-conversation-context.ts`, que dá a conta da conversa, da lista de conversas e do `RailChat`;
  - `src/components/layout/rail/RailHeader.tsx`, que dá a conta do seletor Painel | Pipeline;
  - `src/components/equipe/EquipeEmptyScreen.tsx`;
  - `src/app/(dashboard)/library/page.tsx:85-96`;
  - `src/components/equipe/IdeasView.tsx`, `GoalsView.tsx` e `PipelineView.tsx` (o `EquipeAccountSwitcher`; no
    `PipelineView`, também a conta padrão das linhas 223 e 229).
- Test: `src/lib/equipe/use-equipe.test.tsx`, `src/lib/equipe/use-conversation-context.test.tsx`,
  `src/components/equipe/EquipeEmptyScreen.test.tsx` e `src/app/(dashboard)/library/page.test.tsx`

**Interfaces:**
- Consumes: `useActiveBrand` e `useSwitchActiveBrand` (Task 4).
- Produces:
  `defaultEquipeAccountId(accounts: EquipeAccountJson[], activeBrand?: { id: string } | null): string | null`.
  Com `activeBrand` definido (mesmo `null`) devolve a conta da marca, ou `null` se ela ainda não tem conta. Sem o
  argumento faz o que faz hoje.

- [ ] **Step 1: Escrever os testes que falham**

Em `use-equipe.test.tsx`, acrescente:

```tsx
describe("defaultEquipeAccountId (spec 2026-10-07 §3)", () => {
  const accounts = [
    { id: "acc-a", clientProfileId: "b-a", pendingDecisions: 0 },
    { id: "acc-b", clientProfileId: "b-b", pendingDecisions: 2 },
  ] as never;

  it("keeps today's rule outside the rail: pending decisions first, else the first", () => {
    expect(defaultEquipeAccountId(accounts)).toBe("acc-b");
  });

  it("in the rail, is the active brand's own account, and null while it has none", () => {
    expect(defaultEquipeAccountId(accounts, { id: "b-a" })).toBe("acc-a");
    expect(defaultEquipeAccountId(accounts, { id: "b-new" })).toBeNull();
    expect(defaultEquipeAccountId(accounts, null)).toBeNull();
  });
});
```

Importe `defaultEquipeAccountId` de `./use-equipe` se o arquivo ainda não importa.

Em `use-conversation-context.test.tsx`:
- acrescente, junto dos mocks:
  `vi.mock("@/lib/brands/active-brand-context", () => ({ useActiveBrand: () => railBrand }));` com
  `let railBrand: { id: string; name: string } | undefined;` (no `beforeEach`, `railBrand = undefined`);
- acrescente este teste:

```tsx
  it("in the rail, stands in with the active brand's account, not the one with pending decisions (spec 2026-10-07 §3)", () => {
    thread = undefined;
    railBrand = { id: "profile-a", name: "A" };
    const { result } = renderHook(() => useConversationContext(null));
    expect(result.current).toMatchObject({ accountId: "acc-a", clientProfileId: "profile-a" });
    expect(stateHook).toHaveBeenCalledWith("acc-a");
  });
```

Hoje esse caso dá `acc-b`, porque a conta com decisões pendentes vem primeiro. É isso que faz o teste falhar.

Em `EquipeEmptyScreen.test.tsx`, acrescente o mock
`vi.mock("@/lib/brands/active-brand-context", () => ({ useActiveBrand: () => activeBrand }))` com
`let activeBrand: { id: string; name: string } | undefined;` (no `beforeEach`, `activeBrand = undefined`). Depois,
acrescente este teste:

```tsx
  it("names the rail's active brand, even before it has an account (spec 2026-10-07 §3)", () => {
    activeBrand = { id: "b-new", name: "Studio Lume" };
    renderScreen("library");
    expect(screen.getByText(/Studio Lume/)).toBeInTheDocument();
  });
```

`renderScreen` já existe no arquivo.

Em `library/page.test.tsx`, no `describe("LibraryPage (ticket 07): scoped to the active brand")`:
- acrescente, junto dos mocks:
  `vi.mock("@/lib/brands/active-brand-context", () => ({ useActiveBrand: () => railBrand }));` com
  `let railBrand: { id: string; name: string } | undefined;` (no `beforeEach`, `railBrand = undefined`);
- acrescente este teste:

```tsx
  it("in the rail, the active brand decides, even before it has an account (spec 2026-10-07 §3)", () => {
    railBrand = { id: "profile-2", name: "Livraria Norte" };
    useActiveClientProfileMock.mockReturnValue({
      profiles: [{ id: ACTIVE_PROFILE_ID, name: "Acme" }, { id: "profile-2", name: "Livraria Norte" }],
      activeProfile: { id: ACTIVE_PROFILE_ID, name: "Acme" },
      activeClientProfileId: ACTIVE_PROFILE_ID,
      requiresSelection: false, isLoading: false, isError: false, selectProfile: vi.fn(),
    });

    render(<LibraryPage />);

    expect(useWorkspaceAssetsMock).toHaveBeenCalledWith(expect.objectContaining({ clientProfileId: "profile-2" }));
    expect(useEquipeAccountStateMock).toHaveBeenCalledWith(null);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/lib/equipe/use-equipe.test.tsx src/lib/equipe/use-conversation-context.test.tsx src/components/equipe/EquipeEmptyScreen.test.tsx "src/app/(dashboard)/library/page.test.tsx"`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

Em `use-equipe.ts`:
- Troque `defaultEquipeAccountId` por:

```ts
/**
 * Default account. In the rail (spec 2026-10-07 §3) it is the active brand's own account, null while that brand has none;
 * outside it, the first with pending client decisions, else the first.
 */
export function defaultEquipeAccountId(accounts: EquipeAccountJson[], activeBrand?: { id: string } | null): string | null {
  if (activeBrand !== undefined) {
    return activeBrand ? accounts.find((account) => account.clientProfileId === activeBrand.id)?.id ?? null : null;
  }
  return accounts.find((account) => account.pendingDecisions)?.id ?? accounts[0]?.id ?? null;
}
```

- Em `useEquipeAccountSelection`:
  - importe `useActiveBrand` e `useSwitchActiveBrand` de `@/lib/brands/active-brand-context`;
  - troque `const selected = valid ?? (accounts ? defaultEquipeAccountId(accounts) : null);` por:

```ts
  const brand = useActiveBrand();
  const switchBrand = useSwitchActiveBrand();
  const selected = valid ?? (accounts ? defaultEquipeAccountId(accounts, brand) : null);
  // A link to another brand's account (a notice, a shared URL) makes that brand the active one, on the same screen: the
  // rail and the screen always show the same brand (spec 2026-10-07 §3).
  const linkedBrand = valid && brand ? accounts?.find((account) => account.id === valid)?.clientProfileId : undefined;
  useEffect(() => {
    if (linkedBrand && brand && linkedBrand !== brand.id) switchBrand(linkedBrand, { stay: true });
  }, [linkedBrand, brand, switchBrand]);
```

  O `useEffect` que grava o `?account=` continua igual.

Em `use-conversation-context.ts`:
- importe `useActiveBrand` de `@/lib/brands/active-brand-context`;
- logo depois de `const thread = useAssistantThread(threadId).data?.thread;`, acrescente
  `const brand = useActiveBrand();`. O hook fica fora da expressão condicional, como pedem as regras dos hooks;
- na expressão de `account`, troque `defaultEquipeAccountId(accounts)` por `defaultEquipeAccountId(accounts, brand)`.

Em `RailHeader.tsx`:
- importe `useActiveBrand`;
- troque `const accountId = defaultEquipeAccountId(list);` por:

```tsx
  const brand = useActiveBrand();
  const accountId = defaultEquipeAccountId(list, brand);
```

Em `PipelineView.tsx`:
- importe `useActiveBrand`;
- declare `const brand = useActiveBrand();` no topo do componente que tem as linhas 221-233;
- nas duas chamadas `defaultEquipeAccountId(accounts ?? [])`, passe `brand` como segundo argumento;
- acrescente `brand` às dependências do `useEffect` da linha 233.

Em `EquipeEmptyScreen.tsx`:
- importe `useActiveBrand`;
- troque `const account = accounts.find((entry) => entry.id === defaultEquipeAccountId(accounts));` por:

```tsx
  const activeBrand = useActiveBrand();
  const account = accounts.find((entry) => entry.id === defaultEquipeAccountId(accounts, activeBrand));
```

- no `t(..., { brand: … })`, troque
  `account?.clientProfileName?.trim() || t("brandFallback")` por
  `activeBrand?.name || account?.clientProfileName?.trim() || t("brandFallback")`.

Em `library/page.tsx`:
- importe `useActiveBrand`;
- troque o bloco do comentário "The pilot's shell has no brand selector…" até a linha do `accountId` por:

```tsx
  const brand = useActiveBrand();
  // In the rail the active brand decides (spec 2026-10-07 §3), even before its account exists; the classic Library keeps
  // the selected brand.
  const pilotAccounts = accountsQuery.data?.accounts;
  const pilotAccount = pilotAccounts?.find(account => account.id === defaultEquipeAccountId(pilotAccounts, brand)) ?? null;
  const activeClientProfileId = brand?.id ?? pilotAccount?.clientProfileId ?? active.activeClientProfileId;
  const activeProfile = active.activeProfile?.id === activeClientProfileId
    ? active.activeProfile
    : active.profiles.find(profile => profile.id === activeClientProfileId) ?? null;
  const accountId = pilotAccount?.id ?? pilotAccounts?.find(account => account.clientProfileId === activeClientProfileId)?.id ?? null;
```

Em `IdeasView.tsx`, `GoalsView.tsx` e `PipelineView.tsx`:
- importe `useActiveBrand`;
- logo depois da chamada de `useEquipeAccountSelection(...)`, acrescente
  `const inRail = useActiveBrand() !== undefined;`. No `PipelineView`, use o `brand` já declarado:
  `const inRail = brand !== undefined;`;
- envolva o elemento `<EquipeAccountSwitcher … />` com `{inRail ? null : (…)}`. No trilho quem escolhe a marca é o
  seletor do topo.

- [ ] **Step 4: Rodar e ver passar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/lib/equipe src/components/equipe src/components/layout/rail src/components/assistant "src/app/(dashboard)/library"`
Expected: PASS. Testes de views que renderizam fora do provider continuam vendo o `EquipeAccountSwitcher`.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/equipe app/src/components/equipe app/src/components/layout/rail/RailHeader.tsx "app/src/app/(dashboard)/library"
git commit -m "feat(caminho-unico): the rail's screens follow the active brand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Criações da marca ativa

**Files:**
- Modify:
  - `src/server/repositories/campaign.ts` (`CampaignListQuery` e `buildCampaignListConditions`);
  - `src/server/repositories/creative-work.ts` (`listCreativeWorks` e `listCreativeWorksWithOutputs`);
  - `src/server/creative-work/canonical/queries.ts` (`ListCanonicalWorksOptions` e `listCanonicalWorksPage`);
  - `src/app/api/creative-work/route.ts` (o ramo padrão do `GET`);
  - `src/lib/hooks/use-canonical-works.ts`;
  - `src/app/(dashboard)/campaigns/page.tsx`.
- Test: `src/app/api/creative-work/route.test.ts` e `src/server/creative-work/canonical/queries.test.ts`

**Interfaces:**
- Produces:
  - `ListCanonicalWorksOptions.clientProfileId?: string | null`;
  - `useCanonicalWorks(options?: { clientProfileId?: string | null })`;
  - `GET /api/creative-work?clientProfileId=<uuid>`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/app/api/creative-work/route.test.ts`, no bloco que testa o `GET` padrão (o que usa `listMock`), acrescente:

```ts
  it("lists one brand's works when asked (spec 2026-10-07 §3)", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    const brand = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const res = await GET(new Request(`http://localhost/api/creative-work?clientProfileId=${brand}`));
    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ clientProfileId: brand }));
  });

  it("refuses a brand that is not an id", async () => {
    const res = await GET(new Request("http://localhost/api/creative-work?clientProfileId=../x"));
    expect(res.status).toBe(400);
  });
```

O arquivo já chama o `GET` com `new Request(...)` e já tem `listMock`.

Ainda em `route.test.ts`, as duas asserções exatas que já existem (linhas 151 e 167) passam a incluir a marca vazia:
`{ limit: 24, cursor: null, clientProfileId: null }` e, na segunda, `clientProfileId: null` depois do `cursor`.

Em `src/server/creative-work/canonical/queries.test.ts`, acrescente (o arquivo já tem `mockGetCampaignsPage`,
`mockListWithOutputs` e `WS`, e o `beforeEach` já faz os dois devolverem listas vazias):

```ts
  it("passes the brand to both origins (spec 2026-10-07 §3)", async () => {
    await listCanonicalWorksPage(WS, { clientProfileId: "brand-1" });
    expect(mockGetCampaignsPage).toHaveBeenCalledWith(WS, expect.objectContaining({ clientProfileId: "brand-1" }));
    expect(mockListWithOutputs).toHaveBeenCalledWith(WS, expect.any(Number), null, "brand-1");
  });
```

As asserções exatas que já existem (linhas 132-133 e 145-146) passam a incluir a marca vazia:
`{ limit: 25, cursor: null, clientProfileId: null }` com `(WS, 25, null, null)`, e `{ limit: 11, cursor, clientProfileId: null }`
com `(WS, 11, cursor, null)`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/app/api/creative-work/route.test.ts src/server/creative-work/canonical/queries.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

`repositories/campaign.ts`:
- em `CampaignListQuery`, acrescente
  `/** One brand's campaigns (spec 2026-10-07 §3); all of them when absent. */ clientProfileId?: string | null;`;
- em `buildCampaignListConditions`, antes do `if (query.cursor)`, acrescente:

```ts
  if (query.clientProfileId) {
    conditions.push(eq(campaigns.clientProfileId, query.clientProfileId));
  }
```

`repositories/creative-work.ts`:
- em `listCreativeWorks`, acrescente o parâmetro `clientProfileId?: string | null` depois de `cursor`;
- antes do `if (cursor)`, acrescente:

```ts
  if (clientProfileId) conditions.push(eq(creativeWorkItems.clientProfileId, clientProfileId));
```

- em `listCreativeWorksWithOutputs`, acrescente o mesmo parâmetro e troque
  `const works = await listCreativeWorks(workspaceId, limit, cursor);` por
  `const works = await listCreativeWorks(workspaceId, limit, cursor, clientProfileId);`.

`canonical/queries.ts`:
- em `ListCanonicalWorksOptions`, acrescente
  `/** One brand's works (spec 2026-10-07 §3); the whole workspace when absent. */ clientProfileId?: string | null;`;
- em `listCanonicalWorksPage`, troque as duas chamadas por:

```ts
    getCampaignsPage(workspaceId, { limit: fetchLimit, cursor, clientProfileId: options.clientProfileId ?? null }),
    listCreativeWorksWithOutputs(workspaceId, fetchLimit, cursor, options.clientProfileId ?? null),
```

`api/creative-work/route.ts`, no ramo padrão do `GET`, troque:

```ts
    const works = await listCanonicalWorksPage(workspace.id, {
      limit: page.limit,
      cursor: page.cursor,
    });
```

por:

```ts
    const brandParam = searchParams.get("clientProfileId");
    const brand = brandParam === null ? null : z.string().uuid().safeParse(brandParam);
    if (brand && !brand.success) return apiError("invalidInput", 400, { clientProfileId: "invalid" });
    const works = await listCanonicalWorksPage(workspace.id, {
      limit: page.limit,
      cursor: page.cursor,
      // Spec 2026-10-07 §3: Criações of the rail shows the active brand's works; the workspace filter still applies.
      clientProfileId: brand?.data ?? null,
    });
```

`use-canonical-works.ts`:
- troque `fetchCanonicalWorks(cursor)` por `fetchCanonicalWorks(cursor, clientProfileId)`, acrescentando
  `const brand = clientProfileId ? `&clientProfileId=${encodeURIComponent(clientProfileId)}` : "";` à URL;
- troque `export function useCanonicalWorks()` por
  `export function useCanonicalWorks(options: { clientProfileId?: string | null } = {})`;
- use `queryKey: [...CANONICAL_WORKS_QUERY_KEY, options.clientProfileId ?? "all"]` e
  `queryFn: ({ pageParam }) => fetchCanonicalWorks(pageParam, options.clientProfileId ?? null)`. O
  `invalidateCanonicalWorks`, que invalida pelo prefixo, continua cobrindo as duas chaves.

`campaigns/page.tsx`:
- importe `useActiveBrand`;
- troque a chamada `useCanonicalWorks()` por `useCanonicalWorks({ clientProfileId: activeBrand?.id ?? null })`, com
  `const activeBrand = useActiveBrand();` antes. Fora do trilho, `activeBrand` é `undefined` e a lista é a do
  workspace, como hoje.

- [ ] **Step 4: Rodar e ver passar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/app/api/creative-work src/server/creative-work/canonical src/server/repositories/campaign src/server/repositories/creative-work "src/app/(dashboard)/campaigns" src/lib/hooks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/repositories/campaign.ts app/src/server/repositories/creative-work.ts app/src/server/creative-work/canonical app/src/app/api/creative-work app/src/lib/hooks/use-canonical-works.ts "app/src/app/(dashboard)/campaigns/page.tsx"
git commit -m "feat(caminho-unico): Criações lists the active brand's works

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: O palco perde o seletor de marca e o "Novo trabalho" na casca nova

**Files:**
- Modify: `src/components/dashboard/DashboardHomeActions.tsx` (o `topBar` do `BrandStageHome`)
- Test: `src/components/dashboard/DashboardHomeActions.test.tsx`

**Interfaces:**
- Consumes: `useActiveBrand` (Task 4).
- Produces: nada.

- [ ] **Step 1: Escrever o teste que falha**

Em `DashboardHomeActions.test.tsx`:
- acrescente `let railBrand: { id: string; name: string } | undefined;` e
  `vi.mock("@/lib/brands/active-brand-context", () => ({ useActiveBrand: () => railBrand }));`;
- no `beforeEach`, acrescente `railBrand = undefined;`;
- acrescente este teste:

```tsx
  it("in the rail, leaves the brand to the rail: no stage switcher and no Novo trabalho (spec 2026-10-07 §2)", () => {
    railBrand = { id: "p1", name: "Marca A" };
    render(<DashboardHomeActions />);
    expect(screen.queryByTestId("active-client-switcher")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Novo trabalho" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TZ=UTC npx vitest run --config config/vitest.config.ts src/components/dashboard/DashboardHomeActions.test.tsx`
Expected: FAIL no teste novo.

- [ ] **Step 3: Implementar**

Em `DashboardHomeActions.tsx`:
- importe `useActiveBrand`;
- no corpo, depois de `const freePlan = useFreePlanAccount();`, acrescente:

```tsx
  // Spec 2026-10-07 §2: in the rail the brand is the rail's, and the composer page is already "new work".
  const inRail = useActiveBrand() !== undefined;
```

- troque a prop `topBar={( <div data-testid="stage-brand-bar" …>…</div> )}` por
  `topBar={inRail ? null : ( …o mesmo bloco de hoje… )}`. A prop é `ReactNode` em `BrandStageHome`, que aceita
  `null`, e o `{topBar}` da barra não renderiza nada nesse caso. O rótulo da barra (`eyebrow`) continua.

- [ ] **Step 4: Rodar e ver passar**

Run: o comando do Step 2.
Expected: PASS, inclusive os testes antigos do `stage-brand-bar`, que rodam fora do trilho.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/dashboard
git commit -m "feat(caminho-unico): the stage leaves the brand to the rail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Conferência manual e visual contra c8 e c8b

**Files:** prints fora do repositório (scratchpad), que vão para o PR.

- [ ] **Step 1: Banco e servidor com o gate ligado**

Crie um banco `caminho_unico_e2b_test`, migre e suba o `next dev` com o gate ligado:
- `EQUIPE_ENABLED='true'`, `EQUIPE_PILOT_WORKSPACES='*'`;
- leitores falsos;
- chaves de mentira;
- `E2E_DISABLE_RATE_LIMIT='true'`.

Antes de subir, rode `rm -rf .next/dev`. A receita completa está no plano da etapa 1, Task 9.

- [ ] **Step 2: Workspace grátis (c8b)**

Crie um usuário, confirme o e-mail por SQL e abra `/`. A conta grátis abre com "Minha marca". Abra o seletor do
trilho:
- deve haver uma marca só e "Adicionar marca" com cadeado;
- "Ver card do plano" abre o card.

Capture e ponha lado a lado com `c8b-seletor-conta-gratis.png`.

- [ ] **Step 3: Workspace que paga, com três marcas (c8)**

No mesmo workspace, libere o acesso de testador e crie mais duas marcas com Brand Kit:

```bash
/opt/homebrew/opt/postgresql@16/bin/psql "$DATABASE_URL" <<'SQL'
insert into adscale_app.workspace_entitlements (workspace_id, kind, status) select workspace_id, 'tester', 'active' from adscale_app.workspace_members m join adscale_app."user" u on u.id = m.user_id where u.email = 'gratis-e2b@adscale.local';
insert into adscale_app.client_profiles (workspace_id, name, brand_colors) select workspace_id, 'Livraria Norte', '["#2B4C7E"]'::jsonb from adscale_app.workspace_members m join adscale_app."user" u on u.id = m.user_id where u.email = 'gratis-e2b@adscale.local';
insert into adscale_app.client_profiles (workspace_id, name, brand_colors) select workspace_id, 'Studio Lume', '["#C9A227"]'::jsonb from adscale_app.workspace_members m join adscale_app."user" u on u.id = m.user_id where u.email = 'gratis-e2b@adscale.local';
SQL
```

Recarregue `/` e confira:
- o seletor lista as três marcas e marca a ativa;
- trocar para "Livraria Norte" leva a `/` com uma conversa nova, sem os cards do handoff, porque a marca entra por
  importação;
- Biblioteca, Criações, Ideias e Metas mostram essa marca;
- o composer (`/creative-work/new`) não tem seletor no palco;
- "Adicionar marca" abre o diálogo de criação, e a marca nova cai no handoff do zero.

Capture o seletor aberto e ponha lado a lado com `c8-seletor-de-marca.png`.

- [ ] **Step 4: Decidir**

Se os prints batem com os quadros, siga. Se houver diferença de layout (posição, tamanho do monograma, espaçamento do
menu), corrija no `BrandSwitcher` com um commit próprio e refaça as capturas.

---

### Task 11: Verificação completa e PR

- [ ] **Step 1: Lint, tipos e suíte**

```bash
rm -rf .next/dev
npm run lint
npm run typecheck
TZ=UTC npx vitest run --config config/vitest.config.ts --maxWorkers=4 --exclude '**/*.pg.test.ts'
TEST_DATABASE_URL=… npx vitest run --config config/vitest.config.ts .pg.test.ts --no-file-parallelism --maxWorkers=1
```

Expected: tudo em PASS. Duas falhas locais são esperadas e não vêm daqui: `creative-production.test.ts` e
`brand-knowledge-publish.pg.test.ts`, que pedem o contêiner da porta 5433. Depois, rode
`git checkout -- ../.planning/phases/128-evaluation-and-release-gate/`.

- [ ] **Step 2: Inventário e gates**

```bash
npm run convergence:inventory
npm run convergence:test
npm run convergence:gate
```

Commite o inventário. Se o gate pedir decisão para um CTA novo, registre-a em `../.planning/convergence/surface-decisions.yaml`
seguindo o formato do arquivo.

- [ ] **Step 3: PR (com a confirmação do dono)**

Com o ok do dono, rode `git push -u origin caminho-unico/etapa-2b` e abra o PR contra `main` usando a skill `pr`. A
descrição leva:
- os prints da Task 10;
- as decisões deste plano;
- o que fica para a etapa 3.

A seção Merge Danger conta:
- **Porta:** two-way, sem migração de esquema. As contas novas por marca nascem só quando alguém abre uma marca.
- **Raio:** a casca nova inteira.

Depois, vincule o PR com `ccd_pr` (`get_status`/`bind_pr`).
