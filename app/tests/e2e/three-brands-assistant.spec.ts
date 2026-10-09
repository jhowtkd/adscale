import { expect, test } from "@playwright/test";
import { ensureIdentity, loginAs, openPilotHome, THREE_BRANDS_EMAIL, withDb, workspaceOf } from "./support/pilot-home";

/**
 * Spec 2026-10-07 §5: three brands, each with its own conversation and Library. A workspace that pays (tester access, by
 * SQL) opens one account per brand on its first visit; brands with a Brand Kit enter by import, with a new conversation.
 */

// The sign-up creates no brand (a free workspace gets "Minha marca" when it opens its account; this one pays and already has
// its three): these are the workspace's brands. Two have a Brand Kit (they enter by import), one does not (it goes through
// the handoff); each still gets its own account and main conversation.
const BRANDS = [
  { name: "Livraria Norte", colors: ["#2B4C7E"] },
  { name: "Studio Lume", colors: ["#C9A227"] },
  { name: "Café Aurora", colors: [] },
] as const;

test.describe("three brands, three conversations", () => {
  let workspaceId: string;

  test.beforeAll(async () => {
    await ensureIdentity(THREE_BRANDS_EMAIL, "Três Marcas E2E");
    workspaceId = await workspaceOf(THREE_BRANDS_EMAIL);
    await withDb(async (db) => {
      await db.query(
        `insert into adscale_app.workspace_entitlements (workspace_id, kind, status)
         select $1, 'tester', 'active' where not exists (
           select 1 from adscale_app.workspace_entitlements where workspace_id = $1 and kind = 'tester' and status = 'active')`,
        [workspaceId],
      );
      for (const brand of BRANDS) {
        await db.query(
          `insert into adscale_app.client_profiles (workspace_id, name, brand_colors)
           select $1, $2, $3::jsonb where not exists (select 1 from adscale_app.client_profiles where workspace_id = $1 and name = $2)`,
          [workspaceId, brand.name, JSON.stringify(brand.colors)],
        );
      }
    });
  });

  test("each brand opens its own account and conversation, and the rail follows the brand", async ({ page }) => {
    await loginAs(page, THREE_BRANDS_EMAIL);
    await openPilotHome(page);
    // The rail's control on a desktop window, the top bar's on a phone: the one on screen.
    const switcher = page.locator('[data-testid="rail-brand-switcher"]:visible');
    for (const { name } of BRANDS) {
      await switcher.click();
      await page.getByTestId("rail-brand-option").filter({ hasText: name }).click();
      await expect(page).toHaveURL(/\/$/);
      // The rail shows the brand's monogram; its name is in the control's accessible name.
      await expect(page.getByRole("button", { name: `Marca ativa: ${name}. Trocar marca` })).toBeVisible();
      await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("assistant-chat-input")).toBeVisible({ timeout: 30_000 });
      // The account opens on the server while the page renders: wait for it instead of assuming the order of the stream.
      await expect.poll(() => withDb(async (db) => (await db.query(
        `select 1 from adscale_equipe.equipe_accounts a join adscale_app.client_profiles p on p.id = a.client_profile_id
          where a.workspace_id = $1 and p.name = $2`, [workspaceId, name])).rowCount), { timeout: 30_000 }).toBe(1);
    }
    const accounts = await withDb(async (db) => (await db.query<{ client_profile_id: string; thread: string }>(
      `select a.client_profile_id, t.assistant_thread_id as thread from adscale_equipe.equipe_accounts a
         join adscale_equipe.equipe_threads t on t.account_id = a.id and t.kind = 'primary' where a.workspace_id = $1`,
      [workspaceId],
    )).rows);
    expect(new Set(accounts.map((row) => row.client_profile_id)).size).toBe(accounts.length);
    expect(new Set(accounts.map((row) => row.thread)).size).toBe(accounts.length);
    expect(accounts.length).toBe(BRANDS.length);
  });

  test("the Library asks for the active brand only", async ({ page }) => {
    await loginAs(page, THREE_BRANDS_EMAIL);
    await openPilotHome(page);
    const brandId = await withDb(async (db) => (await db.query<{ id: string }>(
      `select id from adscale_app.client_profiles where workspace_id = $1 and name = $2`, [workspaceId, BRANDS[1].name],
    )).rows[0]!.id);
    await page.context().addCookies([{ name: "adscale_active_brand", value: brandId, url: process.env.E2E_BASE_URL ?? "http://localhost:3000" }]);
    const assetsRequest = page.waitForRequest((request) => request.url().includes("/api/workspace/assets"));
    await page.goto("/library");
    expect(new URL((await assetsRequest).url()).searchParams.get("clientProfileId")).toBe(brandId);
  });
});
