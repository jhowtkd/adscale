import { expect, test, type Page } from "@playwright/test";
import { loginVisualFoundation, seedVisualManifest } from "./support/visual-auth";
import {
  dismissCookieBanner, expectCardUnderPinnedMesa, expectNoSidewaysScroll, expectPinnedMesaInView, mockInspirations, openPilotHome,
  pilotContext, runAxe, seedStage, stageWithScript, withDb,
  type PilotContext,
} from "./support/pilot-home";

/**
 * Ticket 09 — the pilot shell (Equipe gate on): the v4 rail, the mesa, "Nova conversa" (the conversation panel's +), the fixed suggestions of the
 * empty screens, no attach button for a free account, and axe on the five rail routes.
 *
 * Runs against a local server with EQUIPE_ENABLED=true and EQUIPE_PILOT_WORKSPACES=*, started with its own database
 * (E2E_BASE_URL and TEST_DATABASE_URL both point at it). Handoff states are seeded by SQL. It never sends a chat message
 * (the chat endpoint is stubbed where a phrase is sent) and never reads a real site.
 */

const CATALOG_PHRASE = "O que falta na minha Biblioteca?";

async function skipUnlessGateOn(page: Page) {
  const gate = await page.request.get("/api/equipe/accounts");
  test.skip(gate.status() === 404, "The pilot shell requires the Equipe gate for this workspace.");
  expect(gate.status()).toBe(200);
}

test.describe("pilot shell (Equipe gate on)", () => {
  let runtimeErrors: string[];
  let ctx: PilotContext;

  test.beforeAll(() => {
    seedVisualManifest();
  });

  test.beforeEach(async ({ page }) => {
    runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await loginVisualFoundation(page);
    await skipUnlessGateOn(page);
    await mockInspirations(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPilotHome(page);
    ctx = await withDb(pilotContext);
    await withDb((db) => seedStage(db, ctx, "opening"));
  });

  test.afterEach(async () => {
    expect(runtimeErrors).toEqual([]);
    if (ctx) await withDb((db) => seedStage(db, ctx, "opening"));
  });

  test("the rail offers the six v4 destinations and moves between them without new routes", async ({ page }) => {
    await openPilotHome(page);
    const rail = page.getByTestId("rail");
    await expect(rail).toBeVisible();
    const nav = rail.getByRole("navigation", { name: "Seções" });
    const entries = await nav.getByRole("listitem").evaluateAll((items) =>
      items.map((item) => {
        const control = item.querySelector("a, button")!;
        return { name: control.getAttribute("aria-label"), href: control.getAttribute("href") };
      }),
    );
    expect(entries).toEqual([
      { name: "Conversa", href: "/" },
      { name: "Buscar", href: null },
      { name: "Criações", href: "/campaigns" },
      { name: "Biblioteca", href: "/library" },
      { name: "Ideias", href: expect.stringMatching(/^\/ideas/) },
      { name: "Metas", href: expect.stringMatching(/^\/goals/) },
    ]);
    // The brand sits where the old "+" was: "Nova conversa" lives in the conversation panel now (the tests below open it there).
    await expect(rail.getByTestId("rail-brand-switcher")).toBeVisible();
    await expect(rail.getByRole("button", { name: "Nova conversa" })).toHaveCount(0);
    await expect(rail.getByRole("link", { name: "Ajuda" })).toBeVisible();
    await expect(rail.getByRole("button", { name: /^Menu da conta/ })).toBeVisible();
    await expect(rail).not.toContainText(/\bEquipe\b/);
    await expect(rail.getByRole("link", { name: "Conversa" })).toHaveAttribute("aria-current", "page");

    for (const [name, pattern] of [
      ["Criações", /\/campaigns(\?.*)?$/],
      ["Biblioteca", /\/library(\?.*)?$/],
      ["Ideias", /\/ideas(\?.*)?$/],
      ["Metas", /\/goals(\?.*)?$/],
      ["Conversa", /\/$/],
    ] as const) {
      await rail.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(pattern);
      await expect(page.locator("main#main")).toBeVisible();
      await expect(rail.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(rail.locator('nav a[aria-current="page"]')).toHaveCount(1);
    }
  });

  test("the header holds Painel | Pipeline and Pipeline stays out of the rail", async ({ page }) => {
    await openPilotHome(page);
    const header = page.getByTestId("rail-header");
    await expect(header.getByRole("link", { name: "Painel" })).toHaveAttribute("aria-current", "page");
    await header.getByRole("link", { name: "Pipeline" }).click();
    await expect(page).toHaveURL(/\/pipeline(\?.*)?$/);
    await expect(page.getByTestId("rail-header").getByRole("link", { name: "Pipeline" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("rail").getByRole("link", { name: "Pipeline" })).toHaveCount(0);
    await expect(page.getByTestId("rail").locator('a[aria-current="page"]')).toHaveCount(0);
  });

  test("Buscar focuses the conversation search, from the conversation and from a page that has none", async ({ page }) => {
    await openPilotHome(page);
    await page.getByTestId("rail").getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByTestId("conversation-search")).toBeFocused();

    await page.getByTestId("rail").getByRole("link", { name: "Ideias" }).click();
    await expect(page).toHaveURL(/\/ideas/);
    await page.getByTestId("rail").getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("conversation-search")).toBeFocused({ timeout: 15_000 });
  });

  test("the mesa is large on the first open, compact once the person answers, and shows the brand while it is read", async ({ page }) => {
    await openPilotHome(page);
    const mesa = page.getByTestId("mesa");
    await expect(mesa).toHaveAttribute("data-size", "large", { timeout: 15_000 });
    await expect(mesa).toHaveAttribute("data-pinned", "false");
    await expect(page.getByTestId("mesa-card-inspiration")).toHaveCount(5);
    // The fan's cards are absolutely positioned, so the list has no box of its own: it is attached, not "visible".
    await expect(mesa.getByRole("list", { name: "Mesa de criativos" })).toBeAttached();
    const largeHeight = (await mesa.boundingBox())!.height;

    await withDb((db) => seedStage(db, ctx, "answered"));
    await openPilotHome(page);
    await expect(page.getByTestId("mesa")).toHaveAttribute("data-size", "compact", { timeout: 15_000 });
    await expect(page.getByTestId("mesa-card-inspiration")).toHaveCount(5);
    expect((await page.getByTestId("mesa").boundingBox())!.height).toBeLessThan(largeHeight);
    // An inspiration is its picture and the "Inspiração" stamp. The catalog's own name for it (a file name) is nowhere on the page, not even for assistive technology:
    // the picture only has a generic alternative text.
    const inspiration = page.getByTestId("mesa-card-inspiration").first();
    await expect(inspiration.locator("p")).toHaveCount(0);
    await expect(inspiration).not.toContainText("Inspiração 1");
    await expect(inspiration.getByRole("img", { name: "Imagem de inspiração" })).toBeAttached();

    await withDb((db) => seedStage(db, ctx, "reading"));
    await openPilotHome(page);
    await expect(page.getByTestId("mesa")).toHaveAttribute("data-size", "compact", { timeout: 15_000 });
    await expect(page.getByTestId("mesa-card-inspiration")).toHaveCount(0);
    await expect(page.getByTestId("mesa-card-palette")).toHaveCount(1);
    await expect(page.getByTestId("mesa-swatch")).toHaveCount(3);
    expect(await page.getByTestId("mesa-card-queued").count()).toBeGreaterThanOrEqual(2);
    // Nothing from the person's own brand but our managed copies is ever linked from the mesa.
    await expect(page.getByTestId("mesa").locator("img[src^='http']")).toHaveCount(0);
    // The conversation is longer than the screen by now, and the mesa stays where the person can see it.
    await expectPinnedMesaInView(page);
  });

  test("on a short window the pinned mesa shrinks, and on one too short to share it scrolls away so the card keeps the screen", async ({ page }) => {
    await withDb((db) => seedStage(db, ctx, "reading"));
    const positionOfPin = () => page.getByTestId("mesa-pin").evaluate((element) => getComputedStyle(element).position);

    // A laptop-sized window: still pinned, but no more than 28% of the window's height.
    await page.setViewportSize({ width: 1280, height: 620 });
    await openPilotHome(page);
    await expect(page.getByTestId("mesa")).toHaveAttribute("data-pinned", "true");
    expect(await positionOfPin()).toBe("sticky");
    expect((await page.getByTestId("mesa").boundingBox())!.height).toBeLessThanOrEqual(620 * 0.28 + 1);
    await expectPinnedMesaInView(page);

    // A phone on its side: the fan would take the whole scroll region, so it goes with the conversation.
    await page.setViewportSize({ width: 844, height: 390 });
    await openPilotHome(page);
    expect(await positionOfPin()).not.toBe("sticky");
    await page.getByTestId("assistant-chat-scroll-region").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByText("Corrigir a fonte (refaz a leitura)")).toBeInViewport();
    await expect(page.getByTestId("assistant-chat-input")).toBeInViewport();
  });

  test("a parallel conversation is created from Nova conversa, bound to the account and opened", async ({ page }) => {
    await openPilotHome(page);
    await page.getByTestId("conversation-panel").getByTestId("conversation-new").click();
    const dialog = page.getByRole("dialog", { name: "Nova conversa" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Criar conversa" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Escreva o assunto da conversa.");
    await expect(dialog).toBeVisible();

    const topic = `Promoção de abril ${Date.now()}`;
    await dialog.getByLabel("Assunto da conversa").fill(topic);
    await dialog.getByRole("button", { name: "Criar conversa" }).click();
    await expect(page).toHaveURL(/\/assistant\?threadId=[0-9a-f-]{36}$/, { timeout: 90_000 });
    const threadId = new URL(page.url()).searchParams.get("threadId")!;
    await expect(page.getByTestId("conversation-screen")).toBeVisible();
    await expect(page.getByTestId("conversation-label")).toHaveText(topic);
    await expect(page.getByTestId("mesa")).toHaveCount(0);

    const list = page.getByTestId("conversation-parallel");
    await expect(list.getByRole("link", { name: topic })).toHaveAttribute("aria-current", "page");
    await expect(list.getByRole("link", { name: topic })).toHaveAttribute("href", `/assistant?threadId=${threadId}`);
    await expect(page.getByTestId("conversation-main")).not.toHaveAttribute("aria-current", "page");

    // The binding is what routes it through the Strategist: the account lists it as a parallel conversation.
    const state = await (await page.request.get(`/api/equipe/accounts/${ctx.accountId}`)).json() as {
      threads: { primary: { assistantThreadId: string }; parallel: { assistantThreadId: string; topic: string }[] };
    };
    expect(state.threads.parallel.map((entry) => [entry.assistantThreadId, entry.topic])).toContainEqual([threadId, topic]);
    expect(state.threads.primary.assistantThreadId).toBe(ctx.threadId);

    await page.getByTestId("conversation-main").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("conversation-main")).toHaveAttribute("aria-current", "page");
  });

  test("closing Nova conversa gives focus back to the button that opened it, and its close button speaks the reader's language", async ({ page }) => {
    await openPilotHome(page);
    const open = page.getByTestId("conversation-panel").getByTestId("conversation-new");
    const dialog = page.getByRole("dialog", { name: "Nova conversa" });

    await open.click();
    await expect(dialog.getByLabel("Assunto da conversa")).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Fechar" })).toBeAttached();
    await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
  });

  test("a workspace conversation that no account owns goes home on the server, and opens once it is bound", async ({ page }) => {
    const created = await page.request.post("/api/assistant/threads", {
      data: { clientProfileId: ctx.clientProfileId, name: "Sem vínculo", experience: "classic" },
    });
    expect(created.status()).toBe(201);
    const { thread } = await created.json() as { thread: { id: string } };

    // It exists in the workspace, but no account owns it: opened here it would answer outside the Strategist and the ceiling.
    expect((await page.request.get(`/api/assistant/threads/${thread.id}`)).status()).toBe(200);
    const unbound = await page.request.get(`/assistant?threadId=${thread.id}`, { maxRedirects: 0 });
    expect(unbound.status()).toBe(307);
    expect(unbound.headers().location).toBe("/");
    // The page is not the only way in: its chat is refused too, with the reason, and nothing answers it.
    const chat = await page.request.post(`/api/assistant/threads/${thread.id}/chat`, { data: { message: "Oi" } });
    expect(chat.status()).toBe(409);
    expect(await chat.json()).toMatchObject({ code: "threadNotInAccount" });

    const bound = await page.request.post(`/api/equipe/accounts/${ctx.accountId}/commands`, {
      data: { type: "open_parallel_thread", payload: { assistantThreadId: thread.id, topic: "Vinculada" } },
    });
    expect(bound.status()).toBe(200);
    expect((await page.request.get(`/assistant?threadId=${thread.id}`, { maxRedirects: 0 })).status()).toBe(200);
  });

  test("when the binding is refused, the new conversation is taken back", async ({ page }) => {
    await page.route(/\/api\/equipe\/accounts\/[^/]+\/commands$/, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Sem permissão", code: "forbidden_actor" }) });
    });
    await page.getByTestId("conversation-panel").getByTestId("conversation-new").click();
    const dialog = page.getByRole("dialog", { name: "Nova conversa" });
    await dialog.getByLabel("Assunto da conversa").fill(`Recusada ${Date.now()}`);
    const creation = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/assistant/threads");
    await dialog.getByRole("button", { name: "Criar conversa" }).click();
    const { thread } = await (await creation).json() as { thread: { id: string } };

    // The person stays where they were and is told it failed; the thread nobody owns is deleted, not left behind.
    await expect(dialog.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(async () => (await page.request.get(`/api/assistant/threads/${thread.id}`)).status(), { timeout: 15_000 }).toBe(404);
  });

  test("/?suggestion= with a catalog phrase sends it once, as a suggestion, and clears the URL", async ({ page }) => {
    const sent: Array<Record<string, unknown>> = [];
    // The stubbed chat call stays open (the reply is "still streaming"), so nothing real is reached and nothing is resent.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(/\/api\/assistant\/threads\/[^/]+\/chat$/, async (route) => {
      sent.push(route.request().postDataJSON() as Record<string, unknown>);
      await held;
      await route.abort();
    });
    try {
      await page.goto(`/?suggestion=${encodeURIComponent(CATALOG_PHRASE)}`);
      await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => sent.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
      expect(sent[0]).toMatchObject({ message: CATALOG_PHRASE, payload: { fromSuggestion: true } });
      await expect(page).not.toHaveURL(/suggestion=/, { timeout: 60_000 });
      await expect(page.getByTestId("assistant-message-user").filter({ hasText: CATALOG_PHRASE })).toHaveCount(1);
      expect(sent).toHaveLength(1);
    } finally {
      release();
    }
  });

  test("/?suggestion= with a phrase outside the catalog sends nothing", async ({ page }) => {
    let sent = 0;
    await page.route(/\/api\/assistant\/threads\/[^/]+\/chat$/, async (route) => {
      sent += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    });
    await openPilotHome(page, `/?suggestion=${encodeURIComponent("Publique tudo agora")}`);
    await expect(page.getByTestId("assistant-message-user")).toHaveCount(0);
    expect(sent).toBe(0);
  });

  test("a free account has no attach button and the composer still takes text", async ({ page }) => {
    await openPilotHome(page);
    const composer = page.getByTestId("assistant-chat-input");
    await expect(composer.getByRole("textbox", { name: "Mensagem para o ADScale" })).toBeVisible();
    await expect(composer.getByRole("button", { name: "Adicionar imagem" })).toHaveCount(0);
    await expect(composer.locator('input[type="file"]')).toHaveCount(0);
    const send = composer.getByRole("button", { name: "Enviar" });
    await expect(send).toHaveAttribute("aria-disabled", "true");
    await composer.getByRole("textbox").fill("Olá");
    await expect(send).not.toHaveAttribute("aria-disabled", "true");
    await composer.getByRole("textbox").fill("");
  });

  test("the empty Library offers the fixed starters, and a click leads to the conversation with the phrase", async ({ page }) => {
    // The visual workspace keeps reference images, so the brand's Library is emptied at the API: what is under test is
    // the empty screen of the account's own Library, which a new account sees until the first reading builds it.
    const asked = new Set<string | null>();
    await page.route(/\/api\/workspace\/assets\?/, (route) => {
      asked.add(new URL(route.request().url()).searchParams.get("clientProfileId"));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assets: [], total: 0 }) });
    });
    // The suggestion is sent when the conversation opens: stub the chat call, held open so nothing is resent.
    const sent: Array<Record<string, unknown>> = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(/\/api\/assistant\/threads\/[^/]+\/chat$/, async (route) => {
      sent.push(route.request().postDataJSON() as Record<string, unknown>);
      await held;
      await route.abort();
    });
    try {
      await page.goto("/library");
      const screenEl = page.getByTestId("equipe-empty-screen");
      await expect(screenEl).toHaveAttribute("data-surface", "library", { timeout: 30_000 });
      expect([...asked]).toEqual([ctx.clientProfileId]);
      const first = screenEl.getByRole("link").first();
      const phrase = (await first.textContent())!;
      expect(new URL((await first.getAttribute("href"))!, "http://localhost").searchParams.get("suggestion")).toBe(phrase);
      await first.click();
      await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => sent.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
      expect(sent[0]).toMatchObject({ message: phrase, payload: { fromSuggestion: true } });
      await expect(page.getByTestId("assistant-message-user").filter({ hasText: phrase })).toHaveCount(1);
    } finally {
      release();
    }
  });

  test("a workspace with more than one brand opens the Library of the account's brand, with no choice to make", async ({ page }) => {
    // A workspace with a brand besides the account's: with no brand picked in the shell, the Library used to ask for a
    // choice the v4 rail has nowhere to offer. Since stage 2B the opening takes the workspace's brand instead of making a
    // second one, so the test adds the other brand itself (newer, so never the active one by age).
    const otherBrand = await withDb(async (db) => (await db.query<{ id: string }>(
      "insert into adscale_app.client_profiles (workspace_id, name) values ($1, 'VF Outra marca') returning id", [ctx.workspaceId],
    )).rows[0]!.id);
    try {
      const { brands, accountBrand } = await withDb(async (db) => ({
        brands: (await db.query("select id from adscale_app.client_profiles where workspace_id = $1", [ctx.workspaceId])).rowCount ?? 0,
        accountBrand: (await db.query<{ name: string }>("select name from adscale_app.client_profiles where id = $1", [ctx.clientProfileId])).rows[0]!.name,
      }));
      expect(brands, "the visual workspace has a brand of its own besides the account's").toBeGreaterThanOrEqual(2);
      await page.evaluate(() => { try { window.localStorage.clear(); } catch { /* storage may be blocked */ } });

      const asked = new Set<string | null>();
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname === "/api/workspace/assets") asked.add(url.searchParams.get("clientProfileId"));
      });
      await page.goto("/library");
      await expect(page.getByRole("heading", { level: 1 })).toContainText(accountBrand, { timeout: 30_000 });
      await expect(page.getByText("Selecione uma marca para ver a Biblioteca.")).toHaveCount(0);
      expect(asked.size).toBeGreaterThan(0);
      expect([...asked]).toEqual([ctx.clientProfileId]);
    } finally {
      await withDb((db) => db.query("delete from adscale_app.client_profiles where id = $1", [otherBrand]));
    }
  });
});

test.describe("pilot shell: mobile", () => {
  test.beforeAll(() => { seedVisualManifest(); });

  test("the bottom bar replaces the rail, and the conversation list opens in a sheet", async ({ page }) => {
    await loginVisualFoundation(page);
    await skipUnlessGateOn(page);
    await mockInspirations(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openPilotHome(page);

    await expect(page.getByTestId("rail")).toBeHidden();
    const bar = page.getByRole("navigation", { name: "Primary mobile navigation" });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link")).toHaveText(["Conversa", "Criações", "Biblioteca"]);
    // A dev-tool avatar floats over the right end of the bar in local runs, so click without the pointer hit-test.
    await bar.getByRole("button", { name: "Mais" }).dispatchEvent("click");
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: "Ideias" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Metas" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Pipeline" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Fechar" })).toBeAttached();
    await expect(sheet.getByRole("button", { name: "Close" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The composer sits above the bar, never clipped under it.
    const composer = await page.getByTestId("assistant-chat-input").boundingBox();
    const barBox = await bar.boundingBox();
    expect(composer).not.toBeNull();
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(barBox!.y + 1);

    await page.getByTestId("conversation-list-open").click();
    const list = page.getByRole("dialog").getByTestId("conversation-list");
    await expect(list).toBeVisible();
    await expect(list.getByTestId("conversation-main")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("dialog").getByRole("button", { name: "Fechar" })).toBeAttached();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Close" })).toHaveCount(0);
  });

  test("while the brand is read, the pinned mesa stays in view and leaves the screen to the card being answered", async ({ page }) => {
    await loginVisualFoundation(page);
    await skipUnlessGateOn(page);
    await mockInspirations(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openPilotHome(page);
    const ctx = await withDb(pilotContext);
    try {
      await withDb((db) => seedStage(db, ctx, "reading"));
      await openPilotHome(page);
      await expect(page.getByTestId("mesa")).toHaveAttribute("data-size", "compact", { timeout: 15_000 });
      await expect(page.getByTestId("mesa-card-palette")).toHaveCount(1);
      await expectPinnedMesaInView(page);
      expect((await page.getByTestId("mesa").boundingBox())!.height).toBeLessThan(844 * 0.25);
      await expect(page.getByTestId("assistant-chat-input")).toBeInViewport();
    } finally {
      await withDb((db) => seedStage(db, ctx, "opening"));
    }
  });
});

const AXE_ROUTES = ["/", "/library", "/campaigns", "/ideas", "/goals"] as const;
const AXE_VIEWPORTS = [{ width: 1280, height: 800 }, { width: 390, height: 844 }] as const;

test.describe("pilot shell: axe (wcag2a/aa) on the rail routes", () => {
  test.beforeAll(() => { seedVisualManifest(); });

  for (const viewport of AXE_VIEWPORTS) {
    for (const route of AXE_ROUTES) {
      test(`no serious or critical violations on ${route} at ${viewport.width}×${viewport.height}`, async ({ page }) => {
        await loginVisualFoundation(page, "pt-BR", "light");
        await skipUnlessGateOn(page);
        await mockInspirations(page);
        await page.setViewportSize(viewport);
        if (route === "/") await openPilotHome(page);
        else await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main#main")).toBeVisible({ timeout: 30_000 });
        await dismissCookieBanner(page);
        // The page settles when its own content, not a fixed delay, is on screen.
        await expect(page.getByText("Carregando conversa…")).toHaveCount(0);
        const findings = (await runAxe(page)).filter((finding) => finding.impact === "serious" || finding.impact === "critical");
        expect(findings, `${route}@${viewport.width}: ${JSON.stringify(findings)}`).toEqual([]);
      });
    }
  }
});

// The steps of the handoff, staged by app/scripts/pilot-states.ts (it writes the images the mesa and the cards show into the
// storage the server reads, so it needs the server's E2E_STORAGE_DIR). Windows that matter: a 1366×768 laptop with the
// browser's bars, a 1280×720 screen, a 1024×768 tablet and the two common phone widths.
const CARD_WINDOWS = [
  { width: 1366, height: 650 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 360, height: 740 },
] as const;
const CARD_STEPS = ["reading", "identity", "networks", "images", "summary"] as const;

test.describe("pilot shell: the card under the pinned mesa, on every window", () => {
  test.skip(!process.env.E2E_STORAGE_DIR, "the steps are staged by app/scripts/pilot-states.ts, which needs the server's E2E_STORAGE_DIR");
  test.beforeAll(() => { seedVisualManifest(); });
  test.afterAll(() => { try { stageWithScript("reset"); } catch { /* the next run stages again */ } });

  test.beforeEach(async ({ page }) => {
    await loginVisualFoundation(page);
    await skipUnlessGateOn(page);
    await openPilotHome(page);
  });

  for (const step of CARD_STEPS) {
    test(`${step}: the card opens with its top under the mesa, nothing slides sideways, and axe finds nothing`, async ({ page }) => {
      stageWithScript(step);
      for (const window of CARD_WINDOWS) {
        await page.setViewportSize(window);
        await openPilotHome(page);
        await expect(page.getByTestId("mesa")).toHaveAttribute("data-pinned", "true");
        await expectCardUnderPinnedMesa(page);
        // The conversation rests on the card whatever the window: the list does not start from its top.
        if (window.width === 1280 || window.width === 390) {
          const findings = (await runAxe(page)).filter((finding) => finding.impact === "serious" || finding.impact === "critical");
          expect(findings, `${step}@${window.width}×${window.height}: ${JSON.stringify(findings)}`).toEqual([]);
        }
      }
    });
  }

  test("a step that is cut still shows where it begins: a short window shows the step and its first lines, the buttons are a scroll below", async ({ page }) => {
    stageWithScript("identity");
    await page.setViewportSize({ width: 1366, height: 650 });
    await openPilotHome(page);
    const card = page.getByTestId("handoff-card");
    await expect(card.getByText(/Passo 3 de 6/)).toBeInViewport({ ratio: 1 });
    await expect(card.getByRole("heading", { name: "Nome, logo, cores e fontes" })).toBeInViewport({ ratio: 1 });
    await expect(card.getByRole("button", { name: "Confirmar" })).not.toBeInViewport();
    await page.getByTestId("assistant-chat-scroll-region").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(card.getByRole("button", { name: "Confirmar" })).toBeInViewport({ ratio: 1 });
  });

  for (const width of [360, 390] as const) {
    test(`networks: the boxes, the @ field and Confirmar stay inside the card at ${width} px, with a long address`, async ({ page }) => {
      stageWithScript("networks");
      await page.setViewportSize({ width, height: 844 });
      await openPilotHome(page);
      const card = (await page.getByTestId("handoff-card").boundingBox())!;
      const inside = async (locator: ReturnType<Page["locator"]>) => {
        const box = (await locator.boundingBox())!;
        expect(box.x, `${await locator.evaluate((element) => element.outerHTML.slice(0, 80))} starts outside the card`).toBeGreaterThanOrEqual(card.x - 1);
        expect(box.x + box.width, "ends outside the card").toBeLessThanOrEqual(card.x + card.width + 1);
        expect(box.x + box.width, "ends outside the screen").toBeLessThanOrEqual(width);
      };
      const boxes = page.getByTestId("handoff-card").getByRole("checkbox");
      expect(await boxes.count()).toBeGreaterThanOrEqual(2);
      for (let index = 0; index < await boxes.count(); index++) await inside(boxes.nth(index));
      await inside(page.getByTestId("handoff-card").getByPlaceholder("@sua_marca"));
      await inside(page.getByTestId("handoff-card").getByRole("button", { name: "Confirmar" }));
      await expect(page.getByText("https://facebook.com/cafeaurora")).toBeVisible();
      await expectNoSidewaysScroll(page);
    });
  }

  for (const window of [{ width: 390, height: 844 }, { width: 1366, height: 650 }] as const) {
    test(`images: a control that takes focus from the keyboard is never behind the mesa, at ${window.width}×${window.height}`, async ({ page }) => {
      stageWithScript("images");
      await page.setViewportSize(window);
      await openPilotHome(page);
      const scroller = page.getByTestId("assistant-chat-scroll-region");
      // Read the card to its end: its first row of images goes up under the mesa. Then come back with Shift+Tab from the composer.
      await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await page.getByTestId("assistant-chat-input").getByRole("textbox").focus();
      const first = "Remover imagem 1, do site";
      let reached = false;
      for (let presses = 0; presses < 40 && !reached; presses++) {
        await page.keyboard.press("Shift+Tab");
        reached = (await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")) === first;
      }
      expect(reached, `Shift+Tab never reached "${first}"`).toBe(true);
      const pin = (await page.getByTestId("mesa-pin").boundingBox())!;
      const focused = (await page.getByRole("checkbox", { name: first }).boundingBox())!;
      expect(focused.y, "the focused image control is behind the mesa").toBeGreaterThanOrEqual(pin.y + pin.height - 1);
      // The names say where the image is and where it came from, never an identifier.
      const names = await page.getByTestId("handoff-card").getByRole("checkbox").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")));
      expect(names.length).toBeGreaterThanOrEqual(5);
      for (const name of names) expect(name).toMatch(/^Remover imagem \d+, (do site|do Instagram|enviada por você)$/);
    });
  }

  test("after the last confirmation the conversation has no Strategist row with only the name of the step", async ({ page }) => {
    stageWithScript("done");
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPilotHome(page);
    await expect(page.getByText("Sua marca está confirmada. Vou preparar o diagnóstico.")).toBeVisible();
    await expect(page.getByTestId("handoff-history")).toHaveCount(0);
    await expect(page.getByTestId("handoff-card")).toHaveCount(0);
    await expect(page.getByTestId("strategist-row").filter({ hasText: /^\s*Estrategista\s*IA\s*[\d:]*\s*Resumo\s*$/ })).toHaveCount(0);
    await expectNoSidewaysScroll(page);
  });

  test("the diagnosis document closes with a button that says Fechar, and the compact mesa does not draw the palette caption", async ({ page }) => {
    stageWithScript("diagnosis");
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPilotHome(page);
    await page.getByRole("button", { name: /Abrir documento/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Fechar" })).toBeAttached();
    await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    stageWithScript("reading");
    await openPilotHome(page);
    await expect(page.getByTestId("mesa-card-palette")).toHaveCount(1);
    await expect(page.getByTestId("mesa-card-palette").getByText(/Paleta · \d+ cores/)).toHaveClass(/sr-only/);
  });
});
