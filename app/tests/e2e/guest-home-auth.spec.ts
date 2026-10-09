import { expect, test } from "@playwright/test";
import { seedVisualManifest, VISUAL_EMAIL } from "./support/visual-auth";
import { loginOnCurrentPage } from "./support/guest-home";

test.beforeAll(() => {
  seedVisualManifest();
});

test("o convidado vai ao login sem pedido na URL e cai em / depois de entrar", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Anúncio de lançamento");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
  // The guest's draft is not reconnected after the sign-up (spec 2026-10-07 §4): nothing of it in the URL.
  expect(new URL(page.url()).search).toBe("");

  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL((url) => url.pathname === "/" && url.search === "", { timeout: 45_000 });
  await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Anúncio de lançamento")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Usar este pedido" })).toHaveCount(0);
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

test("login para cadastro preserva o callback", async ({ page }) => {
  await page.goto("/login?callbackUrl=%2Fcreative-work%2Fnew%3Fcompose%3D1");
  const signup = page.getByRole("link", { name: "Criar conta" });
  await expect(signup).toBeVisible();
  expect(await signup.getAttribute("href")).toContain("callbackUrl=");
  await signup.click();
  await page.waitForURL(/\/signup\?callbackUrl=/);
  expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe("/creative-work/new?compose=1");
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
