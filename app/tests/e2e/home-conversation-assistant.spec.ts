import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, request, test, type Page, type TestInfo } from "@playwright/test";
import { loginVisualFoundation, seedVisualManifest, VISUAL_PASSWORD } from "./support/visual-auth";

/**
 * Ticket 03 — `/` is the home conversation (spec 2026-10-07, caminho único: for every workspace, no product switch).
 * Ticket 09 put it in the pilot shell: the v4 rail, the conversations panel and the chat of `ConversationScreen`.
 * Runs against a local server with its own database (E2E_BASE_URL, e.g. http://localhost:3103); it never sends a
 * chat message, so it never reaches the real (placeholder-keyed) AI provider.
 */

// Screenshots land under this run's Playwright output by default; set
// E2E_SCREENSHOT_DIR to collect the final desktop/mobile prints for the
// implementation-notes artifact instead.
function screenshotPath(testInfo: TestInfo, name: string): string {
  const dir = process.env.E2E_SCREENSHOT_DIR;
  return dir ? path.join(dir, name) : testInfo.outputPath(name);
}

// Wait for the loaded conversation before navigating again or capturing it.
async function waitForHomeConversationReady(page: Page): Promise<void> {
  // The conversation has no thread header: it is ready when its composer is there and nothing is loading.
  await page.getByTestId("conversation-screen").waitFor({ state: "visible", timeout: 20_000 });
  await expect(page.getByTestId("assistant-chat-input")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Carregando conversa…")).toHaveCount(0);
}

function homeThreadResponse(page: Page) {
  return page.waitForResponse((response) =>
    response.request().method() === "GET" &&
    /^\/api\/assistant\/threads\/[^/]+$/.test(new URL(response.url()).pathname),
  );
}

async function openHomeConversation(page: Page, url = "/"): Promise<string> {
  const loaded = homeThreadResponse(page);
  await page.goto(url);
  const response = await loaded;
  expect(response.status()).toBe(200);
  await waitForHomeConversationReady(page);
  // The body can be gone once the page moved on (a cold dev server navigates twice): ask for it again then.
  const body = await response.json().catch(async () => (await page.request.get(response.url())).json());
  return body.thread.id as string;
}

test.describe("home conversation", () => {
  let runtimeErrors: string[];
  test.beforeAll(() => {
    seedVisualManifest();
  });

  test.beforeEach(async ({ page }) => {
    runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await loginVisualFoundation(page);
    expect((await page.request.get("/api/equipe/accounts")).status()).toBe(200);
    await openHomeConversation(page);
  });

  test.afterEach(() => {
    expect(runtimeErrors).toEqual([]);
  });

  test("desktop: / opens the pilot shell with the home conversation composer", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHomeConversation(page);

    const rail = page.getByTestId("rail");
    await expect(rail).toBeVisible({ timeout: 15_000 });
    const panel = page.getByTestId("conversation-panel");
    await expect(panel).toBeVisible();

    // The account's main conversation is selected in the panel, and it is the only selected row.
    const main = panel.getByTestId("conversation-main");
    await expect(main).toHaveText("Conversa principal");
    await expect(main).toHaveAttribute("aria-current", "page");
    await expect(panel.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByTestId("conversation-label")).toHaveText("Conversa principal");

    const screenEl = page.getByTestId("conversation-screen");
    await expect(screenEl.getByText("Carregando conversa…")).toHaveCount(0);
    const composer = screenEl.getByTestId("assistant-chat-input");
    await expect(composer).toBeVisible();
    await expect(composer.locator("textarea")).toHaveAttribute(
      "placeholder",
      "Mensagem para o ADScale",
    );

    // The composer's own surface — talk box, request field and stage — lives at /creative-work/new, not here.
    await expect(page.getByTestId("studio-talk-box")).toHaveCount(0);
    await expect(page.locator("#creative-composer-request")).toHaveCount(0);
    await expect(page.getByTestId("studio-stage")).toHaveCount(0);

    // Creating parallel conversations is the panel's + ("Nova conversa"), not the old tree buttons or the rail: the rail
    // carries the active brand where its "+" used to be.
    await expect(page.getByRole("button", { name: "Novo cliente" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Novo chat" })).toHaveCount(0);
    await expect(rail.getByTestId("rail-brand-switcher")).toBeVisible();
    await expect(rail.getByRole("button", { name: "Nova conversa" })).toHaveCount(0);
    await expect(panel.getByTestId("conversation-new")).toBeVisible();

    await waitForHomeConversationReady(page);
    await page.screenshot({
      path: screenshotPath(testInfo, "home-conversation-desktop.png"),
      fullPage: true,
      style: "nextjs-portal, .tsqd-open-btn-container { display: none !important; }",
    });
  });

  test("mobile: / opens the pilot shell in a single compact column", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHomeConversation(page);

    await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("rail")).toBeHidden();
    await expect(page.getByTestId("conversation-panel")).toBeHidden();
    const composer = page.getByTestId("assistant-chat-input");
    await expect(composer).toBeVisible();

    // The composer sits in the lower half of the viewport, fully above the
    // bottom bar — never clipped under it.
    const tabbar = page.getByRole("navigation", { name: "Primary mobile navigation" });
    await expect(tabbar).toBeVisible();
    const composerBox = await composer.boundingBox();
    const tabbarBox = await tabbar.boundingBox();
    expect(composerBox).not.toBeNull();
    expect(tabbarBox).not.toBeNull();
    expect(composerBox!.y).toBeGreaterThan(844 / 2);
    expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(tabbarBox!.y + 1);

    // No horizontal scroll at phone width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await waitForHomeConversationReady(page);
    await page.screenshot({
      path: screenshotPath(testInfo, "home-conversation-mobile.png"),
      fullPage: true,
      style: "nextjs-portal, .tsqd-open-btn-container { display: none !important; }",
    });
  });

  test("/assistant without a threadId redirects back to the home conversation", async ({ page }) => {
    await page.goto("/assistant");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 15_000 });
  });

  for (const [kind, id] of [["nonexistent", randomUUID()], ["malformed", "not-a-uuid"]]) {
    test(`/assistant with a ${kind} thread redirects on the server`, async ({ page }) => {
      const response = await page.request.get(`/assistant?threadId=${id}`, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers().location).toBe("/");
    });
  }

  test("a deleted conversation redirects on the server", async ({ page }) => {
    const manifest = seedVisualManifest();
    const profiles = await page.request.get("/api/client-profiles");
    expect(profiles.status()).toBe(200);
    const { profiles: clients } = await profiles.json() as { profiles: { id: string }[] };
    const created = await page.request.post("/api/assistant/threads", {
      data: { clientProfileId: clients[0].id, name: "Ticket 03 deleted fixture", experience: "classic" },
    });
    expect(created.status()).toBe(201);
    const { thread } = await created.json() as { thread: { id: string } };
    expect((await page.request.get(`/api/assistant/threads/${thread.id}`)).status()).toBe(200);
    expect(process.env.TEST_DATABASE_URL).toBeTruthy();
    const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    try {
      const deleted = await db.query(
        "delete from adscale_app.assistant_threads where id = $1 and workspace_id = $2 returning id",
        [thread.id, manifest.fixtureIds.workspaceId],
      );
      expect(deleted.rowCount).toBe(1);
    } finally { await db.end(); }
    expect((await page.request.get(`/api/assistant/threads/${thread.id}`)).status()).toBe(404);
    const response = await page.request.get(`/assistant?threadId=${thread.id}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/");
  });

  test("a conversation in another workspace redirects without revealing its existence", async ({ page }) => {
    const manifest = seedVisualManifest();
    const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
    const foreign = await request.newContext({ baseURL });
    expect(process.env.TEST_DATABASE_URL).toBeTruthy();
    const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    const clientId = randomUUID();
    const id = randomUUID();
    await db.connect();
    try {
      // Seed only this fixture; the admin's workspace need not open a free account.
      const workspace = await db.query<{ workspace_id: string }>(
        'select m.workspace_id from adscale_app.workspace_members m join adscale_app."user" u on u.id = m.user_id where u.email = $1 order by m.created_at, m.id limit 1',
        [manifest.roleMatrix.workspaceAdmin.email],
      );
      expect(workspace.rows).toHaveLength(1);
      const workspaceId = workspace.rows[0].workspace_id;
      expect(workspaceId).not.toBe(manifest.fixtureIds.workspaceId);
      await db.query(
        "insert into adscale_app.client_profiles (id, workspace_id, name) values ($1, $2, $3)",
        [clientId, workspaceId, "Ticket 03 foreign fixture"],
      );
      await db.query(
        "insert into adscale_app.assistant_threads (id, workspace_id, client_profile_id, name) values ($1, $2, $3, $4)",
        [id, workspaceId, clientId, "Ticket 03 foreign fixture"],
      );
      const login = await foreign.post("/api/auth/sign-in/email", {
        data: { email: manifest.roleMatrix.workspaceAdmin.email, password: VISUAL_PASSWORD },
        headers: { Origin: baseURL },
      });
      expect(login.status()).toBe(200);
      expect((await foreign.get(`/api/assistant/threads/${id}`)).status()).toBe(200);
      expect((await page.request.get(`/api/assistant/threads/${id}`)).status()).toBe(404);
      const response = await page.request.get(`/assistant?threadId=${id}`, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers().location).toBe("/");
    } finally {
      await db.query("delete from adscale_app.client_profiles where id = $1", [clientId]);
      await db.end();
      await foreign.dispose();
    }
  });

  test("an existing /assistant conversation keeps its selection in the panel, and the main one is one click away", async ({ page }) => {
    const primaryThreadId = await openHomeConversation(page);
    const main = page.getByTestId("conversation-main");
    await expect(main).toHaveAttribute("aria-current", "page");

    // The primary thread opened by its own id is still "Conversa principal" and selected.
    await page.goto(`/assistant?threadId=${primaryThreadId}`);
    await waitForHomeConversationReady(page);
    await expect(page).toHaveURL(new RegExp(`/assistant\\?threadId=${primaryThreadId}$`));
    await expect(page.getByTestId("conversation-label")).toHaveText("Conversa principal");
    await expect(page.getByTestId("conversation-main")).toHaveAttribute("aria-current", "page");

    // The classic tree and its creation buttons are not part of the pilot shell.
    await expect(page.getByRole("button", { name: "Novo cliente" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Novo chat" })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("conversation-list-open").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("conversation-main")).toHaveAttribute("aria-current", "page");
    await sheet.getByTestId("conversation-main").click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the primary thread is server-chosen and ignores a spoofed ?threadId= on /", async ({ page }) => {
    const firstOpen = await page.request.get("/api/equipe/accounts");
    expect(firstOpen.status()).toBe(200);

    const primaryThreadId = await openHomeConversation(page);
    await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 15_000 });
    await waitForHomeConversationReady(page);
    const realThreadId = new URL(page.url()).searchParams.get("threadId");
    // The route never reads ?threadId= itself; the thread comes back from
    // open_free_account on the server every time.
    expect(realThreadId).toBeNull();

    expect(await openHomeConversation(page, "/?threadId=00000000-0000-4000-8000-000000000000")).toBe(primaryThreadId);
    await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("conversation-main")).toHaveAttribute("aria-current", "page");
  });

  test("the primary thread survives a reload and a second tab", async ({ page, context }) => {
    const primaryThreadId = await openHomeConversation(page);
    await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("conversation-main")).toHaveAttribute("aria-current", "page", { timeout: 15_000 });

    const reloadedThread = homeThreadResponse(page);
    await page.reload();
    // Only the status of the captured response: its body is dropped when the page fetches again, which made this test race.
    expect((await reloadedThread).status()).toBe(200);
    await waitForHomeConversationReady(page);
    await expect(page.getByTestId("conversation-main")).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
    // The conversation after the reload is the same main one: the account lists exactly that thread as its primary.
    const listed = await (await page.request.get("/api/equipe/accounts")).json() as { accounts: { id: string }[] };
    const detail = await (await page.request.get(`/api/equipe/accounts/${listed.accounts[0]!.id}`)).json() as {
      threads: { primary: { assistantThreadId: string } };
    };
    expect(detail.threads.primary.assistantThreadId).toBe(primaryThreadId);

    const secondTab = await context.newPage();
    expect(await openHomeConversation(secondTab)).toBe(primaryThreadId);
    await waitForHomeConversationReady(secondTab);
    await expect(secondTab.getByTestId("conversation-main")).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
    await secondTab.close();

    // The reload and the second tab must resolve the same primary account —
    // open_free_account is idempotent, not creating a second one.
    const accountsAfterReload = await page.request.get("/api/equipe/accounts");
    expect(accountsAfterReload.status()).toBe(200);
    const { accounts } = (await accountsAfterReload.json()) as { accounts: unknown[] };
    expect(accounts).toHaveLength(1);
  });

  test("?guest= and ?guestDraft= on / land on the same account and primary thread, not the old guest branch", async ({ page }) => {
    const before = await page.request.get("/api/equipe/accounts");
    expect(before.status()).toBe(200);
    const { accounts: accountsBefore } = (await before.json()) as { accounts: { id: string }[] };
    expect(accountsBefore).toHaveLength(1);
    const primaryThreadId = await openHomeConversation(page);

    for (const query of [
      "?guest=00000000-0000-4000-8000-000000000001",
      "?guestDraft=00000000-0000-4000-8000-000000000002",
    ]) {
      expect(await openHomeConversation(page, `/${query}`)).toBe(primaryThreadId);
      await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 15_000 });
      await waitForHomeConversationReady(page);
      // The legacy guest studio surface never renders on this route anymore.
      await expect(page.getByTestId("studio-talk-box")).toHaveCount(0);

      const after = await page.request.get("/api/equipe/accounts");
      expect(after.status()).toBe(200);
      const { accounts: accountsAfter } = (await after.json()) as { accounts: { id: string }[] };
      expect(accountsAfter).toHaveLength(1);
      expect(accountsAfter[0].id).toBe(accountsBefore[0].id);
    }
  });
});
