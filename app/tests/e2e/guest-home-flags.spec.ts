import { expect, test, chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { VISUAL_EMAIL } from "./support/visual-auth";
import { loginOnCurrentPage } from "./support/guest-home";

/**
 * Flag-transition evidence (F09). Each phase runs against a differently-flagged server sharing one persistent profile:
 *   GUEST_FLAGS_PHASE=save  HOME=true  IMPORT=true  ATTACHMENTS=true
 *   GUEST_FLAGS_PHASE=off   HOME=true  IMPORT=true  ATTACHMENTS=false (F09)
 * The rollback (HOME=false) and containment (IMPORT=false) phases (D03/D04) are gone with the guest import at `/`: the
 * guest's draft is not reconnected after the sign-up (spec 2026-10-07 §4), so no flag changes what `/` does with it.
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
  // The plain login entry: no draft id and no query in the URL; after the login the person lands on `/`.
  await page.waitForURL((url) => url.pathname === "/login");
  expect(new URL(page.url()).search).toBe("");
  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL((url) => url.pathname === "/" && url.search === "", { timeout: 45_000 });
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
