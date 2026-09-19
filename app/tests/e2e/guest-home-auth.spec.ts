import { expect, test, type Page } from "@playwright/test";

/**
 * Auth-return preservation (#441): a guest draft continuation survives every
 * authentication path with the same UUID on the same origin. Email-dependent
 * legs (verification, resend, magic link, recovery) run in #446 with test
 * mail; this spec covers the legs provable without email: password login,
 * entry-screen hopping, valid-session shortcut, and unsafe-destination
 * rejection.
 */

const GUEST_DRAFT = "aa111111-1111-4111-8111-111111111111";
const CALLBACK = `/?compose=1&fresh=1&intent=single&guestDraft=${GUEST_DRAFT}`;
const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";

/**
 * Fill the password form after hydration (#446): pre-hydration fills of the
 * controlled inputs are wiped when React takes over, leaving `required`
 * validation to block the submit. Round-tripping the values fails fast
 * instead of timing out at waitForURL.
 */
async function fillPasswordForm(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await expect(page.locator("#email")).toHaveValue(EMAIL);
  await expect(page.locator("#login-password")).toHaveValue(PASSWORD);
}

test.describe("auth return preservation (#441)", () => {
  test("password login lands on the guestDraft continuation with the same UUID", async ({
    page,
  }) => {
    await page.goto(`/login?callbackUrl=${encodeURIComponent(CALLBACK)}`, {
      waitUntil: "domcontentloaded",
    });
    await fillPasswordForm(page);
    await page.locator("form:has(#email) button[type=submit]").click();
    await page.waitForURL(
      (url) => url.pathname === "/" && url.searchParams.get("guestDraft") === GUEST_DRAFT,
      { timeout: 30_000 },
    );
    expect(page.url()).toContain(`intent=single`);
    expect(page.url()).toContain("compose=1");
  });

  test("login/signup/forgot-password hopping preserves the continuation", async ({
    page,
  }) => {
    await page.goto(`/login?callbackUrl=${encodeURIComponent(CALLBACK)}`, {
      waitUntil: "domcontentloaded",
    });
    const signupHref = await page
      .getByRole("link", { name: "Criar conta", exact: true })
      .first()
      .getAttribute("href");
    expect(signupHref).toContain(`callbackUrl=${encodeURIComponent(CALLBACK)}`);
    await page.goto(signupHref as string, { waitUntil: "domcontentloaded" });
    const loginHref = await page
      .getByRole("link", { name: /entrar/i })
      .first()
      .getAttribute("href");
    expect(loginHref).toContain(`callbackUrl=${encodeURIComponent(CALLBACK)}`);
  });

  test("already-authenticated visitor jumps to the continuation, not a loop", async ({
    page,
  }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await fillPasswordForm(page);
    await page.locator("form:has(#email) button[type=submit]").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 30_000,
    });
    await page.goto(`/login?callbackUrl=${encodeURIComponent(CALLBACK)}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL(
      (url) => url.pathname === "/" && url.searchParams.get("guestDraft") === GUEST_DRAFT,
      { timeout: 30_000 },
    );
  });

  test("expired or forged cookie renders login without looping", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "forged-session-token",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto(`/login?callbackUrl=${encodeURIComponent(CALLBACK)}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("load");
    await expect(page.locator("#email")).toBeVisible();
    expect(page.url()).toContain("/login");
  });

  test("external, protocol-relative and evasive destinations are rejected", async ({
    browser,
  }) => {
    for (const evil of [
      "https://evil.example/",
      "//evil.example/",
      "/%2Fevil.example/",
      "/%252Fevil.example/",
    ]) {
      // Fresh context per leg (#446): reusing one page across sign-outs
      // races the dashboard's post-sign-out 401s, whose correct
      // session-expiry redirect to bare /login aborts the next goto
      // (net::ERR_ABORTED). Each evil leg starts logged-out, like a real
      // attacker link, with no shared cookies, polls, or sign-out needed.
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await page.goto(`/login?callbackUrl=${encodeURIComponent(evil)}`, {
          waitUntil: "domcontentloaded",
        });
        await fillPasswordForm(page);
        await page.locator("form:has(#email) button[type=submit]").click();
        await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
          timeout: 30_000,
        });
        expect(new URL(page.url()).origin).toBe(
          new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").origin,
        );
        expect(page.url()).not.toContain("evil.example");
      } finally {
        await context.close();
      }
    }
  });
});
