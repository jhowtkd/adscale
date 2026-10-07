# Caminho único, etapa 1: o composer fora de `/` (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o composer do Estúdio de `/` e colocá-lo em `/creative-work/new`, nas duas cascas, com todo caminho
antigo levando para lá e sem mudar o que o composer faz.

**Architecture:** A página que já existe, `/creative-work/[id]`, passa a tratar o id `new` como o palco do Estúdio: o
mesmo `DashboardHomeActions` que a home renderiza. Um módulo puro (`composer-href`) monta o endereço do composer e
traduz os links antigos. `/` redireciona os endereços antigos com essa mesma regra, e um teste-guarda impede link novo
para `/` com consulta. Não entra rota nova nem regra de dinheiro nova: a conta grátis vê o card do plano no lugar da
caixa.

**Tech Stack:** Next.js 16.2 (App Router, `params` e `searchParams` como Promise), React 19.2, TypeScript, Vitest 4
(projetos `node` e `jsdom` em `app/config/vitest.config.ts`), Playwright 1.60 (projeto `serial-flows`), next-intl 4
(`app/messages/pt-BR.json` e `app/messages/en.json`) e pen.dev (MCP `pencil`).

**Spec:** `docs/superpowers/specs/2026-10-07-caminho-unico-design.md`, seções 2 e 5, etapas 0 e 1.

## Global Constraints

- Nenhum `page.tsx` ou `route.ts` novo: a trava de destinos (`docs/decisions/allowed-primary-destinations.json`) barra
  no CI. `/creative-work/[id]` já é entrada do destino `creative_work_home`.
- O composer mora em `/creative-work/new`. Um Trabalho que já existe continua em `/creative-work/<id>`, a página da
  Peça.
- Regra de tradução: `/?<consulta do composer>` vira `/creative-work/new?<mesma consulta, na mesma ordem>`.
- As chaves da consulta do composer são `workId`, `intent`, `mode`, `fresh`, `compose`, `templateId` e `campaignId`,
  as mesmas de `STUDIO_RESUME_QUERY_KEYS`.
- Continuam em `/`: `?suggestion=` (conversa), `?workspaceId=` (convite) e `?guestDraft=` (convidado, até a etapa 4).
- A conta grátis abre o composer, mas o card do plano (`FreePlanCta`) ocupa o lugar da caixa.
- A palavra "Equipe" não aparece em texto novo para o cliente, nem em pt-BR nem em en.
- Toda tela é conferida contra os quadros aprovados do pen.dev (Task 0) e contra a v3, com prints lado a lado no PR.
- Rode tudo com Node 22 (`$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin`), não com o Node 26 do PATH.
- Antes de cada commit, desfaça o que os testes regravam:
  `git checkout -- ../.planning/phases/128-evaluation-and-release-gate/`.
- Mensagens de commit no padrão do repositório (`feat(...)`, `fix(...)`, `test(...)`), terminando com a linha
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Ajustes na spec feitos ao escrever este plano

Ler o código mostrou cinco pontos em que a spec aprovada simplificava demais. A spec foi corrigida no mesmo commit
deste plano:

1. **Endereço do rascunho.** O composer já grava `?workId=<id>` no endereço sem trocar de página
   (`useComposerLocation.exposeWorkId` mantém o caminho). Em `/creative-work/new` fica `/creative-work/new?workId=<id>`,
   e recarregar volta ao mesmo palco. Ir para `/creative-work/<id>` mudaria de layout no meio do trabalho, porque essa é
   a página da Peça.
2. **Regra de tradução.** Ficou uma só, trocar o caminho: `/?…` vira `/creative-work/new?…`, inclusive com `workId`,
   que abre o palco com o Trabalho aberto, como `/` fazia. `/creative-work/<id>` continua sendo a retomada canônica de
   Criações e do mosaico de Produção.
3. **"Novo trabalho" do palco.** Sai na etapa 2, junto com o seletor de marca do palco. Na etapa 1 os dois ficam,
   porque a home clássica ainda usa o mesmo componente.
4. **`/` redireciona os endereços antigos.** Favoritos, e-mails e a volta do login caem no composer pela mesma regra.
5. **Convidado.** `/?guestDraft=` não é redirecionado, e o guarda não olha `src/components/guest-home`. O fluxo do
   convidado fica como está até sair, na etapa 4.

## Fora deste plano

- As etapas 2 (marca ativa, conta por marca, seletor na barra, plano grátis pela regra do workspace), 3 (a virada) e 4
  (limpeza) ganham planos próprios, cada um escrito quando a etapa anterior entrar na `main`.
- O composer com a caixa dentro da casca nova só vira o caso comum na etapa 3. A conferência visual do quadro c7 fica
  para lá; aqui conferem-se a casca clássica e a variante grátis (c7b).
- A jornada E2E "cadastro novo até o card do plano no composer" (spec, seção 5) também entra no plano da etapa 3. Hoje
  o CI roda os E2E com o gate desligado, e é a etapa 3 que tira essa diferença. Nesta etapa a jornada fica coberta pelo
  teste de componente da Task 4 e pela conferência visual da Task 9.

## Mapa de arquivos

Caminhos relativos à raiz do repositório.

**Criar:**
- `app/src/lib/studio/composer-href.ts`: endereço do composer, chaves da consulta e tradução dos links antigos.
- `app/src/lib/studio/composer-href.test.ts`.
- `app/src/lib/studio/composer-links.guard.test.ts`: guarda contra link novo para `/` com consulta.
- `app/src/app/(dashboard)/studio-stage-props.ts`: props do palco (consulta e gates de rollout), usadas por `/` e por
  `/creative-work/new`.
- `app/src/app/(dashboard)/creative-work/[id]/page.test.tsx`.
- `app/tests/e2e/composer-address.spec.ts`.
- `docs/design/pen/telas-caminho-unico/*.png` (Task 0).

**Modificar:**
- `app/src/lib/studio-resume-query.ts`: passa a reusar as chaves do composer.
- `app/src/app/(dashboard)/page.tsx` e `page.test.tsx`: redirecionamento de endereço antigo e `studioStageProps`.
- `app/src/app/(dashboard)/creative-work/[id]/page.tsx`: `new` abre o palco.
- `app/src/components/dashboard/DashboardHomeActions.tsx` e o teste: conta grátis e link "Novo trabalho".
- `app/messages/pt-BR.json` e `app/messages/en.json`: chave `billing.conversion.freePlan.composer`.
- Links:
  - `app/src/app/(dashboard)/campaigns/page.tsx`;
  - `app/src/components/campaigns/useCampaignsPage.ts` e o teste;
  - `app/src/components/campaigns/v6/workspace/CampaignWorkspaceV6View.tsx` e o teste;
  - `app/src/app/(dashboard)/campaigns/[id]/CampaignWorkspace.test.tsx`;
  - `app/src/components/creative-work/CreativeWorkResumeSurface.tsx` e o teste;
  - `app/src/components/layout/TopBar.tsx`;
  - `app/src/components/assistant/AssistantStartComposer.tsx` e o teste.
- Redirecionamentos e voltas:
  - `app/next.config.ts`;
  - `app/src/app/(dashboard)/campaigns/new/page.tsx` e o teste;
  - `app/src/app/(dashboard)/templates/page.tsx` e o teste;
  - `app/src/app/(dashboard)/quick-tools/create-post/LegacyCreatePostRedirect.tsx` e o teste;
  - `app/src/app/api/creative-work/[id]/copy/route.ts` e o teste;
  - `app/src/server/application/generate-social-post-copy.ts` e o teste;
  - `app/src/components/billing/AccessGatePanel.tsx` e o teste.
- E2E e CI:
  - `app/tests/e2e/support/guided-auth.ts`;
  - os specs `first-studio-piece`, `frictionless-home`, `creative-work-carousel`, `creative-directions` e
    `critical-studio-journey`;
  - `app/playwright.config.ts`;
  - `.github/workflows/ci.yml`.
- `.planning/convergence/surface-inventory.raw.json` (regenerado).
- `docs/design/pen/adscale.pen` (Task 0).

**Apagar:** `app/src/components/dashboard/v6/DashboardV6View.tsx` e `DashboardV6View.motion.test.tsx`. É código morto
(nada o importa) com quatro links para `/?compose=1` que o guarda pegaria.

## Como rodar (vale para todas as tarefas)

```bash
cd app
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
node --version
npm ci
```

`node --version` precisa mostrar `v22.x`. O `npm ci` roda uma vez por worktree.

Para testar um arquivo: `npx vitest run --config config/vitest.config.ts <caminho>`. O argumento é filtro por
substring, não glob.

---

### Task 0: Quadros do pen.dev (etapa 0, gate do dono)

**Files:**
- Modify: `docs/design/pen/adscale.pen`
- Create:
  - `docs/design/pen/telas-caminho-unico/c7-composer-na-casca.png`
  - `docs/design/pen/telas-caminho-unico/c7b-composer-conta-gratis.png`
  - `docs/design/pen/telas-caminho-unico/c8-seletor-de-marca.png`
  - `docs/design/pen/telas-caminho-unico/c8b-seletor-conta-gratis.png`

**Interfaces:**
- Consumes: v3 em `docs/design/pen/telas-v3/` (`c1-conversa-principal.png`, `c4-criacoes.png`); v4 em
  `docs/design/pen/telas-v4/` no branch `origin/design/pen-v4-primeira-abertura` (`b2-criacoes-vazia-com-iscas.png`);
  a home logada de hoje (o palco do Estúdio) como referência de acabamento.
- Produces: quatro PNGs aprovados. A Task 9 deste plano e o plano da etapa 2 conferem contra eles.

- [x] **Step 1: Criar o branch de implementação e abrir o arquivo**

```bash
git fetch origin
git worktree add ../.worktrees/caminho-unico-etapa-1 -b caminho-unico/etapa-1 docs/caminho-unico-spec
```

O branch nasce de `docs/caminho-unico-spec`, que é a `main` com a spec e este plano, e por isso o PR leva os dois.
Carregue as ferramentas do pen.dev com `ToolSearch` (`select:mcp__pencil__get_app_state,mcp__pencil__read_skill,mcp__pencil__execute,mcp__pencil__get_style`),
leia a skill do servidor com `mcp__pencil__read_skill` e abra `docs/design/pen/adscale.pen`. Arquivos `.pen` são
criptografados: só por essas ferramentas, nunca com Read ou Grep.

- [x] **Step 2: Desenhar o c7 (composer na casca, desktop 1440×900)**

Parta de uma cópia do quadro `c4-criacoes` da v3.
- **Trilho:** o da v4, com Conversa, Buscar, Criações (ativo), Biblioteca, Ideias e Metas, mais ajuda e avatar.
- **Topo:** rótulo `CRIAÇÕES`, seletor Painel | Pipeline e sino, como no c4.
- **Área principal:** o palco do Estúdio como está hoje na home logada:
  - título "O que a Café Aurora precisa sair hoje?";
  - a caixa com os cinco objetivos (Variações, Peça única, Adaptar formatos, Mudar estilo, Carrossel);
  - o seletor Inspirações | Produção com o mosaico;
  - o "Continuar de onde parei".
- **Sem o seletor de marca nem o "Novo trabalho" no topo do palco:** é o alvo da etapa 2, e a marca vem do trilho.
- **Marca de exemplo:** use a inventada "Café Aurora", a mesma das telas do fluxo 0.

- [x] **Step 3: Desenhar o c7b (composer na conta grátis)**

O mesmo quadro do c7. No lugar da caixa fica o card do plano, com os textos que o `FreePlanCta` já usa:
- a frase "Criar peças faz parte do plano." (chave nova da Task 4);
- o botão "Falar com uma pessoa" (`billing.conversion.freePlan.action`);
- a nota de contato do card do plano (`assistant.equipe.plan.contact`).

O mosaico continua visível.

- [x] **Step 4: Desenhar o c8 e o c8b (seletor de marca no trilho)**

- **c8:** o seletor de marca aberto no trilho, com a lista de marcas (Café Aurora ativa e marcada, Livraria Norte,
  Studio Lume) e a ação "Adicionar marca" no fim da lista. Proponha onde o seletor mora no trilho (topo, junto do logo,
  ou acima do avatar) e marque a escolha no quadro.
- **c8b:** o mesmo seletor numa conta grátis com uma marca só. "Adicionar marca" mostra que faz parte do plano (cadeado
  e a frase "Outras marcas fazem parte do plano.") e leva ao card do plano.

- [x] **Step 5: Exportar e mostrar ao dono**

Exporte os quatro quadros como PNG em 1x para `docs/design/pen/telas-caminho-unico/`, com os nomes da lista de
arquivos. Mostre ao dono (`SendUserFile` com os quatro PNGs) e **pare até ter aprovação explícita**. Pedidos de ajuste
voltam aos passos 2 a 4.

- [x] **Step 6: Registrar o que o quadro decidiu**

Se o c7 aprovado pedir uma mudança de layout na página do composer que valha já na etapa 1 (por exemplo, um cabeçalho
da página acima do palco), acrescente à Task 9 os passos com o código dessa mudança antes de executá-la. Anote também,
num parágrafo no fim deste plano, onde o seletor de marca mora no trilho: o plano da etapa 2 parte dessa decisão.

- [x] **Step 7: Commit**

```bash
git add docs/design/pen/adscale.pen docs/design/pen/telas-caminho-unico
git commit -m "design(caminho-unico): quadros do composer na casca e do seletor de marca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: O endereço do composer (`composer-href`)

**Files:**
- Create: `app/src/lib/studio/composer-href.ts`
- Create: `app/src/lib/studio/composer-href.test.ts`
- Modify: `app/src/lib/studio-resume-query.ts:1-11`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `COMPOSER_PATH = "/creative-work/new"`;
  - `NEW_CREATIVE_WORK_ID = "new"`;
  - `COMPOSER_QUERY_KEYS` (tupla `readonly`);
  - `type ComposerQuery = Partial<Record<ComposerQueryKey, string | null | undefined>>`;
  - `composerHref(query?: ComposerQuery): string`;
  - `legacyComposerHref(searchParams: Record<string, string | string[] | undefined>): string | null`.

- [ ] **Step 1: Escrever o teste que falha**

`app/src/lib/studio/composer-href.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COMPOSER_PATH, composerHref, legacyComposerHref } from "./composer-href";

const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GUEST_ID = "dd111111-1111-4111-8111-111111111111";

describe("composerHref", () => {
  it("is the composer page when there is no query", () => {
    expect(COMPOSER_PATH).toBe("/creative-work/new");
    expect(composerHref()).toBe("/creative-work/new");
  });

  it("keeps the order it was given and leaves empty values out", () => {
    expect(composerHref({ mode: "arte", compose: "1", fresh: "1" }))
      .toBe("/creative-work/new?mode=arte&compose=1&fresh=1");
    expect(composerHref({ compose: "1", intent: null, templateId: undefined, campaignId: "" }))
      .toBe("/creative-work/new?compose=1");
  });

  it("encodes the values instead of trusting them", () => {
    expect(composerHref({ workId: "a b&c" })).toBe("/creative-work/new?workId=a+b%26c");
  });
});

describe("legacyComposerHref", () => {
  it("moves an old composer link at / to the composer, with the same query in the same order", () => {
    expect(legacyComposerHref({ mode: "arte", compose: "1", fresh: "1" }))
      .toBe("/creative-work/new?mode=arte&compose=1&fresh=1");
    expect(legacyComposerHref({ workId: WORK_ID, intent: "variations" }))
      .toBe(`/creative-work/new?workId=${WORK_ID}&intent=variations`);
  });

  it("leaves the conversation's and the invite's own query at /", () => {
    expect(legacyComposerHref({})).toBeNull();
    expect(legacyComposerHref({ suggestion: "Montar o calendário do mês" })).toBeNull();
    expect(legacyComposerHref({ workspaceId: WORK_ID })).toBeNull();
  });

  it("drops what is not a composer key, blank values and repeated keys", () => {
    expect(legacyComposerHref({ compose: "1", utm_source: "ig" })).toBe("/creative-work/new?compose=1");
    expect(legacyComposerHref({ workId: "  " })).toBeNull();
    expect(legacyComposerHref({ campaignId: [WORK_ID, WORK_ID] })).toBeNull();
  });

  it("keeps the guest handoff at / until the guest flow is removed (spec §4)", () => {
    expect(legacyComposerHref({ compose: "1", fresh: "1", intent: "single", guestDraft: GUEST_ID })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --config config/vitest.config.ts src/lib/studio/composer-href.test.ts`
Expected: FAIL, "Failed to resolve import "./composer-href"".

- [ ] **Step 3: Implementar**

`app/src/lib/studio/composer-href.ts`:

```ts
/**
 * Where the Studio composer lives (spec 2026-10-07, §2): its own page inside whichever shell the workspace has, no
 * longer `/`. `/creative-work/<id>` stays the piece page of an existing work, the canonical resume.
 */
export const COMPOSER_PATH = "/creative-work/new";

/** The `[id]` of `/creative-work/[id]` that means "the Studio stage for a new work", not a work id. */
export const NEW_CREATIVE_WORK_ID = "new";

/** The query the composer reads, as the home used to read it. */
export const COMPOSER_QUERY_KEYS = [
  "workId",
  "intent",
  "mode",
  "fresh",
  "compose",
  "templateId",
  "campaignId",
] as const;

export type ComposerQueryKey = (typeof COMPOSER_QUERY_KEYS)[number];
export type ComposerQuery = Partial<Record<ComposerQueryKey, string | null | undefined>>;
type SearchParamsRecord = Record<string, string | string[] | undefined>;

const COMPOSER_KEYS: ReadonlySet<string> = new Set(COMPOSER_QUERY_KEYS);

/** The composer's address with the given query, in the order given; empty values are left out. */
export function composerHref(query: ComposerQuery = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (COMPOSER_KEYS.has(key) && value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${COMPOSER_PATH}?${search}` : COMPOSER_PATH;
}

/**
 * Where an old link that opened the composer at `/` goes now: the composer, with the same composer query in the same
 * order, so an open `workId` stays open. Null when nothing in it is a composer key (the conversation's `?suggestion=`,
 * an invite's `?workspaceId=`) or when it carries a guest draft: the guest handoff keeps landing on `/` until the guest
 * flow is removed (spec §4).
 */
export function legacyComposerHref(searchParams: SearchParamsRecord): string | null {
  if (searchParams.guestDraft !== undefined) return null;
  const query: ComposerQuery = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (COMPOSER_KEYS.has(key) && typeof value === "string" && value.trim()) {
      query[key as ComposerQueryKey] = value;
    }
  }
  return Object.keys(query).length > 0 ? composerHref(query) : null;
}
```

- [ ] **Step 4: Fazer `studio-resume-query` usar a mesma lista**

Em `app/src/lib/studio-resume-query.ts`, troque as linhas 1 a 11 (o import e a lista `STUDIO_RESUME_QUERY_KEYS`) por:

```ts
import { UUID_PATTERN } from "@/components/guest-home/guest-core.mjs";
import { COMPOSER_QUERY_KEYS } from "@/lib/studio/composer-href";

/** The Studio resume keys are the composer's query (spec 2026-10-07 §2): one list for both. */
export const STUDIO_RESUME_QUERY_KEYS = COMPOSER_QUERY_KEYS;
```

O resto do arquivo (`hasStudioResumeQuery`) não muda.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run --config config/vitest.config.ts src/lib/studio/composer-href.test.ts src/lib/studio-resume-query.test.ts src/proxy.test.ts`
Expected: PASS nos três arquivos.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/studio/composer-href.ts app/src/lib/studio/composer-href.test.ts app/src/lib/studio-resume-query.ts
git commit -m "feat(caminho-unico): composer address and the old-link translation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `/creative-work/new` abre o palco do Estúdio

**Files:**
- Create: `app/src/app/(dashboard)/studio-stage-props.ts`
- Create: `app/src/app/(dashboard)/creative-work/[id]/page.test.tsx`
- Modify: `app/src/app/(dashboard)/creative-work/[id]/page.tsx` (arquivo inteiro)
- Modify: `app/src/app/(dashboard)/page.tsx` (imports e o `return` final)

**Interfaces:**
- Consumes: `NEW_CREATIVE_WORK_ID` (Task 1).
- Produces: `studioStageProps(workspaceId: string, searchParams: Record<string, string | string[] | undefined>)`. Devolve
  as props de `DashboardHomeActions`: a saída de `parseDashboardSearchParams`, mais `workspaceId`, `rolloutVariant`,
  `carouselCreationEnabled`, `entryInterviewEnabled` e `threeFourCreationEnabled`.

- [ ] **Step 1: Escrever o teste que falha**

`app/src/app/(dashboard)/creative-work/[id]/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mockRequireWorkspaceAccess = vi.fn(async () => ({
  user: { id: "user-1", emailVerified: true },
  workspace: { id: "ws-1" },
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: () => mockRequireWorkspaceAccess(),
}));
vi.mock("@/server/validation/env", () => ({
  env: new Proxy({}, {
    get(_target, key: string) {
      if (key === "STUDIO_PROGRESSIVE_ROLLOUT_PERCENT") return 0;
      if (key === "STUDIO_CAROUSEL_ROLLOUT_PERCENT") return 100;
      if (key === "STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT") return 0;
      if (key === "CREATIVE_WORK_34_CREATION_ENABLED") return "true";
      return undefined;
    },
  }),
}));
vi.mock("@/components/dashboard/DashboardHomeActions", () => ({
  default: function DashboardHomeActionsStub() { return null; },
}));
vi.mock("@/components/creative-work/CreativeWorkResumeSurface", () => ({
  CreativeWorkResumeSurface: function CreativeWorkResumeSurfaceStub() { return null; },
}));

type PageElement = { type: unknown; props: Record<string, unknown> };

async function renderPage(id: string, query: Record<string, string | string[] | undefined> = {}) {
  const { default: CreativeWorkPage } = await import("./page");
  return (await CreativeWorkPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(query),
  })) as unknown as PageElement;
}

const nameOf = (element: PageElement) => (element.type as { name?: string }).name;

describe("CreativeWorkPage (spec 2026-10-07 §2)", () => {
  beforeEach(() => mockRequireWorkspaceAccess.mockClear());

  it("opens the Studio stage for a new work, with the home's rollout gates and the composer query", async () => {
    const element = await renderPage("new", { mode: "arte", compose: "1", fresh: "1", workId: WORK_ID });

    expect(nameOf(element)).toBe("DashboardHomeActionsStub");
    expect(element.props).toMatchObject({
      workspaceId: "ws-1",
      workId: WORK_ID,
      studioMode: "arte",
      initialIntent: "variations",
      focusComposer: true,
      freshEntry: true,
      rolloutVariant: "control",
      carouselCreationEnabled: true,
      entryInterviewEnabled: false,
      threeFourCreationEnabled: true,
    });
    expect(mockRequireWorkspaceAccess).toHaveBeenCalledTimes(1);
  });

  it("keeps the piece page for an existing work, without reading the workspace", async () => {
    const element = await renderPage(WORK_ID);

    expect(nameOf(element)).toBe("CreativeWorkResumeSurfaceStub");
    expect(element.props).toEqual({ workId: WORK_ID, threeFourCreationEnabled: true });
    expect(mockRequireWorkspaceAccess).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --config config/vitest.config.ts "src/app/(dashboard)/creative-work/[id]/page.test.tsx"`
Expected: FAIL. O primeiro teste recebe `CreativeWorkResumeSurfaceStub` com `workId: "new"`.

- [ ] **Step 3: Criar `studioStageProps`**

`app/src/app/(dashboard)/studio-stage-props.ts`:

```ts
import { isStudioCarouselEnabled, isStudioEntryInterviewEnabled, resolveStudioRolloutVariant } from "@/server/studio-rollout";
import { env } from "@/server/validation/env";
import { parseDashboardSearchParams } from "./dashboard-search-params";

type StudioSearchParams = Record<string, string | string[] | undefined>;

/** The Studio stage's props for a workspace: the composer query and the rollout gates, sent as booleans only. */
export function studioStageProps(workspaceId: string, searchParams: StudioSearchParams) {
  return {
    ...parseDashboardSearchParams(searchParams),
    workspaceId,
    rolloutVariant: resolveStudioRolloutVariant(workspaceId, env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT),
    carouselCreationEnabled: isStudioCarouselEnabled(workspaceId, env.STUDIO_CAROUSEL_ROLLOUT_PERCENT),
    entryInterviewEnabled: isStudioEntryInterviewEnabled(workspaceId, env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT),
    threeFourCreationEnabled: env.CREATIVE_WORK_34_CREATION_ENABLED === "true",
  };
}
```

- [ ] **Step 4: A página `[id]` abre o palco para `new`**

Substitua o conteúdo inteiro de `app/src/app/(dashboard)/creative-work/[id]/page.tsx` por:

```tsx
import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import { CreativeWorkResumeSurface } from "@/components/creative-work/CreativeWorkResumeSurface";
import { NEW_CREATIVE_WORK_ID } from "@/lib/studio/composer-href";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { env } from "@/server/validation/env";
import { studioStageProps } from "../../studio-stage-props";

type CreativeWorkSearchParams = Record<string, string | string[] | undefined>;

export default async function CreativeWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CreativeWorkSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  // Spec 2026-10-07 §2: `/creative-work/new` is the Studio stage, the composer that lived at `/`, in either shell.
  if (id === NEW_CREATIVE_WORK_ID) {
    const { workspace } = await requireWorkspaceAccess();
    return <DashboardHomeActions {...studioStageProps(workspace.id, query)} />;
  }
  return (
    <CreativeWorkResumeSurface
      workId={id}
      threeFourCreationEnabled={env.CREATIVE_WORK_34_CREATION_ENABLED === "true"}
    />
  );
}
```

- [ ] **Step 5: A home usa as mesmas props**

Em `app/src/app/(dashboard)/page.tsx`:
- Remova as linhas
  `import { isStudioCarouselEnabled, isStudioEntryInterviewEnabled, resolveStudioRolloutVariant } from "@/server/studio-rollout";`,
  `import { env } from "@/server/validation/env";` e
  `import { parseDashboardSearchParams } from "./dashboard-search-params";`.
- Acrescente `import { studioStageProps } from "./studio-stage-props";` depois de
  `import { createEquipeRouteDeps } from "@/server/equipe/http/deps";`.
- Troque o `return <DashboardHomeActions … />;` do fim da função, que hoje tem sete linhas de props, por:

```tsx
  return <DashboardHomeActions {...studioStageProps(workspace.id, params)} />;
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run --config config/vitest.config.ts "src/app/(dashboard)/creative-work/[id]/page.test.tsx" "src/app/(dashboard)/page.test.tsx"`
Expected: PASS nos dois. Os testes de rollout da home continuam valendo, porque as props são as mesmas.

- [ ] **Step 7: Commit**

```bash
git add "app/src/app/(dashboard)/studio-stage-props.ts" "app/src/app/(dashboard)/creative-work/[id]/page.tsx" "app/src/app/(dashboard)/creative-work/[id]/page.test.tsx" "app/src/app/(dashboard)/page.tsx"
git commit -m "feat(caminho-unico): /creative-work/new opens the Studio stage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `/` manda os endereços antigos do composer para `/creative-work/new`

**Files:**
- Modify: `app/src/app/(dashboard)/page.tsx` (imports e o começo da função)
- Modify: `app/src/app/(dashboard)/page.test.tsx` (um mock novo e um `describe` novo no fim)

**Interfaces:**
- Consumes: `legacyComposerHref` (Task 1); `studioStageProps` (Task 2).
- Produces: nada que outra tarefa use.

- [ ] **Step 1: Escrever o teste que falha**

Em `app/src/app/(dashboard)/page.test.tsx`, logo depois do bloco `vi.mock("@/server/equipe/http/deps", …)`,
acrescente:

```ts
const mockRedirect = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); });
vi.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));
```

No fim do arquivo, acrescente:

```ts
describe("DashboardPage old composer links (spec 2026-10-07 §2)", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockRequireWorkspaceAccess.mockReset();
    mockRequireWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1", emailVerified: true },
      workspace: { id: "ws-e2e-1" },
    });
    mockExecuteCommand.mockReset();
    mockExecuteCommand.mockResolvedValue({
      ok: true,
      value: { type: "open_free_account", data: { assistantThreadId: THREAD_ID, created: false } },
    });
    mockIsEquipeEnabledForWorkspace.mockReturnValue(false);
    mockUsesEquipeProduct.mockImplementation((workspaceId: string) => { void workspaceId; return mockIsEquipeEnabledForWorkspace(); });
  });

  it("sends an old composer link to /creative-work/new with the same query, before reading the workspace", async () => {
    await expect(renderDashboardPage({ mode: "arte", compose: "1", fresh: "1" }))
      .rejects.toThrow("NEXT_REDIRECT:/creative-work/new?mode=arte&compose=1&fresh=1");
    expect(mockRequireWorkspaceAccess).not.toHaveBeenCalled();
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it("keeps an open work open in the composer", async () => {
    await expect(renderDashboardPage({ workId: WORK_ID, intent: "variations" }))
      .rejects.toThrow(`NEXT_REDIRECT:/creative-work/new?workId=${WORK_ID}&intent=variations`);
  });

  it("does the same with the home conversation on, without opening an account", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    await expect(renderDashboardPage({ compose: "1" })).rejects.toThrow("NEXT_REDIRECT:/creative-work/new?compose=1");
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it("leaves the conversation's suggestion and the guest handoff at /", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    expect(renderedName(await renderDashboardPage({ suggestion: "Montar o calendário do mês" }))).toBe("ConversationScreenStub");
    expect(renderedName(await renderDashboardPage({ compose: "1", fresh: "1", intent: "single", guestDraft: GUEST_ID })))
      .toBe("ConversationScreenStub");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --config config/vitest.config.ts "src/app/(dashboard)/page.test.tsx"`
Expected: FAIL nos três primeiros testes do `describe` novo. A página renderiza em vez de redirecionar, e
`mockRequireWorkspaceAccess` é chamado.

- [ ] **Step 3: Implementar**

Em `app/src/app/(dashboard)/page.tsx`:
- Acrescente na primeira linha: `import { redirect } from "next/navigation";`.
- Acrescente `import { legacyComposerHref } from "@/lib/studio/composer-href";` depois do import de
  `next-intl/server`.
- Logo depois de `const params = await searchParams;`, acrescente:

```tsx
  // Spec 2026-10-07 §2: the composer left `/`. An old link that opened it here (a bookmark, an e-mail, the way back from
  // the login) goes to its page with the same query; the conversation's own query stays.
  const legacyComposer = legacyComposerHref(params);
  if (legacyComposer) redirect(legacyComposer);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run --config config/vitest.config.ts "src/app/(dashboard)/page.test.tsx"`
Expected: PASS em todos, inclusive os testes antigos de `guestDraft`, que continuam sem redirecionar.

- [ ] **Step 5: Commit**

```bash
git add "app/src/app/(dashboard)/page.tsx" "app/src/app/(dashboard)/page.test.tsx"
git commit -m "feat(caminho-unico): / sends old composer links to /creative-work/new

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Conta grátis no composer: o card do plano no lugar da caixa

**Files:**
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx` (imports; corpo, perto da linha 231; `return`, linhas 670-750)
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx` (mock de `use-equipe`, linhas 22-26; `beforeEach`; um teste novo)
- Modify: `app/messages/pt-BR.json` e `app/messages/en.json` (`billing.conversion.freePlan`)

**Interfaces:**
- Consumes: `useFreePlanAccount()` de `@/lib/equipe/use-equipe` (devolve `{ accountId: string | null; closedAccountId?: string } | null | undefined`); `FreePlanCta({ accountId, intro })` de `@/components/billing/FreePlanCta`.
- Produces: a chave de mensagem `billing.conversion.freePlan.composer`.

- [ ] **Step 1: Escrever o teste que falha**

Em `app/src/components/dashboard/DashboardHomeActions.test.tsx`, troque o bloco das linhas 22-26 (o comentário e o
`vi.mock("@/lib/equipe/use-equipe", …)`) por:

```tsx
// The free plan (ticket 11, part 2) decides the access gate and, on the composer page, what takes the box's place.
const useFreePlanAccountMock = vi.fn((): { accountId: string | null } | null | undefined => null);
vi.mock("@/lib/equipe/use-equipe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/equipe/use-equipe")>()),
  useFreePlanAccount: () => useFreePlanAccountMock(),
}));
vi.mock("@/components/billing/FreePlanCta", () => ({
  FreePlanCta: ({ accountId, intro }: { accountId: string | null; intro?: string }) => (
    <div data-testid="free-plan-cta" data-account-id={accountId ?? ""}>{intro}</div>
  ),
}));
```

No `beforeEach` do `describe("DashboardHomeActions")`, logo depois de `vi.clearAllMocks();`, acrescente:

```tsx
    useFreePlanAccountMock.mockReturnValue(null);
```

E acrescente este teste dentro do mesmo `describe`:

```tsx
  it("on the free plan, opens the stage with the plan card in the box's place (spec 2026-10-07 §2)", () => {
    useFreePlanAccountMock.mockReturnValue({ accountId: "acc-1" });

    render(<DashboardHomeActions />);

    const cards = screen.getAllByTestId("free-plan-cta");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-account-id", "acc-1");
    expect(cards[0].textContent).toMatch(/composer/);
    expect(screen.queryByTestId("studio-talk-box")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --config config/vitest.config.ts src/components/dashboard/DashboardHomeActions.test.tsx`
Expected: FAIL no teste novo. Aparecem o `studio-talk-box` e um único card, o do `AccessGatePanel`, sem o texto
`composer`.

- [ ] **Step 3: Implementar**

Em `app/src/components/dashboard/DashboardHomeActions.tsx`:
- Imports, junto dos outros de `@/components` e `@/lib`:

```tsx
import { FreePlanCta } from "@/components/billing/FreePlanCta";
import { useFreePlanAccount } from "@/lib/equipe/use-equipe";
```

- Logo depois de `const { data: billing } = useBillingStatus();`:

```tsx
  const tFreePlan = useTranslations("billing.conversion.freePlan");
  // Spec 2026-10-07 §2: on the free plan the composer opens, but the plan card takes the box's place.
  const freePlan = useFreePlanAccount();
```

- No `return`, troque `<AccessGatePanel />` por:

```tsx
      {freePlan ? null : <AccessGatePanel />}
```

- Nas props de `<BrandStageHome>`, troque `talkBox={talkBox}` por:

```tsx
        talkBox={freePlan ? <FreePlanCta accountId={freePlan.accountId} intro={tFreePlan("composer")} /> : talkBox}
```

- E troque o `onDropFiles` por:

```tsx
        onDropFiles={(files) => {
          if (freePlan) return;
          setBoxExpanded(true);
          void composer.addFiles?.(files);
        }}
```

- [ ] **Step 4: As mensagens**

Em `app/messages/pt-BR.json`, dentro de `billing.conversion.freePlan`, depois de `"campaignAssistant": …,`:

```json
        "composer": "Criar peças faz parte do plano.",
```

Em `app/messages/en.json`, no mesmo lugar:

```json
        "composer": "Creating pieces is part of the plan.",
```

Mantenha a indentação de cada arquivo e confira que o JSON continua válido:
`node -e "JSON.parse(require('fs').readFileSync('messages/pt-BR.json','utf8')); JSON.parse(require('fs').readFileSync('messages/en.json','utf8'))"`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run --config config/vitest.config.ts src/components/dashboard/DashboardHomeActions.test.tsx src/components/billing`
Expected: PASS. O teste de paridade das mensagens, se existir, passa porque a chave entrou nas duas línguas.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/dashboard/DashboardHomeActions.tsx app/src/components/dashboard/DashboardHomeActions.test.tsx app/messages/pt-BR.json app/messages/en.json
git commit -m "feat(caminho-unico): the free plan sees the plan card in the composer's box

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Os links da interface apontam para o composer

**Files:**
- Modify:
  - `app/src/app/(dashboard)/campaigns/page.tsx:259` e `:341`;
  - `app/src/components/campaigns/useCampaignsPage.ts:92-106` e o teste (linhas 162, 179, 188, 197, 206);
  - `app/src/components/campaigns/v6/workspace/CampaignWorkspaceV6View.tsx:49` e o teste (linha 82);
  - `app/src/app/(dashboard)/campaigns/[id]/CampaignWorkspace.test.tsx:295`;
  - `app/src/components/creative-work/CreativeWorkResumeSurface.tsx:70` e o teste (linha 76);
  - `app/src/components/dashboard/DashboardHomeActions.tsx:717` e o teste (linha 254);
  - `app/src/components/layout/TopBar.tsx:337`;
  - `app/src/components/assistant/AssistantStartComposer.tsx:238` e o teste (linha 126).

**Interfaces:**
- Consumes: `composerHref` (Task 1).
- Produces: nada.

- [ ] **Step 1: Trocar as expectativas dos testes (que passam a falhar)**

| Arquivo de teste | Linha | De | Para |
|---|---|---|---|
| `useCampaignsPage.test.tsx` | 162 | `"/?compose=1"` | `"/creative-work/new?compose=1"` |
| `useCampaignsPage.test.tsx` | 179 | `"/?compose=1&intent=single"` | `"/creative-work/new?compose=1&intent=single"` |
| `useCampaignsPage.test.tsx` | 188 | `` `/?compose=1&templateId=${TEMPLATE_ID}` `` | `` `/creative-work/new?compose=1&templateId=${TEMPLATE_ID}` `` |
| `useCampaignsPage.test.tsx` | 197 | `"/?compose=1"` | `"/creative-work/new?compose=1"` |
| `useCampaignsPage.test.tsx` | 206 | `"/?compose=1"` | `"/creative-work/new?compose=1"` |
| `CampaignWorkspaceV6View.test.tsx` | 82 | `"/?mode=arte&compose=1&campaignId=camp-1",` | `"/creative-work/new?mode=arte&compose=1&campaignId=camp-1",` |
| `campaigns/[id]/CampaignWorkspace.test.tsx` | 295 | `"/?mode=arte&compose=1&campaignId=camp-1",` | `"/creative-work/new?mode=arte&compose=1&campaignId=camp-1",` |
| `CreativeWorkResumeSurface.test.tsx` | 76 | `"/?mode=arte&compose=1&intent=variations&fresh=1"` | `"/creative-work/new?mode=arte&compose=1&intent=variations&fresh=1"` |
| `DashboardHomeActions.test.tsx` | 254 | `"/?mode=arte&compose=1&fresh=1"` | `"/creative-work/new?mode=arte&compose=1&fresh=1"` |
| `AssistantStartComposer.test.tsx` | 126 | `"/?compose=1"` | `"/creative-work/new?compose=1"` |

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --config config/vitest.config.ts src/components/campaigns "src/app/(dashboard)/campaigns" src/components/creative-work/CreativeWorkResumeSurface.test.tsx src/components/dashboard/DashboardHomeActions.test.tsx src/components/assistant/AssistantStartComposer.test.tsx`
Expected: FAIL exatamente nas dez asserções trocadas, cada uma recebendo o endereço antigo.

- [ ] **Step 3: Trocar os links**

Em todos os arquivos abaixo, acrescente `import { composerHref } from "@/lib/studio/composer-href";` junto dos outros
imports de `@/`.

- `app/src/app/(dashboard)/campaigns/page.tsx`, linhas 259 e 341: troque `router.push("/?mode=arte&compose=1")` por
  `router.push(composerHref({ mode: "arte", compose: "1" }))`.
- `app/src/components/campaigns/useCampaignsPage.ts`: troque o efeito do `shouldRedirectNew` (linhas 92-102) e o
  `startNewWork` (linhas 104-106) por:

```ts
  useEffect(() => {
    if (!shouldRedirectNew) return;
    const intent = searchParams.get("intent");
    const templateId = searchParams.get("templateId");
    router.replace(composerHref({
      compose: "1",
      intent: intent && COMPOSER_INTENTS.has(intent) ? intent : null,
      templateId: templateId && z.string().uuid().safeParse(templateId).success ? templateId : null,
    }));
  }, [router, searchParams, shouldRedirectNew]);

  const startNewWork = useCallback(() => {
    router.push(composerHref({ compose: "1" }));
  }, [router]);
```

- `app/src/components/campaigns/v6/workspace/CampaignWorkspaceV6View.tsx:49`: troque
  ``href={`/?mode=arte&compose=1&campaignId=${campaignId}`}`` por
  `href={composerHref({ mode: "arte", compose: "1", campaignId })}`.
- `app/src/components/creative-work/CreativeWorkResumeSurface.tsx:70`: troque
  `href="/?mode=arte&compose=1&intent=variations&fresh=1"` por
  `href={composerHref({ mode: "arte", compose: "1", intent: "variations", fresh: "1" })}`.
- `app/src/components/dashboard/DashboardHomeActions.tsx:717`: troque `href="/?mode=arte&compose=1&fresh=1"` por
  `href={composerHref({ mode: "arte", compose: "1", fresh: "1" })}`.
- `app/src/components/layout/TopBar.tsx:337`: troque `href="/?compose=1"` por `href={composerHref({ compose: "1" })}`.
- `app/src/components/assistant/AssistantStartComposer.tsx:238`: troque `href="/?compose=1"` por
  `href={composerHref({ compose: "1" })}`.

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/src/app/(dashboard)/campaigns" app/src/components/campaigns app/src/components/creative-work/CreativeWorkResumeSurface.tsx app/src/components/creative-work/CreativeWorkResumeSurface.test.tsx app/src/components/dashboard/DashboardHomeActions.tsx app/src/components/dashboard/DashboardHomeActions.test.tsx app/src/components/layout/TopBar.tsx app/src/components/assistant/AssistantStartComposer.tsx app/src/components/assistant/AssistantStartComposer.test.tsx
git commit -m "feat(caminho-unico): every create link opens /creative-work/new

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Redirecionamentos e voltas apontam para o composer

**Files:**
- Modify:
  - `app/next.config.ts:119-121`;
  - `app/src/app/(dashboard)/campaigns/new/page.tsx` e `page.test.tsx` (arquivos inteiros);
  - `app/src/app/(dashboard)/templates/page.tsx` e `page.test.tsx` (arquivos inteiros);
  - `app/src/app/(dashboard)/quick-tools/create-post/LegacyCreatePostRedirect.tsx` (`legacyCreatePostDestination`) e o teste (arquivo inteiro);
  - `app/src/app/api/creative-work/[id]/copy/route.ts:28` e o teste (linha 77);
  - `app/src/server/application/generate-social-post-copy.ts:98-100` e o teste;
  - `app/src/components/billing/AccessGatePanel.tsx:22-28` e o teste.

**Interfaces:**
- Consumes: `composerHref` e `COMPOSER_PATH` (Task 1).
- Produces: nada.

- [ ] **Step 1: Escrever os testes que falham**

`app/src/app/(dashboard)/campaigns/new/page.test.tsx` (arquivo inteiro):

```tsx
import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import NewCampaignPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("NewCampaignPage", () => {
  it("redirects the legacy route to the focused composer (spec 2026-10-07 §2)", () => {
    expect(() => NewCampaignPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/creative-work/new?compose=1");
  });
});
```

`app/src/app/(dashboard)/templates/page.test.tsx` (arquivo inteiro):

```tsx
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import TemplatesPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("templates product surface", () => {
  it("redirects the catalog into the composer instead of keeping a template page", () => {
    expect(() => TemplatesPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/creative-work/new");
    const source = readFileSync("src/app/(dashboard)/templates/page.tsx", "utf8");
    expect(source).not.toContain("TemplateCard");
    expect(source).not.toContain("mode=briefing");
  });
});
```

`app/src/app/(dashboard)/quick-tools/create-post/LegacyCreatePostRedirect.test.tsx` (arquivo inteiro):

```tsx
import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import LegacyCreatePostRedirect, {
  legacyCreatePostDestination,
} from "./LegacyCreatePostRedirect";

const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("LegacyCreatePostRedirect", () => {
  it("routes a bare legacy entry to the variations preset of the composer", () => {
    expect(legacyCreatePostDestination({})).toBe("/creative-work/new?intent=variations");
  });

  it("routes an existing work to the composer with it open", () => {
    expect(legacyCreatePostDestination({ workId: WORK_ID })).toBe(
      `/creative-work/new?workId=${WORK_ID}`
    );
  });

  it("drops non-UUID work identifiers", () => {
    expect(legacyCreatePostDestination({ workId: "../../other-workspace" })).toBe(
      "/creative-work/new?intent=variations"
    );
  });

  it("keeps only a valid composer intent and drops unsafe query parameters", () => {
    expect(
      legacyCreatePostDestination({
        intent: "single",
        callbackUrl: "https://evil.example",
        q: "campaign search",
        templateId: "legacy-template",
      })
    ).toBe("/creative-work/new?intent=single");
    expect(legacyCreatePostDestination({ intent: "unknown" })).toBe(
      "/creative-work/new?intent=variations"
    );
  });

  it("preserves only a UUID template for an empty composer", () => {
    expect(
      legacyCreatePostDestination({ templateId: TEMPLATE_ID, q: "drop-me" })
    ).toBe(`/creative-work/new?intent=variations&compose=1&templateId=${TEMPLATE_ID}`);
    expect(
      legacyCreatePostDestination({ templateId: "../../other-workspace" })
    ).toBe("/creative-work/new?intent=variations");
  });

  it("lets workId take precedence over template and intent", () => {
    expect(
      legacyCreatePostDestination({
        workId: WORK_ID,
        templateId: TEMPLATE_ID,
        intent: "single",
      })
    ).toBe(`/creative-work/new?workId=${WORK_ID}`);
  });

  it("uses the Next redirect primitive", () => {
    expect(() =>
      LegacyCreatePostRedirect({ searchParams: { workId: WORK_ID } })
    ).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/creative-work/new?workId=${WORK_ID}`);
  });
});
```

`app/src/app/api/creative-work/[id]/copy/route.test.ts`, linha 77: troque
`returnPath: "/quick-tools/create-post?workId=work-1",` por `returnPath: "/creative-work/new?workId=work-1",`.

`app/src/server/application/generate-social-post-copy.test.ts`, no teste "spends copy_generation credits, generates,
persists, returns canonical": dentro do `expect.objectContaining({ … })` do `mockSpend`, depois de
`idempotencyKey: "creative-work:work-1:copy",`, acrescente:

```ts
        returnPath: "/creative-work/new?workId=work-1",
```

`app/src/components/billing/AccessGatePanel.test.tsx`: troque o teste "triggers checkout mutation when start plan
button is clicked" inteiro por:

```tsx
  it("triggers checkout and comes back to the page that asked for it (spec 2026-10-07 §2)", () => {
    useBillingStatusMock.mockReturnValue({
      data: { access: { hasSpendAccess: false } },
      isLoading: false,
    });
    window.history.pushState({}, "", "/creative-work/new?compose=1");
    try {
      render(<AccessGatePanel />);
      fireEvent.click(screen.getByRole("button", { name: "billing.accessGate.checkout" }));
      expect(mockStartCheckoutMutateAsync).toHaveBeenCalledWith({
        planKey: "starter",
        returnPath: "/creative-work/new?compose=1",
      });
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --config config/vitest.config.ts "src/app/(dashboard)/campaigns/new" "src/app/(dashboard)/templates" "src/app/(dashboard)/quick-tools" "src/app/api/creative-work/[id]/copy" src/server/application/generate-social-post-copy.test.ts src/components/billing/AccessGatePanel.test.tsx`
Expected: FAIL. Cada asserção recebe o endereço antigo (`/?compose=1`, `/`, `/?intent=…`, `/quick-tools/create-post?workId=…`).

- [ ] **Step 3: Implementar**

`app/src/app/(dashboard)/campaigns/new/page.tsx` (arquivo inteiro):

```tsx
import { redirect } from "next/navigation";
import { composerHref } from "@/lib/studio/composer-href";

/**
 * Legacy "new campaign" entry: creation happens in the composer (spec 2026-10-07 §2). Campaign grouping remains
 * optional after the work exists.
 */
export default function NewCampaignPage() {
  redirect(composerHref({ compose: "1" }));
}
```

`app/src/app/(dashboard)/templates/page.tsx` (arquivo inteiro):

```tsx
import { redirect } from "next/navigation";
import { COMPOSER_PATH } from "@/lib/studio/composer-href";

export default function TemplatesPage() {
  redirect(COMPOSER_PATH);
}
```

`app/src/app/(dashboard)/quick-tools/create-post/LegacyCreatePostRedirect.tsx`: acrescente
`import { composerHref } from "@/lib/studio/composer-href";` e troque a função `legacyCreatePostDestination` inteira
por:

```ts
export function legacyCreatePostDestination(
  searchParams: LegacyCreatePostSearchParams
): string {
  const workIdCandidate =
    typeof searchParams.workId === "string"
      ? searchParams.workId.trim()
      : "";
  const workId = z.string().uuid().safeParse(workIdCandidate).success
    ? workIdCandidate
    : "";
  if (workId) return composerHref({ workId });

  const intent =
    typeof searchParams.intent === "string" &&
    COMPOSER_INTENTS.has(searchParams.intent)
      ? searchParams.intent
      : "variations";
  const templateId = typeof searchParams.templateId === "string"
    && z.string().uuid().safeParse(searchParams.templateId).success
    ? searchParams.templateId
    : null;
  return templateId
    ? composerHref({ intent, compose: "1", templateId })
    : composerHref({ intent });
}
```

`app/src/app/api/creative-work/[id]/copy/route.ts`: acrescente
`import { composerHref } from "@/lib/studio/composer-href";` e troque
`returnPath: \`/quick-tools/create-post?workId=${id}\`,` por `returnPath: composerHref({ workId: id }),`.

`app/src/server/application/generate-social-post-copy.ts`: acrescente
`import { composerHref } from "@/lib/studio/composer-href";` e troque as linhas 98-100 por:

```ts
    returnPath: input.returnPath ?? composerHref({ workId: input.workItemId }),
```

`app/src/components/billing/AccessGatePanel.tsx`: antes de `export function AccessGatePanel()`, acrescente:

```tsx
/** Spec 2026-10-07 §2: the checkout comes back to the page that asked for it (the composer), not to `/`. */
function currentPath(): string {
  return typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
}
```

e troque `await checkout.mutateAsync({ planKey: "starter", returnPath: "/" });` por
`await checkout.mutateAsync({ planKey: "starter", returnPath: currentPath() });`.

`app/next.config.ts`: troque as três linhas dos redirecionamentos (119-121) por:

```ts
      { source: "/quick-tools", destination: "/creative-work/new", permanent: false },
      { source: "/restyling", destination: "/creative-work/new?intent=restyle", permanent: false },
      { source: "/quick-tools/restyling", destination: "/creative-work/new?intent=restyle", permanent: false },
```

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/next.config.ts "app/src/app/(dashboard)/campaigns/new" "app/src/app/(dashboard)/templates" "app/src/app/(dashboard)/quick-tools/create-post" "app/src/app/api/creative-work/[id]/copy" app/src/server/application/generate-social-post-copy.ts app/src/server/application/generate-social-post-copy.test.ts app/src/components/billing/AccessGatePanel.tsx app/src/components/billing/AccessGatePanel.test.tsx
git commit -m "feat(caminho-unico): legacy entries and return paths land on the composer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Guarda no CI contra link novo para `/` com consulta

**Files:**
- Create: `app/src/lib/studio/composer-links.guard.test.ts`
- Delete: `app/src/components/dashboard/v6/DashboardV6View.tsx`, `app/src/components/dashboard/v6/DashboardV6View.motion.test.tsx`

**Interfaces:**
- Consumes: nada (lê os arquivos do repositório).
- Produces: nada.

- [ ] **Step 1: Escrever o guarda**

`app/src/lib/studio/composer-links.guard.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec 2026-10-07 §2: the composer left `/`, so no code may build a link to `/` with a query again. The exceptions are
 * the conversation's `?suggestion=` and an invite's `?workspaceId=`. The guest flow (src/components/guest-home) still
 * lands on `/` until it is removed (spec §4).
 */
const APP_ROOT = process.cwd();
const SCANNED_DIRS = ["src"];
const SCANNED_FILES = ["next.config.ts"];
const SKIPPED_DIRS = new Set([join("src", "components", "guest-home")]);
const ALLOWED_QUERIES = [/^suggestion=/, /^workspaceId=/];
const ROOT_WITH_QUERY = /["'`]\/\?([^"'`\s]*)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(APP_ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(path) ? [] : sourceFiles(path);
    if (!/\.(ts|tsx|mjs)$/.test(entry.name) || /\.(test|spec)\.(ts|tsx|mjs)$/.test(entry.name)) return [];
    return [path];
  });
}

function rootQueryLinks(files: string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const text = readFileSync(join(APP_ROOT, file), "utf8");
    for (const match of text.matchAll(ROOT_WITH_QUERY)) {
      if (ALLOWED_QUERIES.some((allowed) => allowed.test(match[1] ?? ""))) continue;
      const line = text.slice(0, match.index ?? 0).split("\n").length;
      found.push(`${file.split(sep).join("/")}:${line}: ${match[0]}`);
    }
  }
  return found;
}

describe("composer links (spec 2026-10-07 §2)", () => {
  it("no code builds a link to / with a query, except the conversation's suggestion and an invite's workspace", () => {
    const files = [...SCANNED_DIRS.flatMap(sourceFiles), ...SCANNED_FILES];
    expect(rootQueryLinks(files)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar só no código morto**

Run: `npx vitest run --config config/vitest.config.ts src/lib/studio/composer-links.guard.test.ts`
Expected: FAIL listando apenas `src/components/dashboard/v6/DashboardV6View.tsx` nas linhas 205, 308, 320 e 490.
Qualquer outro arquivo na lista é um link que as Tasks 5 e 6 deixaram passar: troque-o por `composerHref` antes de
seguir.

- [ ] **Step 3: Apagar o código morto**

Confirme primeiro que nada o importa. O comando abaixo não pode listar nenhum arquivo além do próprio componente e do
teste dele. O padrão ignora `DashboardV6ViewModel`, um tipo de `dashboard-v6-types.ts` que fica:

```bash
grep -rlE "DashboardV6View([^M]|$)" src --include='*.ts' --include='*.tsx' | grep -v -E 'DashboardV6View(\.motion\.test)?\.tsx$|dashboard/page\.test\.tsx$'
```

Depois apague:

```bash
git rm src/components/dashboard/v6/DashboardV6View.tsx src/components/dashboard/v6/DashboardV6View.motion.test.tsx
```

O `src/app/(dashboard)/dashboard/page.test.tsx` afirma que a página não contém `DashboardV6View` e continua valendo.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run --config config/vitest.config.ts src/lib/studio "src/app/(dashboard)/dashboard"`
Expected: PASS.

- [ ] **Step 5: Provar que o guarda tem dentes**

Troque, só localmente, `composerHref({ compose: "1" })` de `src/components/layout/TopBar.tsx` de volta para
`"/?compose=1"` e rode o guarda: ele precisa falhar apontando `src/components/layout/TopBar.tsx:<linha>`. Desfaça com
`git checkout -- src/components/layout/TopBar.tsx` e rode de novo: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/studio/composer-links.guard.test.ts
git commit -m "test(caminho-unico): guard against links to / with a query; drop dead DashboardV6View

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Os E2E abrem o composer em `/creative-work/new`

**Files:**
- Modify:
  - `app/tests/e2e/support/guided-auth.ts:45-78` (o helper `gotoLegacyComposerHome` e o comentário dele);
  - `app/tests/e2e/first-studio-piece.spec.ts`;
  - `app/tests/e2e/frictionless-home.spec.ts`;
  - `app/tests/e2e/creative-work-carousel.spec.ts`;
  - `app/tests/e2e/creative-directions.spec.ts`;
  - `app/tests/e2e/critical-studio-journey.spec.ts:149-150`;
  - `app/playwright.config.ts:36`;
  - `.github/workflows/ci.yml:253`.
- Create: `app/tests/e2e/composer-address.spec.ts`.

**Interfaces:**
- Consumes: as rotas das Tasks 2, 3 e 6; o fixture `app/tests/fixtures/create-post-e2e.json`, gerado por
  `npm run seed:create-post-e2e`.
- Produces: `gotoComposer(page: Page, query?: string, options?: Parameters<Page["goto"]>[1]): Promise<void>`.

- [ ] **Step 1: Trocar o helper**

Em `app/tests/e2e/support/guided-auth.ts`, troque o comentário e a função `gotoLegacyComposerHome` (linhas 45-78)
por:

```ts
/**
 * Spec 2026-10-07 §2: the Studio composer lives at /creative-work/new in both shells, so a spec that drives it goes
 * there directly, whatever the home-conversation gate says. `query` is the composer query (`?workId=…&intent=…`),
 * as the home used to read it.
 */
export async function gotoComposer(
  page: Page,
  query = "",
  options?: Parameters<Page["goto"]>[1],
): Promise<void> {
  await page.goto(`/creative-work/new${query}`, options);
}
```

O import de `test` continua sendo usado por outros helpers do arquivo. Se o `eslint` acusar que não é mais usado,
tire `test` do import.

- [ ] **Step 2: Trocar as chamadas nos specs**

Em cada arquivo, troque o import `gotoLegacyComposerHome` por `gotoComposer` e as chamadas assim:

| Spec | De | Para |
|---|---|---|
| `first-studio-piece.spec.ts` (2×) | `gotoLegacyComposerHome(page)` | `gotoComposer(page)` |
| `first-studio-piece.spec.ts` | ``gotoLegacyComposerHome(page, `/?workId=${data.readyWorkId}`)`` | ``gotoComposer(page, `?workId=${data.readyWorkId}`)`` |
| `frictionless-home.spec.ts` (5×) | `gotoLegacyComposerHome(page)` | `gotoComposer(page)` |
| `creative-work-carousel.spec.ts` | `gotoLegacyComposerHome(page, "/", { waitUntil: "commit" })` | `gotoComposer(page, "", { waitUntil: "commit" })` |
| `creative-work-carousel.spec.ts` | ``gotoLegacyComposerHome(page, `/?workId=${workId}`, { waitUntil: "commit" })`` | ``gotoComposer(page, `?workId=${workId}`, { waitUntil: "commit" })`` |
| `creative-directions.spec.ts` (3×) | ``gotoLegacyComposerHome(page, `/?workId=${workId}&intent=variations`)`` | ``gotoComposer(page, `?workId=${workId}&intent=variations`)`` |
| `creative-directions.spec.ts` (2×) | `gotoLegacyComposerHome(page)` | `gotoComposer(page)` |

Em `critical-studio-journey.spec.ts`, troque as linhas 149-150 por:

```ts
    await page.goto(`/creative-work/new?workId=${workId}`);
    await expect(page).toHaveURL(new RegExp(`/creative-work/new\\?workId=${workId}`));
```

Confira que não sobrou nenhuma chamada: `grep -rn "gotoLegacyComposerHome" tests/e2e` não pode listar nada.

- [ ] **Step 3: O spec novo do endereço do composer**

`app/tests/e2e/composer-address.spec.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Spec 2026-10-07 §2 (caminho único, etapa 1): the composer lives at /creative-work/new, and every old way in lands
 * there with its query. Deterministic seed only (npm run seed:create-post-e2e).
 */

const FIXTURE_PATH = process.env.CREATE_POST_E2E_FIXTURE_PATH
  ? path.resolve(process.env.CREATE_POST_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../fixtures/create-post-e2e.json");

type Fixture = { email: string; password: string; readyWorkId: string };

function fixture(): Fixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing fixture. Run npm run seed:create-post-e2e first.");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("Composer address (caminho único, etapa 1)", () => {
  test.beforeEach(async ({ page }) => {
    const data = fixture();
    await page.addInitScript(() => {
      localStorage.setItem(
        "adscale_cookie_consent",
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
    const signIn = await page.request.post("/api/auth/sign-in/email", {
      data: { email: data.email, password: data.password },
    });
    expect(signIn.ok(), await signIn.text()).toBe(true);
  });

  test("an old composer link at / lands on the composer with the same query", async ({ page }) => {
    const { readyWorkId } = fixture();
    await page.goto(`/?workId=${readyWorkId}&intent=variations`);
    await expect(page).toHaveURL(
      new RegExp(`${escapeRegExp(`/creative-work/new?workId=${readyWorkId}&intent=variations`)}$`),
    );
    await expect(page.getByTestId("studio-talk-box")).toBeVisible({ timeout: 60_000 });
  });

  test("the legacy entries land on the composer", async ({ page }) => {
    const cases: Array<[string, string]> = [
      ["/campaigns/new", "/creative-work/new?compose=1"],
      ["/templates", "/creative-work/new"],
      ["/quick-tools", "/creative-work/new"],
      ["/restyling", "/creative-work/new?intent=restyle"],
      ["/quick-tools/create-post", "/creative-work/new?intent=variations"],
    ];
    for (const [from, to] of cases) {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(to)}$`));
    }
  });
});
```

- [ ] **Step 4: O spec entra no projeto e no CI**

Em `app/playwright.config.ts:36`, acrescente `composer-address|` logo depois de `testMatch: /(` no `testMatch` do
projeto `serial-flows`:

```ts
      testMatch: /(composer-address|restyle|assistant|guided|template-materialize|create-post|creative-directions|frictionless-home|phase6-gate6-uat|layer-editor|carousel|critical-studio-journey|first-studio-piece|worker-journey|hi-unified-hosting|diagnostics-split).*\.spec\.ts$/,
```

Em `.github/workflows/ci.yml:253`, troque a linha por:

```yaml
        run: cd app && npx playwright test tests/e2e/first-studio-piece.spec.ts tests/e2e/critical-studio-journey.spec.ts tests/e2e/composer-address.spec.ts --project=serial-flows
```

- [ ] **Step 5: Conferir os tipos dos E2E**

O `tsconfig.json` do app exclui `tests/**`, então crie um `tsconfig.tmp.json` temporário em `app/`:

```json
{ "extends": "./tsconfig.json", "include": ["tests/e2e/**/*.ts"], "exclude": ["node_modules"] }
```

Rode `npx tsc --noEmit -p tsconfig.tmp.json`. Expected: sem erros nos arquivos tocados. Depois apague com
`rm tsconfig.tmp.json`.

- [ ] **Step 6: Rodar os E2E localmente (gate desligado, como no CI)**

Crie um banco próprio para a rodada, terminado em `_test`, e migre-o:

```bash
/opt/homebrew/opt/postgresql@16/bin/createdb caminho_unico_e1_test
export DATABASE_URL=postgres://$(whoami)@localhost:5432/caminho_unico_e1_test
node scripts/migrate-with-retry.mjs
npm run seed:create-post-e2e
npm run build
```

Para subir o servidor, use as variáveis de placeholder do job de E2E de `.github/workflows/ci.yml`, sem as variáveis
`EQUIPE_*`: `npx next start -p 3311 &`. Depois rode:

```bash
E2E_BASE_URL=http://localhost:3311 npx playwright test tests/e2e/first-studio-piece.spec.ts tests/e2e/critical-studio-journey.spec.ts tests/e2e/composer-address.spec.ts --project=serial-flows
```

Expected: PASS. Se o Playwright pedir um Chromium que não está instalado, crie um `playwright.local.config.ts`
temporário que importa `playwright.config.ts` e força `launchOptions.executablePath` em
`~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
Não commite esse arquivo. No fim, pare o servidor e rode `dropdb caminho_unico_e1_test`.

- [ ] **Step 7: Commit**

```bash
git add app/tests/e2e app/playwright.config.ts .github/workflows/ci.yml
git commit -m "test(caminho-unico): e2e drive the composer at /creative-work/new; old entries land there

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Conferência visual da etapa 1

**Files:**
- Create: prints fora do repositório, no scratchpad; eles só vão para o PR.

**Interfaces:**
- Consumes: os quadros aprovados `c7b-composer-conta-gratis.png` (Task 0) e a home de hoje na `main`.
- Produces: os prints lado a lado para a descrição do PR.

- [ ] **Step 1: Casca clássica: `/creative-work/new` igual à home de hoje**

Com o servidor da Task 8 (gate desligado) e o usuário do fixture logado, capture `/creative-work/new` em 1440×900.
Para a captura de antes, use uma cópia da `main`:

```bash
git archive origin/main app | tar -x -C <scratch>/main-copy
cp -cR app/node_modules <scratch>/main-copy/app/node_modules
```

Suba a cópia em outra porta, sobre o mesmo banco, e capture `/`. Esconda o que o modo dev desenha por cima com
`page.addStyleTag({ content: ".tsqd-parent-container, nextjs-portal { display: none !important; }" })`, e espere a
caixa (`[data-testid="studio-talk-box"]`) e as imagens do mosaico carregarem antes de cada captura. O palco precisa
ser o mesmo nas duas: título, caixa com os objetivos, mosaico e "Continuar de onde parei". A diferença esperada é só o
item ativo da navegação.

- [ ] **Step 2: Conta grátis na casca nova contra o c7b**

Suba o servidor de dev com o gate ligado, usando um arquivo de ambiente com cada valor entre aspas:
- `EQUIPE_ENABLED='true'` e `EQUIPE_PILOT_WORKSPACES='*'`;
- `SITE_READER_PROVIDER='fake'` e `INSTAGRAM_READER_PROVIDER='fake'`;
- chaves Anthropic e Meta de mentira;
- `E2E_DISABLE_RATE_LIMIT='true'`;
- `DATABASE_URL` no banco `_test` da Task 8.

Antes de subir, rode `rm -rf .next/dev`. Crie um usuário novo com
`POST /api/auth/sign-up/email` (`{ "email": "gratis-e1@adscale.local", "password": "Gratis123!", "name": "Ana Paula" }`)
e confirme o e-mail:

```bash
/opt/homebrew/opt/postgresql@16/bin/psql "$DATABASE_URL" -c "update adscale_app.\"user\" set email_verified = true where email = 'gratis-e1@adscale.local'"
```

Entre com esse usuário, abra `/` (a conta grátis abre) e capture `/creative-work/new`. Ponha lado a lado com o
`c7b-composer-conta-gratis.png`: dois painéis de 864×540 num fundo `#18181c`, com os rótulos "quadro aprovado" e
"implementado".

- [ ] **Step 3: Decidir**

Se as capturas batem com o quadro e com a home, a tarefa termina aqui. Se o c7b mostrar uma diferença de layout (o card
noutro lugar, espaçamento, tipografia), pare: o Step 6 da Task 0 acrescenta aqui os passos com o código da correção,
e esta tarefa é refeita depois deles.

---

- [x] **Step 4: Corrigir o card do composer grátis após a conferência visual**

A captura da Task 9 encontrou uma diferença de layout no c7b aprovado: o CTA estava solto, sem card, com introdução de 14px e altura de 84px. O quadro pede card de aproximadamente 672×208px, cantos de 24px, borda e fundo elevado, padding de 28px e introdução de 24px com peso forte. A correção autorizada pelo Step 6 da Task 0 fica na apresentação do `FreePlanCta` usado em `app/src/components/dashboard/DashboardHomeActions.tsx`, reutilizando seu `className` e os tokens existentes. Ajustar apenas o subtítulo/posicionamento dessa composição grátis se necessário para o quadro, sem mudar o componente de billing em outras superfícies nem sua lógica de contato, conta, consentimento ou envio. O seletor no trilho e a retirada de “Novo trabalho” continuam na etapa 2.

- [x] **Step 5: Verificar e recapturar a correção**

Use os testes existentes do `DashboardHomeActions` para preservar os critérios de uma única CTA, ausência de talkbox e drop bloqueado na conta grátis. Não adicionar testes que espelhem classes CSS. Capturar novamente a conta grátis e medir card, título, spacing e tipografia contra c7b; guardar antes/depois fora do Git. A comparação clássica inicial tinha feed de inspirações vazio nas duas versões. Completar, se necessário, com uma inspiração sintética usando somente o banco e um asset locais desta rodada, sem chamadas de provider, sem interceptação que falsifique o layout e sem mudança de aplicação para acomodar a fixture. Registrar diferenças de dados e as diferenças previstas das etapas seguintes.

- [ ] **Step 6: Commit local e revisão independente da correção visual**

Comitar apenas o código mínimo e este registro do plano; repetir os checks afetados, atualizar o grafo somente por AST e submeter o diff e as capturas à revisão independente. A Task 9 só termina após conferir a correção contra o quadro aprovado. Push e PR permanecem no gate da Task 10.

---

Registro local da correção (2026-10-07): card medido em 672×208px, raio 24px, padding 28px, introdução 24px/600, botão 40px e contato 14px; tokens existentes e subtítulo oculto apenas na composição grátis. Teste existente `DashboardHomeActions`: 61/61; lint focal sem erros (um aviso anterior). Recapturas preservadas fora do Git, com mosaico carregado pelo feed real no fixture local sintético e geometria clássica equivalente nos casos com trabalhos e inicial. O fundo usa `--surface-base`; há pequena diferença residual de cor contra os pixels do quadro. Dados da marca/imagens e os controles previstos para a etapa 2 continuam distintos. Grafo atualizado por AST. Step 6 permanece pendente da revisão independente do controlador; commit local e evidências não representam push, PR ou aprovação humana.

### Task 10: Verificação completa, inventário e PR

**Files:**
- Modify: `.planning/convergence/surface-inventory.raw.json` (regenerado)

**Interfaces:**
- Consumes: tudo acima.
- Produces: o PR da etapa 1.

- [ ] **Step 1: Lint e tipos**

```bash
rm -rf .next/dev
npm run lint
npm run typecheck
```

Expected: o lint sem erros (avisos antigos não reprovam) e o `tsc` sem erros.

- [ ] **Step 2: Suíte completa com Postgres real**

Use o banco da Task 8 (ou um novo terminado em `_test`, migrado):

```bash
CI=true TZ=UTC PGOPTIONS='-c timezone=UTC' DATABASE_URL=$DATABASE_URL TEST_DATABASE_URL=$DATABASE_URL npx vitest run --config config/vitest.config.ts --maxWorkers=4 --exclude '**/*.pg.test.ts'
CI=true TZ=UTC PGOPTIONS='-c timezone=UTC' DATABASE_URL=$DATABASE_URL TEST_DATABASE_URL=$DATABASE_URL npx vitest run --config config/vitest.config.ts .pg.test.ts --no-file-parallelism --maxWorkers=1
```

Expected: PASS. Duas falhas locais são esperadas e não vêm deste trabalho: `creative-production.test.ts` e
`brand-knowledge-publish.pg.test.ts` pedem o contêiner da porta 5433. Desfaça o que a suíte regravou:
`git checkout -- ../.planning/phases/128-evaluation-and-release-gate/`.

- [ ] **Step 3: Inventário de superfícies e gates de convergência**

```bash
npm run convergence:inventory
npm run convergence:test
npm run convergence:gate
```

Expected: o inventário regravado em `../.planning/convergence/surface-inventory.raw.json` e os dois gates em PASS. O
gate de destinos não acusa rota nova.

- [ ] **Step 4: Build**

Run: `npm run build`, com as variáveis de placeholder do job `test` do CI.
Expected: build concluído.

- [ ] **Step 5: Commit do inventário**

```bash
git add ../.planning/convergence/surface-inventory.raw.json
git commit -m "chore(caminho-unico): regenerate the surface inventory

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: PR (com a confirmação do dono)**

Peça ao dono a confirmação para publicar. Com o ok, rode `git push -u origin caminho-unico/etapa-1` e abra o PR contra
`main` com `gh pr create`. A descrição traz:
- o que muda: o composer em `/creative-work/new`, `/` redirecionando os endereços antigos, a conta grátis com o card
  do plano e o guarda;
- os prints da Task 9, lado a lado;
- os cinco ajustes da spec;
- o que fica para as etapas 2 a 4.

Termine a descrição com:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Depois de abrir, vincule o PR com as ferramentas `ccd_pr` (`get_status` e, se precisar, `bind_pr`).


### Decisão aprovada dos quadros — Task 0 (2026-10-07)

O dono aprovou os quatro quadros c7, c7b, c8 e c8b. O seletor de marca mora no topo do trilho, logo abaixo do logo, com o monograma da marca ativa e abertura do menu à direita. Na conta grátis há uma só marca; “Adicionar marca” exibe cadeado e “Outras marcas fazem parte do plano.”, levando ao card do plano. Esta é a posição aprovada para a etapa 2. A Task 0 não comprovou necessidade adicional naquele momento. A comparação de runtime da Task 9 identificou a falta do card no composer grátis; os passos 4–6 da Task 9 registram a correção de apresentação exigida pelo c7b aprovado, preservando os limites entre as etapas. Os passos 1–7 da Task 0 estão concluídos, com persistência do arquivo editável e escopo conferidos antes do commit local.
