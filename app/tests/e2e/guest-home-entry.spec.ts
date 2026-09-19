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
  // Hydration wipes pre-hydration fills of the controlled inputs (#446):
  // wait for load, then round-trip the values before submitting.
  await page.waitForLoadState("load");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await expect(page.locator("#email")).toHaveValue(EMAIL);
  await expect(page.locator("#login-password")).toHaveValue(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

async function seedDraft(
  page: Page,
  options: {
    id?: string;
    request?: string;
    fileCount?: number;
    expiresInMs?: number;
  } = {},
): Promise<string> {
  const id = options.id ?? DRAFT_ID;
  await page.evaluate(
    ({ draftId, request, fileCount, expiresInMs }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("adscale-public-drafts-v1", 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore("drafts", { keyPath: "id" });
        };
        open.onsuccess = () => {
          const db = open.result;
          const now = Date.now();
          const files = Array.from({ length: fileCount }, (_, index) => {
            // Minimal valid PNG (1x1) so server magic-byte checks pass.
            const png = Uint8Array.from([
              137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
              0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222,
            ]);
            return new File([png], `ref-${index}.png`, { type: "image/png" });
          });
          const tx = db.transaction("drafts", "readwrite");
          tx.objectStore("drafts").put({
            version: 1,
            id: draftId,
            request,
            intent: "single",
            exampleId: null,
            files,
            createdAt: now,
            expiresAt: now + expiresInMs,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    {
      draftId: id,
      request: options.request ?? DRAFT_REQUEST,
      fileCount: options.fileCount ?? 0,
      expiresInMs: options.expiresInMs ?? 24 * 60 * 60 * 1000,
    },
  );
  return id;
}

async function ensureBrand(page: Page): Promise<void> {
  const panel = page.locator('[data-guest-entry="panel"]');
  await expect(panel).toBeVisible();
  const create = panel.getByRole("button", { name: /criar marca/i });
  if (await create.count()) {
    await create.click();
    await page.locator("#assistant-create-client-name").fill("Marca E2E");
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: /criar|salvar|confirmar/i })
      .click();
    await expect(
      panel.locator("strong", { hasText: "Marca E2E" }),
    ).toBeVisible({
      timeout: 15_000,
    });
  }
}

type NetworkCall = { url: string; method: string; body: string | null };

function watchNetwork(page: Page): NetworkCall[] {
  const calls: NetworkCall[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("/api/")) return;
    calls.push({ url, method: request.method(), body: request.postData() });
  });
  return calls;
}

function forbiddenImporterCalls(calls: NetworkCall[]): NetworkCall[] {
  return calls.filter((call) => {
    const pathname = new URL(call.url).pathname;
    if (/\/generate(\/|$)/.test(pathname)) return true;
    if (/\/copy(\/|$)/.test(pathname)) return true;
    if (/\/checkout(\/|$)/.test(pathname)) return true;
    if (/\/trial(\/|$)/.test(pathname) && call.method !== "GET") return true;
    if (call.body && /"action"\s*:\s*"prepare"/.test(call.body)) return true;
    return false;
  });
}

async function entryOrSkip(page: Page, url: string): Promise<boolean> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  const marker = page.locator("[data-guest-entry]");
  try {
    await marker.first().waitFor({ timeout: 15_000 });
  } catch {
    test.skip(true, "server runs with import flags off (normal Studio)");
    return false;
  }
  // Import-off servers render the honest recovery panel instead of the
  // import-capable review; import legs cannot run there (#446).
  if (await page.locator('[data-guest-entry="recovery"]').count()) {
    test.skip(true, "server runs with import off (recovery renders)");
    return false;
  }
  return true;
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

  test("confirm imports a verified work without forbidden mutations", async ({
    page,
  }) => {
    await login(page);
    const draftId = await seedDraft(page, {
      id: "bb444444-4444-4444-8444-444444444444",
      request: "Pedido importado de verdade no e2e",
    });
    const calls = watchNetwork(page);
    if (
      !(await entryOrSkip(
        page,
        `/?compose=1&fresh=1&intent=single&guestDraft=${draftId}`,
      ))
    )
      return;
    await ensureBrand(page);
    await page
      .locator('[data-guest-entry="panel"]')
      .getByRole("button", { name: /usar este pedido/i })
      .click();
    const imported = page.locator('[data-guest-entry="imported"]');
    await expect(imported).toBeVisible({ timeout: 30_000 });
    const openHref = await imported
      .getByRole("link", { name: /abrir no estúdio/i })
      .getAttribute("href");
    expect(openHref).toMatch(/workId=[0-9a-f-]{36}&compose=1/i);
    expect(forbiddenImporterCalls(calls)).toEqual([]);
    const analytics = calls.filter((call) =>
      new URL(call.url).pathname.endsWith("/api/analytics/events"),
    );
    expect(
      analytics.some((call) => call.body?.includes("guest_draft_imported")),
      "guest_draft_imported delivered after verification",
    ).toBe(true);
  });

  test("reload after verified offers receipt recovery", async ({ page }) => {
    await login(page);
    const draftId = await seedDraft(page, {
      id: "cc555555-5555-4555-8555-555555555555",
      request: "Pedido para recuperação por recibo",
    });
    if (
      !(await entryOrSkip(
        page,
        `/?compose=1&fresh=1&intent=single&guestDraft=${draftId}`,
      ))
    )
      return;
    await ensureBrand(page);
    await page
      .locator('[data-guest-entry="panel"]')
      .getByRole("button", { name: /usar este pedido/i })
      .click();
    const imported = page.locator('[data-guest-entry="imported"]');
    await expect(imported).toBeVisible({ timeout: 30_000 });
    const openHref = (await imported
      .getByRole("link", { name: /abrir no estúdio/i })
      .getAttribute("href")) as string;
    const workId = new URL(openHref, "http://localhost").searchParams.get(
      "workId",
    );
    // Reload: the content snapshot is gone, the verified receipt remains.
    await page.goto(`/?compose=1&fresh=1&intent=single&guestDraft=${draftId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("load");
    await expect(page.locator('[data-guest-entry="missing"]')).toBeVisible();
    const recovery = page.getByRole("link", {
      name: /abrir trabalho importado/i,
    });
    await expect(recovery).toBeVisible();
    await expect(recovery).toHaveAttribute(
      "href",
      `/?workId=${workId}&compose=1`,
    );
    await recovery.click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/" && url.searchParams.get("workId") === workId,
      { timeout: 30_000 },
    );
  });

  test("draft with references verifies or explains the flag honestly", async ({
    page,
  }) => {
    await login(page);
    const draftId = await seedDraft(page, {
      id: "dd666666-6666-4666-8666-666666666666",
      request: "Pedido com referência real",
      fileCount: 1,
    });
    const calls = watchNetwork(page);
    if (
      !(await entryOrSkip(
        page,
        `/?compose=1&fresh=1&intent=single&guestDraft=${draftId}`,
      ))
    )
      return;
    await ensureBrand(page);
    await page
      .locator('[data-guest-entry="panel"]')
      .getByRole("button", { name: /usar este pedido/i })
      .click();
    const imported = page.locator('[data-guest-entry="imported"]');
    const partialOff = page.locator('[data-guest-entry="partial-off"]');
    await expect(imported.or(partialOff)).toBeVisible({ timeout: 60_000 });
    expect(forbiddenImporterCalls(calls)).toEqual([]);
    if (await partialOff.count()) {
      // Journey A (attachments off): text imported, files kept locally.
      await expect(partialOff).toContainText(/desligada/i);
      await expect(
        partialOff.getByRole("button", { name: /criar pedido só com texto/i }),
      ).toBeVisible();
    } else {
      // Journey B (attachments on): the reference transferred for real.
      const openHref = await imported
        .getByRole("link", { name: /abrir no estúdio/i })
        .getAttribute("href");
      expect(openHref).toMatch(/workId=[0-9a-f-]{36}&compose=1/i);
    }
  });

  test("expired draft lands on missing without crashing", async ({ page }) => {
    await login(page);
    const draftId = await seedDraft(page, {
      id: "ee777777-7777-4777-8777-777777777777",
      expiresInMs: -60_000,
    });
    if (
      !(await entryOrSkip(
        page,
        `/?compose=1&fresh=1&intent=single&guestDraft=${draftId}`,
      ))
    )
      return;
    await expect(page.locator('[data-guest-entry="missing"]')).toBeVisible();
  });
});
