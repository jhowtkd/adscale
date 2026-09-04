import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Native layer-editor visual/interaction contract.
 *
 * Seed first with `npm run seed:layer-editor-e2e`. The seed creates only
 * synthetic Sharp images and uses no image-generation provider. These tests
 * deliberately stay on the serial Playwright project because they persist a
 * lease and a saved revision on the same synthetic output.
 */
const FIXTURE_PATH = process.env.LAYER_EDITOR_E2E_FIXTURE_PATH
  ? path.resolve(process.env.LAYER_EDITOR_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../fixtures/layer-editor-e2e.json");

type LayerEditorFixture = {
  email: string;
  password: string;
  userId: string;
  workspaceId: string;
  workItemId: string;
  outputId: string;
  readyCandidateWorkItemId: string;
  readyCandidateOutputId: string;
  foreignLeaseWorkItemId: string;
  foreignLeaseOutputId: string;
  submissionUnknownWorkItemId: string;
  submissionUnknownOutputId: string;
};

function fixture(): LayerEditorFixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing layer editor E2E fixture. Run: npm run seed:layer-editor-e2e");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as LayerEditorFixture;
}

async function login(page: Page) {
  const seeded = fixture();
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email: seeded.email, password: seeded.password },
  });
  expect(response.ok(), `E2E login must succeed (got ${response.status()})`).toBeTruthy();
}

async function openEditor(page: Page, workItemId = fixture().workItemId) {
  await page.goto(`/?workId=${workItemId}`);
  await page.getByRole("button", { name: /^(Editar imagem|Edit image)$/ }).click();
  const dialog = page.getByRole("dialog", { name: "Editor de camadas" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("native layer editor", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!fs.existsSync(FIXTURE_PATH), "Run npm run seed:layer-editor-e2e with local DB/storage first.");
    await login(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    testInfo.setTimeout(60_000);
  });

  test("desktop saves rename, visibility, order, pointer geometry, undo, and redo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const dialog = await openEditor(page);
    await page.getByRole("button", { name: /Product|Produto sintético/ }).click();
    const name = page.getByRole("textbox", { name: "Nome da camada" });
    await name.fill("Produto sintético");
    await name.press("Enter");
    await page.getByRole("button", { name: /Ocultar Produto sintético/ }).click();
    await page.getByRole("button", { name: /Mostrar Produto sintético/ }).click();
    await page.getByRole("button", { name: "Trazer para frente" }).click();

    const selected = page.getByLabel("Camada selecionada");
    await selected.focus();
    await selected.press("ArrowRight");
    await selected.press("Shift+Alt+ArrowRight");
    await dialog.getByRole("button", { name: "Desfazer" }).click();
    await dialog.getByRole("button", { name: "Refazer" }).click();
    await page.waitForTimeout(800); // autosave debounce
    const persistedGeometry = await selected.boundingBox();
    if (!persistedGeometry) throw new Error("Edited layer geometry must be measurable");

    await expect(dialog).toHaveScreenshot("layer-editor-desktop.png", { animations: "disabled" });
    await page.reload();
    await expect(page.getByRole("button", { name: "Editar imagem" })).toBeVisible();
    await page.getByRole("button", { name: "Editar imagem" }).click();
    await page.getByRole("button", { name: "Produto sintético" }).click();
    await expect(page.getByRole("textbox", { name: "Nome da camada" })).toHaveValue("Produto sintético");
    const reloadedGeometry = await page.getByLabel("Camada selecionada").boundingBox();
    if (!reloadedGeometry) throw new Error("Reloaded layer geometry must be measurable");
    expect(reloadedGeometry.x).toBeCloseTo(persistedGeometry.x, 0);
    expect(reloadedGeometry.y).toBeCloseTo(persistedGeometry.y, 0);
    expect(reloadedGeometry.width).toBeCloseTo(persistedGeometry.width, 0);
    expect(reloadedGeometry.height).toBeCloseTo(persistedGeometry.height, 0);
  });

  test("tablet keeps 44px controls and supports touch geometry and reorder gestures", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1100 });
    const dialog = await openEditor(page);
    await page.getByRole("button", { name: /Product|Produto sintético/ }).click();
    const controls = [
      dialog.getByRole("button", { name: "Desfazer" }),
      dialog.getByRole("button", { name: "Refazer" }),
      dialog.getByRole("button", { name: "Exportar PNG" }),
      dialog.getByRole("button", { name: "Mais ações" }),
      dialog.getByRole("button", { name: "Criar nova variação" }),
      dialog.getByRole("button", { name: /Ocultar Product|Ocultar Produto sintético/ }),
      dialog.locator("[data-layer-order='0']").getByRole("button").first(),
    ];
    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const editorMutations: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "PATCH" || !request.url().includes("/api/creative-work/")) return;
      const body = request.postData() ?? "";
      if (body.includes("saveLayerEditor")) editorMutations.push(body);
    });

    const selected = page.getByLabel("Camada selecionada");
    const before = await selected.boundingBox();
    if (!before) throw new Error("Selected layer box must be measurable");
    await selected.dispatchEvent("pointerdown", { pointerId: 71, pointerType: "touch", clientX: before.x + 5, clientY: before.y + 5 });
    await selected.dispatchEvent("pointermove", { pointerId: 71, pointerType: "touch", clientX: before.x + 25, clientY: before.y + 15 });
    await selected.dispatchEvent("pointerup", { pointerId: 71, pointerType: "touch", clientX: before.x + 25, clientY: before.y + 15 });
    await page.waitForTimeout(800);

    const reorderHandle = page.getByRole("button", { name: /^(Reordenar|Reorder) / });
    const handleBox = await reorderHandle.boundingBox();
    const reorderTarget = page.locator("[data-layer-order]").nth(1);
    const targetBox = await reorderTarget.boundingBox();
    if (!handleBox || !targetBox) throw new Error("Layer reorder controls must be measurable");
    await reorderHandle.dispatchEvent("pointerdown", { pointerId: 72, pointerType: "touch", clientX: handleBox.x + 8, clientY: handleBox.y + 8 });
    await reorderHandle.dispatchEvent("pointermove", { pointerId: 72, pointerType: "touch", clientX: targetBox.x + 8, clientY: targetBox.y + targetBox.height / 2 });
    await expect(reorderTarget).toHaveAttribute("data-layer-drop-target", "true");
    await reorderHandle.dispatchEvent("pointerup", { pointerId: 72, pointerType: "touch", clientX: targetBox.x + 8, clientY: targetBox.y + targetBox.height / 2 });
    await page.waitForTimeout(800);
    expect(editorMutations.length).toBeGreaterThanOrEqual(2);
    await expect(dialog).toHaveScreenshot("layer-editor-tablet.png", { animations: "disabled" });
  });

  test("mobile is inspect/export only and sends no editor mutation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const mutations: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "PATCH" || !request.url().includes("/api/creative-work/")) return;
      const body = request.postData() ?? "";
      if (/saveLayerEditor|heartbeatLayerEditor|regenerateLayer|acceptLayerCandidate|discardLayerCandidate|publishLayerEditor/.test(body)) mutations.push(body);
    });
    const dialog = await openEditor(page);
    await expect(page.getByRole("button", { name: "Criar nova variação" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Nome da camada" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Exportar PNG" })).toBeEnabled();
    await page.getByRole("button", { name: /Product|Produto sintético/ }).click();
    await page.getByRole("button", { name: /Ocultar Product|Ocultar Produto sintético/ }).click();
    expect(mutations).toEqual([]);
    await expect(dialog).toHaveScreenshot("layer-editor-mobile-inspect.png", { animations: "disabled" });
  });

  test("shows a seeded ready candidate before immutable accept", async ({ page }) => {
    const seeded = fixture();
    const dialog = await openEditor(page, seeded.readyCandidateWorkItemId);
    await page.getByRole("button", { name: /Product|Produto sintético/ }).click();
    await expect(page.getByRole("img", { name: /Atual:/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Candidata:/ })).toBeVisible();
    await expect(dialog).toHaveScreenshot("layer-editor-candidate.png", { animations: "disabled" });
    await page.getByRole("button", { name: "Aceitar" }).click();
  });

  test("renders a foreign live lease as inspect-only", async ({ page }) => {
    const seeded = fixture();
    const lockAttempt = await page.request.patch(`/api/creative-work/${seeded.foreignLeaseWorkItemId}`, {
      data: { action: "openLayerEditor", outputId: seeded.foreignLeaseOutputId, mode: "edit" },
    });
    expect(lockAttempt.status()).toBe(409);
    await expect(lockAttempt.json()).resolves.toMatchObject({ code: "layer_editor_locked" });
    const dialog = await openEditor(page, seeded.foreignLeaseWorkItemId);
    await expect(page.getByRole("button", { name: "Criar nova variação" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Nome da camada" })).toHaveCount(0);
    await expect(dialog).toHaveScreenshot("layer-editor-read-only.png", { animations: "disabled" });
  });

  test("keeps editing available while exhausted regeneration quota disables only regeneration", async ({ page }) => {
    const dialog = await openEditor(page);
    await page.getByRole("button", { name: /Product|Produto sintético/ }).click();
    await expect(page.getByRole("button", { name: "Regenerar camada" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Criar nova variação" })).toBeEnabled();
    await expect(dialog).toHaveScreenshot("layer-editor-exhausted-quota.png", { animations: "disabled" });
  });

  test("renders submission_unknown as an explicit terminal reconciliation state", async ({ page }) => {
    const seeded = fixture();
    await openEditor(page, seeded.submissionUnknownWorkItemId);
    await page.getByRole("button", { name: /Product|Produto sintético/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: /envio precisa de reconciliação|submission requires reconciliation/i })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Editor de camadas" }).getByRole("button", { name: /Regenerar camada|Regenerate layer/ })).toBeDisabled();
  });

  test("publishes a child and returns to refreshed results", async ({ page }) => {
    const seeded = fixture();
    const before = await page.request.get(`/api/creative-work/${seeded.workItemId}`);
    expect(before.ok()).toBeTruthy();
    const beforeCount = ((await before.json()) as { outputs: unknown[] }).outputs.length;
    const dialog = await openEditor(page);

    await page.getByRole("button", { name: "Criar nova variação" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: /^(Editar|Visualizar) camadas$|^(Edit|View) layers$/ })).toBeVisible();
    await expect.poll(async () => {
      const response = await page.request.get(`/api/creative-work/${seeded.workItemId}`);
      return ((await response.json()) as { outputs: unknown[] }).outputs.length;
    }).toBe(beforeCount + 1);
  });
});
