import { test, expect, type Page, type APIResponse } from "@playwright/test";
import path from "node:path";

/**
 * TC014 — Restyle creative input into a new variation
 * TC019 — Restyle creative content and review the result
 *
 * These are the two cases the TestSprite cloud runner cannot execute, because
 * they require attaching real image files to <input type="file">. Local
 * Playwright can do this via setInputFiles, so we close the 2/30 gap here.
 *
 * Requires the app running on http://localhost:3000 (npm run start) with
 * E2E_DISABLE_RATE_LIMIT=true and the Inngest dev server up so the async
 * gpt-image generation job actually runs.
 */

const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";

const FIXTURES = path.resolve(__dirname, "../fixtures");
const BASE_IMAGE = path.join(FIXTURES, "base.png");
const STYLE_IMAGE = path.join(FIXTURES, "style.png");

const CAMPAIGN_URL_RE =
  /\/campaigns\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Locale-resilient placeholders/labels (app renders en by default, pt-BR via cookie).
const NAME_PLACEHOLDER = /(Summer 2026|Verão 2026)/;
const SUBMIT_LABEL = /(Start Restyling|Iniciar Restilização)/;
const PREVIEW_LABEL = /^(Preview|Visualizar)/i;

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  // Locale-proof: submit the form that contains the email field.
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

/**
 * Drives the restyle form: attaches base + style images, names the campaign,
 * submits, and waits for the redirect to the new campaign workspace.
 * Returns the new campaignId parsed from the URL.
 */
async function submitRestyle(page: Page, name: string): Promise<string> {
  await page.goto("/restyling");

  const fileInputs = page.locator('input[aria-label="Upload creative file"]');
  await expect(fileInputs).toHaveCount(2);

  // Each upload unmounts its <input> once a file is set, which would reindex a
  // live locator. Capture both element handles up front so setting the base
  // image doesn't invalidate the style input reference.
  const [baseInput, styleInput] = await fileInputs.elementHandles();
  await baseInput.setInputFiles(BASE_IMAGE);
  await styleInput.setInputFiles(STYLE_IMAGE);

  // The upload component swaps to a preview showing the file name once accepted.
  await expect(page.getByText("base.png").first()).toBeVisible();
  await expect(page.getByText("style.png").first()).toBeVisible();

  await page.getByPlaceholder(NAME_PLACEHOLDER).fill(name);

  // NB: once both files are attached, the file inputs unmount (replaced by
  // previews), so the submit button can't be scoped via the inputs. Match it
  // directly by its accessible name.
  await page.getByRole("button", { name: SUBMIT_LABEL }).click();

  // Success returns redirectUrl=/campaigns/{id}; a toast appears only on error.
  await page.waitForURL(CAMPAIGN_URL_RE, { timeout: 30_000 });

  return page.url().split("/campaigns/")[1].split(/[/?#]/)[0];
}

interface DerivationDTO {
  id: string;
  status: string;
  imageUrl: string | null;
  outputKey: string | null;
}

async function getDerivations(
  page: Page,
  campaignId: string
): Promise<DerivationDTO[]> {
  const res: APIResponse = await page.request.get(
    `/api/campaigns/${campaignId}/derivations`
  );
  expect(
    res.ok(),
    `derivations API should respond OK (got ${res.status()})`
  ).toBeTruthy();
  const body = (await res.json()) as { derivations: DerivationDTO[] };
  return body.derivations ?? [];
}

/** Polls the derivations API until the (single) restyle derivation completes. */
async function waitForCompletedDerivation(
  page: Page,
  campaignId: string,
  timeoutMs = 200_000
): Promise<DerivationDTO> {
  const start = Date.now();
  let last: DerivationDTO[] = [];
  while (Date.now() - start < timeoutMs) {
    last = await getDerivations(page, campaignId);
    const failed = last.find((d) => d.status === "failed");
    expect(
      failed,
      `derivation generation failed: ${JSON.stringify(failed)}`
    ).toBeUndefined();

    const done = last.find((d) => d.status === "completed" && !!d.imageUrl);
    if (done) return done;

    await page.waitForTimeout(4_000);
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for a completed derivation. Last: ${JSON.stringify(last)}`
  );
}

test.describe("Restyle flows (local Playwright — covers TestSprite TC014 + TC019)", () => {
  test.beforeEach(async ({ context, page }) => {
    // Deterministic locale + skip the cookie banner overlay so it never
    // intercepts the submit button.
    await context.addCookies([
      { name: "locale", value: "en", url: "http://localhost:3000" },
    ]);
    await context.addInitScript(() => {
      try {
        localStorage.setItem(
          "adscale_cookie_consent",
          JSON.stringify({ necessary: true, analytics: false, marketing: false })
        );
      } catch {
        /* ignore */
      }
    });
    await login(page);
  });

  test("TC014 — restyle creative input produces a new completed variation", async ({
    page,
  }) => {
    const campaignId = await submitRestyle(page, "E2E Restyle TC014");

    // A brand-new campaign workspace was created from the uploaded images.
    expect(campaignId).toMatch(UUID_RE);

    // At least one derivation (the new variation) exists for the campaign...
    const initial = await getDerivations(page, campaignId);
    expect(
      initial.length,
      "a new variation should be queued"
    ).toBeGreaterThanOrEqual(1);

    // ...and it generates a real output via the Inngest + OpenAI pipeline.
    const completed = await waitForCompletedDerivation(page, campaignId);
    expect(
      completed.imageUrl,
      "completed variation should have an output image"
    ).toBeTruthy();
  });

  test("TC019 — restyle and review the generated result", async ({ page }) => {
    const campaignId = await submitRestyle(page, "E2E Restyle TC019");

    const completed = await waitForCompletedDerivation(page, campaignId);
    expect(completed.imageUrl).toBeTruthy();

    // Reload the workspace so the completed variation renders in the grid.
    await page.goto(`/campaigns/${campaignId}`);

    // The generated creative is shown and is reviewable (preview opens a dialog).
    const previewButton = page.getByRole("button", { name: PREVIEW_LABEL }).first();
    await expect(previewButton).toBeVisible({ timeout: 30_000 });
    await previewButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("img").first()).toBeVisible();
  });
});
