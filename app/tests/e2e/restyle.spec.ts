import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import {
  gotoApp,
  loadPhase6Fixture,
  openAuthedPage,
} from "./support/phase6-uat-auth";

/**
 * TC014 — Restyle creative input into a new variation
 * TC019 — Restyle creative content and review the result
 *
 * These are the two cases the TestSprite cloud runner cannot execute, because
 * they require attaching real image files to <input type="file">. Local
 * Playwright can do this via setInputFiles, so we close the 2/30 gap here.
 *
 * Restyle lives in the composer: `/restyling` only redirects to
 * `/creative-work/new?intent=restyle` (composer-address.spec.ts covers that).
 *
 * Requires the same environment as phase6-gate6-uat.spec.ts: an optimized build
 * with E2E_DISABLE_RATE_LIMIT=true and E2E_CONTROLLED_PROVIDER=true, the Inngest
 * dev server, and `npm run seed:phase6-uat`.
 */

const FIXTURES = path.resolve(__dirname, "../fixtures");
const BASE_IMAGE = path.join(FIXTURES, "base.png");
const STYLE_IMAGE = path.join(FIXTURES, "style.png");

const RESTYLE_REQUEST = "Copie o estilo da referência para a minha arte.";

interface WorkOutputDTO {
  id: string;
  status: string;
  hasOutput?: boolean;
}

/**
 * Drives the restyle composer: attaches the original art + style reference,
 * confirms the plan and waits for the generate request.
 * Returns the creative work id parsed from the URL.
 */
async function submitRestyle(page: Page): Promise<string> {
  const fixture = loadPhase6Fixture();
  await page.addInitScript((activeClientProfileId) => {
    localStorage.setItem("adscale-storage", JSON.stringify({
      state: { sidebarCollapsed: false, activeClientProfileId }, version: 0,
    }));
  }, fixture.clientProfileId);
  await gotoApp(page, "/creative-work/new?intent=restyle");
  // The brand switcher only carries the brand name after hydration, so the
  // file inputs below already have their change handlers.
  await expect(page.locator('[data-testid="rail-brand-switcher"]:visible'))
    .toHaveAttribute("title", "Phase6 UAT Brand", { timeout: 30_000 });

  await page.locator("#creative-composer-file").setInputFiles(BASE_IMAGE);
  await expect
    .poll(
      () => new URL(page.url()).searchParams.get("workId"),
      { timeout: 60_000, intervals: [250, 500, 1_000] }
    )
    .toBeTruthy();
  const workId = new URL(page.url()).searchParams.get("workId")!;
  // The composer refuses a new file while another one is still uploading.
  const ready = page.getByRole("status").filter({ hasText: /imagem pronta|image ready/i });
  await expect(ready).toHaveCount(1, { timeout: 60_000 });
  await page.locator("#creative-composer-style-file").setInputFiles(STYLE_IMAGE);
  await expect(ready).toHaveCount(2, { timeout: 60_000 });

  await page
    .getByRole("textbox", { name: /pedido criativo|creative request/i })
    .fill(RESTYLE_REQUEST);
  const generate = page.getByTestId("studio-talk-box").locator(".talk-generate");
  await expect(generate).toBeEnabled({ timeout: 60_000 });
  await generate.click();
  await expect(page.getByRole("heading", { name: /revise seu plano|review your plan/i }))
    .toBeVisible({ timeout: 60_000 });

  const generated = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/creative-work/${workId}/generate`) &&
      response.request().method() === "POST",
    { timeout: 30_000 }
  );
  await page.getByRole("button", { name: /confirmar e gerar|confirm and generate/i }).click();
  const response = await generated;
  expect(response.ok(), `generate HTTP ${response.status()}`).toBeTruthy();
  return workId;
}

/** Polls the work until its single restyle output completes. */
async function waitForCompletedOutput(
  context: BrowserContext,
  workId: string
): Promise<WorkOutputDTO> {
  let outputs: WorkOutputDTO[] = [];
  await expect
    .poll(
      async () => {
        const response = await context.request.get(`/api/creative-work/${workId}`);
        if (!response.ok()) return "request_failed";
        outputs = ((await response.json()) as { outputs?: WorkOutputDTO[] }).outputs ?? [];
        return outputs.map((output) => output.status).join(",");
      },
      { timeout: 200_000, intervals: [1_000, 2_000, 4_000] }
    )
    .toBe("completed");
  return outputs[0];
}

test.describe("Restyle flows (local Playwright — covers TestSprite TC014 + TC019)", () => {
  test("TC014 — restyle creative input produces a new completed variation", async ({
    browser,
  }) => {
    const { context, page } = await openAuthedPage(browser);
    try {
      const workId = await submitRestyle(page);
      const completed = await waitForCompletedOutput(context, workId);
      expect(
        completed.hasOutput,
        "completed variation should have an output image"
      ).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("TC019 — restyle and review the generated result", async ({ browser }) => {
    const { context, page } = await openAuthedPage(browser);
    try {
      const workId = await submitRestyle(page);
      const completed = await waitForCompletedOutput(context, workId);

      // Reload the work so the completed variation renders from the server.
      await gotoApp(page, `/?workId=${workId}`);

      const card = page.locator(
        '[data-testid="proposal-level"][data-status="completed"]'
      );
      await expect(card).toHaveCount(1, { timeout: 30_000 });
      const image = page.getByRole("img", { name: /^(proposta|proposal) .+, (formato|format) /i });
      await expect(image).toHaveAttribute("src", new RegExp(`/outputs/${completed.id}/`), {
        timeout: 30_000,
      });
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
      await expect(card.getByRole("button", { name: /aprovar|approve/i })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
