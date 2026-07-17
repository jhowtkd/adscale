import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";
const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/create-post-e2e.json");

type Fixture = {
  primaryClientProfileId: string;
  attachmentBufferBase64: string;
  readyWorkId: string;
  expectedInitialCredits: number;
};

type WorkDetail = {
  work: { id: string; campaignId: string | null; request: string };
  outputs: Array<{
    id: string;
    status: "queued" | "processing" | "completed" | "failed";
    creativeLevel: "conservative" | "balanced" | "bold";
    retryCount: number;
    parentOutputId: string | null;
    versionNumber: number;
    isSelected: boolean;
  }>;
  sources: Array<{ id: string; name: string; status: string; usage: string }>;
};

function fixture(): Fixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing fixture. Run npm run seed:create-post-e2e first.");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

async function login(page: Page, activeClientProfileId: string) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.evaluate((profileId) => {
    localStorage.setItem("adscale-storage", JSON.stringify({
      state: { sidebarCollapsed: false, activeClientProfileId: profileId },
      version: 0,
    }));
  }, activeClientProfileId);
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

async function fillRequestAndAttach(page: Page, request: string, name = "arte-e2e.png") {
  await page.getByRole("textbox", { name: /pedido criativo|creative request/i }).fill(request);
  await page.locator("#creative-composer-file").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: Buffer.from(fixture().attachmentBufferBase64, "base64"),
  });
}

test.describe("Frictionless operational Home", () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    await login(page, fixture().primaryClientProfileId);
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
    await expect(page.getByRole("heading", { name: /o que vamos criar|what shall we create/i })).toBeVisible();

    const request = "Promoção de matrículas para julho [e2e:retry-once-bold]";
    await fillRequestAndAttach(page, request);
    const source = page.locator("article").filter({ hasText: "arte-e2e.png" });
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
    expect([200, 201, 202]).toContain((await generated).status());
    await expect.poll(() => generationRequests.length).toBe(1);

    const initial = await workDetail(page, workId);
    const initialIds = initial.outputs.map((output) => output.id).sort();
    expect(initialIds).toHaveLength(3);
    let partialSeen = false;
    await expect.poll(async () => {
      const detail = await workDetail(page, workId);
      const complete = detail.outputs.filter((output) => output.status === "completed").length;
      partialSeen ||= complete >= 2 && complete < detail.outputs.length;
      return detail.outputs.map((output) => output.status).sort().join(",");
    }, { timeout: 120_000, intervals: [250, 500, 1_000] }).toBe("completed,completed,completed");
    expect(partialSeen, "two sibling outputs must be observable while the retry is pending").toBe(true);

    const settled = await workDetail(page, workId);
    const retried = settled.outputs.find((output) => output.creativeLevel === "bold")!;
    expect(retried.retryCount).toBe(1);
    expect(settled.outputs.map((output) => output.id).sort()).toEqual(initialIds);
    const usage = await newUsage(page, usageBefore);
    expect(usage.reduce((sum, item) => sum + Math.abs(item.amount), 0)).toBe(fixture().expectedInitialCredits);
    expect(campaignMutations).toEqual([]);
    expect(await campaignsCount(page)).toBe(campaignCountBefore);

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`workId=${workId}`));
    await expect(page.getByTestId("proposal-level")).toHaveCount(3);
    expect((await workDetail(page, workId)).outputs.map((output) => output.id).sort()).toEqual(initialIds);

    const original = settled.outputs.find((output) => output.creativeLevel === "conservative")!;
    const originalCard = page.getByTestId("proposal-level").filter({ has: page.getByTestId("proposal-level-name").filter({ hasText: /conservadora|conservative/i }) });
    await originalCard.getByRole("button", { name: /aprovar|approve/i }).click();
    await expect.poll(async () => (await workDetail(page, workId)).outputs.find((output) => output.id === original.id)?.isSelected).toBe(true);

    const popupPromise = page.waitForEvent("popup");
    await originalCard.getByRole("button", { name: /baixar|download/i }).click();
    const popup = await popupPromise;
    expect(popup.url()).toContain(`/api/creative-work/${workId}/outputs/${original.id}/download`);
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
    const request = "Variações de campanha [e2e:retry-twice-bold]";
    await fillRequestAndAttach(page, request, "fonte-pronta.png");
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
    await page.getByRole("button", { name: /gerar 3 variações · 15 créditos|generate 3 variations · 15 credits/i }).click();
    const initialIds = (await workDetail(page, workId)).outputs.map((output) => output.id).sort();
    await expect(page.getByRole("button", { name: /repetir esta proposta|retry this proposal/i })).toHaveCount(0);
    await expect.poll(async () => {
      const detail = await workDetail(page, workId);
      return detail.outputs.map((output) => output.status).sort().join(",");
    }, { timeout: 120_000, intervals: [500, 1_000] }).toBe("completed,completed,failed");
    const terminal = await workDetail(page, workId);
    expect(terminal.outputs.map((output) => output.id).sort()).toEqual(initialIds);
    expect(terminal.outputs.find((output) => output.status === "failed")).toMatchObject({ retryCount: 1 });
    await expect(page.getByRole("button", { name: /repetir esta proposta|retry this proposal/i })).toBeVisible();
    const usage = await newUsage(page, usageBefore);
    expect(usage.reduce((sum, item) => sum + Math.abs(item.amount), 0)).toBe(fixture().expectedInitialCredits);
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`home and results remain accessible at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/?workId=${fixture().readyWorkId}`);
      const request = page.getByRole("textbox", { name: /pedido criativo|creative request/i });
      await expect(request).toBeVisible();
      await request.focus();
      await expect(request).toBeFocused();
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
      await expect(page.getByRole("button", { name: /gerar 3 variações · 15 créditos|generate 3 variations · 15 credits/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /aprovar|approve/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /baixar|download/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /editar|edit/i }).first()).toBeVisible();
      await expect(page.locator('[role="status"][aria-live="polite"]')).not.toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page }).analyze();
      expect(audit.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious"))
        .toEqual([]);
    });
  }
});
