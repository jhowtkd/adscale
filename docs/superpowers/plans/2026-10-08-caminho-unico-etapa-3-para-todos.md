# Caminho único, etapa 3: o caminho único para todos (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo workspace, pague ou não, vê a casca nova e a conversa em `/`. A casca clássica, o `/assistant`
clássico, o interruptor `EQUIPE_ENABLED` e o código que só eles usavam saem. As pontas soltas da seção 4 da spec e os
três itens que o 2B adiou entram no mesmo PR.

**Architecture:**
- **Uma regra só:** `usesEquipeProduct` e o `classic_paid_access` saem. O layout, `/`, o `/assistant` e a rota de chat
  seguem sempre o ramo do produto. As regras de dinheiro (`findFreePlanAccount`, `freePlanLimitsApply`, a porta
  `hasClassicPaidAccess`) ficam, porque decidem o plano, não o produto.
- **Sem interruptor:** `isEquipeEnabledForWorkspace`, `EQUIPE_ENABLED` e `EQUIPE_PILOT_WORKSPACES` saem do código, das
  dependências dos jobs e do cliente. As regras de modelos e chaves do ambiente passam a valer sempre.
- **Apagar o que ficou sem uso:** a casca clássica, o `/assistant` clássico e o código morto da seção 4 saem em
  tarefas separadas, cada uma com o grafo de imports conferido.
- **Pontas soltas:** os erros de `/` ganham saída, e a conta encerrada abre a conversa só para leitura. Fica um único
  e-mail de boas-vindas. Um link para a conversa de outra marca troca a marca ativa.
- **E2E:** os specs do CI passam a rodar no caminho único, e os specs clássicos saem. Os do piloto ganham uma receita
  num banco novo, e entra o E2E de três marcas.

**Tech Stack:** Next.js 16.2 (App Router), React 19.2, TypeScript, TanStack Query 5, Vitest 4, Playwright, Drizzle,
next-intl 4 e Better Auth.

**Spec:** `docs/superpowers/specs/2026-10-07-caminho-unico-design.md`: seção 4 (Limpeza), seção 5 (Ordem, produção e
testes) e "Pronto quando". O 2B entrou na `main` pelo PR #633 (merge `76a2baf3`); este plano parte desse merge.
**Decisão do dono em 08/10:** o ADScale não tem clientes pagantes. Por isso não há virada, e as etapas 3 e 4 viram uma
só (Task 1 registra isso na spec e no `CONTEXT.md`).

## Global Constraints

- Nenhum `page.tsx` ou `route.ts` novo (trava de destinos). Apagar um deles é permitido.
- A palavra "Equipe" não aparece em texto novo para o cliente, nem em pt-BR nem em en. No código, o módulo continua
  se chamando `equipe`.
- Não há clientes pagantes: nada de migração, convivência dos dois caminhos ou janela de espera. O que é da casca
  clássica sai neste PR.
- As regras de dinheiro não mudam. `findFreePlanAccount`, `freePlanLimitsApply`, `accountOnFreePlan`,
  `workspaceHasActivePaidAccess` e a porta `hasClassicPaidAccess` continuam decidindo quem está no plano grátis.
- As decisões do 2B continuam valendo:
  - a marca ativa vem do cookie, e sem cookie vale a da Conta viva mais antiga;
  - uma Conta por marca;
  - só quem paga importa marca com Brand Kit;
  - o grátis fica preso a uma marca;
  - a conta grátis encerrada volta para o workspace.
- Toda tarefa que apaga ou desloca uma linha com `href` ou `router.push` em `components/**` ou `app/(dashboard)/**`
  roda `npm run convergence:inventory` e commita `.planning/convergence/surface-inventory.raw.json`. Toda tarefa
  termina com `npm run convergence:test && npm run convergence:gate` verdes.
- Testes com Node 22: `export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"`. Suítes de
  componente rodam com `TZ=UTC`. Depois da suíte completa, rode `git checkout -- .planning/phases/` antes de commitar.
- Os comandos `npm`, `npx` e `vitest` rodam em `app/`. Os `git add` e `git commit` rodam na raiz do worktree, com
  caminhos `app/…`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisões deste plano

- **Workspace que paga e ainda não tem Conta viva:** abre a Conta como qualquer outro. A regra de importação do 2B
  vale também para a primeira Conta: se o workspace paga e a marca tem Brand Kit, ela entra sem handoff. Uma Conta
  encerrada continua sendo devolvida, mesmo para quem paga.
- **Sem interruptor:** `EQUIPE_ENABLED` e `EQUIPE_PILOT_WORKSPACES` saem do código.
  - **Validação do ambiente:** as regras de modelos e chaves passam a valer sempre. No CI, cada bloco `env:` que tem
    `OPENAI_API_KEY` ganha chaves de mentira para Anthropic e Meta.
  - **Produção:** as duas variáveis ficam sem efeito, e o dono pode apagá-las do Render depois do deploy.
  - **Freio de emergência:** a parada global da operação, para as publicações, ou reverter o deploy.
- **Endereço das conversas:** fica como está. `/` é a conversa principal da marca ativa, e
  `/assistant?threadId=` abre qualquer conversa de uma Conta.
  - **Link para a conversa de outra marca:** troca a marca ativa, como o `?account=` já faz.
  - **No grátis:** o trilho está preso a uma marca, então uma conversa de outra Conta volta para `/`.
- **Conta encerrada:** a conversa abre só para leitura, com "Falar com uma pessoa" no lugar da caixa. O servidor
  recusa turnos com 409 `accountClosed`.
- **Erros de `/`:** cada erro ganha uma saída.
  - **E-mail não confirmado:** reenviar a confirmação, pelo catch-all do Better Auth, sem rota nova.
  - **Dono ainda não abriu:** o aviso diz quem é o dono, lido dos membros do workspace.
  - **Erro genérico:** um botão "Tentar de novo".
- **Boas-vindas:** fica um só e-mail, o da primeira abertura. O trial de 500 créditos do cadastro fica como está; a
  decisão é do subprojeto 3.
- **`/hi`:** continua desligado por padrão. O convidado vai para `/` depois do cadastro, sem `guestDraft`.
- **`V6ShellLayout` e `MobileMoreSheet` ficam**, embora a seção 4 da spec os liste como casca antiga: o trilho usa os
  dois (`RailShell` e `RailMobileNav`). Sai só o que é exclusivo da casca clássica: o `sidebar` opcional do
  `V6ShellLayout`.
- **E2E do CI:** a identidade visual é testadora, então agora cai no caminho do produto. O gate de acessibilidade
  passa a auditar a conversa em `/`, e a rota `creativeWork` do manifesto vira `/creative-work/new`.
- **E2E do piloto:** ganham identidades próprias, separadas da semente visual (que dá testador e apaga as marcas VF):
  - `pilot-free@example.test`, sem acesso de testador, para os specs do grátis;
  - `three-brands@example.test`, com testador dado por SQL, para o E2E de três marcas.
  - **CI:** eles entram no CI se passarem na receita do CI sem chamar nenhum provedor. Se algum precisar de um, ficam
    fora, e o PR diz por quê.

## Fora deste plano

- **Código de servidor do Assistente clássico que perde a tela:**
  - o goal agent (`src/server/assistant/goal-agent*` e as rotas `api/assistant/threads/[threadId]/goal*`);
  - os fluxos guiados;
  - a rota `api/workspace/brand-kit/extract-multi`.
  Apagá-los mexe no `ai-route-inventory.test.ts` e em módulos de servidor que esta etapa não toca: fica para uma
  limpeza própria. O ramo `runGoalAgentTurn` da rota de chat fica.
- **Os fallbacks `useActiveBrand() === undefined`** dentro de hooks (`use-active-client-profile.ts`,
  `defaultEquipeAccountId`): são inofensivos fora do provider (testes, páginas públicas). Os forks de **tela** saem
  na Task 8.
- **Renomear o módulo e os caminhos internos `equipe`.**
- **Dinheiro (subprojeto 3):** o trial de 500 créditos e o aviso `auth.confirmEmailTrialNotice`.

## Mapa de arquivos

Caminhos relativos a `app/`, salvo indicação.

| Task | Mexe em |
|---|---|
| 1 | `docs/superpowers/specs/2026-10-07-caminho-unico-design.md`, `CONTEXT.md` (raiz) |
| 2 | `server/equipe/module/free-plan.ts`, `open-free-account.ts`, `app/(dashboard)/page.tsx`, `layout.tsx`, `assistant/page.tsx`, apaga `assistant/layout.tsx`, `api/assistant/threads/[threadId]/chat/route.ts` e os testes deles |
| 3 | `server/services/email.ts`, `server/auth/index.ts`, `messages/*.json`, testes de e-mail |
| 4 | apaga `server/equipe/module/equipe-enabled.ts`; `server/validation/env.ts`, `free-plan.ts`, `http/guards.ts`, `http/errors.ts`, `module/commands.ts`, `module/ports.ts`, `module/open-account-candidates.ts`, `jobs/*`, `handoff/read.ts`, `agents/agent-work.ts`, `testing/*`, páginas `pipeline`/`ideas`/`goals`, `admin/equipe/accounts/page.tsx`, rotas de Instagram e de thread, `components/equipe/staff-errors.ts`, `.github/workflows/ci.yml`, `.env.example` |
| 5 | `lib/equipe/api.ts`, `lib/equipe/use-equipe.ts`, `components/equipe/EquipeAccountStates.tsx`, `PipelineView`/`IdeasView`/`GoalsView`, `EquipeNavLinks.tsx`, `app/(dashboard)/campaigns/page.tsx` |
| 6 | apaga a casca clássica (`AppShell`, `AppSidebar` e filhos, `DashboardShellSwitcher`, `TopBar` default, `AccountStatusBadge`, `SidebarAssistantModeSwitch`); `V6ShellLayout.tsx`, `TopBar.tsx`, `.planning/convergence/surface-decisions.yaml` |
| 7 | apaga o `/assistant` clássico (`AssistantShell`, `AssistantSidebarPanel`, `AssistantContextPanelSlot` e subárvore, `AssistantMain`, `AssistantStartComposer` e o que só eles usam); scripts de release gate |
| 8 | apaga o código morto da seção 4 e os forks de tela da casca clássica; `guest-core.mjs`, `guest-controller.mjs`, `composer-href.ts`, `composer-links.guard.test.ts` |
| 9 | cria `components/assistant/conversation/HomeOpenProblem.tsx`; `app/(dashboard)/page.tsx`, `messages/*.json` |
| 10 | `AssistantChatCore.tsx`, `RailChat.tsx`, `FreePlanCta.tsx`, rota de chat, `messages/*.json` |
| 11 | `lib/equipe/use-equipe.ts` (`useFollowLinkedBrand`), `ConversationScreen.tsx`, `app/(dashboard)/assistant/page.tsx` |
| 12 | specs do CI, `scripts/seed-visual-foundations.ts`, specs clássicos |
| 13 | `tests/e2e/support/pilot-home.ts`, specs do piloto, cria `three-brands-assistant.spec.ts` e `home-errors-assistant.spec.ts`, `package.json`, `docs/design/verification/fluxo0-09/README.md` |
| 14 | `PRODUCT.md`, `CONTEXT.md`, `docs/decisions/allowed-primary-destinations.json`, `render.yaml`, `docs/runbooks/fluxo-0-lancamento.md` |
| 15 | conferência manual, verificação completa e PR |

## Como rodar

- **Unitários (um arquivo ou pasta):**
  `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts <caminhos>`
- **Postgres real:** crie o banco uma vez:
  - `/opt/homebrew/opt/postgresql@16/bin/createdb caminho_unico_e3_test`;
  - `DATABASE_URL=postgres://jhonatan@localhost:5432/caminho_unico_e3_test node scripts/migrate-with-retry.mjs`.

  Depois rode os `*.pg.test.ts` com `TEST_DATABASE_URL=` apontando para o banco, `--no-file-parallelism --maxWorkers=1`.
- **Suíte completa:**
  `CI=true TZ=UTC PGOPTIONS='-c timezone=UTC' DATABASE_URL=… TEST_DATABASE_URL=… npx vitest run --config config/vitest.config.ts --maxWorkers=4 --exclude '**/*.pg.test.ts'`
  Os `*.pg.test.ts` rodam à parte. São falhas locais esperadas, sem relação com o código:
  - `creative-production.test.ts` e `brand-knowledge-publish.pg.test.ts`, que pedem a porta 5433;
  - `selection-effects-claim.pg.test.ts`, pelo fuso local.
- **Convergência:** `npm run convergence:inventory` (quando a tarefa pedir), depois
  `npm run convergence:test && npm run convergence:gate`.
- **Tipos e lint:** `npm run typecheck && npm run lint`.
- **E2E na receita do CI:**
  1. `npm run build` e `next start -p 3100`, com as variáveis do bloco "Start app for e2e" de `ci.yml` (com as chaves
     de mentira da Task 4), `DATABASE_URL` no banco `_test` e `E2E_BASE_URL=http://localhost:3100`;
  2. `npx playwright test <spec> --project=serial-flows`.

  O Chromium local é o 1243: se o Playwright pedir outro build, use um `playwright.local.config.ts` fora do commit
  que força `launchOptions.executablePath` para o `chrome-headless-shell` em `~/Library/Caches/ms-playwright/chromium_headless_shell-1243/`.
- **Disco:** o build e os E2E pedem alguns GB livres. Confira com `df -h /System/Volumes/Data` antes do build.

---

### Task 0: Branch

O branch `caminho-unico/etapa-3` já existe no worktree `.worktrees/caminho-unico-etapa-3`, sobre `76a2baf3`, e o
`npm ci` já foi feito em `app/`.

- [ ] **Step 1: Conferir**

Run: `git -C .worktrees/caminho-unico-etapa-3 log --oneline -1 && git -C .worktrees/caminho-unico-etapa-3 status --short`
Expected: `76a2baf3d Merge pull request #633…` (ou o commit do plano por cima) e nada pendente.

---

### Task 1: A spec e o `CONTEXT.md` dizem que não há virada

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-caminho-unico-design.md`
- Modify: `CONTEXT.md` (raiz)

- [ ] **Step 1: Seção 5 da spec**

Na tabela da seção 5, troque as linhas das etapas 3 e 4 por uma só:

```markdown
| 3 · Caminho único para todos | `usesEquipeProduct`, o `classic_paid_access` e o interruptor `EQUIPE_ENABLED` saem; todo workspace (grátis, testador, dono) vê a casca nova e a conversa em `/`; a casca clássica, o `/assistant` clássico e tudo da seção 4 saem no mesmo PR | Não há clientes pagantes (decisão do dono em 08/10): na casca clássica só estão o dono e os testadores, então não há virada nem convivência |
```

Troque o parágrafo logo abaixo da tabela ("Cada etapa é um PR…") por:

```markdown
Cada etapa é um PR e deixa a produção coerente sozinha. Até a etapa 2, desligar em emergência era
`EQUIPE_ENABLED=false`. Depois da etapa 3 não há interruptor: parar as publicações é a parada global da operação, e
voltar atrás é reverter o deploy.
```

- [ ] **Step 2: As outras menções à etapa 4 na spec**

Run: `grep -n "virada\|etapa 4\|Etapa 4" docs/superpowers/specs/2026-10-07-caminho-unico-design.md`

Em cada linha encontrada fora da tabela, troque "etapa 4" por "etapa 3" e "a virada" por "a etapa 3". Hoje são as
linhas do `?guestDraft=` e do `src/components/guest-home` na seção 2. Na linha da guarda, o trecho sobre o
`src/components/guest-home` vira: "Ele não olhava `src/components/guest-home`; desde a etapa 3 o convidado volta
para `/` e a guarda vale para tudo".

- [ ] **Step 3: Decisão no `CONTEXT.md`**

Logo depois da seção "#### Marca ativa e uma Conta por marca — decisão aceita em 2026-10-08" (antes do verbete
`**Equipe**:`), acrescente:

```markdown
#### Caminho único para todos — decisão aceita em 2026-10-08

O ADScale não tem clientes pagantes (dono, 2026-10-08). A etapa 3 do Caminho único deixa de ser uma virada com convivência e junta a limpeza da etapa 4. Este é o registro canônico; o [plano da etapa 3](docs/superpowers/plans/2026-10-08-caminho-unico-etapa-3-para-todos.md) é a receita.

- Todo workspace, pague ou não, vê a casca nova e a conversa em `/`. Não existe mais a regra que deixava um workspace que paga, sem Conta viva, no produto clássico.
- Um workspace que paga e abre a primeira Conta segue a regra da importação: marca com Brand Kit entra sem handoff, com conversa nova.
- Não há interruptor do produto. Parar as publicações é a parada global da operação; voltar atrás é reverter o deploy.
- A casca clássica, o `/assistant` clássico e a home do Estúdio em `/` saem. O composer continua em `/creative-work/new`.
- Um link para a conversa de outra marca troca a marca ativa, como o `?account=`. No plano grátis, preso a uma marca, ele volta para `/`.
- A conversa de uma Conta encerrada abre só para leitura, com "Falar com uma pessoa".
- Fica um e-mail de boas-vindas, o da primeira abertura. O trial de 500 créditos do cadastro continua (decisão do subprojeto 3).
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-07-caminho-unico-design.md CONTEXT.md
git commit -m "docs(caminho-unico): no paying customers, no switchover: stages 3 and 4 become one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Uma regra para todo workspace

**Files:**
- Modify: `src/server/equipe/module/free-plan.ts:1-14,83-97`
- Modify: `src/server/equipe/module/open-free-account.ts:47-71`
- Modify: `src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/assistant/page.tsx`
- Delete: `src/app/(dashboard)/assistant/layout.tsx`, `src/app/(dashboard)/assistant/layout.test.tsx`
- Modify: `src/app/api/assistant/threads/[threadId]/chat/route.ts:146-169`
- Test:
  - `src/server/equipe/module/free-plan.test.ts`
  - `src/server/equipe/module/open-free-account.test.ts`
  - `src/server/equipe/module/open-free-account.paid.pg.test.ts`
  - `src/server/billing/events.pg.test.ts`
  - `src/app/(dashboard)/page.test.tsx`
  - `src/app/(dashboard)/layout.test.tsx`
  - `src/app/(dashboard)/assistant/page.test.tsx`
  - `src/app/api/assistant/threads/[threadId]/chat/route.test.ts`

**Interfaces:**
- Produces: `runOpenFreeAccount` sem o erro `classic_paid_access`. O layout passa a renderizar
  `<RailShell activeBrand>` direto, e o `DashboardShellSwitcher` fica sem importador (a Task 6 o apaga).

- [ ] **Step 1: Teste da abertura para quem paga**

Em `open-free-account.test.ts`, no `describe` que hoje cobre o `classic_paid_access` (perto da linha 175), troque os
três casos que esperam `classic_paid_access` (perto das linhas 182, 234 e 265) por estes, com o mesmo arranjo de deps
dos vizinhos (`hasClassicPaidAccess: async () => true`):
- **Workspace que paga, sem Conta:** `open_free_account` sem marca cria a Conta. Espere
  `result.ok === true` e `result.value.data.created === true`.
- **Workspace que paga, sem Conta, marca com Brand Kit** (`brandColors: ["#2B4C7E"]` no perfil do gateway):
  - espere `created === true` e `imported === true`;
  - espere o handoff em `done`, como no caso de importação que já existe no arquivo.
- **Workspace que paga, só com Conta encerrada:** a Conta encerrada volta. Espere `created === false` e
  `accountId` igual ao da encerrada.

Run: `cd app && npx vitest run --config config/vitest.config.ts src/server/equipe/module/open-free-account.test.ts`
Expected: os três casos novos falham (hoje voltam `classic_paid_access`).

- [ ] **Step 2: A abertura sem o produto clássico**

Em `open-free-account.ts`, apague as linhas 47-53 (o comentário e o `if` do `classic_paid_access`). Depois troque o
cálculo de `paying` e o comentário acima dele por:

```ts
    // Whether the workspace pays (spec 2026-10-07 §3), asked only when an account opens: an existing account's conversation
    // opens without it. A workspace that pays and has no account yet opens its first one here, by the same import rule.
    const readers: FreePlanReaders = { readAccounts: async () => accounts, hasActivePaidAccess: deps.hasClassicPaidAccess ?? (async () => false) };
    const paying = !(await freePlanLimitsApply({ status: "free" }, ctx.workspaceId, readers));
```

A linha do `requires_plan` (`if (profile && live && !paying)`) não muda. A variável `live` continua sendo declarada
antes do `existing`: mantenha `const live = accounts.some((account) => account.status !== "closed");` logo depois da
ordenação das contas.

Run: o mesmo comando do Step 1.
Expected: PASS.

- [ ] **Step 3: A regra única some**

Em `free-plan.ts`:
- apague `usesEquipeProduct` (linhas 83-97);
- no cabeçalho, apague a frase final ("A classic customer with an active paid access, and every paid Equipe account,
  are untouched.") e troque "with the pilot on, it gets" por "it gets".

Em `free-plan.test.ts`, apague o import de `usesEquipeProduct` e o `describe("usesEquipeProduct")` (linhas 160-197).
Em `open-free-account.paid.pg.test.ts`, os casos das linhas 91-160 que esperam o produto clássico passam a esperar a
Conta aberta, com os mesmos asserts do Step 1, agora contra o Postgres. Em `billing/events.pg.test.ts:146,245-248`,
apague as asserções sobre `usesEquipeProduct` e `classic_paid_access`; o resto do teste fica.

- [ ] **Step 4: `/` sempre abre a conversa**

Troque `src/app/(dashboard)/page.tsx` por:

```tsx
import { redirect } from "next/navigation";
import ConversationScreen from "@/components/assistant/conversation/ConversationScreen";
import { getTranslations } from "next-intl/server";
import { legacyComposerHref, type PageSearchParams } from "@/lib/studio/composer-href";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { resolveActiveBrand } from "@/server/brands/active-brand";
import { RefreshForFirstBrand } from "@/lib/brands/active-brand-context";
import { executeCommand } from "@/server/equipe/module/commands";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  // Spec 2026-10-07 §2: the composer left `/`. An old link that opened it here (a bookmark, an e-mail, the way back from
  // the login) goes to its page with the same query; the conversation's own query stays.
  const legacyComposer = legacyComposerHref(params);
  if (legacyComposer) redirect(legacyComposer);
  const { user, workspace } = await requireWorkspaceAccess();
  const t = await getTranslations("assistant");
  if (!user.emailVerified) {
    return <p className="p-6 text-sm text-[var(--text-secondary)]" role="status">{t("homeVerifyEmail")}</p>;
  }
  const activeBrand = await resolveActiveBrand(workspace.id);
  const opened = await executeCommand(
    createEquipeRouteDeps(workspace.id),
    { actor: { kind: "system", job: "home.first_open" }, workspaceId: workspace.id },
    { type: "open_free_account", payload: { userId: user.id, ...(activeBrand ? { clientProfileId: activeBrand.id } : {}) } },
  );
  const threadId = opened.ok ? opened.value.data.assistantThreadId : null;
  if (typeof threadId !== "string" || !threadId) {
    const errorKey = !opened.ok && opened.error.code === "forbidden_actor" ? "homeOwnerFirst" : "homeOpenError";
    return <p className="p-6 text-sm text-[var(--danger-text)]" role="alert">{t(errorKey)}</p>;
  }
  // With no brand before, this opening created the first one, after the layout drew the rail without it. The shape is
  // the same either way (a fragment), so the conversation keeps its place in the tree when the refresh unmounts.
  return (
    <>
      <ConversationScreen threadId={threadId} />
      {activeBrand ? null : <RefreshForFirstBrand />}
    </>
  );
}
```

Os erros continuam como `<p>`; a Task 9 dá saída a eles. `studio-stage-props.ts` fica, porque
`creative-work/[id]/page.tsx` usa.

- [ ] **Step 5: O layout sempre usa o trilho**

Troque `src/app/(dashboard)/layout.tsx` por:

```tsx
import RailShell from "@/components/layout/rail/RailShell";
import AdminAgentation from "@/components/admin/AdminAgentation";
import { getSession } from "@/server/auth/session";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { requireWorkspaceAccess, isWorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/workspace";
import { resolveActiveBrand } from "@/server/brands/active-brand";
import type { ActiveBrand } from "@/lib/brands/active-brand";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const canAnnotate = !!session?.user?.email && isPlatformOwnerEmail(session.user.email);
  let activeBrand: ActiveBrand | null = null;
  if (session?.user) {
    try {
      const { workspace } = await requireWorkspaceAccess();
      // Spec 2026-10-07 §3: the rail's brand, read once per request (the page asks the same).
      activeBrand = await resolveActiveBrand(workspace.id);
    } catch (error) {
      if (!isWorkspaceAuthError(error) || error.code !== AUTH_ERROR_CODES.noWorkspace) throw error;
    }
  }

  return (
    <>
      <RailShell activeBrand={activeBrand}>{children}</RailShell>
      {canAnnotate && <AdminAgentation />}
    </>
  );
}
```

- [ ] **Step 6: `/assistant` só abre conversas de Conta**

Em `src/app/(dashboard)/assistant/page.tsx`:
- tire os imports de `AssistantMain`, `isPlatformOwnerEmail`, `getActiveTesterEntitlementByWorkspace` e
  `usesEquipeProduct`;
- troque o corpo por:

```tsx
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ threadId?: string | string[] }>;
}) {
  const { threadId: rawThreadId } = await searchParams;
  const threadId = typeof rawThreadId === "string" && rawThreadId.trim() ? rawThreadId : undefined;
  const { workspace } = await requireWorkspaceAccess();
  // Only the conversations bound to an account open here. A thread of the workspace that no account owns (a creation whose
  // binding was refused) would answer outside the Strategist and the free ceiling, so it goes home like an invalid one.
  const thread = threadId && z.string().uuid().safeParse(threadId).success
    ? await getAssistantThreadById(workspace.id, threadId)
    : null;
  const owned = thread
    ? await findEquipeThreadByAssistantThread(createPostgresEquipeUnitOfWork(db).repos, workspace.id, thread.clientProfileId, thread.id)
    : null;
  if (!thread || !owned) redirect("/");
  return <ConversationScreen threadId={thread.id} />;
}
```

Apague `src/app/(dashboard)/assistant/layout.tsx` e `layout.test.tsx`: sem a casca clássica, o layout só repassava
`children`.

Em `assistant/page.test.tsx`:
- apague os casos do gate desligado e do `AssistantMain` (perto das linhas 44-141, 9, 68, 85, 113 e 153);
- mantenha os casos de thread inválida, de thread sem Conta (redirect para `/`) e de thread com Conta
  (`ConversationScreen`);
- tire o mock de `usesEquipeProduct`.

- [ ] **Step 7: A rota de chat sem o produto clássico**

Em `chat/route.ts`, troque o trecho da linha 146 (o comentário "Equipe conversations (#551)") até o fim do `if (pilot &&
!equipeMatch)` por:

```ts
    // Account conversations (#551): a thread in an account's conversation map goes to the Strategist.
    const equipeMatch = await findEquipeThreadByAssistantThread(
      createPostgresEquipeUnitOfWork(db).repos,
      workspace.id,
      thread.clientProfileId,
      threadId
    );
    // A conversation that no account owns (one whose binding was refused, say) would be answered by the classic assistant,
    // outside the Strategist and the free ceiling: it is refused, by the same rule as the /assistant page. A campaign's own
    // thread is the exception: the campaign page keeps its assistant panel...
    if (!equipeMatch && !thread.campaignId) {
      return apiError("threadNotInAccount", 409);
    }
    // ...except on the free plan (ticket 11, part 2): the campaign assistant runs outside the Strategist and the free ceiling.
    if (!equipeMatch) {
      const freePlan = await findFreePlanAccount(workspace.id);
      if (freePlan) return apiError("free_plan", 403, { reason: "free_plan", accountId: freePlan.accountId });
    }
```

Tire o import de `usesEquipeProduct`. Em `chat/route.test.ts`:
- apague o `describe` "a classic payer with the pilot on" (linhas 735-800), o "pilot off" (perto da linha 686) e o
  "skips the map lookup when the pilot gate is closed" (perto da linha 580);
- tire o mock de `usesEquipeProduct` (linhas 59-69).

- [ ] **Step 8: Testes de `/` e do layout**

Em `(dashboard)/page.test.tsx`:
- apague o mock de `usesEquipeProduct` (linhas 22-25), o `describe` "classic paying customer" (linhas 336-377) e o caso
  do gate desligado (perto da linha 225);
- apague os mocks do `DashboardHomeActions` (perto das linhas 65-78), que `/` não renderiza mais.

Em `layout.test.tsx`:
- troque o mock do `DashboardShellSwitcher` pelo do `RailShell`;
- apague os casos clássicos (linhas 57, 67-71, 79-89);
- o caso que fica confere que o `RailShell` recebe a marca de `resolveActiveBrand`.

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts src/server/equipe/module "src/app/(dashboard)/page.test.tsx" "src/app/(dashboard)/layout.test.tsx" "src/app/(dashboard)/assistant" src/app/api/assistant/threads`
Expected: PASS.

Run: `TEST_DATABASE_URL=postgres://jhonatan@localhost:5432/caminho_unico_e3_test npx vitest run --config config/vitest.config.ts src/server/equipe/module/open-free-account.paid.pg.test.ts src/server/billing/events.pg.test.ts --no-file-parallelism --maxWorkers=1`
Expected: PASS.

- [ ] **Step 9: Tipos, convergência e commit**

Run: `npm run typecheck && npm run convergence:inventory && npm run convergence:test && npm run convergence:gate`
Expected: sem erro.

```bash
git add -A app/src/server app/src/app .planning/convergence/surface-inventory.raw.json
git commit -m "feat(caminho-unico): every workspace gets the conversation at / and the rail

usesEquipeProduct and classic_paid_access are gone: a paying workspace with no
live account opens its account like any other, by the 2B import rule.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Um e-mail de boas-vindas

**Files:**
- Modify: `src/server/services/email.ts:217-274`
- Modify: `src/server/auth/index.ts:88-106`
- Modify: `messages/pt-BR.json`, `messages/en.json` (`transactionalEmails.welcome`)
- Test: `src/server/services/email.test.ts:260-317`, `src/server/auth/signup-trial.test.ts`

- [ ] **Step 1: O teste pede o e-mail único**

Em `email.test.ts`, no bloco de `sendWelcomeEmail`:
- apague os casos do e-mail clássico ("Entrou. Agora gera.", créditos);
- o caso do `firstOpen` passa a chamar `sendWelcomeEmail({ to, locale, firstName })`, sem `firstOpen`, e espera o
  assunto `transactionalEmails.welcomeFirstOpen.subject`.

Em `signup-trial.test.ts`:
- troque as asserções de `firstOpen` (perto das linhas 120 e 270-293) por `expect(sendWelcomeEmail).toHaveBeenCalledWith(expect.not.objectContaining({ firstOpen: expect.anything() }))`;
- tire o mock de `isEquipeEnabledForWorkspace`.

Run: `cd app && npx vitest run --config config/vitest.config.ts src/server/services/email.test.ts src/server/auth/signup-trial.test.ts`
Expected: FAIL (o e-mail clássico ainda sai sem `firstOpen`).

- [ ] **Step 2: Só o e-mail da primeira abertura**

Em `email.ts`, troque `sendWelcomeEmail` por:

```ts
export async function sendWelcomeEmail(input: {
  to: string;
  locale?: string | null;
  firstName?: string | null;
}) {
  const { t, locale } = await getTransactionalEmailTranslations(input.locale);
  const firstName = firstNameFromDisplayName(input.firstName);
  const greeting = firstName
    ? t("welcome.greeting", { firstName })
    : t("welcome.greetingAnonymous");
  const url = env.APP_URL;
  // The account opens on the first visit: the welcome leads there (brand reading and free diagnosis).
  await sendEmail({
    to: input.to,
    subject: t("welcomeFirstOpen.subject"),
    text: t("welcomeFirstOpen.text", { firstName: firstName ?? "", url }),
    html: renderTransactionalEmail({
      ...emailChrome(t, locale, t("eyebrows.account")),
      preview: t("welcomeFirstOpen.preview"),
      title: t("welcomeFirstOpen.title"),
      greeting,
      bodyHtml: [
        paragraphsToHtml([t("welcomeFirstOpen.intro")]),
        stepsToHtml([t("welcomeFirstOpen.step1"), t("welcomeFirstOpen.step2"), t("welcomeFirstOpen.step3")]),
        paragraphsToHtml([t("welcomeFirstOpen.close")]),
      ].join(""),
      cta: { label: t("welcomeFirstOpen.cta"), url },
      footerReason: t("welcome.reason"),
    }),
  });
}
```

Se `TRIAL_CREDIT_GRANT` ficar sem uso em `email.ts`, tire o import.

Em `auth/index.ts`, tire a linha `firstOpen: …` e o comentário acima dela, e tire o import de
`isEquipeEnabledForWorkspace`.

- [ ] **Step 3: As chaves do e-mail clássico saem**

Em `messages/pt-BR.json` e `messages/en.json`, em `transactionalEmails.welcome`, apague todas as chaves menos
`greeting`, `greetingAnonymous` e `reason`. Depois rode
`grep -rn "eyebrows.studio\|\"studio\":" src/server/services` e, se `eyebrows.studio` ficou sem uso, apague essa
chave nos dois arquivos. Em `tests/unit/i18n/customer-copy-guards.test.ts:101`, ajuste a referência às chaves
apagadas.

Run: `cd app && npx vitest run --config config/vitest.config.ts src/server/services src/server/auth tests/unit/i18n`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/server/services/email.ts app/src/server/services/email.test.ts app/src/server/auth app/messages app/tests/unit/i18n
git commit -m "feat(caminho-unico): one welcome email, the one that leads to the first open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: O interruptor sai do servidor

**Files:**
- Delete: `src/server/equipe/module/equipe-enabled.ts`, `src/server/equipe/module/equipe-enabled.test.ts`
- Modify (produção):
  - `src/server/validation/env.ts:74-80,206-250+`
  - `src/server/equipe/module/free-plan.ts:21,68-81`
  - `src/server/equipe/http/guards.ts:84`
  - `src/server/equipe/http/errors.ts:110`
  - `src/server/equipe/module/commands.ts:275-280`
  - `src/server/equipe/module/ports.ts` (o campo `isEnabledForWorkspace`)
  - `src/server/equipe/module/open-account-candidates.ts:37-39`
  - `src/server/equipe/jobs/shared.ts:86,115`
  - `src/server/equipe/jobs/notifications.ts:85`
  - `src/server/equipe/jobs/dispatch.ts:70`
  - `src/server/equipe/jobs/agent-work-outbox.ts:22`
  - `src/server/equipe/jobs/diagnosis.ts:181`
  - `src/server/equipe/handoff/read.ts:66,163`
  - `src/server/equipe/agents/agent-work.ts:32,69,79`
  - `src/server/equipe/testing/deps.ts:58`, `src/server/equipe/testing/free-pg.ts:36`
  - `src/app/(dashboard)/pipeline/page.tsx:8`, `ideas/page.tsx:8`, `goals/page.tsx:8`
  - `src/app/(dashboard)/admin/equipe/accounts/page.tsx:32`
  - `src/app/api/assistant/threads/[threadId]/route.ts:90`
  - `src/app/api/equipe/accounts/[accountId]/instagram/connect/route.ts:36`
  - `src/app/api/equipe/instagram/callback/route.ts:57`
  - `src/components/equipe/staff-errors.ts:14`
- Modify (config): `.github/workflows/ci.yml`, `app/.env.example`
- Test (os testes que mockam o gate):
  - `src/server/validation/env.test.ts:177-321`
  - `chat/route.test.ts:55,97,108`
  - `threads/[threadId]/route.test.ts:31,124,151-156`
  - `instagram/callback/route.test.ts:52`, `instagram/connect/route.test.ts:39`
  - `jornada.pg.test.ts:14,90`
  - `free-plan-signup.test.ts:22`
  - `staff-scale.pg.test.ts:129`
  - `free-accounts-sweeps.test.ts:20,155,167,207`
  - `free-plan.pg.test.ts:20-21`
  - `agents/agent-work.test.ts:50`

**Interfaces:**
- Produces:
  - `findFreePlanAccount(workspaceId, readers?)`, sem o terceiro parâmetro;
  - `listWorkspaceIdsForOpening(internal, after?)` em `open-account-candidates.ts`, devolvendo uma página de
    `OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE + 1` ids;
  - `EquipeModuleDeps` sem `isEnabledForWorkspace`.

- [ ] **Step 1: O ambiente valida as regras sempre**

Em `env.ts`:
- apague `EQUIPE_ENABLED` e `EQUIPE_PILOT_WORKSPACES`, com o comentário deles (linhas 74-80);
- no `superRefine`, troque `if (data.EQUIPE_ENABLED === "true") {` por um bloco sem condição, mantendo o corpo;
- troque o comentário acima do bloco por:
  `// Equipe rules (#550, #588): the conversation is the product, so the models it uses and their provider keys are checked at boot.`

Em `env.test.ts`, os casos que provam "sem gate não valida" (perto das linhas 177-321) passam a provar que a regra
vale sem nenhuma variável de gate:
- um ambiente com `EQUIPE_MODEL_STRATEGIST` `claude-*` e sem `ANTHROPIC_API_KEY` falha em `ANTHROPIC_API_KEY`;
- um com `muse-*` e sem `META_MODEL_API_KEY` falha em `META_MODEL_API_KEY`;
- apague os casos que só comparavam "gate ligado" com "gate desligado".

Run: `cd app && npx vitest run --config config/vitest.config.ts src/server/validation/env.test.ts`
Expected: PASS.

- [ ] **Step 2: Chaves de mentira no CI e no exemplo**

Em `.github/workflows/ci.yml`, em todo bloco `env:` que tem `OPENAI_API_KEY`, acrescente logo abaixo dela:

```yaml
          ANTHROPIC_API_KEY: sk-ant-test-ci-placeholder
          META_MODEL_API_KEY: meta-test-ci-placeholder
```

Run: `grep -c "OPENAI_API_KEY" .github/workflows/ci.yml; grep -c "ANTHROPIC_API_KEY" .github/workflows/ci.yml; grep -c "META_MODEL_API_KEY" .github/workflows/ci.yml`
Expected: os três números iguais.

Em `app/.env.example`, logo depois de `OPENAI_API_KEY=…`, acrescente:

```
# The conversation's models (Estrategista, research, reviewer): required at boot.
ANTHROPIC_API_KEY="sk-ant-replace-me"
META_MODEL_API_KEY="replace-me"
```

- [ ] **Step 3: O gate sai dos módulos**

Apague `equipe-enabled.ts` e `equipe-enabled.test.ts`. Em cada arquivo de produção da lista acima:
- **`free-plan.ts`:**
  - tire o import e o parâmetro `overrides` de `findFreePlanAccount`;
  - apague a linha 73;
  - no cabeçalho, apague o item "1. pilot off for the workspace" e renumere os outros;
  - no comentário de `freePlanLimitsApply`, troque "Unlike that rule there is no pilot gate: an account exists only
    where the pilot opened it." por nada.
- **`guards.ts`:** tire a checagem do gate em `equipeClientContext`, que passa a seguir direto para a resolução do
  contexto.
- **`errors.ts`:** apague o mapeamento de `equipe_not_enabled`.
- **`commands.ts`:** apague `const enabledForWorkspace = …` e o `if` que devolve `equipe_not_enabled` (linhas
  275-280); se `isGlobalStopCommand` ficar sem uso, tire o import.
- **`ports.ts`:** apague o campo `isEnabledForWorkspace` de `EquipeModuleDeps`, com o comentário dele.
- **`open-account-candidates.ts`:** apague o bloco `const enabled = …; if (!enabled) return null;`. No fim do
  arquivo, acrescente:

```ts
/** Preserve the paid Operations form's paging: one bounded page of workspace ids plus a sentinel for the next link. */
export const OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listWorkspaceIdsForOpening(
  internal: Pick<InternalEquipeRepositories, "listWorkspaceIds">, after?: string,
): Promise<string[]> {
  if (after !== undefined && !UUID_PATTERN.test(after)) return [];
  return internal.listWorkspaceIds({ after, limit: OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE + 1 });
}
```

  (importe `InternalEquipeRepositories` de `../data` se o arquivo ainda não importa.)
- **`admin/equipe/accounts/page.tsx`:** troque o import e a chamada por
  `listWorkspaceIdsForOpening(createEquipeRouteDeps().uow.internal, cursor)`, importando
  `listWorkspaceIdsForOpening` e `OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE` de `@/server/equipe/module/open-account-candidates`.
- **Jobs (`shared.ts`, `notifications.ts`, `dispatch.ts`, `agent-work-outbox.ts`, `diagnosis.ts`, `handoff/read.ts`):**
  - apague `isEnabledForWorkspace` de `createProdJobDeps` e do tipo das deps;
  - apague cada filtro ou `skip` que o consulta, mantendo o caminho em que ele dava `true`;
  - em `handoff/read.ts`, o `?? true` some junto.
- **`agent-work.ts`:** apague `EQUIPE_NOT_ENABLED_ERROR` e as duas recusas (linhas 69 e 79).
- **`testing/deps.ts:58` e `testing/free-pg.ts:36`:** apague o `isEnabledForWorkspace` padrão.
- **`pipeline`, `ideas` e `goals` (`page.tsx`):** apague o `if (!isEquipeEnabledForWorkspace(…)) notFound();` e os
  imports que ficarem sem uso.
- **`threads/[threadId]/route.ts`:** troque a condição da linha 90 por `if (!z.string().uuid().safeParse(threadId).success)`.
- **Rotas de Instagram:** apague a recusa pelo gate em `connect/route.ts:36` e o redirect `not_enabled` em
  `callback/route.ts:57`.
- **`staff-errors.ts`:** apague o mapeamento `equipe_not_enabled → "notEnabled"`; se a chave de mensagem `notEnabled`
  ficar sem uso, apague-a nos dois `messages/*.json`.

- [ ] **Step 4: Os testes deixam de mockar o gate**

Em cada teste da lista:
- apague o mock de `isEquipeEnabledForWorkspace` ou o `isEnabledForWorkspace` das deps;
- apague os casos que provavam a recusa com o gate desligado ("pilot off", "not enabled", 404 do gate, `not_enabled`);
- mantenha os casos do caminho ligado;
- em `free-plan.pg.test.ts`, tire o terceiro argumento das chamadas de `findFreePlanAccount`.

Run: `grep -rn "isEquipeEnabledForWorkspace\|EQUIPE_ENABLED\|EQUIPE_PILOT_WORKSPACES\|isEnabledForWorkspace\|equipe_not_enabled\|EQUIPE_NOT_ENABLED\|listPilotWorkspaceIds\|EquipeEnabledOverrides" app/src app/scripts app/tests`
Expected: nada. (`EQUIPE_PUBLISH_ENABLED` é outro interruptor e fica.)

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts src/server src/app/api "src/app/(dashboard)" src/components/equipe`
Expected: PASS.

Run: `TEST_DATABASE_URL=postgres://jhonatan@localhost:5432/caminho_unico_e3_test npx vitest run --config config/vitest.config.ts src/server/equipe src/server/billing --no-file-parallelism --maxWorkers=1`
Expected: PASS, salvo as falhas locais esperadas de "Como rodar".

- [ ] **Step 5: Tipos, convergência e commit**

Run: `npm run typecheck && npm run convergence:test && npm run convergence:gate`
Expected: sem erro.

```bash
git add -A app/src app/.env.example .github/workflows/ci.yml
git commit -m "feat(caminho-unico): no product switch: EQUIPE_ENABLED and the pilot allowlist are gone

The conversation is the product for every workspace. The model and provider
key rules are checked at boot; CI gets placeholder keys.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: O cliente para de perguntar se o produto está ligado

**Files:**
- Modify: `src/lib/equipe/api.ts:9-14,29,325,329` (`EquipeDisabledError`, `gate404`)
- Modify: `src/lib/equipe/use-equipe.ts:48-56` (`useEquipeEnabled`)
- Modify: `src/components/equipe/EquipeAccountStates.tsx:90-92` (`isDisabledError`)
- Modify: `src/components/equipe/PipelineView.tsx:254`, `IdeasView.tsx:362`, `GoalsView.tsx:457`
- Modify: `src/components/equipe/EquipeNavLinks.tsx:19-29`
- Modify: `src/app/(dashboard)/campaigns/page.tsx:24,126-134,231-232`
- Test: os testes desses arquivos e `src/app/(dashboard)/campaigns/page.test.tsx:12`

- [ ] **Step 1: Criações usa sempre os rótulos e a tela vazia do produto**

Em `campaigns/page.test.tsx`:
- tire o mock de `useEquipeEnabled` (linha 12);
- troque o mock de `EquipeEmptyScreen` por `({ surface }: { surface: string }) => <div data-testid="equipe-empty-screen" data-surface={surface} />`;
- acrescente um caso: com a lista vazia e sem filtros, a página entrega `EquipeEmptyScreen` com `surface="creations"`.
  Se a página passa a tela vazia ao `CampaignsV6View` por prop, faça o mock do `CampaignsV6View` renderizar essa prop.

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts "src/app/(dashboard)/campaigns/page.test.tsx"`
Expected: FAIL (sem o mock, a página quebra no import ou mostra os rótulos clássicos).

Em `campaigns/page.tsx`:
- tire `useEquipeEnabled` e a variável `equipeEnabled`;
- os `labels` passam a ser sempre
  `{ ...base, sectionLabel: tCreations("section"), formatTitle: () => tCreations("title"), subtitle: "", newWork: tCreations("create") }`;
- a tela vazia sem filtros é sempre `<EquipeEmptyScreen surface="creations" />`;
- o `EmptyState` clássico fica só para "filtros sem resultado", se a página já distingue esse caso.

Run: o mesmo comando.
Expected: PASS.

- [ ] **Step 2: O erro de produto desligado some**

- **`api.ts`:** apague `EquipeDisabledError`, o parâmetro `gate404` e o `throw` dele. As leituras de
  `/api/equipe/accounts` e `/api/equipe/accounts/:id` tratam 404 como qualquer outro erro.
- **`use-equipe.ts`:** apague `useEquipeEnabled` e o import de `EquipeDisabledError`.
- **`EquipeAccountStates.tsx`:** apague `isDisabledError` e o estado "desligado" que ele alimenta.
- **`PipelineView`, `IdeasView`, `GoalsView`:** apague o ramo que mostra o estado desligado.
- **`EquipeNavLinks.tsx`:** `useEquipeNavLinks` devolve os links sempre, sem o `null` do produto desligado.

As chaves de mensagem que só o estado desligado usava saem dos dois `messages/*.json`. Para achá-las, rode
`grep -n "disabled\|notEnabled" src/components/equipe/EquipeAccountStates.tsx` antes de apagar.

Run: `grep -rn "EquipeDisabledError\|useEquipeEnabled\|isDisabledError\|gate404" app/src`
Expected: nada.

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts src/lib/equipe src/components/equipe src/components/layout "src/app/(dashboard)"`
Expected: PASS. Ajuste os testes que mockavam `useEquipeEnabled` ou esperavam o estado desligado: tire o mock e
apague o caso do estado desligado.

- [ ] **Step 3: Inventário, convergência e commit**

Run: `npm run typecheck && npm run convergence:inventory && npm run convergence:test && npm run convergence:gate`
Expected: sem erro.

```bash
git add -A app/src app/messages .planning/convergence/surface-inventory.raw.json
git commit -m "refactor(caminho-unico): screens stop asking whether the product is on

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: A casca clássica sai

**Files:**
- Delete (com os testes de cada um):
  - `src/components/layout/DashboardShellSwitcher.tsx` (+ `DashboardShellSwitcher.test.tsx`)
  - `src/components/layout/AppShell.tsx` (+ `AppShell.test.tsx`)
  - `src/components/layout/AppSidebar.tsx` (+ `AppSidebar.test.tsx`)
  - `src/components/layout/SidebarRecentWorks.tsx` (+ teste)
  - `src/components/layout/SidebarBrandKitFeature.tsx` (+ teste)
  - `src/components/equipe/EquipeStaffNav.tsx` (+ teste)
  - `src/components/layout/AccountStatusBadge.tsx` (+ teste)
  - `src/components/layout/SidebarAssistantModeSwitch.tsx` (+ teste)
- Modify:
  - `src/components/layout/V6ShellLayout.tsx` (o `sidebar` passa a ser obrigatório)
  - `src/components/layout/TopBar.tsx` (sai o default `TopBar`, fica `NotificationMenu`) e `TopBar.test.tsx`
  - `src/components/layout/access-probes.shell.test.tsx:16` (sai a parte do `EquipeStaffNav`)
  - `.planning/convergence/surface-decisions.yaml:12-16` (sai a decisão `B-demo-restore-stub`)
  - `src/app/globals.css:770-893` (saem `.v6-shell-sidebar` e `.v6-shell-main`)

**Interfaces:**
- Consumes: o layout da Task 2 já renderiza `RailShell` direto.
- Produces: `V6ShellLayout({ children, sidebar }: { children: ReactNode; sidebar: ReactNode })`.

- [ ] **Step 1: Conferir que nada vivo importa a casca clássica**

Run: `cd app && grep -rln "DashboardShellSwitcher\|AppShell\|AppSidebar\|SidebarRecentWorks\|SidebarBrandKitFeature\|EquipeStaffNav\|AccountStatusBadge\|SidebarAssistantModeSwitch" src | grep -v "\.test\."`
Expected: só os próprios arquivos da lista, mais `V6ShellLayout.tsx` (import do `AppSidebar`) e `TopBar.tsx` (import do
`AccountStatusBadge`). Se aparecer outro importador, pare: esse arquivo precisa sair primeiro ou o componente não é
morto.

- [ ] **Step 2: Apagar e ajustar os sobreviventes**

- Apague os arquivos da lista "Delete", com os testes.
- **`V6ShellLayout.tsx`:** tire o import de `AppSidebar`, troque `sidebar?: ReactNode` por `sidebar: ReactNode` e
  `{sidebar ?? <AppSidebar />}` por `{sidebar}`.
- **`TopBar.tsx`:**
  - apague o default export `TopBar` e tudo que só ele usa, incluindo o item de restauração da demo (linha 451) e o
    import de `AccountStatusBadge`;
  - mantenha `NotificationMenu`, que o `RailHeader` usa;
  - se `deriveRouteTitle` ficar sem uso fora do teste, apague-o.
- **`TopBar.test.tsx`:** apague os casos do default e mantenha os do `NotificationMenu`.
- **`access-probes.shell.test.tsx`:** apague a parte do `EquipeStaffNav`.
- **`surface-decisions.yaml`:** apague a entrada `B-demo-restore-stub` (linhas 12-16), cujo bloqueador estava no
  `TopBar` default.
- **`globals.css`:** rode `grep -rn "v6-shell-sidebar\|v6-shell-main" app/src`. Para cada classe sem uso, apague as
  regras dela em `globals.css`.

- [ ] **Step 3: Testes, inventário e gates**

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts src/components/layout src/components/equipe "src/app/(dashboard)"`
Expected: PASS.

Run: `npm run typecheck && npm run convergence:inventory && npm run convergence:test && npm run convergence:gate`
Expected: sem erro. Se o gate do inventário falhar com "blockerId not found", a entrada do `surface-decisions.yaml` que
aponta para uma linha apagada ficou para trás: apague-a.

- [ ] **Step 4: Commit**

```bash
git add -A app/src .planning/convergence
git commit -m "refactor(caminho-unico): delete the classic shell

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: O `/assistant` clássico sai

**Files:**
- Delete (com os testes de cada um):
  - `src/components/assistant/AssistantShell.tsx` e `AssistantMobileTabs.tsx`
  - `src/components/assistant/AssistantSidebarPanel.tsx` e `AssistantTreeSidebar.tsx`
  - `src/components/assistant/AssistantContextPanelSlot.tsx`, `AssistantContextPanel.tsx`, `AssistantReviewPanel.tsx`,
    `VersionHistory.tsx`
  - `AssistantGoalWorkspaceSlot.tsx`, `AssistantGoalWorkspace.tsx`, `AssistantGoalPlan.tsx`, `CreativeTripletGrid.tsx`,
    `CreativeAnnotationEditor.tsx`, `GoalPackageReview.tsx`
  - `src/lib/hooks/use-assistant-goal.ts`
  - `src/components/assistant/AssistantMain.tsx`, `AssistantStartComposer.tsx`, `AssistantJourneyCards.tsx`
  - `src/components/assistant/AssistantCreateThreadDialog.tsx`
- Modify:
  - `src/components/assistant/assistant-chrome.ts` (saem `assistantShellClass` e `assistantComposerClass`, se só os
    apagados usavam)
  - `src/lib/hooks/use-guided-flow.ts` (sai `useUpsertGuidedFlow`, se só o `AssistantStartComposer` usava)
  - `scripts/run-goal-agent-release-gate.mjs`, `scripts/run-v13-9-release-gate.mjs`, `package.json`

**Interfaces:**
- Consumes: `assistant/page.tsx` da Task 2 já não importa `AssistantMain`, e `assistant/layout.tsx` já saiu.
- Ficam: `AssistantChatCore` (usado pelo `RailChat` e pelo `CampaignAssistantDrawer`), `AssistantCreateClientDialog`
  (usado pelo `BrandSwitcher`), `AssistantSurfaceContext` e `use-assistant-artifact-versions`.

- [ ] **Step 1: Conferir os importadores**

Run: `cd app && for n in AssistantShell AssistantMobileTabs AssistantSidebarPanel AssistantTreeSidebar AssistantContextPanelSlot AssistantContextPanel AssistantReviewPanel VersionHistory AssistantGoalWorkspaceSlot AssistantGoalWorkspace AssistantGoalPlan CreativeTripletGrid CreativeAnnotationEditor GoalPackageReview use-assistant-goal AssistantMain AssistantStartComposer AssistantJourneyCards AssistantCreateThreadDialog; do echo "$n: $(grep -rl "$n" src | grep -v "\.test\." | tr '\n' ' ')"; done`
Expected: cada nome aparece só no próprio arquivo ou em outro arquivo da lista. `VersionHistory` pode casar com
`VersionComparisonDialog`: confira só os imports de `./VersionHistory`. Se algum nome tiver importador vivo, pare e
mantenha esse arquivo.

- [ ] **Step 2: Apagar**

- Apague os arquivos da lista com os testes:
  - `AssistantShell.test.tsx`, `AssistantSidebarPanel.test.tsx`, `AssistantTreeSidebar.test.tsx`;
  - `AssistantContextPanelSlot.test.tsx`, `VersionHistory.test.tsx`, `AssistantReviewPanel.test.tsx`;
  - `AssistantStartComposer.test.tsx`, `AssistantJourneyCards.test.tsx`;
  - `GoalPackageReview.test.tsx`, `CreativeTripletGrid.test.tsx`, `CreativeAnnotationEditor.test.tsx`.
- **`assistant-chrome.ts`:** rode `grep -rn "assistantShellClass\|assistantComposerClass" src`. As classes sem uso
  saem do arquivo, e o arquivo sai se ficar vazio.
- **`useUpsertGuidedFlow`:** rode `grep -rn "useUpsertGuidedFlow" src`. Se só o teste dele restar, apague o hook e o
  teste.

- [ ] **Step 3: Scripts de release gate**

- **`scripts/run-goal-agent-release-gate.mjs`:** linhas 22-24 (três testes apagados) e 58 (o spec
  `assistant-goal-agent`, que a Task 12 apaga). Se a lista de testes ficar vazia, apague o script e a entrada
  `"goal-agent-release-gate"` do `package.json`.
- **`scripts/run-v13-9-release-gate.mjs`:** linhas 24-25 (os specs `iterative-copilot-loop.*`, que a Task 12 apaga).
  Tire esses dois da lista; se ela ficar vazia, apague o script e a entrada `"v13-9-release-gate"`.

- [ ] **Step 4: Testes, inventário e commit**

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts src/components/assistant src/lib/hooks "src/app/(dashboard)"`
Expected: PASS.

Run: `npm run typecheck && npm run lint && npm run convergence:inventory && npm run convergence:test && npm run convergence:gate`
Expected: sem erro.

```bash
git add -A app/src app/scripts app/package.json .planning/convergence/surface-inventory.raw.json
git commit -m "refactor(caminho-unico): delete the classic /assistant

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: O código morto da seção 4 e os forks de tela

**Files:**
- Delete (com os testes de cada um):
  - `src/components/dashboard/MissionCreditBanner.tsx`, `src/components/billing/ConversionCta.tsx`,
    `src/lib/billing/conversion-client.ts`
  - `src/components/guest-home/GuestStudioEntry.tsx`, `GuestDraftResume.tsx`, `useGuestDraftImport.ts`
  - `src/lib/guest-home/import-text.ts`, `import-references.ts`, `telemetry.ts` e `handoff.ts`
  - `src/components/brand-training/BrandTrainingWizard.tsx` e `BrandTrainingStepper.tsx`, mais o hook
    `useExtractMulti` de `src/lib/hooks/use-brand-training.ts` (o resto do arquivo fica, se tiver outros usos)
- Modify:
  - `src/app/(dashboard)/brand-kit/page.tsx:4-10,57-62` e `brand-kit/page.test.tsx:19`
  - `src/components/equipe/GoalsView.tsx:442,463-467`, `IdeasView.tsx:348,368-372`, `PipelineView.tsx:241,260-264` e
    `EquipeAccountStates.tsx:44,54`
  - `src/components/dashboard/DashboardHomeActions.tsx:84-88,582-600`
  - `src/components/billing/free-plan-fail-closed.test.tsx:25,40`
  - `src/components/guest-home/guest-core.mjs:66-69`, `guest-controller.mjs:147,158`
  - `src/lib/studio/composer-href.ts:60-61` e o teste dele
  - `src/lib/studio/composer-links.guard.test.ts:13`

- [ ] **Step 1: O código morto sai**

1. Confira os importadores:

   Run: `cd app && for n in MissionCreditBanner ConversionCta conversion-client GuestStudioEntry GuestDraftResume useGuestDraftImport guest-home/import-text guest-home/import-references guest-home/telemetry guest-home/handoff BrandTrainingWizard BrandTrainingStepper useExtractMulti; do echo "$n: $(grep -rl "$n" src | grep -v "\.test\." | tr '\n' ' ')"; done`
   Expected: só os próprios arquivos e os da lista, mais `brand-kit/page.tsx` (que importa `BrandFontFiles` e
   `BrandVoiceSection` pelo `BrandTrainingWizard`).

2. Em `brand-kit/page.tsx`:
   - importe `BrandFontFiles` de `@/components/brand-training/BrandFontFiles` e `BrandVoiceSection` de
     `@/components/brand-training/BrandVoiceSection` (os arquivos que o wizard só reexportava);
   - apague o `ActiveBrandSwitcher id="brand-kit-active-brand"` (linhas 57-62) e o import dele: o trilho já escolhe a
     marca;
   - em `brand-kit/page.test.tsx`, tire o mock do switcher.

3. Apague os arquivos da lista com os testes. `import-contracts.ts` fica se `guest-store.d.mts` ainda importa os tipos
   dele.

4. Em `free-plan-fail-closed.test.tsx`, apague a linha do `ConversionCta` (linhas 25 e 40).

- [ ] **Step 2: Os forks de tela da casca clássica saem**

Com o trilho em toda rota do `(dashboard)`, `useActiveBrand()` nunca é `undefined` nessas telas.
- **`GoalsView`, `IdeasView`, `PipelineView`:**
  - apague `const inRail = …`;
  - apague os ramos `!inRail` que mostram `EquipeAccountSwitcher` e `EquipeEmptyAccounts`;
  - o que era do ramo `inRail` fica sem condição.
- **`EquipeAccountStates.tsx`:** apague `EquipeAccountSwitcher` e `EquipeEmptyAccounts`, se ficarem sem importador.
- **`DashboardHomeActions.tsx`:**
  - apague o fork `inRail` das linhas 84-88, ficando o caminho do trilho;
  - troque `topBar={inRail ? null : …}` por nada, apagando a barra `stage-brand-bar` com o "Novo trabalho" e o
    `ActiveBrandSwitcher`;
  - se a prop `topBar` ficar sem uso no componente que a recebe, tire-a de lá.
- **Testes:**
  - nos de `PipelineView`, `IdeasView` e `GoalsView`, apague os casos do seletor por tela e da lista vazia clássica
    (`PipelineView.test.tsx:273,294,317,396-420`, `IdeasView.test.tsx:241-265`, `GoalsView.test.tsx:560`);
  - em `DashboardHomeActions.test.tsx`, apague o caso da linha 364 (a barra clássica).

- [ ] **Step 3: O convidado volta para `/`**

- **`guest-core.mjs`:** `buildResumePath` passa a devolver `'/'`. Os parâmetros ficam, porque o controller ainda os
  passa; o rascunho do convidado não é reconectado (spec §4).
- **`guest-controller.mjs:147`:** troque `let path = '/?compose=1&fresh=1';` por `let path = '/';`.
- **`guest-core.test.ts`:** ajuste os dois casos (linhas 56 e 93) para esperar `'/'`.
- **`composer-href.ts`:** apague a exceção das linhas 60-61, que mantinha em `/` um endereço com `guestDraft`. Um link
  antigo com `?compose=1&guestDraft=…` passa a ir para o composer com a mesma consulta, e o composer ignora o
  `guestDraft`. No teste de `composer-href`, troque o caso do `guestDraft` para esperar o redirecionamento.
- **`composer-links.guard.test.ts:13`:** apague o pulo de `src/components/guest-home`.

- [ ] **Step 4: Testes, inventário e commit**

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts src/components src/lib "src/app/(dashboard)" src/app/hi`
Expected: PASS.

Run: `npm run typecheck && npm run lint && npm run check:guest-home-assets && npm run convergence:inventory && npm run convergence:test && npm run convergence:gate`
Expected: sem erro.

```bash
git add -A app/src .planning/convergence/surface-inventory.raw.json
git commit -m "refactor(caminho-unico): delete the dead code of section 4 and the classic screen forks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Os erros de `/` têm saída

**Files:**
- Create: `src/components/assistant/conversation/HomeOpenProblem.tsx`
- Create: `src/components/assistant/conversation/HomeOpenProblem.test.tsx`
- Modify: `src/app/(dashboard)/page.tsx`
- Modify: `messages/pt-BR.json`, `messages/en.json` (em `assistant`)
- Test: `src/app/(dashboard)/page.test.tsx:295-326`

**Interfaces:**
- Produces:

```ts
export type HomeOpenProblemProps =
  | { kind: "verifyEmail"; email: string }
  | { kind: "ownerFirst"; ownerName: string | null }
  | { kind: "openError" };
```

- [ ] **Step 1: Mensagens**

Em `messages/pt-BR.json`, dentro de `assistant`:
- troque `homeOpenError` por `"Não foi possível abrir sua conversa."`;
- acrescente:

```json
    "homeOwnerFirstNamed": "Peça para {owner} abrir o ADScale primeiro. Assim que essa pessoa entrar, sua conversa abre aqui.",
    "homeRetry": "Tentar de novo",
    "homeRetrying": "Tentando…",
```

Em `messages/en.json`, dentro de `assistant`:
- troque `homeOpenError` por `"We could not open your conversation."`;
- acrescente:

```json
    "homeOwnerFirstNamed": "Ask {owner} to open ADScale first. As soon as they do, your conversation opens here.",
    "homeRetry": "Try again",
    "homeRetrying": "Trying…",
```

- [ ] **Step 2: Teste do componente**

Crie `HomeOpenProblem.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomeOpenProblem from "./HomeOpenProblem";

const refresh = vi.fn();
const sendVerificationEmail = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/auth-client", () => ({ authClient: { sendVerificationEmail: (...args: unknown[]) => sendVerificationEmail(...args) } }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => (values?.owner ? `${key}:${values.owner}` : key),
}));

describe("HomeOpenProblem: every error of / has a way out (spec 2026-10-07 §4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an unverified email can ask for the confirmation again", async () => {
    sendVerificationEmail.mockResolvedValue({ data: {}, error: null });
    render(<HomeOpenProblem kind="verifyEmail" email="ana@example.test" />);
    expect(screen.getByRole("status")).toHaveTextContent("homeVerifyEmail");
    fireEvent.click(screen.getByRole("button", { name: "resendVerificationEmail" }));
    await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledWith({ email: "ana@example.test", callbackURL: "/" }));
    expect(await screen.findByText("verificationEmailSent")).toBeInTheDocument();
  });

  it("a failed resend says so and keeps the button", async () => {
    sendVerificationEmail.mockResolvedValue({ data: null, error: { message: "boom" } });
    render(<HomeOpenProblem kind="verifyEmail" email="ana@example.test" />);
    fireEvent.click(screen.getByRole("button", { name: "resendVerificationEmail" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("verificationEmailError");
    expect(screen.getByRole("button", { name: "resendVerificationEmail" })).toBeEnabled();
  });

  it("names the owner who has to open ADScale first, and can try again", () => {
    render(<HomeOpenProblem kind="ownerFirst" ownerName="Bia" />);
    expect(screen.getByRole("alert")).toHaveTextContent("homeOwnerFirstNamed:Bia");
    fireEvent.click(screen.getByRole("button", { name: "homeRetry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("without the owner's name keeps the generic owner message", () => {
    render(<HomeOpenProblem kind="ownerFirst" ownerName={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("homeOwnerFirst");
  });

  it("any other opening error can be tried again", () => {
    render(<HomeOpenProblem kind="openError" />);
    expect(screen.getByRole("alert")).toHaveTextContent("homeOpenError");
    fireEvent.click(screen.getByRole("button", { name: "homeRetry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
```

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts src/components/assistant/conversation/HomeOpenProblem.test.tsx`
Expected: FAIL ("Cannot find module './HomeOpenProblem'").

- [ ] **Step 3: O componente**

Crie `HomeOpenProblem.tsx`:

```tsx
"use client";

// What `/` shows when the conversation cannot open (spec 2026-10-07 §4), each with a real way out: resend the confirmation,
// say who the owner is, or try again. Before, the rail and "Abrir a conversa" led back to the same bare message.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export type HomeOpenProblemProps =
  | { kind: "verifyEmail"; email: string }
  | { kind: "ownerFirst"; ownerName: string | null }
  | { kind: "openError" };

const BUTTON = "rounded-full bg-[var(--text-primary)] px-5 py-2 text-xs font-semibold text-[var(--surface-base)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50";

export default function HomeOpenProblem(props: HomeOpenProblemProps) {
  return (
    <div className="flex flex-col items-start gap-3 p-6" data-testid="home-open-problem" data-kind={props.kind}>
      {props.kind === "verifyEmail" ? <ResendConfirmation email={props.email} /> : <TryAgain {...props} />}
    </div>
  );
}

function ResendConfirmation({ email }: { email: string }) {
  const t = useTranslations("assistant");
  const tAuth = useTranslations("auth");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  async function resend() {
    setState("sending");
    try {
      const res = await authClient.sendVerificationEmail({ email, callbackURL: "/" });
      setState(res?.error ? "failed" : "sent");
    } catch {
      setState("failed");
    }
  }
  return (
    <>
      <p className="text-sm text-[var(--text-secondary)]" role="status">{t("homeVerifyEmail")}</p>
      <button type="button" className={BUTTON} disabled={state === "sending" || state === "sent"} onClick={() => void resend()}>
        {state === "sending" ? tAuth("resendingVerificationEmail") : tAuth("resendVerificationEmail")}
      </button>
      {state === "sent" ? <p className="text-xs text-[var(--text-muted)]">{tAuth("verificationEmailSent")}</p> : null}
      {state === "failed" ? <p className="text-xs text-[var(--danger-text)]" role="alert">{tAuth("verificationEmailError")}</p> : null}
    </>
  );
}

function TryAgain(props: Exclude<HomeOpenProblemProps, { kind: "verifyEmail" }>) {
  const t = useTranslations("assistant");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const message = props.kind === "ownerFirst"
    ? props.ownerName ? t("homeOwnerFirstNamed", { owner: props.ownerName }) : t("homeOwnerFirst")
    : t("homeOpenError");
  return (
    <>
      <p className="text-sm text-[var(--danger-text)]" role="alert">{message}</p>
      <button type="button" className={BUTTON} disabled={pending} onClick={() => startTransition(() => router.refresh())}>
        {pending ? t("homeRetrying") : t("homeRetry")}
      </button>
    </>
  );
}
```

Run: o mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 4: `/` usa o componente**

Em `src/app/(dashboard)/page.tsx`:
- importe `HomeOpenProblem` de `@/components/assistant/conversation/HomeOpenProblem` e `getWorkspaceMembers` de
  `@/server/auth/team`;
- tire o `getTranslations`, que fica sem uso;
- troque o retorno do e-mail não confirmado por
  `return <HomeOpenProblem kind="verifyEmail" email={user.email} />;`;
- troque o bloco do erro de abertura por:

```tsx
  if (typeof threadId !== "string" || !threadId) {
    if (!opened.ok && opened.error.code === "forbidden_actor") {
      // The owner has not confirmed their email yet: the opening needs them. Say who, so the person knows whom to ask.
      const owner = (await getWorkspaceMembers(workspace.id)).find((member) => member.role === "owner");
      return <HomeOpenProblem kind="ownerFirst" ownerName={owner ? owner.name || owner.email : null} />;
    }
    return <HomeOpenProblem kind="openError" />;
  }
```

Em `page.test.tsx` (linhas 295-326):
- mocke `@/components/assistant/conversation/HomeOpenProblem` com um componente que renderiza
  `data-kind={props.kind}` e o `ownerName`;
- mocke `@/server/auth/team` com
  `getWorkspaceMembers: async () => [{ role: "owner", name: "Bia", email: "bia@example.test" }]`;
- os três casos esperam `verifyEmail` (com o e-mail do usuário), `ownerFirst` com `ownerName` `"Bia"` e `openError`.

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts "src/app/(dashboard)/page.test.tsx" src/components/assistant/conversation`
Expected: PASS.

- [ ] **Step 5: Gates e commit**

Run: `npm run typecheck && npm run convergence:inventory && npm run convergence:test && npm run convergence:gate`
Expected: sem erro.

```bash
git add app/src/components/assistant/conversation/HomeOpenProblem.tsx app/src/components/assistant/conversation/HomeOpenProblem.test.tsx "app/src/app/(dashboard)/page.tsx" "app/src/app/(dashboard)/page.test.tsx" app/messages .planning/convergence/surface-inventory.raw.json
git commit -m "feat(caminho-unico): every error of / has a way out

Resend the confirmation, name the owner who has to open first, try again.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: A conversa de uma Conta encerrada é só leitura

**Files:**
- Modify: `src/components/assistant/AssistantChatCore.tsx:28-45,118-133,198-209,384-388,403-413`
- Modify: `src/components/assistant/conversation/RailChat.tsx`
- Modify: `src/components/billing/FreePlanCta.tsx:77-98` (exporta `ClosedAccountRequest`)
- Modify: `src/app/api/assistant/threads/[threadId]/chat/route.ts`
- Modify: `messages/pt-BR.json`, `messages/en.json` (`errors.accountClosed`)
- Test:
  - `src/components/assistant/conversation/RailChat.test.tsx`
  - `src/components/assistant/AssistantChatCore.test.tsx`
  - `chat/route.test.ts`

**Interfaces:**
- Produces: a prop `readOnlyFooter?: ReactNode` em `AssistantChatCoreProps`. Quando definida, ela substitui a caixa,
  e nenhuma sugestão é enviada. `ClosedAccountRequest` passa a ser exportado de `FreePlanCta.tsx`.

- [ ] **Step 1: Testes**

1. Em `AssistantChatCore.test.tsx`, acrescente:
   - com `readOnlyFooter={<p>só leitura</p>}`, a caixa (`assistant-chat-input`) não aparece e "só leitura" aparece;
   - clicar numa sugestão de mensagem não chama o envio. Copie o arranjo do caso de sugestão que já existe no arquivo.
2. Em `RailChat.test.tsx`:
   - mocke `useConversationContext` com `{ accountStatus: "closed", accountId: "acc-1", isPrimary: true, … }` e
     `AssistantChatCore` com um componente que renderiza a prop `readOnlyFooter`;
   - espere o `ClosedAccountRequest`: mocke `@/components/billing/FreePlanCta` com
     `ClosedAccountRequest: ({ accountId }) => <p>closed:{accountId}</p>` e espere `closed:acc-1`;
   - com `accountStatus: "free"`, `readOnlyFooter` é `undefined`.
3. Em `chat/route.test.ts`, um caso com `findEquipeThreadByAssistantThread` devolvendo
   `{ account: { id: "acc-1", status: "closed" }, thread: … }`:
   - espere 409 com `error: "accountClosed"`;
   - espere que `runEquipeTurn` não seja chamado.

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts src/components/assistant src/app/api/assistant/threads`
Expected: os casos novos falham.

- [ ] **Step 2: A prop no chat**

Em `AssistantChatCore.tsx`:
- em `AssistantChatCoreProps`, depois de `onUrlSuggestionHandled`, acrescente:

```ts
  /** The conversation is read-only (a closed account): this replaces the input, and no suggestion is sent. */
  readOnlyFooter?: ReactNode;
```

- acrescente `readOnlyFooter` à desestruturação das props;
- no efeito do `urlSuggestion`, troque `if (!threadId || isLoading …` por `if (readOnlyFooter || !threadId || isLoading …`
  e acrescente `readOnlyFooter` às dependências;
- no `onSuggestion` (perto da linha 384), troque `if (isStreaming || sendingRef.current) return;` por
  `if (readOnlyFooter || isStreaming || sendingRef.current) return;`;
- troque `<AssistantChatInput … />` por `{readOnlyFooter ?? <AssistantChatInput … />}`, com as mesmas props de hoje
  na caixa.

- [ ] **Step 3: O `RailChat` passa o aviso**

Em `FreePlanCta.tsx`, troque `function ClosedAccountRequest(` por `export function ClosedAccountRequest(`.

Em `RailChat.tsx`, importe `ClosedAccountRequest` de `@/components/billing/FreePlanCta`, crie
`const closedAccountId = conversation.accountStatus === "closed" ? conversation.accountId : null;` e passe para o
`AssistantChatCore`:

```tsx
        readOnlyFooter={closedAccountId ? (
          <div className="px-4 pb-6 md:px-9">
            <ClosedAccountRequest accountId={closedAccountId} />
          </div>
        ) : undefined}
```

- [ ] **Step 4: O servidor recusa o turno**

Em `messages/pt-BR.json`, em `errors`, depois de `threadNotInAccount`:

```json
    "accountClosed": "A conta desta marca foi encerrada. A conversa fica para leitura; para continuar, fale com uma pessoa do nosso time.",
```

Em `messages/en.json`, no mesmo lugar:

```json
    "accountClosed": "This brand's account was closed. The conversation stays readable; to continue, talk to someone on our team.",
```

Em `chat/route.ts`, logo depois do bloco do `free_plan`:

```ts
    // Spec 2026-10-07 §4: a closed account's conversation is read-only. The screen offers no input; a turn sent anyway is
    // refused before the message is recorded (it used to be answered as "paused").
    if (equipeMatch?.account.status === "closed") {
      return apiError("accountClosed", 409);
    }
```

Run: o comando do Step 1.
Expected: PASS.

- [ ] **Step 5: Gates e commit**

Run: `npm run typecheck && npm run convergence:inventory && npm run convergence:test && npm run convergence:gate`
Expected: sem erro.

```bash
git add -A app/src/components/assistant app/src/components/billing app/src/app/api/assistant app/messages .planning/convergence/surface-inventory.raw.json
git commit -m "feat(caminho-unico): a closed account's conversation is read-only, with a way to a person

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: O link para a conversa de outra marca troca a marca ativa

**Files:**
- Modify: `src/lib/equipe/use-equipe.ts:140-188`
- Modify: `src/components/assistant/conversation/ConversationScreen.tsx`
- Modify: `src/app/(dashboard)/assistant/page.tsx`
- Test:
  - `src/lib/equipe/use-equipe.test.tsx`
  - `src/components/assistant/conversation/ConversationScreen.test.tsx`
  - `src/app/(dashboard)/assistant/page.test.tsx`

**Interfaces:**
- Produces: `useFollowLinkedBrand(linkedBrand: string | null | undefined): { refused: boolean }`, exportado de
  `use-equipe.ts`.

- [ ] **Step 1: Testes**

1. Em `use-equipe.test.tsx`, acrescente um `describe("useFollowLinkedBrand")`, com o mesmo `QueryClient` e os mocks
   do `describe` da seleção:
   - **outra marca, fora do grátis:** com `railBrand = { id: "b-a" }` e `useFollowLinkedBrand("b-b")`, espere
     `switchBrand` chamado com `("b-b", { stay: true })` e `refused === false`;
   - **no grátis** (`setQueryData(["billing", "status"], { access: {}, freePlan: { accountId: "acc-a" } })`): espere
     `refused === true` e `switchBrand` não chamado;
   - **a mesma marca, `undefined` ou trilho sem marca:** nada é chamado.
   Os casos da seleção que já existem continuam iguais.
2. Em `ConversationScreen.test.tsx`:
   - mocke `useAssistantThread` com `{ data: { thread: { clientProfileId: "b-b" } } }`, `useFollowLinkedBrand` com um
     `vi.fn()`, `useConversationContext`, `ConversationList` e `RailChat`;
   - espere `useFollowLinkedBrand` chamado com `"b-b"`.
3. Em `assistant/page.test.tsx`, um caso no grátis: mocke `findFreePlanAccount` devolvendo `{ accountId: "acc-a" }` e
   `findEquipeThreadByAssistantThread` devolvendo `{ account: { id: "acc-b" }, thread: … }`. Espere o `redirect("/")`.

Run: `cd app && TZ=UTC npx vitest run --config config/vitest.config.ts src/lib/equipe/use-equipe.test.tsx src/components/assistant/conversation "src/app/(dashboard)/assistant"`
Expected: os casos novos falham.

- [ ] **Step 2: O hook extraído**

Em `use-equipe.ts`, logo antes de `useEquipeAccountSelection`, acrescente:

```ts
/**
 * A link that names another brand's account or conversation makes that brand the active one, on the same screen: the rail
 * and the screen always show the same brand (spec 2026-10-07 §3). The free plan pins the rail to its account's brand
 * (`pickActiveBrand` on the server), so there the switch is refused, never asked, and the caller falls back to the rail's
 * brand. Outside the rail, or with no brand yet, there is nothing to follow.
 */
export function useFollowLinkedBrand(linkedBrand: string | null | undefined): { refused: boolean } {
  const brand = useActiveBrand();
  const switchBrand = useSwitchActiveBrand();
  const freePlan = useFreePlanAccount();
  const pinned = Boolean(freePlan && (freePlan.accountId ?? freePlan.closedAccountId));
  const other = Boolean(linkedBrand && brand && linkedBrand !== brand.id);
  const refused = pinned && other;
  // The brand is a new object after every router.refresh(). When the server refuses the linked brand the rail keeps the
  // old one, so remember the brand already asked for and ask once, instead of again after each refresh.
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (refused || !other || !linkedBrand || askedFor.current === linkedBrand) return;
    askedFor.current = linkedBrand;
    switchBrand(linkedBrand, { stay: true });
  }, [refused, other, linkedBrand, switchBrand]);
  return { refused };
}
```

Em `useEquipeAccountSelection`, troque o trecho que vai de `const switchBrand = useSwitchActiveBrand();` até o fim do
primeiro `useEffect` (o que chama `switchBrand`) por:

```ts
  const linkedBrand = valid && brand ? accounts?.find((account) => account.id === valid)?.clientProfileId : undefined;
  // Refused on the free plan: the screen shows the rail brand's account instead, and the URL is stamped with it below.
  const { refused } = useFollowLinkedBrand(linkedBrand);
  const selected = (refused ? null : valid) ?? (accounts ? defaultEquipeAccountId(accounts, brand) : null);
```

O `const brand = useActiveBrand();` de antes fica.

- [ ] **Step 3: A conversa segue a marca dela**

Em `ConversationScreen.tsx`, importe `useAssistantThread` de `@/lib/hooks/use-assistant-threads` e
`useFollowLinkedBrand` de `@/lib/equipe/use-equipe`. Logo depois de `const conversation = useConversationContext(threadId);`,
acrescente:

```tsx
  // A link to another brand's conversation makes that brand the active one, like a link to its account (spec 2026-10-07 §3).
  const threadBrand = useAssistantThread(threadId).data?.thread?.clientProfileId;
  useFollowLinkedBrand(threadBrand);
```

No comentário do topo do arquivo, troque "The classic shell keeps AssistantShell." por "A conversation of another brand
makes that brand the active one."

- [ ] **Step 4: No grátis, a conversa de outra Conta volta para `/`**

Em `assistant/page.tsx`, importe `findFreePlanAccount` de `@/server/equipe/module/free-plan` e, logo depois de
`if (!thread || !owned) redirect("/");`, acrescente:

```tsx
  // The free plan is pinned to its account's brand: a conversation of another account cannot open under it, so the person
  // goes to the conversation of the rail's brand (spec 2026-10-07 §3).
  const freePlan = await findFreePlanAccount(workspace.id);
  const pinnedAccountId = freePlan?.accountId ?? freePlan?.closedAccountId;
  if (pinnedAccountId && owned.account.id !== pinnedAccountId) redirect("/");
```

Run: o comando do Step 1.
Expected: PASS.

- [ ] **Step 5: Gates e commit**

Run: `npm run typecheck && npm run convergence:test && npm run convergence:gate`
Expected: sem erro.

```bash
git add -A app/src/lib/equipe app/src/components/assistant/conversation "app/src/app/(dashboard)/assistant"
git commit -m "feat(caminho-unico): a link to another brand's conversation makes that brand the active one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Os E2E do CI no caminho único e os specs clássicos saem

**Files:**
- Modify: `scripts/seed-visual-foundations.ts:256-265`
- Modify: `tests/e2e/composer-address.spec.ts:101-107`, `tests/e2e/visual-a11y-gate.spec.ts`,
  `tests/e2e/visual-release-gate.spec.ts`, `tests/e2e/template-materialize.spec.ts:109-110`,
  `tests/e2e/guest-home-flags.spec.ts:71-100`, `tests/e2e/home-conversation-assistant.spec.ts:25-39,342-400`,
  `tests/e2e/phase6-gate6-uat.spec.ts`
- Delete: `tests/e2e/assistant-happy-path.spec.ts`, `assistant-goal-agent.spec.ts`,
  `guided-assistant-journeys.spec.ts`, `guided-assistant-scenarios.spec.ts`, `iterative-copilot-loop.desktop.spec.ts`,
  `iterative-copilot-loop.mobile.spec.ts`
- Modify: `tests/e2e/support/guided-auth.ts:40-44` (sai `assistantSurface`, se ficar sem uso)

- [ ] **Step 1: A semente aponta para o composer**

Em `seed-visual-foundations.ts`, no objeto `routes`, troque:
- `creativeWork: "/"` por `creativeWork: "/creative-work/new"`;
- `` variationWorkspace: `/?workId=${variationWork.id}&intent=variations` `` por
  `` variationWorkspace: `/creative-work/new?workId=${variationWork.id}&intent=variations` ``.

O gate de acessibilidade continua com `home` em `/`, que agora é a conversa.

- [ ] **Step 2: Specs que esperavam a casca clássica**

- **`composer-address.spec.ts:101-107`:** o teste "keeps authenticated client navigation to a fresh composer" passa a
  sair de um trabalho, ir a Criações e clicar em "Criar":

```ts
  test("keeps authenticated client navigation to a fresh composer", async ({ page }) => {
    await page.goto(`/creative-work/new?workId=${fixture().readyWorkId}&intent=variations`);
    await expect(page.getByTestId("studio-talk-box")).toBeVisible();
    await page.getByTestId("rail").getByRole("link", { name: "Criações" }).click();
    await page.getByRole("button", { name: "Criar" }).first().click();
    await expect(page).toHaveURL(/\/creative-work\/new\?compose=1/);
    await expect(page.getByTestId("studio-talk-box")).toBeVisible();
  });
```

  Antes de commitar, confira no `Rail.tsx` o `data-testid` do trilho e o nome acessível do link de Criações, e no
  `campaigns/page.tsx` se "Criar" é botão ou link. Ajuste os seletores ao que estiver lá.
- **`template-materialize.spec.ts:109-110`:** o rótulo "marca ativa" do palco saiu. Troque a asserção por uma sobre o
  composer (`studio-talk-box` visível).
- **`guest-home-flags.spec.ts:71-100`:** apague os casos D03/D04, que esperam a entrada antiga em `/`.
- **`home-conversation-assistant.spec.ts`:**
  - apague o `describe` "classic assistant (Equipe gate off)" (linhas 342-400);
  - em `waitForHomeConversationReady` (linhas 25-39), tire os test ids clássicos (`assistant-start-composer`,
    `assistant-chat-header`).
- **`phase6-gate6-uat.spec.ts`:** apague os testes que abrem `/` esperando o composer, a home do Estúdio ou a navegação
  móvel clássica: S01 (perto da linha 1344), S02 (178-207), S12 (425-468), S13 (1376-1420) e os outros `gotoApp("/")`
  das linhas 237, 445, 732 e 1457. Se o arquivo ficar sem teste, apague-o.

- [ ] **Step 3: Specs do Assistente clássico saem**

- Apague os seis specs da lista "Delete".
- Rode `grep -rn "assistantSurface" tests` e, se `assistantSurface` ficar sem uso, apague-o de `guided-auth.ts`.
- Os scripts de release que citavam esses specs já foram ajustados na Task 7.

- [ ] **Step 4: A Peça aparece em Criações**

A spec §5 pede "workspace pagante gerando uma Peça que aparece em Criações". Em `critical-studio-journey.spec.ts`,
depois da asserção de que a Peça ficou pronta:
1. abra `/campaigns`;
2. espere o Trabalho da jornada na lista, pelo nome ou título que o spec já usa para achá-lo.

O usuário da semente `seed:create-post-e2e` tem uma marca só, então Criações mostra essa marca.

- [ ] **Step 5: Rodar os specs do CI na receita do CI**

1. Crie e migre um banco `caminho_unico_e3_e2e_test`.
2. Faça o build e suba o `next start -p 3100` como em "Como rodar", com `DATABASE_URL` nesse banco.
3. Rode, nesta ordem e com `E2E_BASE_URL=http://localhost:3100`:

```bash
npx playwright test tests/e2e/visual-a11y-gate.spec.ts
npx playwright test --config playwright.release.config.ts tests/e2e/visual-release-gate.spec.ts --grep "SCN-STUDIO-CAROUSEL|SCN-STUDIO-EDIT|ticket #167"
npm run seed:create-post-e2e
npx playwright test tests/e2e/first-studio-piece.spec.ts tests/e2e/critical-studio-journey.spec.ts tests/e2e/composer-address.spec.ts --project=serial-flows
```

Expected: todos passam. Se o gate de acessibilidade apontar uma violação séria ou crítica na conversa ou na casca do
trilho:
- corrija no componente, com um commit próprio;
- rode de novo. Não relaxe o gate.

Se o `visual-release-gate` falhar por geometria (o trilho é mais estreito que a barra clássica), ajuste a asserção do
cenário à largura útil da casca nova. Se o PR precisar dizer por quê, registre na mensagem do commit.

- [ ] **Step 6: Commit**

```bash
git add -A app/tests/e2e app/scripts/seed-visual-foundations.ts
git commit -m "test(caminho-unico): CI journeys on the single path; classic assistant specs go

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: A receita dos E2E do piloto, o E2E de três marcas e o dos erros de `/`

**Files:**
- Modify: `tests/e2e/support/pilot-home.ts`
- Modify: `tests/e2e/home-rail-assistant.spec.ts`, `home-conversation-assistant.spec.ts`,
  `credit-ended-assistant.spec.ts`
- Create: `tests/e2e/three-brands-assistant.spec.ts`, `tests/e2e/home-errors-assistant.spec.ts`
- Modify: `app/package.json` (script `test:e2e:pilot`)
- Modify: `docs/design/verification/fluxo0-09/README.md:28-41`
- Modify (condicional, Step 6): `.github/workflows/ci.yml`

**Interfaces:**
- Produces, em `pilot-home.ts`:
  - `PILOT_EMAIL = "pilot-free@example.test"`, `THREE_BRANDS_EMAIL = "three-brands@example.test"` e
    `PILOT_PASSWORD`;
  - `ensureIdentity(email: string, name: string): Promise<void>`;
  - `loginAs(page: Page, email: string): Promise<void>`;
  - `pilotContext(db, email = PILOT_EMAIL)`.

- [ ] **Step 1: Identidades próprias, sem testador**

Em `pilot-home.ts`:
- troque o import de `VISUAL_EMAIL` pelas constantes novas;
- logo depois de `withDb`, acrescente:

```ts
// The pilot specs need a workspace on the free plan: the visual identity's seed grants tester access (a paying workspace)
// and deletes its "VF" brands on every re-seed (taking their account with them), so the pilot has identities of its own.
export const PILOT_EMAIL = "pilot-free@example.test";
export const THREE_BRANDS_EMAIL = "three-brands@example.test";
export const PILOT_PASSWORD = process.env.PILOT_E2E_PASSWORD ?? "PilotE2E-123!";

/** Signs the identity up through the running server once, then confirms its email and onboarding by SQL (no tester grant). */
export async function ensureIdentity(email: string, name: string): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const exists = await withDb(async (db) => (await db.query(`select 1 from adscale_app."user" where email = $1`, [email])).rowCount);
  if (!exists) {
    const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseURL, Referer: `${baseURL}/signup` },
      body: JSON.stringify({ email, password: PILOT_PASSWORD, name }),
    });
    if (!response.ok) throw new Error(`Pilot sign-up failed (${response.status}): ${await response.text()}`);
  }
  await withDb((db) => db.query(
    `update adscale_app."user" set name = $2, email_verified = true, onboarding_completed_at = '2026-01-01T12:00:00Z', locale = 'pt-BR' where email = $1`,
    [email, name],
  ));
}

export async function loginAs(page: Page, email: string): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const response = await page.context().request.post(`${baseURL}/api/auth/sign-in/email`, {
    data: { email, password: PILOT_PASSWORD },
    headers: { Origin: baseURL },
  });
  if (!response.ok()) throw new Error(`Pilot sign-in failed (${response.status()}): ${await response.text()}`);
  await page.context().addCookies([{ name: "locale", value: "pt-BR", url: baseURL }]);
  await page.addInitScript(() => {
    localStorage.setItem("adscale_cookie_consent", JSON.stringify({ necessary: true, analytics: false, marketing: false }));
  });
}
```

- `pilotContext` ganha o parâmetro `email = PILOT_EMAIL`, usado na consulta no lugar de `VISUAL_EMAIL`, e a mensagem de
  erro passa a citar o e-mail.

- [ ] **Step 2: Os specs do piloto usam a identidade grátis**

Em `home-rail-assistant.spec.ts`, `home-conversation-assistant.spec.ts` e `credit-ended-assistant.spec.ts`:
- troque `seedVisualManifest()` no `beforeAll` por `await ensureIdentity(PILOT_EMAIL, "Piloto E2E")`;
- troque `loginVisualFoundation(page)` por `loginAs(page, PILOT_EMAIL)`;
- apague `skipUnlessGateOn` e as chamadas dele: sem interruptor, não há o que pular;
- no comentário de cabeçalho, tire "Runs against a local server with EQUIPE_ENABLED=true and
  EQUIPE_PILOT_WORKSPACES=*" e cite a receita do README.

Em `credit-ended-assistant.spec.ts:29,31`, restrinja o `delete from … equipe_exceptions` e a leitura de
`equipe_brand_handoffs` à conta do piloto. Use o `ctx.accountId` de `pilotContext(db)` em
`where account_id = $1`.

Em `home-conversation-assistant.spec.ts:313,320`, o "exatamente uma conta" passa a contar só as contas do workspace
do piloto.

Em `home-rail-assistant.spec.ts`, acrescente o caso da spec §5 "cadastro novo até o card do plano no composer":

```ts
  test("a free account finds the plan card in the composer, in the box's place", async ({ page }) => {
    await openPilotHome(page);
    await page.goto("/creative-work/new");
    await expect(page.getByTestId("free-plan-cta")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("studio-talk-box")).toHaveCount(0);
  });
```

Confira no `DashboardHomeActions.tsx` (perto da linha 603) se a caixa do composer some quando o cartão aparece. Se ela
continuar visível ao lado do cartão, tire a segunda asserção.

- [ ] **Step 3: E2E de três marcas**

Crie `tests/e2e/three-brands-assistant.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { ensureIdentity, loginAs, openPilotHome, THREE_BRANDS_EMAIL, withDb } from "./support/pilot-home";

/**
 * Spec 2026-10-07 §5: three brands, each with its own conversation and Library. A workspace that pays (tester access, by
 * SQL) opens one account per brand on its first visit; brands with a Brand Kit enter by import, with a new conversation.
 */

// The sign-up creates no brand: these are the workspace's three. Two have a Brand Kit (they enter by import), one does not
// (it goes through the handoff); each still gets its own account and main conversation.
const BRANDS = [
  { name: "Livraria Norte", colors: ["#2B4C7E"] },
  { name: "Studio Lume", colors: ["#C9A227"] },
  { name: "Café Aurora", colors: [] },
] as const;

async function workspaceOf(email: string): Promise<string> {
  return withDb(async (db) => (await db.query<{ workspace_id: string }>(
    `select m.workspace_id from adscale_app.workspace_members m join adscale_app."user" u on u.id = m.user_id where u.email = $1`,
    [email],
  )).rows[0]!.workspace_id);
}

test.describe("three brands, three conversations", () => {
  let workspaceId: string;

  test.beforeAll(async () => {
    await ensureIdentity(THREE_BRANDS_EMAIL, "Três Marcas E2E");
    workspaceId = await workspaceOf(THREE_BRANDS_EMAIL);
    await withDb(async (db) => {
      await db.query(
        `insert into adscale_app.workspace_entitlements (workspace_id, kind, status)
         select $1, 'tester', 'active' where not exists (
           select 1 from adscale_app.workspace_entitlements where workspace_id = $1 and kind = 'tester' and status = 'active')`,
        [workspaceId],
      );
      for (const brand of BRANDS) {
        await db.query(
          `insert into adscale_app.client_profiles (workspace_id, name, brand_colors)
           select $1, $2, $3::jsonb where not exists (select 1 from adscale_app.client_profiles where workspace_id = $1 and name = $2)`,
          [workspaceId, brand.name, JSON.stringify(brand.colors)],
        );
      }
    });
  });

  test("each brand opens its own account and conversation, and the rail follows the brand", async ({ page }) => {
    await loginAs(page, THREE_BRANDS_EMAIL);
    await openPilotHome(page);
    const switcher = page.getByTestId("rail-brand-switcher");
    for (const { name } of BRANDS) {
      await switcher.click();
      await page.getByTestId("rail-brand-option").filter({ hasText: name }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(switcher).toContainText(name);
      await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 30_000 });
    }
    const accounts = await withDb(async (db) => (await db.query<{ client_profile_id: string; thread: string }>(
      `select a.client_profile_id, t.assistant_thread_id as thread from adscale_equipe.equipe_accounts a
         join adscale_equipe.equipe_threads t on t.account_id = a.id and t.kind = 'primary' where a.workspace_id = $1`,
      [workspaceId],
    )).rows);
    expect(new Set(accounts.map((row) => row.client_profile_id)).size).toBe(accounts.length);
    expect(new Set(accounts.map((row) => row.thread)).size).toBe(accounts.length);
    expect(accounts.length).toBe(BRANDS.length);
  });

  test("the Library asks for the active brand only", async ({ page }) => {
    await loginAs(page, THREE_BRANDS_EMAIL);
    await openPilotHome(page);
    const brandId = await withDb(async (db) => (await db.query<{ id: string }>(
      `select id from adscale_app.client_profiles where workspace_id = $1 and name = $2`, [workspaceId, BRANDS[1].name],
    )).rows[0]!.id);
    await page.context().addCookies([{ name: "adscale_active_brand", value: brandId, url: process.env.E2E_BASE_URL ?? "http://localhost:3000" }]);
    const assetsRequest = page.waitForRequest((request) => request.url().includes("/api/workspace/assets"));
    await page.goto("/library");
    expect(new URL((await assetsRequest).url()).searchParams.get("clientProfileId")).toBe(brandId);
  });
});
```

Antes de rodar, confira:
- no `BrandSwitcher.tsx`, os test ids (`rail-brand-switcher`, `rail-brand-option`) e o que o seletor mostra da marca
  ativa. Se for só o monograma, troque o `toContainText(name)` por uma asserção sobre o nome acessível do botão ou
  sobre a opção marcada no menu;
- na `library/page.tsx`, como a marca vai para a leitura (`clientProfileId` na consulta).

Ajuste os seletores ao que estiver lá. Confira também, no schema, o nome da tabela e das colunas de `workspace_entitlements`; o SQL do plano 2B (Task 10,
Step 3) é o mesmo e funcionou.

- [ ] **Step 4: E2E de um erro de `/`**

Crie `tests/e2e/home-errors-assistant.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { ensureIdentity, loginAs, withDb } from "./support/pilot-home";

/** Spec 2026-10-07 §4: an error of / has a way out. A member whose owner never confirmed their email sees who to ask. */

const OWNER = "owner-unverified@example.test";
const MEMBER = "member-of-unverified@example.test";

test("a member of a workspace whose owner has not confirmed sees the owner's name and can try again", async ({ page }) => {
  await ensureIdentity(OWNER, "Dona Sem Confirmar");
  await ensureIdentity(MEMBER, "Membro E2E");
  await withDb(async (db) => {
    await db.query(`update adscale_app."user" set email_verified = false where email = $1`, [OWNER]);
    // The member joins the owner's workspace (and leaves its own): the opening needs a verified owner, so it is refused.
    await db.query(
      `update adscale_app.workspace_members set workspace_id = (
         select m.workspace_id from adscale_app.workspace_members m join adscale_app."user" u on u.id = m.user_id where u.email = $1),
         role = 'member'
       where user_id = (select id from adscale_app."user" where email = $2)`,
      [OWNER, MEMBER],
    );
    await db.query(
      `delete from adscale_equipe.equipe_accounts where workspace_id = (
         select m.workspace_id from adscale_app.workspace_members m join adscale_app."user" u on u.id = m.user_id where u.email = $1)`,
      [OWNER],
    );
  });
  await loginAs(page, MEMBER);
  await page.goto("/");
  const problem = page.getByTestId("home-open-problem");
  await expect(problem).toHaveAttribute("data-kind", "ownerFirst");
  await expect(problem).toContainText("Dona Sem Confirmar");
  await expect(problem.getByRole("button", { name: "Tentar de novo" })).toBeEnabled();
});
```

O `ensureIdentity` confirma o e-mail do dono; o `update` logo depois desfaz isso de propósito.

- [ ] **Step 5: Script e receita**

Em `app/package.json`, logo depois de `"test:e2e"`, acrescente:

```json
    "test:e2e:pilot": "playwright test tests/e2e/home-rail-assistant.spec.ts tests/e2e/home-conversation-assistant.spec.ts tests/e2e/credit-ended-assistant.spec.ts tests/e2e/three-brands-assistant.spec.ts tests/e2e/home-errors-assistant.spec.ts --project=serial-flows",
```

Em `docs/design/verification/fluxo0-09/README.md`, troque a receita das linhas 28-41 pela nova:
1. crie e migre um banco `_test` novo;
2. suba o servidor com as variáveis do bloco "Start app for e2e" de `ci.yml` (sem `EQUIPE_*`), mais `DATABASE_URL`
   nesse banco e `E2E_STORAGE_DIR`;
3. rode `TEST_DATABASE_URL=<o mesmo banco> E2E_BASE_URL=<o servidor> npm run test:e2e:pilot`.

As identidades se criam sozinhas, e a semente visual não é necessária.

Run: a receita acima, num banco novo.
Expected: os cinco specs passam. Rode duas vezes seguidas no mesmo banco para provar que a receita é repetível.

- [ ] **Step 6: Decidir o CI**

Se os cinco specs passaram na receita do CI sem nenhum provedor real (com `E2E_CONTROLLED_PROVIDER=true` e as chaves de
mentira), acrescente em `ci.yml`, depois do passo "Run critical studio journey", um passo com o mesmo bloco `env:`
daquele, mais `TEST_DATABASE_URL: postgres://test:test@localhost:5432/adscale_test`:

```yaml
      - name: Run pilot journeys
        run: cd app && npm run test:e2e:pilot
```

Se algum spec precisou de um provedor real, não acrescente o passo e escreva no corpo do PR qual spec e por quê.

- [ ] **Step 7: Commit**

```bash
git add -A app/tests/e2e app/package.json docs/design/verification/fluxo0-09/README.md .github/workflows/ci.yml
git commit -m "test(caminho-unico): pilot journeys on a fresh database, three brands and the errors of /

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Os documentos descrevem um produto só

**Files:**
- Modify: `PRODUCT.md`, `CONTEXT.md`, `docs/decisions/allowed-primary-destinations.json:30,77`, `render.yaml:113-117,249-253`,
  `docs/runbooks/fluxo-0-lancamento.md:9-10,46-49,123`

- [ ] **Step 1: `PRODUCT.md`**

- **`## Operating Context`:** troque a frase "Operator surface is **Estúdio** (start or resume a Trabalho). **Visão
  geral** is a secondary management surface." por:

```markdown
The product starts in a conversation: at `/`, the Estrategista talks with the person about the active brand, and every creation lands in the composer (`/creative-work/new`) as a Trabalho. Each brand of a workspace has its own account and conversation; the brand chosen at the top of the rail decides every screen. **Visão geral** is a secondary management surface.
```

- **Demais linhas:** nas linhas 4, 10-12, 49 e 60, troque "Estúdio" por "the composer" ou "the conversation",
  conforme o que a frase descreve. Na lista de destinos permitidos (l.49), `/` passa a ser "the conversation" e
  `/creative-work/new` "the composer".

- [ ] **Step 2: `CONTEXT.md`**

- **Verbete `**Estúdio**`:** troque por:

```markdown
**Composer** (antes "Estúdio"):
Onde um Trabalho começa ou é retomado, em `/creative-work/new`. A conversa em `/` leva até ele.
_Evitar_: Estúdio como porta do produto, Início, Dashboard como nome visível.
```

- **Verbete `**Equipe**`:** troque por:

```markdown
**Equipe** (nome interno):
O módulo que opera a conta de uma marca (`src/server/equipe`): conversa com o Estrategista, handoff, Pipeline, Ideias, Metas e a operação. Para o cliente é só o ADScale, sem nome próprio.
_Evitar_: "Equipe" em texto para o cliente, produto separado, "modo Equipe".
```

- **Visão geral, Anúncios veiculados e Ditado (l.82-100):** onde Estúdio aparece como destino ou caixa, troque por
  "composer".
- **`## 1. Visão geral` (l.9-13):** acrescente ao fim do parágrafo: "A porta do produto é a conversa com o
  Estrategista, uma por marca; a criação acontece no composer."
- **Datas:** acerte a data do rodapé (l.439) para 2026-10-08, igual à do cabeçalho.

- [ ] **Step 3: Manifesto de destinos**

Em `allowed-primary-destinations.json`, troque só as descrições, sem mexer em `id` nem em `entrypoints`:
- **`creative_work_home`:** troque o começo "Estúdio: adaptador operacional do trabalho criativo." por "Composer:
  adaptador operacional do trabalho criativo, em /creative-work/new; / é a conversa com o Estrategista da marca ativa."
- **`equipe`:** troque "ADScale Equipe:" por "Conta da marca (módulo equipe):".

Run: `cd app && npm run convergence:test && npm run convergence:gate`
Expected: sem erro. Se o gate acusar mudança no manifesto contra a `main`, as descrições não podem mudar ali: desfaça
este step e registre no PR.

- [ ] **Step 4: `render.yaml` e o runbook**

- **`render.yaml`:**
  - nos dois serviços (linhas 113-117 e 249-253), apague o comentário do piloto e as linhas `EQUIPE_ENABLED` e
    `EQUIPE_PILOT_WORKSPACES`;
  - se `ANTHROPIC_API_KEY` e `META_MODEL_API_KEY` não estiverem listadas nesses serviços, acrescente-as com
    `sync: false`, como as outras chaves.
- **`docs/runbooks/fluxo-0-lancamento.md`:**
  - na tabela (l.9-10) e no passo 5 da abertura (l.46), tire o `EQUIPE_ENABLED`/`EQUIPE_PILOT_WORKSPACES`;
  - troque o parágrafo "**Desligar:**" (l.49) por: "**Desligar:** desde a etapa 3 do caminho único não há interruptor
    do produto. Para parar as publicações, use a parada global da operação; para voltar atrás, reverta o deploy.";
  - na execução local (l.123), tire as duas variáveis.

- [ ] **Step 5: Commit**

```bash
git add PRODUCT.md CONTEXT.md docs/decisions/allowed-primary-destinations.json render.yaml docs/runbooks/fluxo-0-lancamento.md
git commit -m "docs(caminho-unico): one product: the conversation, the composer, no switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Conferência manual, verificação completa e PR

- [ ] **Step 1: Conferência no servidor de dev**

Suba o `next dev` num banco `_test` novo, sem nenhuma variável `EQUIPE_*`, com as chaves de mentira e os leitores
falsos da receita do piloto. Antes, rode `rm -rf .next/dev`.

Confira, com prints no scratchpad:
- **Workspace grátis novo:** `/` abre a conversa com o handoff. O trilho mostra uma marca só e "Adicionar marca"
  com cadeado.
- **Workspace que paga sem Conta** (testador por SQL antes de abrir `/`, com uma marca com `brand_colors`): `/` abre a
  conversa direto, por importação, sem a casca clássica em lugar nenhum.
- **Três marcas no workspace que paga:** cada troca no seletor abre a conversa da marca. Um link
  `/assistant?threadId=<conversa da outra marca>` troca o trilho para ela.
- **Conta encerrada** (`update adscale_equipe.equipe_accounts set status = 'closed'`): a conversa abre sem caixa, com
  "Falar com uma pessoa".
- **Erros de `/`:**
  - e-mail não confirmado mostra "Reenviar e-mail de confirmação";
  - membro com dono sem confirmar mostra o nome do dono e "Tentar de novo".
- **Rotas soltas:** `/settings`, `/docs` e `/brand-kit` abrem dentro do trilho. O Brand Kit não tem seletor próprio.

- [ ] **Step 2: Verificação completa**

Run, em `app/`:
- `npm run typecheck && npm run lint`;
- a suíte completa e os `*.pg.test.ts` de "Como rodar";
- `npm run convergence:test && npm run convergence:gate`;
- depois, `git checkout -- .planning/phases/`.

Expected: só as falhas locais esperadas de "Como rodar".

Run: `grep -rn "usesEquipeProduct\|classic_paid_access\|isEquipeEnabledForWorkspace\|EQUIPE_ENABLED\|EQUIPE_PILOT_WORKSPACES\|AppShell\|AppSidebar\|DashboardShellSwitcher\|AssistantMain\|AssistantShell\|GuestStudioEntry\|BrandTrainingWizard\|MissionCreditBanner" app/src app/tests app/scripts .github render.yaml`
Expected: nada.

- [ ] **Step 3: PR**

Com o ok do dono, faça o push do `caminho-unico/etapa-3` e abra o PR contra `main` com o corpo no formato da skill
`pr`:
- **Summary:** diff da regra (os cinco pontos de bifurcação viram um caminho) e árvore do que saiu.
- **Evidence:** prints do Step 1, os números da suíte e os E2E da Task 12 e da Task 13.
- **Merge Danger:** porta de mão dupla no código, sem migração.
  - **No primeiro acesso depois do deploy:** o workspace do dono e os de testadores abrem uma Conta pela marca ativa;
    com Brand Kit, entram por importação.
  - **No Render:** `EQUIPE_ENABLED` e `EQUIPE_PILOT_WORKSPACES` ficam sem efeito e podem ser apagadas.
  - **Sem freio do produto:** não há mais interruptor; parar as publicações é a parada global da operação.

Termine o corpo com "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
