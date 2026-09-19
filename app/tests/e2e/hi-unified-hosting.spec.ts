import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Unified `/hi` hosting proof (#439): the public home is a native route of
 * the same service — no proxy to the old marketing host. Cold-cache proof:
 * the old host is blocked at the request layer for the whole session, then
 * the page, fallback, login return, and local asset aliases must all work.
 *
 * Runs against an already-running server (default flags: all
 * PUBLIC_STUDIO_* false, so the fallback renders). The login leg reuses the
 * seeded dev identity used by the other serial flows.
 */

const OLD_HOST = "adscale-marketing.onrender.com";
const INVENTORY_HASHES: Record<string, string> = {
  "/Adscale.svg":
    "0ff3a13d8f46edec8d8501413f3a89350411d7c0fee7aa381237644618bc1fd1",
  "/hi/Adscale.svg":
    "0ff3a13d8f46edec8d8501413f3a89350411d7c0fee7aa381237644618bc1fd1",
  "/hi/assets/index-K2VpOfil.css":
    "8cd19c0a7e0822b35416ca3c008ca7a2457d31fec0d8cd5041ea996673f67676",
};

const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";

function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

async function gotoNoOldHost(page: Page, url: string) {
  const oldHostHits: string[] = [];
  await page.route(
    (routeUrl) => routeUrl.hostname === OLD_HOST,
    async (route) => {
      oldHostHits.push(route.request().url());
      await route.abort();
    },
  );
  page.on("request", (request) => {
    if (request.url().includes(OLD_HOST)) oldHostHits.push(request.url());
  });
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  return { response, oldHostHits };
}

test.describe("unified /hi hosting (#439)", () => {
  test("/hi serves the local fallback with zero old-host traffic", async ({
    page,
  }) => {
    const { response, oldHostHits } = await gotoNoOldHost(page, "/hi");
    expect(response?.status()).toBe(200);
    const main = page.getByRole("main");
    await expect(main).toHaveAttribute("id", "main");
    await expect(main).toHaveAttribute("data-public-home-mode", "fallback");
    await expect(
      page.getByRole("heading", { name: "Seu Estúdio continua por aqui." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Entrar no Estúdio" }),
    ).toHaveAttribute("href", "/login?callbackUrl=%2F");
    expect(oldHostHits).toEqual([]);
  });

  test("/hi/ serves the same fallback content", async ({ page }) => {
    const { response, oldHostHits } = await gotoNoOldHost(page, "/hi/");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Seu Estúdio continua por aqui." }),
    ).toBeVisible();
    expect(oldHostHits).toEqual([]);
  });

  test("login from the fallback lands back on /", async ({ page }) => {
    await page.route(
      (routeUrl) => routeUrl.hostname === OLD_HOST,
      (route) => route.abort(),
    );
    await page.goto("/hi", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Entrar no Estúdio" }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await page.locator("#email").fill(EMAIL);
    await page.locator("#login-password").fill(PASSWORD);
    await page.locator("form:has(#email) button[type=submit]").click();
    await page.waitForURL((url) => url.pathname === "/", {
      timeout: 30_000,
    });
  });

  test("old logo/asset addresses resolve to inventoried local bytes", async ({
    request,
  }) => {
    for (const [url, expectedHash] of Object.entries(INVENTORY_HASHES)) {
      const response = await request.get(url);
      expect(response.status(), url).toBe(200);
      const body = Buffer.from(await response.body());
      expect(
        createHash("sha256").update(body).digest("hex"),
        `${url} matches inventory hash`,
      ).toBe(expectedHash);
    }
    // Local bytes equal the committed copies (not the live upstream).
    const logoHash = sha256File(
      path.resolve(process.cwd(), "public/adscale-guest/logo.svg"),
    );
    expect(logoHash).toBe(INVENTORY_HASHES["/Adscale.svg"]);
  });
});
