import { expect, test } from "@playwright/test";
import { seedVisualManifest, VISUAL_EMAIL } from "./support/visual-auth";
import { lastGuestDraftId, loginOnCurrentPage } from "./support/guest-home";

/**
 * Spec 2026-10-07 §4 (caminho único, etapa 3): the guest's draft is not reconnected after the sign-up. "Entrar e
 * continuar" goes to the plain login entry (no draft id, no query), the person lands on `/` (the conversation, like
 * anyone else), and an old `?guestDraft=` link neither shows the old entry ("Usar este pedido") nor its conflict
 * banner. The draft itself stays saved in the guest's browser for 24 hours (guest-home-storage.spec.ts). The import
 * API is exercised by its own unit tests.
 */

test.beforeAll(() => {
  seedVisualManifest();
});

test("the guest's draft is not carried into the sign-in: login lands on the conversation without it", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Anúncio de lançamento");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
  expect(new URL(page.url()).search).toBe("");
  // Saved in this browser, not in the URL.
  expect(await lastGuestDraftId(page)).not.toBeNull();

  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL((url) => url.pathname === "/" && url.search === "", { timeout: 45_000 });
  await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByRole("button", { name: "Usar este pedido" })).toHaveCount(0);
  await expect(page.getByText("Anúncio de lançamento")).toHaveCount(0);
});

test("a guestDraft/workId link goes to the composer with the work and no old conflict banner", async ({ page }) => {
  await page.goto("/login");
  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });

  // The old composer link at `/` goes to the composer with its composer query; guestDraft is not a composer key.
  await page.goto(
    "/?guestDraft=aa111111-1111-4111-8111-111111111111&workId=99000000-0000-4000-8000-000000000009&compose=1",
  );
  await page.waitForURL((url) => url.pathname === "/creative-work/new", { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.has("guestDraft")).toBe(false);
  await expect(page.getByTestId("studio-talk-box")).toBeVisible({ timeout: 30_000 });

  await expect(
    page.getByText("Você tem um trabalho aberto e um pedido da página inicial."),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Abrir o trabalho existente" })).toHaveCount(0);
});
