import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/create-post-e2e.json");

type Fixture = {
  email: string;
  password: string;
  primaryClientProfileId: string;
  attachmentBufferBase64: string;
  expectedInitialCredits: number;
};

type WorkDetail = {
  work: { id: string; campaignId: string | null; request: string };
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
  }>;
  sources: Array<{ id: string; name: string; status: string; usage: string; usageConfirmed: boolean }>;
};

function fixture(): Fixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing fixture. Run npm run seed:create-post-e2e first.");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email: fixture().email, password: fixture().password },
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
  await expect(page.getByLabel(/marca ativa|active brand/i).first()).toHaveText("Create Post E2E Brand");
  await expect.poll(async () => page.evaluate(() => {
    const persisted = localStorage.getItem("adscale-storage");
    return persisted ? JSON.parse(persisted).state?.activeClientProfileId ?? null : null;
  })).toBe(fixture().primaryClientProfileId);
}

async function fillRequestAndAttach(page: Page, request: string, name = "arte-e2e.png") {
  await page.getByRole("textbox", { name: /pedido criativo|creative request/i }).fill(request);
  await page.locator("#creative-composer-file").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: Buffer.from(fixture().attachmentBufferBase64, "base64"),
  });
}

async function tabTo(page: Page, target: Locator, backwards = false) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
  }
  throw new Error(`Keyboard focus did not reach ${await target.getAttribute("aria-label") ?? await target.textContent()}`);
}

test.describe("Frictionless operational Home", () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("one request, one attached art and one paid confirmation persist the same outputs", async ({ page }) => {
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
    await expect(page.getByRole("heading", { name: /qual hipótese criativa vamos testar|which creative hypothesis should we test/i })).toBeVisible();

    const request = "Promoção de matrículas para julho [e2e:retry-once-bold]";
    await fillRequestAndAttach(page, request);
    const source = page.locator("article").filter({ hasText: "arte-e2e.png" });
    await expect(source.getByRole("status")).toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });
    await expect(source.getByRole("button", { name: "Ambos" })).toHaveAttribute("aria-pressed", "false");
    await source.getByRole("button", { name: "Ambos" }).click();
    await expect(source.getByRole("button", { name: "Ambos" })).toHaveAttribute("aria-pressed", "true");
    await expect(source.getByRole("status")).toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get("workId"), { timeout: 30_000 }).toBeTruthy();
    const workId = new URL(page.url()).searchParams.get("workId")!;

    const paidConfirmation = page.getByRole("button", { name: /gerar 3 variações · 15 créditos|generate 3 variations · 15 credits/i });
    await expect(paidConfirmation).toBeEnabled();
    const generated = page.waitForResponse((response) =>
      response.url().includes(`/api/creative-work/${workId}/generate`) && response.request().method() === "POST",
    );
    await paidConfirmation.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    const generatedResponse = await generated;
    expect([200, 201, 202]).toContain(generatedResponse.status());
    await expect.poll(() => generationRequests.length).toBe(1);

    const generatedBody = (await generatedResponse.json()) as { outputs: Array<{ id: string }> };
    const initialIds = generatedBody.outputs.map((output) => output.id).sort();
    expect(initialIds).toHaveLength(3);
    const completedProposals = page.locator('[data-testid="proposal-level"][data-status="completed"]');
    const pendingProposal = page.locator('[data-testid="proposal-level"][data-status="queued"], [data-testid="proposal-level"][data-status="processing"]');
    await expect(completedProposals).toHaveCount(2, { timeout: 120_000 });
    await expect(pendingProposal).toHaveCount(1);
    await expect(pendingProposal.getByRole("status"))
      .toHaveText(/gerando/i);
    await expect.poll(async () => (await workDetail(page, workId)).outputs
      .map((output) => output.status).sort().join(","),
    { timeout: 120_000, intervals: [250, 500, 1_000] }).toBe("completed,completed,completed");

    const settled = await workDetail(page, workId);
    expect(settled.inferredBriefing?.version).toBe(1);
    await expect(page.getByTestId("inferred-briefing")).toContainText(/a ia entendeu assim|what the ai understood/i);
    const retried = settled.outputs.find((output) => output.creativeLevel === "bold")!;
    expect(retried.retryCount).toBe(1);
    expect(settled.outputs.map((output) => output.id).sort()).toEqual(initialIds);
    const usage = await newUsage(page, usageBefore);
    expect(usage.reduce((sum, item) => sum + Math.abs(item.amount), 0)).toBe(fixture().expectedInitialCredits);
    expect(campaignMutations).toEqual([]);
    expect(await campaignsCount(page)).toBe(campaignCountBefore);

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`workId=${workId}`));
    await assertSingleActiveBrand(page);
    await expect(page.getByTestId("inferred-briefing")).toBeVisible();
    await expect(page.getByTestId("proposal-level")).toHaveCount(3, { timeout: 60_000 });
    expect((await workDetail(page, workId)).outputs.map((output) => output.id).sort()).toEqual(initialIds);

    const original = settled.outputs.find((output) => output.creativeLevel === "conservative")!;
    const originalCard = page.getByTestId("proposal-level").filter({ has: page.getByTestId("proposal-level-name").filter({ hasText: /conservadora|conservative/i }) });
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

    await originalCard.getByRole("button", { name: /editar|edit/i }).click();
    await originalCard.getByRole("textbox", { name: /o que você quer mudar|what do you want to change/i }).fill("Aumente o contraste");
    await originalCard.getByRole("button", { name: /gerar nova versão · 5 créditos|generate new version · 5 credits/i }).click();
    await expect.poll(async () => (await workDetail(page, workId)).outputs.length, { timeout: 120_000 }).toBe(4);
    const revised = (await workDetail(page, workId)).outputs.find((output) => output.parentOutputId === original.id);
    expect(revised).toMatchObject({ versionNumber: 2 });
    expect((await workDetail(page, workId)).outputs.some((output) => output.id === original.id)).toBe(true);
  });

  test("a second retryable failure exposes manual recovery and source failures stay isolated", async ({ page }) => {
    const usageBefore = await usageIds(page);
    await page.goto("/");
    await assertSingleActiveBrand(page);
    const request = "Variações de campanha [e2e:retry-twice-bold]";
    await fillRequestAndAttach(page, request, "fonte-pronta.png");
    await expect(page.locator("article").filter({ hasText: "fonte-pronta.png" }).getByRole("status"))
      .toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });
    await page.locator("article").filter({ hasText: "fonte-pronta.png" }).getByRole("button", { name: "Ambos" }).click();
    await expect(page.locator("article").filter({ hasText: "fonte-pronta.png" }).getByRole("status"))
      .toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });

    await page.locator("#creative-composer-file").setInputFiles({
      name: "e2e-source-fail-once.png",
      mimeType: "image/png",
      buffer: Buffer.from(fixture().attachmentBufferBase64, "base64"),
    });
    const failedSource = page.locator("article").filter({ hasText: "e2e-source-fail-once.png" });
    await expect(failedSource.getByRole("status")).toHaveText(/falha na análise|analysis failed/i, { timeout: 60_000 });
    await expect(page.getByRole("textbox", { name: /pedido criativo|creative request/i })).toHaveValue(request);
    await failedSource.getByRole("button", { name: /tentar novamente|try again/i }).click();
    await expect(failedSource.getByRole("status")).toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });
    await failedSource.getByRole("button", { name: /remover fonte|remove source/i }).click();
    await expect(failedSource).toHaveCount(0);
    await expect(page.locator("article").filter({ hasText: "fonte-pronta.png" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /pedido criativo|creative request/i })).toHaveValue(request);

    const workId = new URL(page.url()).searchParams.get("workId")!;
    const generationResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/creative-work/${workId}/generate`) && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /gerar 3 variações · 15 créditos|generate 3 variations · 15 credits/i }).click();
    const generation = await generationResponse;
    expect([200, 201, 202]).toContain(generation.status());
    const generationBody = (await generation.json()) as { outputs: Array<{ id: string }> };
    const initialIds = generationBody.outputs.map((output) => output.id).sort();
    expect(initialIds).toHaveLength(3);

    await expect.poll(async () => {
      const bold = (await workDetail(page, workId)).outputs.find((output) => output.creativeLevel === "bold");
      return bold && bold.retryCount === 1 && ["queued", "processing"].includes(bold.status);
    }, { timeout: 120_000, intervals: [200, 500] }).toBe(true);
    await expect(page.getByRole("button", { name: /repetir esta proposta|retry this proposal/i })).toHaveCount(0);
    await expect.poll(async () => {
      const detail = await workDetail(page, workId);
      return detail.outputs.map((output) => output.status).sort().join(",");
    }, { timeout: 120_000, intervals: [500, 1_000] }).toBe("completed,completed,failed");
    const terminal = await workDetail(page, workId);
    expect(terminal.outputs.map((output) => output.id).sort()).toEqual(initialIds);
    expect(terminal.outputs.find((output) => output.status === "failed")).toMatchObject({ retryCount: 1 });
    const retryButton = page.getByRole("button", { name: /repetir esta proposta|retry this proposal/i });
    await expect(retryButton).toBeVisible();
    const usageAfterInitial = await newUsage(page, usageBefore);
    expect(usageAfterInitial.reduce((sum, item) => sum + Math.abs(item.amount), 0)).toBe(fixture().expectedInitialCredits);

    const failedOutput = terminal.outputs.find((output) => output.status === "failed")!;
    const retryResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/creative-work/${workId}/outputs/${failedOutput.id}/retry`)
        && response.request().method() === "POST",
    );
    await retryButton.click();
    const retried = await retryResponse;
    expect(retried.ok()).toBe(true);
    const retryBody = (await retried.json()) as { output: { id: string } };
    expect(retryBody.output.id).toBe(failedOutput.id);
    await expect.poll(async () => (await workDetail(page, workId)).outputs
      .find((output) => output.id === failedOutput.id)?.status,
    { timeout: 120_000, intervals: [250, 500, 1_000] }).toBe("completed");
    const recovered = await workDetail(page, workId);
    expect(recovered.outputs.map((output) => output.id).sort()).toEqual(initialIds);
    expect((await newUsage(page, usageBefore)).map((item) => item.id).sort())
      .toEqual(usageAfterInitial.map((item) => item.id).sort());
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`home and results remain accessible at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await assertSingleActiveBrand(page);
      const request = page.getByRole("textbox", { name: /pedido criativo|creative request/i });
      await expect(request).toBeVisible();
      await request.fill(`Fluxo por teclado ${viewport.name} ${Date.now()}`);
      await request.focus();
      await expect(request).toBeFocused();

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

      const attach = page.locator("button").filter({ hasText: /adicionar arte|add image/i });
      await tabTo(page, attach);
      const chooserPromise = page.waitForEvent("filechooser");
      await page.keyboard.press("Enter");
      const chooser = await chooserPromise;
      await chooser.setFiles({
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

      await page.keyboard.press("Shift+Tab");
      await expect(request).toBeFocused();
      await tabTo(page, attach);
      const useBoth = source.getByRole("button", { name: /ambos|both/i });
      await tabTo(page, useBoth);
      await page.keyboard.press("Enter");
      await expect(useBoth).toHaveAttribute("aria-pressed", "true");
      const generate = page.getByRole("button", { name: /gerar 3 variações · 15 créditos|generate 3 variations · 15 credits/i });
      await expect(generate).toBeEnabled();
      await tabTo(page, generate);
      const generationResponse = page.waitForResponse((response) =>
        /\/api\/creative-work\/[^/]+\/generate$/.test(new URL(response.url()).pathname)
          && response.request().method() === "POST",
      );
      await page.keyboard.press("Space");
      expect((await generationResponse).ok()).toBe(true);
      await expect(liveRegion).toHaveText(/geração iniciada/i);
      await expect(page.locator('[data-testid="proposal-level"][data-status="completed"]'))
        .toHaveCount(3, { timeout: 120_000 });

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

      const edit = card.getByRole("button", { name: /editar|edit/i });
      await tabTo(page, edit);
      await page.keyboard.press("Enter");
      await expect(edit).toHaveAttribute("aria-expanded", "true");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page }).analyze();
      expect(audit.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious"))
        .toEqual([]);
    });
  }
});
