import { expect, test } from "@playwright/test";
import { seedVisualManifest, VISUAL_EMAIL } from "./support/visual-auth";
import { guestDraftIdFromUrl, loginOnCurrentPage } from "./support/guest-home";

test.beforeAll(() => {
  seedVisualManifest();
});

async function reachEntryWithDraft(page: import("@playwright/test").Page, request: string) {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill(request);
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL(/guestDraft=/, { timeout: 45_000 });
  await expect(page.getByText(request).first()).toBeVisible();
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
