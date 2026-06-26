import { expect, test, type Page } from "@playwright/test";

/**
 * v13.6 guided journey smoke — authenticated shell, journey cards and
 * browser-level action confirmation without spending provider/worker credits.
 */

const createdAt = "2026-06-26T12:00:00.000Z";
const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";

async function login(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("adscale_cookie_consent", "necessary");
  });
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

async function mockAssistantShellData(page: Page): Promise<void> {
  await page.route("**/api/client-profiles", async (route) => {
    await route.fulfill({
      json: {
        profiles: [
          {
            id: "client-e2e",
            workspaceId: "workspace-e2e",
            name: "Cliente E2E",
            description: null,
            visualNotes: null,
            toneNotes: null,
            constraints: null,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      },
    });
  });
}

function assistantThreadDetail(status: "pending" | "running") {
  return {
    thread: {
      id: "thread-e2e-confirm",
      workspaceId: "workspace-e2e",
      clientProfileId: "client-e2e",
      campaignId: null,
      name: "Produzir do zero",
      isDefault: false,
      migratedFromThreadId: null,
      createdAt,
      updatedAt: createdAt,
    },
    guidedFlow: {
      id: "guided-flow-e2e",
      workspaceId: "workspace-e2e",
      clientProfileId: "client-e2e",
      threadId: "thread-e2e-confirm",
      path: "from_zero",
      status: status === "pending" ? "ready_for_action" : "action_running",
      currentStep: "confirm_plan",
      slots: {},
      missingFields: [],
      assetIds: [],
      referenceIds: ["ref-1", "ref-2", "ref-3"],
      campaignId: null,
      createdAt,
      updatedAt: createdAt,
    },
    messages: [
      {
        id: "message-action-e2e",
        workspaceId: "workspace-e2e",
        threadId: "thread-e2e-confirm",
        sequence: 1,
        type: "action_card",
        content: "",
        actionRecordId: "action-e2e-confirm",
        createdAt,
        payload: {
          actionRecordId: "action-e2e-confirm",
          status,
          display: {
            label: "Criar plano criativo",
            actionType: "start_complete_campaign",
            riskLabel: "medium",
            confirmationPolicy: "required",
            creditImpact: { kind: "fixed", credits: 0 },
            riskCopyLines: [
              "Cria rascunho de campanha somente depois da confirmação.",
            ],
          },
          ...(status === "running"
            ? { jobRef: { kind: "assistant_action", id: "job-e2e" } }
            : {}),
        },
      },
    ],
  };
}

async function mockAssistantActionConfirmFlow(page: Page) {
  let confirmed = false;
  let confirmCalls = 0;

  await page.route("**/api/assistant/threads?**", async (route) => {
    await route.fulfill({
      json: {
        threads: [
          {
            id: "thread-e2e-confirm",
            workspaceId: "workspace-e2e",
            clientProfileId: "client-e2e",
            campaignId: null,
            name: "Produzir do zero",
            isDefault: false,
            migratedFromThreadId: null,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      },
    });
  });

  await page.route(
    "**/api/assistant/threads/thread-e2e-confirm",
    async (route) => {
      await route.fulfill({
        json: assistantThreadDetail(confirmed ? "running" : "pending"),
      });
    }
  );

  await page.route(
    "**/api/assistant/actions/action-e2e-confirm/confirm",
    async (route) => {
      confirmCalls += 1;
      confirmed = true;
      await route.fulfill({
        json: {
          action: {
            id: "action-e2e-confirm",
            workspaceId: "workspace-e2e",
            status: "running",
          },
        },
      });
    }
  );

  return {
    getConfirmCalls: () => confirmCalls,
  };
}

test.describe("guided assistant journeys", () => {
  test.beforeEach(async ({ page }) => {
    await mockAssistantShellData(page);
    await login(page);
  });

  test("start surface shows both guided journey cards", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/assistant");

    const desktopMain = page.getByTestId("assistant-desktop-main");
    await expect(desktopMain.getByTestId("assistant-journey-cards")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      desktopMain.getByTestId("assistant-journey-card-existing_creative")
    ).toBeVisible();
    await expect(
      desktopMain.getByTestId("assistant-journey-card-from_zero")
    ).toBeVisible();
  });

  test("mobile layout shows journey cards without overlap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/assistant");

    const mobileChat = page.getByTestId("assistant-mobile-chat");
    const cards = mobileChat.getByTestId("assistant-journey-cards");
    await expect(cards).toBeVisible({ timeout: 15_000 });
    await expect(mobileChat.getByTestId("assistant-start-form")).toBeVisible();
  });

  test("confirms the first guided action card from the browser", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const confirmFlow = await mockAssistantActionConfirmFlow(page);

    await page.goto("/assistant?threadId=thread-e2e-confirm");

    const actionCard = page
      .getByTestId("assistant-desktop-main")
      .getByTestId("assistant-action-card");
    await expect(actionCard).toBeVisible({ timeout: 15_000 });
    await expect(actionCard).toHaveAttribute("data-status", "pending");
    await expect(actionCard).toContainText("Criar plano criativo");
    await expect(actionCard).toContainText("Confirmação obrigatória");

    await actionCard.getByRole("button", { name: "Confirmar" }).click();

    await expect
      .poll(() => confirmFlow.getConfirmCalls(), { timeout: 15_000 })
      .toBe(1);
    await expect(actionCard).toHaveAttribute("data-status", "running");
    await expect(actionCard).toContainText("Em execução");
  });
});
