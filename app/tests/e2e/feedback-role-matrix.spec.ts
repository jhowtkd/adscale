import { expect, test } from "@playwright/test";
import {
  loginVisualIdentity,
  seedVisualManifest,
  type VisualManifest,
} from "./support/visual-auth";

test.describe("feedback platform-owner role matrix", () => {
  let manifest: VisualManifest;

  test.beforeAll(() => {
    manifest = seedVisualManifest();
  });

  test("allows the platform owner on both the direct page and API", async ({ page }) => {
    await loginVisualIdentity(page, manifest.roleMatrix.platformOwner.email);

    const access = await page.request.get("/api/feedback/reports?access=1");
    expect(access.status()).toBe(200);
    await expect(access.json()).resolves.toEqual({ allowed: true });

    await page.goto("/feedback", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/feedback$/);
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(4);
  });

  for (const [role, identityKey] of [
    ["workspace admin", "workspaceAdmin"],
    ["workspace member", "workspaceMember"],
  ] as const) {
    test(`rejects a ${role} on both the direct page and API`, async ({ page }) => {
      await loginVisualIdentity(page, manifest.roleMatrix[identityKey].email);

      const access = await page.request.get("/api/feedback/reports?access=1");
      expect(access.status()).toBe(403);

      await page.goto("/feedback", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/campaigns$/);
      await expect(page.getByRole("tablist")).toHaveCount(0);
    });
  }
});
