import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * M02 first Studio piece: empty occupancy stays centered even if the
 * inspiration catalog has items. Começar starts a single piece without a
 * reference. Deterministic seed only; interview stays off.
 */

const FIXTURE_PATH = process.env.CREATE_POST_E2E_FIXTURE_PATH
  ? path.resolve(process.env.CREATE_POST_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../fixtures/create-post-e2e.json");

type Fixture = {
  email: string;
  password: string;
  readyWorkId: string;
  firstVisit: { email: string; password: string };
};

function fixture(): Fixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing fixture. Run npm run seed:create-post-e2e first.");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

async function signInHome(page: import("@playwright/test").Page, data: { email: string; password: string }) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    data: { email: data.email, password: data.password },
  });
  expect(signIn.ok(), await signIn.text()).toBe(true);
}

test.describe("First studio piece (M02)", () => {
  test("keeps the talk box centered on an empty home", async ({ page }) => {
    const data = fixture();
    await signInHome(page, data.firstVisit);

    await page.goto("/");
    const talkBox = page.getByTestId("studio-talk-box");
    await expect(talkBox).toBeVisible({ timeout: 60_000 });
    await expect(talkBox).toHaveAttribute("data-placement", "center");
    await expect(talkBox.getByRole("radiogroup")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /começar|gerar|start|generate/i })).toBeVisible();
  });

  test("keeps protocol settings reachable after a work is open", async ({ page }) => {
    const data = fixture();
    await signInHome(page, data);

    await page.goto(`/?workId=${data.readyWorkId}`);
    const talkBox = page.getByTestId("studio-talk-box");
    await expect(talkBox).toBeVisible({ timeout: 60_000 });
    await expect(talkBox).toHaveAttribute("data-placement", "dock");
    await expect(talkBox.getByRole("radiogroup")).toBeVisible();
  });

  test("completes the first piece from Começar without a reference", async ({ page }) => {
    const data = fixture();
    await signInHome(page, data.firstVisit);

    await page.goto("/");
    const talkBox = page.getByTestId("studio-talk-box");
    await expect(talkBox).toBeVisible({ timeout: 60_000 });
    await expect(talkBox).toHaveAttribute("data-placement", "center");
    const request = page.locator("#creative-composer-request");
    await expect(request).toBeVisible({ timeout: 60_000 });
    await request.fill("Peça de lançamento para o produto de teste.");
    await expect(request).toHaveValue("Peça de lançamento para o produto de teste.");
    await page.getByRole("button", { name: /começar|gerar|start|generate/i }).click();
    await expect(page.getByText(/anexe a peça de referência/i)).toHaveCount(0);
    await expect(talkBox).toHaveAttribute("data-placement", "dock", { timeout: 120_000 });
  });
});
