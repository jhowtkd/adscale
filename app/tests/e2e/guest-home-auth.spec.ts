import { expect, test } from "@playwright/test";
import { seedVisualManifest, VISUAL_EMAIL } from "./support/visual-auth";
import { guestDraftIdFromUrl, loginOnCurrentPage } from "./support/guest-home";

test.beforeAll(() => {
  seedVisualManifest();
});

test("login preserva guestDraft e origem até a entrada", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Anúncio de lançamento");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const draftId = guestDraftIdFromUrl(page.url());
  expect(draftId).not.toBeNull();

  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL((url) => url.searchParams.get("guestDraft") === draftId, { timeout: 45_000 });
  await expect(page.getByText("Anúncio de lançamento").first()).toBeVisible();
});

test("sessão válida em /login com callback salta para o destino", async ({ page }) => {
  await page.goto("/login");
  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
  await page.goto("/login?callbackUrl=%2Fhi");
  await page.waitForURL("**/hi", { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("sua marca");
});

test("callback externo é rejeitado para destino interno seguro", async ({ page }) => {
  await page.goto("/login?callbackUrl=https%3A%2F%2Fevil.test%2Froubo");
  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
  expect(page.url()).not.toContain("evil.test");
});

test("cookie forjado não impede o login nem causa loop", async ({ page, context }) => {
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: "forged-token-value",
      domain: new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname,
      path: "/",
    },
  ]);
  await page.goto("/login");
  await expect(page.locator("#email:visible")).toBeVisible({ timeout: 30_000 });
  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
});
