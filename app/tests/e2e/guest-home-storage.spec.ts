import { expect, test, chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  guestDraftIdFromUrl,
  readGuestDraft,
} from "./support/guest-home";

test("salvar, ir ao login, voltar e retomar preserva texto e referências", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Anúncio de lançamento");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const draftId = guestDraftIdFromUrl(page.url());
  expect(draftId).not.toBeNull();

  // Native IndexedDB commit happened before navigation: assert from the stored copy.
  const stored = await readGuestDraft(page, draftId!);
  expect(stored?.request).toBe("Anúncio de lançamento");

  await page.goto("/hi");
  await expect(page.locator("#ag-resume-banner")).toContainText("pedido salvo");
  await page.locator('#ag-resume-banner [data-action="restore"]').click();
  await expect(page.getByLabel("Descreva o que você precisa criar")).toHaveValue("Anúncio de lançamento");
});

test("retry sem mudar o conteúdo mantém o mesmo UUID", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Pedido repetido");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const firstId = guestDraftIdFromUrl(page.url());
  const first = await readGuestDraft(page, firstId!);

  await page.goto("/hi");
  await page.locator('#ag-resume-banner [data-action="restore"]').click();
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const secondId = guestDraftIdFromUrl(page.url());
  expect(secondId).toBe(firstId);
  const second = await readGuestDraft(page, secondId!);
  expect(second?.expiresAt).toBe(first?.expiresAt);
});

test("edição depois de salvar gera outro UUID sem sobrescrever", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Versão um");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const firstId = guestDraftIdFromUrl(page.url())!;

  await page.goto("/hi");
  await page.locator('#ag-resume-banner [data-action="restore"]').click();
  await page.getByLabel("Descreva o que você precisa criar").fill("Versão dois");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const secondId = guestDraftIdFromUrl(page.url())!;
  expect(secondId).not.toBe(firstId);
  expect((await readGuestDraft(page, firstId))?.request).toBe("Versão um");
  expect((await readGuestDraft(page, secondId))?.request).toBe("Versão dois");
});

test("nova aba no mesmo contexto lê o snapshot salvo", async ({ context, page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Pedido entre abas");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);

  const second = await context.newPage();
  await second.goto("/hi");
  await expect(second.locator("#ag-resume-banner")).toContainText("pedido salvo");
  await second.locator('#ag-resume-banner [data-action="restore"]').click();
  await expect(second.getByLabel("Descreva o que você precisa criar")).toHaveValue("Pedido entre abas");
});

test("outro perfil recebe estado indisponível honesto", async ({ browser }) => {
  const first = await browser.newContext();
  const page = await first.newPage();
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Só neste perfil");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const draftId = guestDraftIdFromUrl(page.url())!;
  await first.close();

  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto("/hi");
  await expect(other.locator("#ag-resume-banner")).toBeHidden();
  expect(await readGuestDraft(other, draftId)).toBeNull();
  await second.close();
});

test("snapshot vencido é recusado sem renovar", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Pedido vencido");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const draftId = guestDraftIdFromUrl(page.url())!;

  // Setup only: expire the snapshot, then reload and interact for real.
  await page.evaluate(({ id }) => {
    const open = indexedDB.open("adscale-public-drafts-v1", 2);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("drafts", "readwrite");
      const get = tx.objectStore("drafts").get(id);
      get.onsuccess = () => {
        const draft = get.result;
        draft.expiresAt = Date.now() - 1000;
        tx.objectStore("drafts").put(draft);
      };
      tx.oncomplete = () => db.close();
    };
  }, { id: draftId });
  await page.waitForFunction(
    ({ id }) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("adscale-public-drafts-v1", 2);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction("drafts", "readonly").objectStore("drafts").get(id);
          get.onsuccess = () => {
            db.close();
            resolve(get.result.expiresAt < Date.now());
          };
        };
      }),
    { id: draftId }
  );

  await page.goto("/hi");
  await expect(page.locator("#ag-resume-banner")).toBeHidden();
});

test("upgrade v1 para v2 preserva o pedido salvo", async ({ page }) => {
  const legacyId = "b0000000-0000-4000-8000-000000000001";
  await page.goto("/hi");
  await page.evaluate(({ id }) => new Promise<void>((resolve, reject) => {
    const del = indexedDB.deleteDatabase("adscale-public-drafts-v1");
    del.onsuccess = () => {
      const open = indexedDB.open("adscale-public-drafts-v1", 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore("drafts", { keyPath: "id" });
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("drafts", "readwrite");
        const createdAt = Date.now() - 1000;
        tx.objectStore("drafts").put({
          version: 1,
          id,
          request: "Pedido legado v1",
          intent: "single",
          exampleId: null,
          files: [],
          createdAt,
          expiresAt: createdAt + 24 * 60 * 60 * 1000,
        });
        tx.oncomplete = () => {
          db.close();
          localStorage.setItem("adscale:guest:last-draft:v1", id);
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    };
    del.onerror = () => reject(del.error);
  }), { id: legacyId });

  await page.goto("/hi");
  await expect(page.locator("#ag-resume-banner")).toContainText("pedido salvo");
  await page.locator('#ag-resume-banner [data-action="restore"]').click();
  await expect(page.getByLabel("Descreva o que você precisa criar")).toHaveValue("Pedido legado v1");
  const stores = await page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const open = indexedDB.open("adscale-public-drafts-v1", 2);
    open.onsuccess = () => {
      const names = [...open.result.objectStoreNames];
      open.result.close();
      resolve(names);
    };
    open.onerror = () => reject(open.error);
  }));
  expect(stores).toContain("importReceipts");
  expect(await readGuestDraft(page, legacyId)).not.toBeNull();
});

test("sem IndexedDB a página não quebra e nada finge sucesso", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/hi");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("sua marca");
  await page.getByLabel("Descreva o que você precisa criar").fill("Pedido sem armazenamento");
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("#ag-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForTimeout(1500);
  expect(page.url()).toContain("/hi");
  expect(await page.getByLabel("Descreva o que você precisa criar").inputValue())
    .toBe("Pedido sem armazenamento");
  expect(errors).toEqual([]);
  await context.close();
});

test("cota esgotada mostra erro honesto sem perder o texto", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name.includes("webkit"), "CDP quota override é Chromium-only");
  const cdp = await context.newCDPSession(page);
  const origin = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").origin;
  try {
    await cdp.send("Storage.overrideQuotaForOrigin", { origin, quotaSize: 1024 });
  } catch {
    test.skip(true, "CDP sem overrideQuotaForOrigin neste Chromium");
  }
  try {
    await page.goto("/hi");
    await page.getByLabel("Descreva o que você precisa criar").fill("Pedido sem cota de disco");
    await page.locator('[data-action="continue"]').click();
    await page.getByRole("button", { name: "Entrar e continuar" }).click();
    await expect(page.locator("#ag-dialog-error")).toContainText("continuam nesta tela");
    await expect(page.getByRole("button", { name: "Tentar continuar novamente" })).toBeVisible();
    expect(page.url()).toContain("/hi");
    expect(await page.getByLabel("Descreva o que você precisa criar").inputValue())
      .toBe("Pedido sem cota de disco");
  } finally {
    await cdp.send("Storage.overrideQuotaForOrigin", { origin, quotaSize: 1_000_000_000 })
      .catch(() => undefined);
  }
});

test("perfil persistente sobrevive a fechar e reabrir o navegador", async ({}, testInfo) => {
  test.skip(testInfo.project.name.includes("webkit"), "launchPersistentContext é Chromium-only");
  const userDataDir = mkdtempSync(join(tmpdir(), "guest-home-persist-"));
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const first = await chromium.launchPersistentContext(userDataDir, { baseURL: baseUrl });
  const page = first.pages()[0] ?? (await first.newPage());
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Pedido persistente");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  await first.close();

  const second = await chromium.launchPersistentContext(userDataDir, { baseURL: baseUrl });
  const resumed = second.pages()[0] ?? (await second.newPage());
  await resumed.goto("/hi");
  await expect(resumed.locator("#ag-resume-banner")).toContainText("pedido salvo");
  await resumed.locator('#ag-resume-banner [data-action="restore"]').click();
  await expect(resumed.getByLabel("Descreva o que você precisa criar")).toHaveValue("Pedido persistente");
  await second.close();
});

test("anexo fica local até a confirmação; quarto arquivo rejeitado sem descartar válidos", async ({ page }) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\//.test(new URL(request.url()).pathname)) {
      uploads.push(new URL(request.url()).pathname);
    }
  });
  await page.goto("/hi");
  const attachInput = page.locator("#ag-file-input");
  await expect(attachInput).toBeAttached();
  const files = [0, 1, 2].map(
    (index) => ({
      name: `ref-${index}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(`fake-png-bytes-${index}`),
    })
  );
  await attachInput.setInputFiles(files);
  await expect(page.locator("#ag-files")).toContainText("ref-0.png");
  await attachInput.setInputFiles([
    ...files,
    { name: "ref-3.png", mimeType: "image/png", buffer: Buffer.from("fake-png-bytes-3") },
  ]);
  await expect(page.locator("#ag-files")).toContainText("ref-2.png");
  await expect(page.locator("#ag-files")).not.toContainText("ref-3.png");
  expect(uploads).toEqual([]);
});
