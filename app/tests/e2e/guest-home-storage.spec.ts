import { expect, test } from "@playwright/test";
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
