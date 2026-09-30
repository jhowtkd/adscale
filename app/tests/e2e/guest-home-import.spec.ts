import { expect, test } from "@playwright/test";
import { seedVisualManifest, VISUAL_EMAIL } from "./support/visual-auth";
import { guestDraftIdFromUrl, loginOnCurrentPage } from "./support/guest-home";

/**
 * Ticket 03: the old guest-draft entry (`GuestStudioEntry`, "Usar este
 * pedido") no longer renders at `/` — the `?guest=`/`?guestDraft=` branch was
 * removed. `/` now always falls back to the normal home: the old Studio
 * composer while the Equipe gate is off (the default here), or the home
 * conversation while it is on — that gate-on path, including that guest
 * params resolve to the same primary account/thread, is covered by
 * `home-conversation-assistant.spec.ts` against the dedicated gate-on server.
 * The import API itself is exercised by its own unit tests, unaffected by
 * this UI removal.
 */

test.beforeAll(() => {
  seedVisualManifest();
});

test("guestDraft on the URL no longer shows the old entry; login lands on the normal home ignoring the draft", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Anúncio de lançamento");
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Entrar e continuar" }).click();
  await page.waitForURL(/\/login\?callbackUrl=/);
  const draftId = guestDraftIdFromUrl(page.url());
  expect(draftId).not.toBeNull();

  await loginOnCurrentPage(page, VISUAL_EMAIL);
  // The redirect target still carries guestDraft (the callback itself is
  // unrelated to this ticket) — but the home route now ignores it.
  await page.waitForURL((url) => url.searchParams.get("guestDraft") === draftId, { timeout: 45_000 });
  await expect(page.locator('#creative-composer-request, [data-testid="assistant-chat-input"]')).toBeVisible();

  await expect(page.getByRole("button", { name: "Usar este pedido" })).toHaveCount(0);
  await expect(page.getByText("Anúncio de lançamento")).toHaveCount(0);
});

test("a guestDraft/workId conflict no longer shows the old conflict banner", async ({ page }) => {
  await page.goto("/login");
  await loginOnCurrentPage(page, VISUAL_EMAIL);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });

  await page.goto(
    "/?guestDraft=aa111111-1111-4111-8111-111111111111&workId=99000000-0000-4000-8000-000000000009&compose=1",
  );
  await expect(page.locator('#creative-composer-request, [data-testid="assistant-chat-input"]')).toBeVisible();

  await expect(
    page.getByText("Você tem um trabalho aberto e um pedido da página inicial."),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Abrir o trabalho existente" })).toHaveCount(0);
});
