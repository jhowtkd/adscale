import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { loginVisualFoundation, seedVisualManifest } from "./support/visual-auth";

/**
 * Ticket 03 — `/` becomes the home conversation when the Equipe gate is on.
 * Runs against a dedicated local server with the Equipe gate on or off and its
 * own database (E2E_BASE_URL, e.g. http://localhost:3103); it never sends a
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
  await page
    .getByTestId("assistant-chat-header")
    .or(page.getByTestId("assistant-empty-state"))
    .or(page.getByTestId("assistant-thread-empty-state"))
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
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
  return (await response.json()).thread.id as string;
}

test.describe("home conversation (Equipe gate on)", () => {
  let runtimeErrors: string[];
  test.beforeAll(() => {
    seedVisualManifest();
  });

  test.beforeEach(async ({ page }) => {
    runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await loginVisualFoundation(page);
    const gate = await page.request.get("/api/equipe/accounts");
    test.skip(gate.status() === 404, "Home conversation requires the Equipe gate for this workspace.");
    expect(gate.status()).toBe(200);
    await openHomeConversation(page);
  });

  test.afterEach(() => {
    expect(runtimeErrors).toEqual([]);
  });

  test("desktop: / opens the assistant shell with the home conversation composer", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHomeConversation(page);

    const desktopMain = page.getByTestId("assistant-desktop-main");
    await expect(desktopMain).toBeVisible({ timeout: 15_000 });
    const sidebar = page.getByTestId("assistant-desktop-sidebar");
    await expect(sidebar).toBeVisible();

    // The primary thread's client auto-expands and its thread is selected —
    // the home conversation never opens on a collapsed, empty sidebar.
    const expandedClient = sidebar.locator('[aria-expanded="true"]');
    await expect(expandedClient).toHaveCount(1, { timeout: 15_000 });
    await expect(sidebar.locator('[aria-pressed="true"]')).toHaveCount(1);

    // The conversation and its client header must be fully loaded — not the
    // spinner state — before this counts as "opened".
    await expect(desktopMain.getByText("Carregando conversa…")).toHaveCount(0);
    await expect(expandedClient).not.toHaveText("");

    const composer = desktopMain.getByTestId("assistant-chat-input");
    await expect(composer).toBeVisible();
    await expect(composer.locator("textarea")).toHaveAttribute(
      "placeholder",
      "Mensagem para o ADScale",
    );

    // The old composer's own surface — talk box, request field and stage —
    // must be gone, not just an unrelated "TalkBox" text string.
    await expect(page.getByTestId("studio-talk-box")).toHaveCount(0);
    await expect(page.locator("#creative-composer-request")).toHaveCount(0);
    await expect(page.getByTestId("studio-stage")).toHaveCount(0);

    // Parallel-conversation creation (new client / new chat) is out of scope
    // for the home route — it moves to ticket 09.
    await expect(sidebar.getByRole("button", { name: "Novo cliente" })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: "Novo chat" })).toHaveCount(0);

    await waitForHomeConversationReady(page);
    await page.screenshot({
      path: screenshotPath(testInfo, "home-conversation-desktop.png"),
      fullPage: true,
      style: "nextjs-portal, .tsqd-open-btn-container { display: none !important; }",
    });
  });

  test("mobile: / opens the assistant shell in a single compact column", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHomeConversation(page);

    const mobileChat = page.getByTestId("assistant-mobile-chat");
    await expect(mobileChat).toBeVisible({ timeout: 15_000 });
    await expect(mobileChat.getByText("Carregando conversa…")).toHaveCount(0);
    const composer = mobileChat.getByTestId("assistant-chat-input");
    await expect(composer).toBeVisible();

    // The composer sits in the lower half of the viewport, fully above the
    // bottom tab bar — never clipped under it.
    const tabbar = page.getByRole("navigation", { name: "Chat", exact: true });
    await expect(tabbar).toBeVisible();
    const composerBox = await composer.boundingBox();
    const tabbarBox = await tabbar.boundingBox();
    expect(composerBox).not.toBeNull();
    expect(tabbarBox).not.toBeNull();
    expect(composerBox!.y).toBeGreaterThan(844 / 2);
    expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(tabbarBox!.y + 1);

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
    await expect(page.getByTestId("assistant-desktop-main")).toBeVisible({ timeout: 15_000 });
  });

  test("existing /assistant conversations keep selection without exposing creation actions", async ({ page }) => {
    const primaryThreadId = await openHomeConversation(page);
    const homeSidebar = page.getByTestId("assistant-desktop-sidebar");
    const primaryClientName = await homeSidebar.locator('button[aria-expanded="true"]').getAttribute("aria-label");
    expect(primaryClientName).toBeTruthy();
    const homeThread = homeSidebar.locator('[aria-pressed="true"]');
    await expect(homeThread).toHaveCount(1);
    await homeThread.click();
    await expect(page).toHaveURL(new RegExp(`/assistant\\?threadId=${primaryThreadId}$`));
    await waitForHomeConversationReady(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Árvore", exact: true }).click();
    const tree = page.getByTestId("assistant-mobile-tree");
    await expect(tree).toBeVisible();
    const client = tree.getByRole("button", { name: primaryClientName!, exact: true });
    await expect(client).toBeVisible();
    if (await client.getAttribute("aria-expanded") !== "true") await client.click();
    await expect(client).toHaveAttribute("aria-expanded", "true");
    await expect(tree.getByRole("button", { name: "Novo cliente" })).toHaveCount(0);
    await expect(tree.getByRole("button", { name: "Novo chat" })).toHaveCount(0);
    const selectedThread = tree.locator('[aria-pressed="true"]');
    await expect(selectedThread).toHaveCount(1);
    await selectedThread.click();
    await expect(page).toHaveURL(new RegExp(`/assistant\\?threadId=${primaryThreadId}$`));
  });

  test("the primary thread is server-chosen and ignores a spoofed ?threadId= on /", async ({ page }) => {
    const firstOpen = await page.request.get("/api/equipe/accounts");
    expect(firstOpen.status()).toBe(200);

    const primaryThreadId = await openHomeConversation(page);
    await expect(page.getByTestId("assistant-desktop-main")).toBeVisible({ timeout: 15_000 });
    await waitForHomeConversationReady(page);
    const realThreadId = new URL(page.url()).searchParams.get("threadId");
    // The route never reads ?threadId= itself; the thread comes back from
    // open_free_account on the server every time.
    expect(realThreadId).toBeNull();

    expect(await openHomeConversation(page, "/?threadId=00000000-0000-4000-8000-000000000000")).toBe(primaryThreadId);
    await expect(page.getByTestId("assistant-desktop-main")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("assistant-desktop-sidebar").locator('[aria-pressed="true"]')).toHaveCount(1);
  });

  test("the primary thread survives a reload and a second tab", async ({ page, context }) => {
    const primaryThreadId = await openHomeConversation(page);
    await expect(page.getByTestId("assistant-desktop-main")).toBeVisible({ timeout: 15_000 });
    const activeThread = page.getByTestId("assistant-desktop-sidebar").locator('[aria-pressed="true"]');
    await expect(activeThread).toHaveCount(1, { timeout: 15_000 });
    const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
    const activeThreadLabel = normalize(await activeThread.innerText());

    const reloadedThread = homeThreadResponse(page);
    await page.reload();
    const response = await reloadedThread;
    expect(response.status()).toBe(200);
    expect((await response.json()).thread.id).toBe(primaryThreadId);
    await expect(page.getByTestId("assistant-desktop-main")).toBeVisible({ timeout: 15_000 });
    await waitForHomeConversationReady(page);
    await expect(activeThread).toBeVisible({ timeout: 15_000 });
    expect(normalize(await activeThread.innerText())).toBe(activeThreadLabel);

    const secondTab = await context.newPage();
    expect(await openHomeConversation(secondTab)).toBe(primaryThreadId);
    await expect(secondTab.getByTestId("assistant-desktop-main")).toBeVisible({ timeout: 15_000 });
    await waitForHomeConversationReady(secondTab);
    const secondTabActiveThread = secondTab
      .getByTestId("assistant-desktop-sidebar")
      .locator('[aria-pressed="true"]');
    await expect(secondTabActiveThread).toBeVisible({ timeout: 15_000 });
    expect(normalize(await secondTabActiveThread.innerText())).toBe(activeThreadLabel);
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
      await expect(page.getByTestId("assistant-desktop-main")).toBeVisible({ timeout: 15_000 });
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

test.describe("classic assistant (Equipe gate off)", () => {
  let runtimeErrors: string[];
  test.beforeAll(() => { seedVisualManifest(); });
  test.beforeEach(async ({ page }) => {
    runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await loginVisualFoundation(page);
    const gate = await page.request.get("/api/equipe/accounts");
    test.skip(gate.status() === 200, "Classic assistant requires the Equipe gate off.");
    expect(gate.status()).toBe(404);
  });
  test.afterEach(() => { expect(runtimeErrors).toEqual([]); });

  test("/assistant without a threadId keeps the classic start composer", async ({ page }) => {
    await page.goto("/assistant");
    await expect(page).toHaveURL(/\/assistant$/);
    await expect(page.getByTestId("assistant-start-composer").first()).toBeVisible();
  });

  test("existing conversations retain working new-client and new-chat controls", async ({ page }) => {
    const profiles = await page.request.get("/api/client-profiles");
    expect(profiles.status()).toBe(200);
    const { profiles: clients } = await profiles.json() as { profiles: { id: string; name: string }[] };
    const client = clients[0];
    expect(client).toBeTruthy();
    const created = await page.request.post("/api/assistant/threads", {
      data: { clientProfileId: client.id, name: "Ticket 03 classic gate regression", experience: "classic" },
    });
    expect(created.status()).toBe(201);
    const { thread } = await created.json() as { thread: { id: string } };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/assistant?threadId=${thread.id}`);
    await waitForHomeConversationReady(page);
    await page.getByRole("button", { name: "Árvore", exact: true }).click();
    const tree = page.getByTestId("assistant-mobile-tree");
    const clientButton = tree.getByRole("button", { name: client.name, exact: true });
    await expect(clientButton).toBeVisible();
    if (await clientButton.getAttribute("aria-expanded") !== "true") await clientButton.click();
    const newChat = tree.getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: client.name, exact: true }) })
      .getByRole("button", { name: "Novo chat", exact: true });
    await expect(newChat).toBeVisible();
    await tree.getByRole("button", { name: "Novo cliente", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await newChat.click();
    await expect(page).toHaveURL(/\/assistant$/);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(page.getByTestId("assistant-mobile-chat").getByTestId("assistant-start-composer")).toBeVisible();
  });
});
