import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const FIXTURE_PATH = process.env.CREATE_POST_E2E_FIXTURE_PATH
  ? path.resolve(process.env.CREATE_POST_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../fixtures/create-post-e2e.json");

type Fixture = {
  email: string;
  password: string;
  primaryClientProfileId: string;
  attachmentBufferBase64: string;
  expectedInitialCredits: number;
  insufficientBalance: {
    workspaceId: string;
    email: string;
    password: string;
    clientProfileId: string;
    contentArtAssetId: string;
    expectedCredits: number;
  };
};

type WorkDetail = {
  work: { id: string; campaignId: string | null; request: string; toolKind?: string };
  preparedPlan?: { preparedRevision: string; outputCount: number } | null;
  inferredBriefing?: {
    version: number;
    offer: { value: string | null; state: string };
    readiness: string;
    confidence: string;
  } | null;
  outputs: Array<{
    id: string;
    status: "queued" | "processing" | "completed" | "failed";
    creativeLevel: "conservative" | "balanced" | "bold";
    retryCount: number;
    parentOutputId: string | null;
    versionNumber: number;
    isSelected: boolean;
    directionSnapshot?: { label?: string; order?: number } | null;
  }>;
  sources: Array<{ id: string; name: string; status: string; usage: string; usageConfirmed: boolean }>;
};

function fixture(): Fixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing fixture. Run npm run seed:create-post-e2e first.");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

async function login(page: Page, credentials = fixture()) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
  const origin = process.env.E2E_BASE_URL ?? "http://localhost:3106";
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email: credentials.email, password: credentials.password },
    headers: { Origin: origin },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function campaignsCount(page: Page) {
  const response = await page.request.get("/api/campaigns?limit=200");
  expect(response.ok(), await response.text()).toBe(true);
  const body = (await response.json()) as { campaigns?: unknown[] };
  return body.campaigns?.length ?? 0;
}

async function workDetail(page: Page, workId: string): Promise<WorkDetail> {
  const response = await page.request.get(`/api/creative-work/${workId}`);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<WorkDetail>;
}

async function newUsage(page: Page, existingIds: Set<string>) {
  const response = await page.request.get("/api/billing/history?limit=100");
  expect(response.ok(), await response.text()).toBe(true);
  const body = (await response.json()) as {
    transactions?: Array<{ id: string; amount: number; type: string }>;
  };
  return (body.transactions ?? []).filter(
    (transaction) => transaction.type === "usage" && !existingIds.has(transaction.id),
  );
}

async function usageIds(page: Page) {
  const response = await page.request.get("/api/billing/history?limit=100");
  expect(response.ok(), await response.text()).toBe(true);
  const body = (await response.json()) as {
    transactions?: Array<{ id: string; type: string }>;
  };
  return new Set((body.transactions ?? []).filter((item) => item.type === "usage").map((item) => item.id));
}

async function assertSingleActiveBrand(page: Page) {
  const response = await page.request.get("/api/client-profiles");
  expect(response.ok(), await response.text()).toBe(true);
  const body = (await response.json()) as { profiles: Array<{ id: string; name: string }> };
  expect(body.profiles).toEqual([
    expect.objectContaining({ id: fixture().primaryClientProfileId, name: "Create Post E2E Brand" }),
  ]);
  const activeBrand = page.locator("#active-client-switcher-home");
  await expect(activeBrand).toBeVisible({ timeout: 60_000 });
  await expect(activeBrand).toContainText("Create Post E2E Brand", { timeout: 60_000 });
  await expect.poll(async () => page.evaluate(() => {
    const persisted = localStorage.getItem("adscale-storage");
    return persisted ? JSON.parse(persisted).state?.activeClientProfileId ?? null : null;
  })).toBe(fixture().primaryClientProfileId);
}

async function revealProtocolSwitcher(page: Page) {
  const box = page.getByTestId("studio-talk-box");
  const radio = box.getByRole("radiogroup").getByRole("radio").first();
  if (await radio.isVisible().catch(() => false)) return;
  await page.locator("#creative-composer-request").focus();
  if (await radio.isVisible().catch(() => false)) return;
  const expand = box.getByRole("button", { name: /abrir controles|open controls/i });
  if (await expand.count()) await expand.click();
}

async function confirmProtocolSwitchIfNeeded(page: Page) {
  const confirm = page.getByRole("button", { name: /preservar e trocar|preserve and switch/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
}

async function chooseProtocol(page: Page, name: RegExp) {
  const box = page.getByTestId("studio-talk-box");
  await expect(box).toBeVisible();
  await revealProtocolSwitcher(page);
  const radio = box.getByRole("radio", { name }).first();
  await expect(radio).toBeVisible({ timeout: 15_000 });
  await radio.click();
  await confirmProtocolSwitchIfNeeded(page);
  await expect(radio).toHaveAttribute("aria-checked", "true");
  return radio;
}

async function chooseVariations(page: Page) {
  return chooseProtocol(page, /^(variações|variations)$/i);
}

async function fillRequestAndAttach(page: Page, request: string, name = "arte-e2e.png") {
  const requestField = page.locator("#creative-composer-request");
  await expect(requestField).toHaveCount(1);
  await requestField.fill(request);
  await expect(requestField).toHaveValue(request);
  await page.locator('[data-testid="studio-talk-box"] input[type="file"]').setInputFiles({
    name,
    mimeType: "image/png",
    buffer: Buffer.from(fixture().attachmentBufferBase64, "base64"),
  });
}

function talkGenerate(page: Page) {
  return page.locator('[data-testid="studio-talk-box"] .talk-generate');
}

async function talkBoxFrame(page: Page) {
  return page.getByTestId("studio-talk-box").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, scrollY: window.scrollY };
  });
}

async function waitForTalkBoxFrame(page: Page) {
  let previous = await talkBoxFrame(page);
  await expect.poll(async () => {
    const next = await talkBoxFrame(page);
    const settled = Math.abs(next.top - previous.top) <= 0.5
      && Math.abs(next.bottom - previous.bottom) <= 0.5
      && next.scrollY === previous.scrollY;
    previous = next;
    return settled;
  }, { timeout: 2_000 }).toBe(true);
  return previous;
}

async function assertStableTalkBox(page: Page, viewport: "desktop" | "mobile") {
  const box = page.getByTestId("studio-talk-box");
  if (await box.getAttribute("data-expanded") === "true") {
    await box.getByRole("button", { name: /recolher controles|collapse controls/i }).click();
  }
  await expect(box).toHaveAttribute("data-expanded", "false");
  const collapsed = await waitForTalkBoxFrame(page);
  const expand = box.getByRole("button", { name: /abrir controles|open controls/i });
  await expand.click();
  await expect(box).toHaveAttribute("data-expanded", "true");
  const expanded = await waitForTalkBoxFrame(page);
  expect(Math.abs(collapsed.bottom - expanded.bottom)).toBeLessThanOrEqual(2);
  expect(expanded.scrollY).toBe(collapsed.scrollY);
  expect(expanded.top).toBeGreaterThanOrEqual(0);
  if (viewport === "mobile") {
    const headerBox = await page.locator("header").first().boundingBox();
    const chromeBox = await page.getByTestId("studio-chrome-bar").boundingBox();
    expect(headerBox && chromeBox, "mobile header and chrome must be measurable").toBeTruthy();
    expect(expanded.top).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
    expect(expanded.top).toBeGreaterThanOrEqual(chromeBox!.y + chromeBox!.height - 1);
    const generateBox = await talkGenerate(page).boundingBox();
    const navBox = await page.getByRole("navigation", { name: /primary mobile navigation/i }).boundingBox();
    expect(generateBox && navBox, "generate and mobile nav must be measurable").toBeTruthy();
    expect(generateBox!.y + generateBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  }
  await box.getByRole("button", { name: /recolher controles|collapse controls/i }).click();
  await expect(box).toHaveAttribute("data-expanded", "false");
  await expand.focus();
  await expand.press("Enter");
  await expect(box).toHaveAttribute("data-expanded", "true");
  await expect(box.getByRole("button", { name: /recolher controles|collapse controls/i })).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  const keyed = await waitForTalkBoxFrame(page);
  expect(Math.abs(collapsed.bottom - keyed.bottom)).toBeLessThanOrEqual(2);
  expect(keyed.scrollY).toBe(collapsed.scrollY);
  expect(keyed.top).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNoStudioPrice(page: Page) {
  await expect(page.locator("main")).not.toContainText(/\b(crédito|credit)\b/i);
}

async function prepareAndConfirm(page: Page, workId: string) {
  const continueToPlan = talkGenerate(page);
  await expect(continueToPlan).toBeEnabled();
  await continueToPlan.click();
  await expect(page.getByRole("heading", { name: /revise seu plano|review your plan/i })).toBeVisible();
  await expectNoStudioPrice(page);

  // Reviewing with Enter must not start any provider request; confirmation is
  // deliberately a separate explicit action in the progressive Studio flow.
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await workDetail(page, workId)).outputs.length).toBe(0);

  const generated = page.waitForResponse((response) =>
    response.url().includes(`/api/creative-work/${workId}/generate`) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /confirmar e gerar|confirm and generate/i }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  return generated;
}

async function tabTo(page: Page, target: Locator, backwards = false) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
  }
  throw new Error(`Keyboard focus did not reach ${await target.getAttribute("aria-label") ?? await target.textContent()}`);
}

test.describe("Frictionless operational Home", () => {
  test.setTimeout(420_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("one request, one attached art and one explicit confirmation persist the same outputs", async ({ page }) => {
    const campaignMutations: string[] = [];
    const generationRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (/^\/api\/campaigns(?:\/|$)/.test(url.pathname) && request.method() !== "GET") {
        campaignMutations.push(`${request.method()} ${url.pathname}`);
      }
      if (/\/api\/creative-work\/[^/]+\/generate$/.test(url.pathname) && request.method() === "POST") {
        generationRequests.push(url.pathname);
      }
    });

    const campaignCountBefore = await campaignsCount(page);
    const usageBefore = await usageIds(page);
    await page.goto("/");
    await assertSingleActiveBrand(page);
    await expect(page.getByTestId("studio-talk-box")).toBeVisible();
    await expect(page.locator("#creative-composer-request")).toHaveCount(1);

    const request = "Promoção de matrículas para julho";
    await expect.poll(() => new URL(page.url()).searchParams.get("workId")).toBeNull();
    await chooseVariations(page);
    await fillRequestAndAttach(page, request);
    const source = page.locator("article").filter({ hasText: "arte-e2e.png" });
    await expect(source.getByRole("status")).toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get("workId"), { timeout: 30_000 }).toBeTruthy();
    const workId = new URL(page.url()).searchParams.get("workId")!;

    const generatedResponse = await prepareAndConfirm(page, workId);
    expect([200, 201, 202]).toContain(generatedResponse.status());
    await expect.poll(() => generationRequests.length).toBe(1);

    const generatedBody = (await generatedResponse.json()) as { outputs: Array<{ id: string }> };
    const initialIds = generatedBody.outputs.map((output) => output.id).sort();
    expect(initialIds).toHaveLength(3);
    await expect(page.getByTestId("proposal-level")).toHaveCount(1, { timeout: 120_000 });
    await expect(page.getByRole("navigation", { name: "Miniaturas das propostas" }).getByRole("button"))
      .toHaveCount(3);
    await expectNoStudioPrice(page);
    await expect.poll(async () => (await workDetail(page, workId)).outputs
      .map((output) => output.status).sort().join(","),
    { timeout: 120_000, intervals: [250, 500, 1_000] }).toBe("completed,completed,completed");

    const settled = await workDetail(page, workId);
    expect(settled.outputs.map((output) => output.id).sort()).toEqual(initialIds);
    const usage = await newUsage(page, usageBefore);
    expect(usage, "one confirmation must debit once").toHaveLength(1);
    expect(usage.reduce((sum, item) => sum + Math.abs(item.amount), 0)).toBeGreaterThan(0);
    expect(campaignMutations).toEqual([]);
    expect(await campaignsCount(page)).toBe(campaignCountBefore);

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`workId=${workId}`));
    await assertSingleActiveBrand(page);
    await expect(page.getByTestId("proposal-level")).toHaveCount(1, { timeout: 60_000 });
    expect((await workDetail(page, workId)).outputs.map((output) => output.id).sort()).toEqual(initialIds);

    const original = settled.outputs.find((output) => output.directionSnapshot?.label === "Conservadora")
      ?? [...settled.outputs].sort((a, b) => (a.directionSnapshot?.order ?? 0) - (b.directionSnapshot?.order ?? 0))[0]!;
    await page.getByRole("button", { name: /Selecionar Conservadora em 4:5|Select Conservadora in 4:5/i }).click();
    const originalCard = page.getByTestId("proposal-level");
    const selectedResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/api/creative-work/${workId}/outputs/${original.id}/select`)
        && response.request().method() === "POST",
    );
    await originalCard.getByRole("button", { name: /aprovar|approve/i }).click();
    const selectedResponse = await selectedResponsePromise;
    const selectedBody = await selectedResponse.text();
    expect(selectedResponse.ok(), selectedBody).toBe(true);
    expect((JSON.parse(selectedBody) as { output: { isSelected: boolean } }).output.isSelected).toBe(true);
    await expect.poll(async () => (await workDetail(page, workId)).outputs.find((output) => output.id === original.id)?.isSelected).toBe(true);

    const expectedDownloadPath = `/api/creative-work/${workId}/outputs/${original.id}/download`;
    const popupPromise = page.waitForEvent("popup");
    const downloadRequest = page.context().waitForEvent("request", {
      predicate: (request) => new URL(request.url()).pathname === expectedDownloadPath,
      timeout: 15_000,
    });
    await originalCard.getByRole("button", { name: /baixar|download/i }).click();
    expect(new URL((await downloadRequest).url()).pathname).toBe(expectedDownloadPath);
    const popup = await popupPromise;
    await popup.close();

    await originalCard.getByRole("button", { name: /refinar|refine|editar|edit/i }).click();
    await originalCard.getByRole("textbox", { name: /o que você quer mudar|what would you like to change|what do you want to change/i }).fill("Aumente o contraste");
    await originalCard.getByRole("button", { name: /gerar nova varia[cç][aã]o|generate new variation|gerar nova versão|generate new version/i }).click();
    await expect.poll(async () => (await workDetail(page, workId)).outputs.length, { timeout: 120_000 }).toBe(4);
    const revised = (await workDetail(page, workId)).outputs.find((output) => output.parentOutputId === original.id);
    expect(revised).toMatchObject({ versionNumber: 2 });
    expect((await workDetail(page, workId)).outputs.some((output) => output.id === original.id)).toBe(true);
  });

  test("source failures stay isolated from a ready source", async ({ page }) => {
    const usageBefore = await usageIds(page);
    await page.goto("/");
    await assertSingleActiveBrand(page);
    const request = "Variações de campanha [e2e:retry-twice-bold]";
    await chooseVariations(page);
    await fillRequestAndAttach(page, request, "fonte-pronta.png");
    await expect(page.locator("article").filter({ hasText: "fonte-pronta.png" }).getByRole("status"))
      .toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });
    await page.locator('[data-testid="studio-talk-box"] input[type="file"]').setInputFiles({
      name: "e2e-source-fail-once.png",
      mimeType: "image/png",
      buffer: Buffer.from(fixture().attachmentBufferBase64, "base64"),
    });
    const failedSource = page.locator("article").filter({ hasText: "e2e-source-fail-once.png" });
    await expect(failedSource.getByRole("status")).toHaveText(/falha na análise|analysis failed/i, { timeout: 60_000 });
    await failedSource.getByRole("button", { name: /tentar novamente|try again/i }).click();
    await expect(failedSource.getByRole("status")).toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });
    await failedSource.getByRole("button", { name: /remover fonte|remove source/i }).click();
    await expect(failedSource).toHaveCount(0);
    await expect(page.locator("article").filter({ hasText: "fonte-pronta.png" })).toBeVisible();

    const workId = new URL(page.url()).searchParams.get("workId")!;
    const generation = await prepareAndConfirm(page, workId);
    expect([200, 201, 202]).toContain(generation.status());
    const generationBody = (await generation.json()) as { outputs: Array<{ id: string }> };
    const initialIds = generationBody.outputs.map((output) => output.id).sort();
    expect(initialIds).toHaveLength(3);

    await expect.poll(async () => {
      const detail = await workDetail(page, workId);
      return detail.outputs.map((output) => output.status).sort().join(",");
    }, { timeout: 120_000, intervals: [500, 1_000] }).toBe("completed,completed,completed");
    const terminal = await workDetail(page, workId);
    expect(terminal.outputs.map((output) => output.id).sort()).toEqual(initialIds);
    expect(terminal.outputs.every((output) => output.status === "completed")).toBe(true);
    const usage = await newUsage(page, usageBefore);
    expect(usage, "retrying an isolated source must not debit twice").toHaveLength(1);
    expect(usage.reduce((sum, item) => sum + Math.abs(item.amount), 0)).toBeGreaterThan(0);
  });

  test("insufficient balance keeps the prepared Studio work intact", async ({ page }) => {
    const insufficient = fixture().insufficientBalance;
    await page.context().clearCookies();
    await login(page, insufficient);
    await page.goto("/");
    await expect(page.locator("aside").getByText(
      new RegExp(`^${insufficient.expectedCredits}\\s*(créditos|credits)$`, "i"),
    )).toBeVisible({ timeout: 30_000 });

    const variations = await chooseVariations(page);
    await fillRequestAndAttach(page, "Criação Studio sem saldo", "saldo-zero.png");
    await expect(variations).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("saldo-zero.png")).toBeVisible({ timeout: 60_000 });
    const source = page.locator("article").filter({ hasText: "saldo-zero.png" });
    await expect(source.getByRole("status")).toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get("workId")).toBeTruthy();
    const workId = new URL(page.url()).searchParams.get("workId")!;
    await expect.poll(async () => (await workDetail(page, workId)).work.toolKind).toBe("variations");

    await talkGenerate(page).click();
    const plan = page.locator("section").filter({
      has: page.getByRole("heading", { name: /revise seu plano|review your plan/i }),
    }).first();
    await expect(plan).toBeVisible();
    await expect(plan).not.toContainText(/\b\d+\s*(créditos|credits)\b/i);
    await expect.poll(async () => Boolean((await workDetail(page, workId)).preparedPlan), { timeout: 30_000 }).toBe(true);
    const beforeBlock = await workDetail(page, workId);

    const blocked = page.waitForResponse((response) =>
      response.url().includes(`/api/creative-work/${workId}/generate`)
        && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /confirmar e gerar|confirm and generate/i }).click();
    expect((await blocked).status()).toBe(402);
    await expect(page.getByRole("alert").filter({ hasText: /limite|limit|crédito|credit/i })).toBeVisible();

    const afterBlock = await workDetail(page, workId);
    expect(afterBlock.outputs).toHaveLength(0);
    expect(afterBlock.work.toolKind).toBe("variations");
    expect(afterBlock.work.request).toBe(beforeBlock.work.request);
    expect(afterBlock.work.id).toBe(beforeBlock.work.id);
    expect(afterBlock.preparedPlan).toMatchObject({
      outputCount: beforeBlock.preparedPlan?.outputCount,
    });
    if (beforeBlock.preparedPlan && afterBlock.preparedPlan) {
      const { preparedRevision: _beforeRev, ...beforePlan } = beforeBlock.preparedPlan;
      const { preparedRevision: _afterRev, ...afterPlan } = afterBlock.preparedPlan;
      expect(afterPlan).toEqual(beforePlan);
    }
    expect(afterBlock.sources).toEqual(beforeBlock.sources);
    // generateCreativeWork writes identitySnapshot/status/updatedAt before
    // credit_blocked; billing is unchanged. The creative payload above stays.
    expect(afterBlock.work).toMatchObject({
      id: beforeBlock.work.id,
      request: beforeBlock.work.request,
      toolKind: "variations",
      campaignId: beforeBlock.work.campaignId,
    });
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`home and results remain accessible at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      if (viewport.name === "desktop") {
        await page.emulateMedia({ reducedMotion: "reduce" });
      }
      await page.goto("/");
      await assertSingleActiveBrand(page);

      await page.evaluate(() => {
        const region = document.querySelector('p.sr-only[role="status"][aria-live="polite"]');
        const messages: string[] = [];
        if (region?.textContent) messages.push(region.textContent);
        if (region) {
          new MutationObserver(() => {
            if (region.textContent) messages.push(region.textContent);
          }).observe(region, { childList: true, characterData: true, subtree: true });
        }
        (window as unknown as { __frictionlessAnnouncements: string[] })
          .__frictionlessAnnouncements = messages;
      });

      const attach = page.getByRole("button", { name: /anexar|attach/i });
      const variations = await chooseVariations(page);
      const requestField = page.locator("#creative-composer-request");
      await tabTo(page, requestField);
      const typedRequest = `Peça acessível no teclado ${viewport.name}`;
      await requestField.pressSequentially(typedRequest, { delay: 12 });
      await expect(requestField).toHaveValue(typedRequest);
      await expect(variations).toHaveAttribute("aria-checked", "true");
      await tabTo(page, attach);
      await page.locator('[data-testid="studio-talk-box"] input[type="file"]').setInputFiles({
        name: `teclado-${viewport.name}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(fixture().attachmentBufferBase64, "base64"),
      });
      const liveRegion = page.locator('p.sr-only[role="status"][aria-live="polite"]');
      await expect.poll(() => page.evaluate(() =>
        (window as unknown as { __frictionlessAnnouncements?: string[] })
          .__frictionlessAnnouncements ?? []
      )).toContain("Arte adicionada");
      const source = page.locator("article").filter({ hasText: `teclado-${viewport.name}.png` });
      await expect(source.getByRole("status")).toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });
      await assertStableTalkBox(page, viewport.name as "desktop" | "mobile");

      const generate = talkGenerate(page);
      await expect(generate).toBeEnabled();
      await tabTo(page, generate);
      await page.keyboard.press("Space");
      const workId = new URL(page.url()).searchParams.get("workId")!;
      await expect(page.getByRole("heading", { name: /revise seu plano|review your plan/i })).toBeVisible();
      const confirm = page.getByRole("button", { name: /confirmar e gerar|confirm and generate/i });
      const generationResponse = page.waitForResponse((response) =>
        /\/api\/creative-work\/[^/]+\/generate$/.test(new URL(response.url()).pathname)
          && response.request().method() === "POST",
      );
      await confirm.click();
      expect((await generationResponse).ok()).toBe(true);
      await expect(liveRegion).toHaveText(/geração iniciada|generation started/i);
      await expect(page.getByTestId("proposal-level")).toHaveCount(1, { timeout: 120_000 });
      await expect(page.getByRole("navigation", { name: "Miniaturas das propostas" }).getByRole("button"))
        .toHaveCount(3);
      await expect.poll(async () => (await workDetail(page, workId)).outputs
        .map((output) => output.status).sort().join(","),
      { timeout: 120_000, intervals: [500, 1_000] }).toBe("completed,completed,completed");

      const card = page.getByTestId("proposal-level").first();
      const approve = card.getByRole("button", { name: /aprovar|approve/i });
      await tabTo(page, approve);
      await page.keyboard.press("Enter");
      await expect(liveRegion).toHaveText(/proposta aprovada/i);

      const download = card.getByRole("button", { name: /baixar|download/i });
      await tabTo(page, download);
      const popupPromise = page.waitForEvent("popup");
      const downloadRequest = page.context().waitForEvent("request", {
        predicate: (candidate) => new URL(candidate.url()).pathname.endsWith("/download"),
      });
      await page.keyboard.press("Space");
      const popup = await popupPromise;
      expect(new URL((await downloadRequest).url()).pathname).toContain("/download");
      await popup.close();

      const edit = card.getByRole("button", { name: /refinar|refine|editar|edit/i });
      await tabTo(page, edit);
      await page.keyboard.press("Enter");
      await expect(edit).toHaveAttribute("aria-expanded", "true");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page }).analyze();
      expect(audit.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious"))
        .toEqual([]);
    });
  }

  test("mesa alterna e caixa recolhe sem gerar ou perder o pedido", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const generation: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/(generate|prepare|plan)$/.test(new URL(request.url()).pathname)) {
        generation.push(request.url());
      }
    });
    await page.goto("/");
    await assertSingleActiveBrand(page);
    const request = page.locator("#creative-composer-request");
    await expect(request).toHaveCount(1);
    await request.fill("Campanha de setembro, manter identidade da marca");
    const box = page.getByTestId("studio-talk-box");
    await expect(box).toHaveAttribute("data-expanded", "true");
    await box.getByRole("button", { name: "Recolher controles" }).click();
    await expect(box).toHaveAttribute("data-expanded", "false");
    await page.getByRole("button", { name: "Produção", exact: true }).click();
    await page.getByRole("button", { name: "Inspirações", exact: true }).click();
    await box.getByRole("button", { name: "Abrir controles" }).click();
    await expect(request).toHaveValue("Campanha de setembro, manter identidade da marca");
    await expect(page.getByTestId("studio-desk")).toHaveAttribute("inert", "");
    await request.press("Escape");
    await expect(box).toHaveAttribute("data-expanded", "false");
    expect(generation).toEqual([]);
    await assertStableTalkBox(page, "desktop");
    expect(generation).toEqual([]);
  });
});
