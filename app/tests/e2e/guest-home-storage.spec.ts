import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Native storage proof (#446): the visitor draft lifecycle runs against the
 * browser's real IndexedDB/localStorage through real interaction. IndexedDB
 * is opened inside the page only to assert stored rows — never to inject the
 * in-memory adapter and never as a substitute for interaction.
 */

async function islandOrSkip(page: Page): Promise<boolean> {
  await page.goto("/hi", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  if (await page.locator('[data-public-home-mode="fallback"]').count()) {
    test.skip(true, "server runs with home flags off (fallback renders)");
    return false;
  }
  await expect(page.getByRole("main")).toHaveAttribute("id", "main");
  return true;
}

type StoredDraft = {
  id: string;
  request: string;
  intent: string;
  files: Array<{ name: string; size: number }>;
  expiresAt: number;
};

async function readStoredDrafts(page: Page): Promise<StoredDraft[]> {
  return page.evaluate(
    () =>
      new Promise<StoredDraft[]>((resolve, reject) => {
        const open = indexedDB.open("adscale-public-drafts-v1", 2);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("drafts")) {
            db.createObjectStore("drafts", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("importReceipts")) {
            db.createObjectStore("importReceipts", { keyPath: "guestDraftId" });
          }
        };
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("drafts")) {
            db.close();
            resolve([]);
            return;
          }
          const rows: StoredDraft[] = [];
          const tx = db.transaction("drafts", "readonly");
          const cursor = tx.objectStore("drafts").openCursor();
          cursor.onsuccess = () => {
            const current = cursor.result;
            if (!current) return;
            const value = current.value as StoredDraft;
            rows.push({
              id: value.id,
              request: value.request,
              intent: value.intent,
              files: Array.isArray(value.files) ? value.files : [],
              expiresAt: value.expiresAt,
            });
            current.continue();
          };
          tx.oncomplete = () => {
            db.close();
            resolve(rows);
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
        open.onblocked = () => reject(new Error("upgrade blocked"));
      }),
  );
}

/**
 * guestDraft of the continuation (#446): top-level when already past auth,
 * nested inside callbackUrl on the auth entry screens (the logged-out
 * island flow lands on /login?callbackUrl=/?...&guestDraft=... by design).
 */
function continuationGuestDraft(page: Page): string | null {
  const url = new URL(page.url());
  const direct = url.searchParams.get("guestDraft");
  if (direct) return direct;
  const callback = url.searchParams.get("callbackUrl");
  if (!callback) return null;
  try {
    return new URL(callback, url.origin).searchParams.get("guestDraft");
  } catch {
    return null;
  }
}

/**
 * Best-effort profile removal (#446): Chromium releases the profile lock
 * asynchronously after close, so a single rmSync flakes with ENOTEMPTY on
 * macOS; the mid-test throw path also skips close entirely. Teardown must
 * never fail the test loudly.
 */
async function removeProfileDir(userDataDir: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
      return;
    } catch {
      if (attempt === 4) return;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

async function fillAndContinue(page: Page, text: string): Promise<string> {
  await page.getByLabel(/descreva o que você precisa criar/i).fill(text);
  await page.getByRole("button", { name: /continuar/i }).first().click();
  await page.getByRole("button", { name: /entrar e continuar/i }).click();
  await page.waitForURL((url) => url.pathname !== "/hi", {
    timeout: 30_000,
  });
  const draftId = continuationGuestDraft(page);
  expect(draftId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(page.url()).not.toContain("Pedido");
  return draftId as string;
}

test.describe("native storage (#446)", () => {
  test("round-trips text through reload with resume", async ({ page }) => {
    if (!(await islandOrSkip(page))) return;
    const text = "Pedido nativo com ida e volta";
    const draftId = await fillAndContinue(page, text);
    await page.goto("/hi", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const banner = page.locator("#ag-resume-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: /retomar/i }).click();
    await expect(
      page.getByLabel(/descreva o que você precisa criar/i),
    ).toHaveValue(text);
    const rows = await readStoredDrafts(page);
    expect(rows.map((row) => row.id)).toContain(draftId);
    expect(rows.find((row) => row.id === draftId)?.request).toBe(text);
  });

  test("second tab in the same context sees the same draft", async ({
    page,
    context,
  }) => {
    if (!(await islandOrSkip(page))) return;
    await fillAndContinue(page, "Pedido visível na segunda aba");
    const tab = await context.newPage();
    await tab.goto("/hi", { waitUntil: "domcontentloaded" });
    await tab.waitForLoadState("load");
    await expect(tab.locator("#ag-resume-banner")).toBeVisible();
    await tab.locator("#ag-resume-banner").getByRole("button", { name: /retomar/i }).click();
    await expect(
      tab.getByLabel(/descreva o que você precisa criar/i),
    ).toHaveValue("Pedido visível na segunda aba");
    await tab.close();
  });

  test("restart with a persistent profile offers resume", async ({
    browser,
  }) => {
    const userDataDir = mkdtempSync(join(tmpdir(), "guest-home-profile-"));
    try {
      const first = await browser
        .browserType()
        .launchPersistentContext(userDataDir, {
          baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
        });
      const page = first.pages()[0] ?? (await first.newPage());
      await page.goto("/hi", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");
      if (
        await page.locator('[data-public-home-mode="fallback"]').count()
      ) {
        test.skip(true, "server runs with home flags off (fallback renders)");
        await first.close();
        return;
      }
      await fillAndContinue(page, "Pedido que sobrevive ao reinício");
      await first.close();

      const second = await browser
        .browserType()
        .launchPersistentContext(userDataDir, {
          baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
        });
      const resumed = second.pages()[0] ?? (await second.newPage());
      await resumed.goto("/hi", { waitUntil: "domcontentloaded" });
      await resumed.waitForLoadState("load");
      await expect(resumed.locator("#ag-resume-banner")).toBeVisible();
      await resumed
        .locator("#ag-resume-banner")
        .getByRole("button", { name: /retomar/i })
        .click();
      await expect(
        resumed.getByLabel(/descreva o que você precisa criar/i),
      ).toHaveValue("Pedido que sobrevive ao reinício");
      await second.close();
    } finally {
      await removeProfileDir(userDataDir);
    }
  });

  test("abrupt close never leaves a corrupt partial", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const userDataDir = mkdtempSync(join(tmpdir(), "guest-home-crash-"));
    const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
    try {
      const first = await browser
        .browserType()
        .launchPersistentContext(userDataDir, { baseURL });
      const page = first.pages()[0] ?? (await first.newPage());
      await page.goto("/hi", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");
      if (
        await page.locator('[data-public-home-mode="fallback"]').count()
      ) {
        test.skip(true, "server runs with home flags off (fallback renders)");
        await first.close();
        return;
      }
      const text = "Pedido interrompido no meio do salvamento";
      await page.getByLabel(/descreva o que você precisa criar/i).fill(text);
      await page.getByRole("button", { name: /continuar/i }).first().click();
      // Close mid-save without waiting: the transaction either committed
      // atomically or not at all.
      await first.close();

      const second = await browser
        .browserType()
        .launchPersistentContext(userDataDir, { baseURL });
      const resumed = second.pages()[0] ?? (await second.newPage());
      await resumed.goto("/hi", { waitUntil: "domcontentloaded" });
      await resumed.waitForLoadState("load");
      const rows = await readStoredDrafts(resumed);
      expect(rows.length).toBeLessThanOrEqual(1);
      if (rows.length === 1) {
        expect(rows[0].request).toBe(text);
        await expect(resumed.locator("#ag-resume-banner")).toBeVisible();
      } else {
        await expect(resumed.locator("#ag-resume-banner")).toBeHidden();
        await expect(
          resumed.getByLabel(/descreva o que você precisa criar/i),
        ).toBeEmpty();
      }
      await second.close();
    } finally {
      await removeProfileDir(userDataDir);
    }
  });

  test("expired drafts are pruned, never offered", async ({ page }) => {
    if (!(await islandOrSkip(page))) return;
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("adscale-public-drafts-v1", 2);
          open.onupgradeneeded = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains("drafts")) {
              db.createObjectStore("drafts", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("importReceipts")) {
              db.createObjectStore("importReceipts", { keyPath: "guestDraftId" });
            }
          };
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction("drafts", "readwrite");
            tx.objectStore("drafts").put({
              version: 1,
              id: "ee333333-3333-4333-8333-333333333333",
              request: "Pedido vencido",
              intent: "single",
              exampleId: null,
              files: [],
              createdAt: Date.now() - 48 * 60 * 60 * 1000,
              expiresAt: Date.now() - 60 * 1000,
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          open.onerror = () => reject(open.error);
        }),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await expect(page.locator("#ag-resume-banner")).toBeHidden();
    await expect(
      page.getByLabel(/descreva o que você precisa criar/i),
    ).toBeEmpty();
    expect(await readStoredDrafts(page)).toEqual([]);
  });

  test("works without localStorage", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("localStorage denied");
        },
      });
    });
    const page = await context.newPage();
    if (!(await islandOrSkip(page))) {
      await context.close();
      return;
    }
    const draftId = await fillAndContinue(page, "Pedido sem localStorage");
    const rows = await readStoredDrafts(page);
    expect(rows.map((row) => row.id)).toContain(draftId);
    await context.close();
  });

  test("upgrade blocked by another tab surfaces guidance", async ({
    page,
    context,
  }) => {
    // The blocker tab holds a v1 connection from a page that never opens the
    // store itself, so the island's v2 upgrade in the main tab cannot proceed.
    const blocker = await context.newPage();
    await blocker.goto("/login", { waitUntil: "domcontentloaded" });
    await blocker.waitForLoadState("load");
    await blocker.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("adscale-public-drafts-v1", 1);
          open.onupgradeneeded = () => {
            if (!open.result.objectStoreNames.contains("drafts")) {
              open.result.createObjectStore("drafts", { keyPath: "id" });
            }
          };
          open.onsuccess = () => {
            (window as unknown as { __blockerDb: IDBDatabase }).__blockerDb =
              open.result;
            resolve();
          };
          open.onerror = () => reject(open.error);
        }),
    );
    if (!(await islandOrSkip(page))) {
      await blocker.close();
      return;
    }
    await page.getByLabel(/descreva o que você precisa criar/i).fill("Pedido com upgrade bloqueado");
    await page.getByRole("button", { name: /continuar/i }).first().click();
    await page.getByRole("button", { name: /entrar e continuar/i }).click();
    const alert = page.locator("#ag-dialog-error");
    await expect(alert).toContainText(/outras abas/i);
    await expect(alert).toContainText(/continuam nesta tela/i);
    await blocker.evaluate(() => {
      (window as unknown as { __blockerDb: IDBDatabase }).__blockerDb.close();
    });
    await blocker.close();
    // The retry button IS the authenticate action: one click re-saves and
    // navigates; there is no second "entrar e continuar" step (#446).
    await page.getByRole("button", { name: /tentar continuar novamente/i }).click();
    await page.waitForURL((url) => url.pathname !== "/hi", {
      timeout: 30_000,
    });
    expect(continuationGuestDraft(page)).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  test("database deleted elsewhere reopens without losing the typed text", async ({
    page,
    context,
  }) => {
    if (!(await islandOrSkip(page))) return;
    const text = "Pedido que sobrevive à exclusão do banco";
    await page.getByLabel(/descreva o que você precisa criar/i).fill(text);
    const other = await context.newPage();
    await other.goto("/login", { waitUntil: "domcontentloaded" });
    await other.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase("adscale-public-drafts-v1");
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          // A persistently blocked delete would pass vacuously; fail instead.
          request.onblocked = () =>
            setTimeout(() => reject(new Error("delete stayed blocked")), 5000);
        }),
    );
    await other.close();
    await page.getByRole("button", { name: /continuar/i }).first().click();
    await page.getByRole("button", { name: /entrar e continuar/i }).click();
    await page.waitForURL((url) => url.pathname !== "/hi", {
      timeout: 30_000,
    });
    expect(continuationGuestDraft(page)).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  test("fresh device holds zero drafts, never a fabricated restore", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    if (!(await islandOrSkip(page))) {
      await context.close();
      return;
    }
    expect(await readStoredDrafts(page)).toEqual([]);
    await expect(page.locator("#ag-resume-banner")).toBeHidden();
    await context.close();
  });
});
