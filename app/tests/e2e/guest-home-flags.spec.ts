import { expect, test, chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { VISUAL_EMAIL } from "./support/visual-auth";
import { guestDraftIdFromUrl, loginOnCurrentPage } from "./support/guest-home";

/**
 * Flag-transition evidence (F09/D03/D04). Each phase runs against a
 * differently-flagged server sharing one persistent profile:
 *   GUEST_FLAGS_PHASE=save     HOME=true  IMPORT=true  ATTACHMENTS=true
 *   GUEST_FLAGS_PHASE=off       HOME=true  IMPORT=true  ATTACHMENTS=false (F09)
 *   GUEST_FLAGS_PHASE=rollback  HOME=false IMPORT=true  ATTACHMENTS=false (D03)
 *   GUEST_FLAGS_PHASE=contain   HOME=false IMPORT=false ATTACHMENTS=false (D04)
 * Without GUEST_FLAGS_PHASE every test skips.
 */
const PHASE = process.env.GUEST_FLAGS_PHASE ?? "";
const PROFILE_DIR = process.env.GUEST_FLAGS_PROFILE ?? "/tmp/guest-home-flags-profile";
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test.beforeEach(() => {
  test.skip(!PHASE, "flag-phase run only");
});

async function openProfile() {
  mkdirSync(PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { baseURL: BASE_URL });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

test("save: pedido com arquivos e sessão persistidos", async () => {
  test.skip(PHASE !== "save", "phase=save only");
  const { context, page } = await openProfile();
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Pedido entre flags");
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  await page.locator("#ag-file-input").setInputFiles([
    { name: "entre-flags.png", mimeType: "image/png", buffer: tinyPng },
  ]);
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const entryPath = new URL(page.url()).searchParams.get("callbackUrl")!;
  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL(/guestDraft=/, { timeout: 45_000 });
  const draftId = guestDraftIdFromUrl(page.url())!;
  process.stdout.write(`\nSAVED_DRAFT_ID=${draftId}\nENTRY_PATH=${entryPath}\n`);
  await context.close();
});

test("F09: anexos desligados mantêm arquivos com aviso honesto", async () => {
  test.skip(PHASE !== "off", "phase=off only");
  const { context, page } = await openProfile();
  await page.goto("/hi");
  await expect(page.locator("#ag-resume-banner")).toContainText("desligado");
  expect(await page.locator("#ag-file-input").count()).toBe(0);
  await page.locator('#ag-resume-banner [data-action="restore"]').click();
  await expect(page.getByLabel("Descreva o que você precisa criar")).toHaveValue("Pedido entre flags");
  await expect(page.locator("#ag-files")).toContainText("entre-flags.png");
  await context.close();
});

test("D03: rollback conclui pedido pendente existente", async () => {
  test.skip(PHASE !== "rollback", "phase=rollback only");
  const draftId = process.env.GUEST_FLAGS_DRAFT_ID!;
  const { context, page } = await openProfile();
  await page.goto(`/hi`);
  await expect(page.locator("[data-public-home-mode='fallback']")).toBeVisible();
  await page.goto(`/?guestDraft=${draftId}&compose=1`);
  await expect(page.getByText("Pedido entre flags").first()).toBeVisible({ timeout: 30_000 });
  const confirm = page.getByRole("button", { name: "Usar este pedido" });
  if (await confirm.isDisabled().catch(() => false)) {
    await page.getByRole("button", { name: "Marca ativa" }).click();
    await page.getByRole("menuitem", { name: "VF Example Brand Kit", exact: true }).click();
  }
  await confirm.click();
  // The draft carries a file while attachments are off: no silent
  // text-only import — the rollback completes through explicit choice.
  await expect(page.getByText("Os anexos estão desligados.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Importar só o texto" }).click();
  await page.waitForURL(/workId=/, { timeout: 60_000 });
  await context.close();
});

test("D04: contenção sem mutações nem exclusão de recuperação", async () => {
  test.skip(PHASE !== "contain", "phase=contain only");
  const draftId = process.env.GUEST_FLAGS_DRAFT_ID!;
  const { context, page } = await openProfile();
  const mutations: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() !== "GET" && url.pathname.startsWith("/api/")) {
      mutations.push(`${request.method()} ${url.pathname}`);
    }
  });
  await page.goto(`/?guestDraft=${draftId}&compose=1`);
  await expect(page.getByText("Pedido entre flags").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /copiar|descartar/i }).first()).toBeVisible();
  await page.waitForTimeout(2000);
  expect(mutations.filter((entry) => entry.includes("/api/creative-work"))).toEqual([]);
  await context.close();
});
