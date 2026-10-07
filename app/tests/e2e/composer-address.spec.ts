import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Spec 2026-10-07 §2 (caminho único, etapa 1): the composer lives at /creative-work/new, and every old way in lands
 * there with its query. Deterministic seed only (npm run seed:create-post-e2e).
 */

const FIXTURE_PATH = process.env.CREATE_POST_E2E_FIXTURE_PATH
  ? path.resolve(process.env.CREATE_POST_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../fixtures/create-post-e2e.json");

type Fixture = { email: string; password: string; readyWorkId: string };

function fixture(): Fixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing fixture. Run npm run seed:create-post-e2e first.");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("Composer address (caminho único, etapa 1)", () => {
  test.beforeEach(async ({ page }) => {
    const data = fixture();
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
  });

  test("an old composer link at / lands on the composer with the same query", async ({ page }) => {
    const { readyWorkId } = fixture();
    await page.goto(`/?workId=${readyWorkId}&intent=variations`);
    await expect(page).toHaveURL(
      new RegExp(`${escapeRegExp(`/creative-work/new?workId=${readyWorkId}&intent=variations`)}$`),
    );
    await expect(page.getByTestId("studio-talk-box")).toBeVisible({ timeout: 60_000 });
  });

  for (const [from, to] of [
    ["/campaigns/new", "/creative-work/new?compose=1"],
    ["/templates", "/creative-work/new"],
    ["/quick-tools", "/creative-work/new"],
    ["/restyling", "/creative-work/new?intent=restyle"],
    ["/quick-tools/create-post", "/creative-work/new?intent=variations"],
  ]) {
    test(`legacy entry ${from} lands on the composer`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(to)}$`));
    });
  }

  test("filters legacy query after authenticated home entry", async ({ page }) => {
    await page.goto(`/?compose=1&workId=A&unknown=x&workId=B&intent=variations&blank=&workspaceId=ws&suggestion=hi`);
    await expect(page).toHaveURL(/\/creative-work\/new\?compose=1&intent=variations$/);
    await expect(page.getByTestId("studio-talk-box")).toBeVisible();
  });

  for (const entry of ["no-cookie", "invalid-cookie", "legacy-root", "legacy-entry"] as const) {
    test(`${entry} resumes the composer destination after login`, async ({ page }) => {
      const { readyWorkId, email, password } = fixture();
      await page.context().clearCookies();
      if (entry === "invalid-cookie") {
        await page.context().addCookies([{ name: "better-auth.session_token", value: "invalid-session", url: process.env.E2E_BASE_URL ?? "http://localhost:3000" }]);
      }
      const search = `?workId=${readyWorkId}&intent=variations`;
      const target = entry === "legacy-entry" ? "/creative-work/new?intent=restyle" : `/creative-work/new${search}`;
      const callback = entry === "legacy-root" ? `/${search}` : target;
      await page.goto(entry === "legacy-entry" ? "/restyling" : entry === "legacy-root" ? callback : target);
      await expect(page).toHaveURL(/\/login\?callbackUrl=/);
      expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe(callback);
      await page.locator("#email").fill(email);
      await page.locator("#login-password").fill(password);
      await page.locator('form:has(#email) button[type="submit"]').click();
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(target)}$`));
      await expect(page.getByTestId("studio-talk-box")).toBeVisible({ timeout: 60_000 });
    });
  }

  for (const cookie of ["no-cookie", "invalid-cookie"] as const) {
    test(`${cookie} callback ignores internal RSC query and a caller return header`, async ({ page }) => {
      await page.context().clearCookies();
      if (cookie === "invalid-cookie") {
        await page.context().addCookies([{ name: "better-auth.session_token", value: "invalid-session", url: process.env.E2E_BASE_URL ?? "http://localhost:3000" }]);
      }
      await page.setExtraHTTPHeaders({ "x-adscale-composer-return": "/creative-work/new?intent=restyle" });
      await page.goto("/creative-work/new?compose=1&intent=variations&_rsc=internal");
      await expect(page).toHaveURL(/\/login\?callbackUrl=/);
      expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe("/creative-work/new?compose=1&intent=variations");
    });
  }

  test("keeps authenticated client navigation to a fresh composer", async ({ page }) => {
    await page.goto(`/creative-work/new?workId=${fixture().readyWorkId}&intent=variations`);
    await expect(page.getByTestId("studio-talk-box")).toBeVisible();
    await page.getByTestId("stage-brand-bar").getByRole("link", { name: "Novo trabalho" }).click();
    await expect(page).toHaveURL(/\/creative-work\/new\?mode=arte&compose=1&fresh=1$/);
    await expect(page.getByTestId("studio-talk-box")).toBeVisible();
  });

});
