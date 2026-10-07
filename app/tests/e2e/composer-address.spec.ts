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

  test("the legacy entries land on the composer", async ({ page }) => {
    const cases: Array<[string, string]> = [
      ["/campaigns/new", "/creative-work/new?compose=1"],
      ["/templates", "/creative-work/new"],
      ["/quick-tools", "/creative-work/new"],
      ["/restyling", "/creative-work/new?intent=restyle"],
      ["/quick-tools/create-post", "/creative-work/new?intent=variations"],
    ];
    for (const [from, to] of cases) {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(to)}$`));
    }
  });
});
