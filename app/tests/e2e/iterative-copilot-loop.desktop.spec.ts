import { expect, test } from "@playwright/test";
import { loginGuidedJourney, mockClientProfiles } from "./support/guided-auth";
import {
  ITERATION_THREAD_ID,
  mockIterativeCopilotThread,
} from "./support/iterative-copilot-mocks";

/**
 * v13.9 iterative copilot loop — desktop viewport.
 * Authenticated campaign thread with mocked artifactVersionState and compare API.
 */

test.describe("iterative copilot loop desktop", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem("adscale:assistant-context-open", "true");
    });
    await mockClientProfiles(page);
    await mockIterativeCopilotThread(page);
    await loginGuidedJourney(page);
  });

  test("shows version history and opens comparison dialog with Portuguese copy", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/assistant?threadId=${ITERATION_THREAD_ID}`);

    const contextPanel = page.getByTestId("assistant-desktop-context");
    await expect(contextPanel).toBeVisible({ timeout: 15_000 });

    const versionHistory = contextPanel.getByTestId("version-history");
    await expect(versionHistory).toBeVisible();
    await expect(versionHistory.getByText("Histórico de versões")).toBeVisible();
    await expect(versionHistory.getByText("Comparar oficial e versão em trabalho")).toBeVisible();

    await versionHistory
      .getByRole("button", { name: "Comparar oficial e versão em trabalho" })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("Comparar versões do plano")).toBeVisible();
    await expect(
      dialog.getByText("Selecione duas versões da mesma linha para comparar.")
    ).toBeVisible();
    await expect(dialog.getByText("Editado")).toBeVisible();
    await expect(dialog.getByText("Gancho revisado")).toBeVisible();

    const promoteButton = dialog.getByRole("button", { name: "Aprovar v3" });
    await expect(promoteButton).toBeVisible();
    await expect(promoteButton).toBeEnabled();

    const closeButton = dialog.getByRole("button", { name: "Fechar comparação" });
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toBeEnabled();
  });
});
