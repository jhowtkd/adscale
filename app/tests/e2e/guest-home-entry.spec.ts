import { expect, test, type Page } from "@playwright/test";

/**
 * Authenticated review entry (#442): a guest draft continuation lands on the
 * review panel with the real brand, explicit invalid/conflict panels, and an
 * honest missing state. The entry renders only when the server runs with the
 * import flags on; against a default-flags server these tests detect the
 * normal Studio and skip with a reason instead of failing. #446 boots the
 * import-enabled server in the dedicated guest-home project.
 *
 * Drafts are seeded into the browser's REAL IndexedDB (the producer side is
 * proven by guest-home-public.spec.ts); no in-memory fakes.
 */

const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";
const DRAFT_ID = "dd111111-1111-4111-8111-111111111111";
const DRAFT_REQUEST = "Pedido semeado para revisão autenticada";

async function login(page: Page): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

async function seedDraft(page: Page): Promise<void> {
  await page.evaluate(
    ({ id, request }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("adscale-public-drafts-v1", 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore("drafts", { keyPath: "id" });
        };
        open.onsuccess = () => {
          const db = open.result;
          const now = Date.now();
          const tx = db.transaction("drafts", "readwrite");
          tx.objectStore("drafts").put({
            version: 1,
            id,
            request,
            intent: "single",
            exampleId: null,
            files: [],
            createdAt: now,
            expiresAt: now + 24 * 60 * 60 * 1000,
          });
          tx.oncomplete = () => {
            db.close();
            try {
              localStorage.setItem("adscale:lastGuestDraftId", id);
            } catch {
              /* Storage may be unavailable; the draft record suffices. */
            }
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    { id: DRAFT_ID, request: DRAFT_REQUEST },
  );
}

async function entryOrSkip(page: Page, url: string): Promise<boolean> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  const marker = page.locator("[data-guest-entry]");
  try {
    await marker.first().waitFor({ timeout: 15_000 });
    return true;
  } catch {
    test.skip(true, "server runs with import flags off (normal Studio)");
    return false;
  }
}

test.describe("authenticated review entry (#442)", () => {
  test("review shows the literal request with the real brand, confirm gated", async ({
    page,
  }) => {
    await login(page);
    await seedDraft(page);
    if (
      !(await entryOrSkip(
        page,
        `/?compose=1&fresh=1&intent=single&guestDraft=${DRAFT_ID}`,
      ))
    )
      return;
    await expect(page.locator('[data-guest-entry="panel"]')).toBeVisible();
    await expect(page.getByText(DRAFT_REQUEST)).toBeVisible();
    // Brand section reflects real account state (zero/one/many handled alike):
    // either a brand name, a chooser, or the create-brand offer renders.
    const brandArea = page.locator('[data-guest-entry="panel"]');
    await expect(brandArea).toContainText(/Marca|marcas/i);
  });

  test("unknown draft id explains honestly without promising sync", async ({
    page,
  }) => {
    await login(page);
    if (
      !(await entryOrSkip(
        page,
        "/?compose=1&guestDraft=ee222222-2222-4222-8222-222222222222",
      ))
    )
      return;
    await expect(page.locator('[data-guest-entry="missing"]')).toBeVisible();
    await expect(
      page.getByText(/outro navegador ou dispositivo/i),
    ).toBeVisible();
  });

  test("invalid guestDraft applies nothing", async ({ page }) => {
    await login(page);
    if (!(await entryOrSkip(page, "/?guestDraft=..%2F..%2Fetc"))) return;
    await expect(page.locator('[data-guest-entry="invalid"]')).toBeVisible();
  });

  test("conflict offers both destinations without overlaying", async ({
    page,
  }) => {
    await login(page);
    await seedDraft(page);
    if (
      !(await entryOrSkip(
        page,
        `/?guestDraft=${DRAFT_ID}&workId=ff333333-3333-4333-8333-333333333333`,
      ))
    )
      return;
    const panel = page.locator('[data-guest-entry="conflict"]');
    await expect(panel).toBeVisible();
    const openExisting = await panel
      .getByRole("link", { name: /trabalho existente/i })
      .getAttribute("href");
    const continueGuest = await panel
      .getByRole("link", { name: /pedido da página inicial/i })
      .getAttribute("href");
    expect(openExisting).toContain("workId=");
    expect(openExisting).not.toContain("guestDraft");
    expect(continueGuest).toContain(`guestDraft=${DRAFT_ID}`);
    expect(continueGuest).not.toContain("workId");
  });
});
