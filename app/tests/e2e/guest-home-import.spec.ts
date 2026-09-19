import { expect, test } from "@playwright/test";
import { seedVisualManifest, VISUAL_EMAIL } from "./support/visual-auth";
import {
  NO_BRAND_EMAIL, NO_BRAND_PASSWORD, guestDraftIdFromUrl, loginOnCurrentPage, seedNoBrandUser,
} from "./support/guest-home";

test.beforeAll(() => {
  seedVisualManifest();
  seedNoBrandUser();
});

async function reachEntryWithDraft(
  page: import("@playwright/test").Page,
  request: string,
  files?: { name: string; mimeType: string; buffer: Buffer }[]
) {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill(request);
  if (files?.length) {
    await page.locator("#ag-file-input").setInputFiles(files);
    await expect(page.locator("#ag-files")).toContainText(files[0].name);
  }
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL(/guestDraft=/, { timeout: 45_000 });
  await expect(page.getByText(request).first()).toBeVisible();
  await ensureBrandSelected(page);
}

async function ensureBrandSelected(page: import("@playwright/test").Page) {
  // The seed owns two brands, so the entry requires an explicit choice.
  const confirm = page.getByRole("button", { name: "Usar este pedido" });
  if (await confirm.isDisabled().catch(() => false)) {
    await page.getByRole("button", { name: "Marca ativa" }).click();
    await page.getByRole("menuitem", { name: "VF Example Brand Kit", exact: true }).click();
    await expect(confirm).toBeEnabled();
  }
}

test("montar e selecionar marca sem confirmar não cria nada", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() !== "GET" && url.pathname.startsWith("/api/")) {
      mutations.push(`${request.method()} ${url.pathname}`);
    }
  });
  await reachEntryWithDraft(page, "Pedido sem confirmação");
  expect(mutations.filter((entry) => entry.includes("/api/creative-work"))).toEqual([]);
});

test("confirmar cria o Trabalho e abre o workId", async ({ page }) => {
  await reachEntryWithDraft(page, "Pedido de importação real");
  await page.getByRole("button", { name: "Usar este pedido" }).click();
  await page.waitForURL(/workId=/, { timeout: 45_000 });
  expect(guestDraftIdFromUrl(page.url()) ?? "navigated").toBeTruthy();
});

test("duplo clique gera um único Trabalho", async ({ page }) => {
  const creations: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/api/creative-work" && response.request().method() === "POST") {
      creations.push(String(response.status()));
    }
  });
  await reachEntryWithDraft(page, "Pedido de duplo clique");
  const confirm = page.getByRole("button", { name: "Usar este pedido" });
  await confirm.dblclick();
  await page.waitForURL(/workId=/, { timeout: 45_000 });
  expect(creations.length).toBeLessThanOrEqual(1);
});

test("importação não dispara prepare, generate, checkout ou trial", async ({ page }) => {
  const forbidden: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const body = request.postDataJSON();
    if (url.pathname.includes("/generate") || url.pathname.includes("/copy")) {
      forbidden.push(url.pathname);
    }
    if (body && typeof body === "object" && (body as Record<string, unknown>).action === "prepare") {
      forbidden.push(`${url.pathname}#prepare`);
    }
    if (/^\/(api\/)?(checkout|billing\/trial)/.test(url.pathname) && request.method() !== "GET") {
      forbidden.push(url.pathname);
    }
  });
  await reachEntryWithDraft(page, "Pedido com guarda de rede");
  await page.getByRole("button", { name: "Usar este pedido" }).click();
  await page.waitForURL(/workId=/, { timeout: 45_000 });
  expect(forbidden).toEqual([]);
});

test("falha de analytics não bloqueia a importação", async ({ page }) => {
  await page.route("**/api/analytics/events", (route) => route.abort("failed"));
  await reachEntryWithDraft(page, "Pedido sem analytics");
  await page.getByRole("button", { name: "Usar este pedido" }).click();
  await page.waitForURL(/workId=/, { timeout: 45_000 });
});

test("sem marca: pedido preservado durante criação real de marca", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Pedido antes da marca");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  await loginOnCurrentPage(page, NO_BRAND_EMAIL, NO_BRAND_PASSWORD);
  await page.waitForURL(/guestDraft=/, { timeout: 45_000 });
  await expect(page.getByText("Você ainda não tem uma marca.")).toBeVisible();
  await expect(page.getByText("Pedido antes da marca").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Usar este pedido" })).toBeDisabled();
  await page.getByRole("button", { name: "Marca ativa" }).click();
  await page.getByRole("menuitem", { name: "+ Nova marca" }).click();
  await page.locator("#assistant-create-client-name").fill("Marca E2E");
  await page.getByRole("button", { name: "Criar marca" }).click();
  await expect(page.getByRole("button", { name: "Usar este pedido" })).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByText("Pedido antes da marca").first()).toBeVisible();
  await page.getByRole("button", { name: "Usar este pedido" }).click();
  await page.waitForURL(/workId=/, { timeout: 45_000 });
});

test("guestDraft com trabalho aberto mostra conflito explícito", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Pedido em conflito");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const draftId = guestDraftIdFromUrl(page.url())!;
  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL(/guestDraft=/, { timeout: 45_000 });
  await page.goto(`/?guestDraft=${draftId}&workId=99000000-0000-4000-8000-000000000009&compose=1`);
  await expect(page.getByText("Você tem um trabalho aberto e um pedido da página inicial.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir o trabalho existente" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continuar com o pedido da página inicial" })).toBeVisible();
});

test("resposta perdida na criação recupera o mesmo Trabalho sem duplicar", async ({ page }) => {
  await reachEntryWithDraft(page, "Pedido com resposta perdida");
  const entryUrl = page.url();
  const draftId = new URL(entryUrl).searchParams.get("guestDraft")!;
  let creations = 0;
  await page.route("**/api/creative-work", async (route) => {
    if (route.request().method() === "POST") {
      creations += 1;
      // Round-trip reaches the server (commit happens) but the page
      // sees a failure: the import must recover the committed row.
      await route.fetch();
      await route.fulfill({ status: 500, body: JSON.stringify({ message: "lost" }) });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Usar este pedido" }).click();
  await page.waitForURL(/workId=/, { timeout: 45_000 });
  const workId = new URL(page.url()).searchParams.get("workId")!;
  const committed = await page.evaluate(async ({ key }) => {
    const res = await fetch(`/api/creative-work?view=draftByKey&draftKey=${key}`);
    return res.ok ? ((await res.json()) as { work: { id: string } }).work.id : null;
  }, { key: draftId });
  expect(committed).toBe(workId);
  expect(creations).toBe(1);
  await page.unroute("**/api/creative-work");
  await page.goto(entryUrl);
  await expect(page.getByText("Pedido com resposta perdida").first()).toBeVisible();
  await ensureBrandSelected(page);
  await page.getByRole("button", { name: "Usar este pedido" }).click();
  await page.waitForURL(/workId=/, { timeout: 45_000 });
  expect(new URL(page.url()).searchParams.get("workId")).toBe(workId);
});

test("falha no meio do lote retoma só os pendentes sem repetir", async ({ page }) => {
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  const files = [0, 1, 2].map((index) => ({
    name: `lote-${index}.png`,
    mimeType: "image/png",
    buffer: tinyPng,
  }));
  let uploads = 0;
  let attaches = 0;
  // No R2/Inngest egress in this sandbox: the bytes hop and the server
  // source rows are simulated while the transfer client (serial order,
  // checkpoints, partial, resume, no-repeat) runs fully natively.
  const seeded = [
    "a0000000-0000-4000-8000-000000000001",
    "a0000000-0000-4000-8000-000000000002",
    "a0000000-0000-4000-8000-000000000003",
  ];
  const sources: { id: string; assetId: string }[] = [];
  await page.route("**/api/workspace/assets", async (route) => {
    if (route.request().method() === "POST") {
      const id = seeded[uploads]!;
      uploads += 1;
      await route.fulfill({
        status: 201,
        body: JSON.stringify({
          asset: {
            id, key: `e2e/guest-home/lote-${uploads - 1}.png`,
            url: `https://assets.invalid/e2e/${id}`, type: "image/png",
            name: `lote-${uploads - 1}.png`, size: 67,
          },
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/creative-work/*", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown> | null;
    if (route.request().method() === "PATCH" && body?.action === "attachSource") {
      attaches += 1;
      if (attaches === 2) {
        await route.fulfill({ status: 500, body: JSON.stringify({ message: "boom" }) });
        return;
      }
      const source = {
        id: `c0000000-0000-4000-8000-${String(attaches).padStart(12, "0")}`,
        assetId: body.assetId as string,
      };
      sources.push(source);
      await route.fulfill({ status: 200, body: JSON.stringify({ source }) });
      return;
    }
    if (route.request().method() === "GET" && !route.request().url().includes("view=")) {
      const upstream = await route.fetch();
      const json = (await upstream.json()) as Record<string, unknown>;
      await route.fulfill({
        status: upstream.status(),
        body: JSON.stringify({ ...json, sources }),
      });
      return;
    }
    await route.continue();
  });
  await reachEntryWithDraft(page, "Pedido com lote de referências", files);
  await page.getByRole("button", { name: "Usar este pedido" }).click();
  await expect(page.getByText("Faltam 2 referências.")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Tentar referências pendentes" }).click();
  await page.waitForURL(/workId=/, { timeout: 60_000 });
  expect(uploads).toBe(3);
  expect(attaches).toBe(4);
});
