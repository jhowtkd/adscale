import { expect, test } from "@playwright/test";
import { loginGuidedJourney, mockClientProfiles } from "./support/guided-auth";
import {
  ITERATION_THREAD_ID,
  mockIterativeCopilotThread,
} from "./support/iterative-copilot-mocks";

/**
 * v13.9 iterative copilot loop — mobile viewport.
 * Same flow as desktop via the context tab with route mocks only.
 */

test.describe("iterative copilot loop mobile", () => {
  test.beforeEach(async ({ page }) => {
    await mockClientProfiles(page);
    await mockIterativeCopilotThread(page);
    await loginGuidedJourney(page);
  });

  test("shows version history and opens comparison dialog with Portuguese copy", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/assistant?threadId=${ITERATION_THREAD_ID}`);

    await page.getByRole("button", { name: "Contexto" }).click();

    const contextPanel = page.getByTestId("assistant-mobile-context");
    await expect(contextPanel).toBeVisible({ timeout: 15_000 });

    const versionHistory = contextPanel.getByTestId("version-history");
    await expect(versionHistory).toBeVisible();
    await expect(versionHistory.getByText("Histórico de versões")).toBeVisible();

    await versionHistory
      .getByRole("button", { name: "Comparar oficial e versão em trabalho" })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("Comparar versões do plano")).toBeVisible();
    await expect(
      dialog.getByText("Selecione duas versões da mesma linha para comparar.")
    ).toBeVisible();

    const promoteButton = dialog.getByRole("button", { name: "Aprovar v3" });
    await expect(promoteButton).toBeVisible();
    await expect(promoteButton).toBeEnabled();

    await expect(
      dialog.getByRole("button", { name: "Fechar comparação" })
    ).toBeEnabled();
  });
});
