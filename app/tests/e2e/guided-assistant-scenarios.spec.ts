import { expect, test, type Page } from "@playwright/test";
import {
  GUIDED_E2E_EMAIL,
  assistantSurface,
  loginGuidedJourney,
  mockClientProfiles,
} from "./support/guided-auth";

const createdAt = "2026-06-26T12:00:00.000Z";
const THREAD_ID = "thread-e2e-scenarios";

type GuidedPresentation = {
  path: string;
  status: string;
  currentStep: string;
  revision: number;
  schemaVersion: number;
  missingFields: string[];
  assetIds: string[];
  referenceIds: string[];
  campaignId: string | null;
  recoverableError: Record<string, unknown> | null;
  slots: Record<string, unknown>;
  navigationHistory: string[];
  allowedCommands: string[];
  retentionPreview?: { retained: string[]; cleared: string[] };
  prompt?: {
    field: string;
    labelKey: string;
    quickReplies?: string[];
    allowSkip?: boolean;
    allowUnknown?: boolean;
  };
  briefReview?: Record<string, string>;
};

function basePresentation(overrides: Partial<GuidedPresentation> = {}): GuidedPresentation {
  return {
    path: "from_zero",
    status: "active",
    currentStep: "collect_brief",
    revision: 3,
    schemaVersion: 2,
    missingFields: ["offer"],
    assetIds: [],
    referenceIds: [],
    campaignId: null,
    recoverableError: null,
    slots: { navigationHistory: ["collect_brief"] },
    navigationHistory: ["collect_brief"],
    allowedCommands: ["back", "preview_restart", "preview_switch"],
    prompt: {
      field: "product",
      labelKey: "fields.product",
      quickReplies: ["Tênis", "Não sei"],
      allowUnknown: true,
    },
    ...overrides,
  };
}

function threadDetail(options: {
  path?: "from_zero" | "existing_creative";
  currentStep?: string;
  referenceIds?: string[];
  slots?: Record<string, unknown>;
  presentation?: Partial<GuidedPresentation>;
  messages?: Array<Record<string, unknown>>;
  recoverableError?: Record<string, unknown> | null;
}) {
  const path = options.path ?? "from_zero";
  const currentStep = options.currentStep ?? "collect_brief";
  const defaultReferenceIds =
    path === "from_zero" ? ["ref-1", "ref-2", "ref-3"] : [];
  return {
    thread: {
      id: THREAD_ID,
      workspaceId: "workspace-e2e",
      clientProfileId: "client-e2e",
      campaignId: null,
      name: "Cenário guiado",
      isDefault: false,
      migratedFromThreadId: null,
      createdAt,
      updatedAt: createdAt,
    },
    guidedFlow: {
      id: "guided-flow-e2e",
      workspaceId: "workspace-e2e",
      clientProfileId: "client-e2e",
      threadId: THREAD_ID,
      path,
      status: "active",
      currentStep,
      slots: options.slots ?? {},
      missingFields: ["offer"],
      assetIds: path === "existing_creative" ? ["asset-1"] : [],
      referenceIds: options.referenceIds ?? defaultReferenceIds,
      campaignId: null,
      recoverableError: options.recoverableError ?? null,
      revision: 3,
      createdAt,
      updatedAt: createdAt,
    },
    guidedPresentation: basePresentation({
      path,
      currentStep,
      recoverableError: options.recoverableError ?? null,
      ...options.presentation,
    }),
    messages: options.messages ?? [],
  };
}

async function mockThreadRoute(
  page: Page,
  detail: ReturnType<typeof threadDetail>
) {
  await page.route("**/api/assistant/threads?**", async (route) => {
    await route.fulfill({
      json: {
        threads: [detail.thread],
      },
    });
  });

  await page.route(`**/api/assistant/threads/${THREAD_ID}`, async (route) => {
    await route.fulfill({ json: detail });
  });
}

async function mockGuidedCommandsRoute(
  page: Page,
  handlers: {
    onCommand?: (body: Record<string, unknown>) => { status: number; json: unknown };
  } = {}
) {
  await page.route(
    `**/api/assistant/threads/${THREAD_ID}/guided-flow/commands`,
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (handlers.onCommand) {
        const result = handlers.onCommand(body);
        await route.fulfill(result);
        return;
      }
      await route.fulfill({
        json: {
          presentation: basePresentation({ revision: 4 }),
        },
      });
    }
  );
}

test.describe("guided assistant scenario matrix", () => {
  test.beforeEach(async ({ page }) => {
    await mockClientProfiles(page);
    await loginGuidedJourney(page);
  });

  test("reload/resume shows resume banner with step context", async ({ page }) => {
    await mockThreadRoute(
      page,
      threadDetail({
        currentStep: "review_brief",
        presentation: {
          currentStep: "review_brief",
          briefReview: { product: "Tênis", offer: "20% off" },
          allowedCommands: ["back", "confirm_brief_review"],
        },
      })
    );

    await page.goto(`/assistant?threadId=${THREAD_ID}`);

    const banner = assistantSurface(page).getByTestId("guided-flow-resume-banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText("Produzir do zero");
    await expect(banner).toContainText("Revisar brief");
  });

  test("correction exposes brief review edit affordance", async ({ page }) => {
    await mockThreadRoute(
      page,
      threadDetail({
        currentStep: "review_brief",
        presentation: {
          currentStep: "review_brief",
          briefReview: { product: "Tênis", offer: "20% off" },
        },
      })
    );
    await mockGuidedCommandsRoute(page);

    await page.goto(`/assistant?threadId=${THREAD_ID}`);

    const reviewPanel = assistantSurface(page).getByTestId("from-zero-brief-review-panel");
    await expect(reviewPanel).toBeVisible({ timeout: 15_000 });
    await expect(reviewPanel.getByRole("button", { name: "Editar" }).first()).toBeVisible();
  });

  test("switch path shows retention preview before confirm", async ({ page }) => {
    await mockThreadRoute(page, threadDetail({}));
    await mockGuidedCommandsRoute(page, {
      onCommand: (body) => {
        const command = (body.command as { type?: string })?.type;
        if (command === "preview_switch") {
          return {
            status: 200,
            json: {
              presentation: basePresentation({
                retentionPreview: {
                  retained: ["answers.product"],
                  cleared: ["referenceIds"],
                },
              }),
            },
          };
        }
        return { status: 200, json: { presentation: basePresentation({ revision: 4 }) } };
      },
    });

    await page.goto(`/assistant?threadId=${THREAD_ID}`);

    const controls = assistantSurface(page).getByTestId("guided-flow-controls");
    await expect(controls).toBeVisible({ timeout: 15_000 });
    await controls.getByRole("button", { name: /Trocar caminho/i }).click();

    const preview = controls.locator('[role="status"]');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Será mantido");
    await expect(preview).toContainText("Será limpo");
  });

  test("restart preview can be cancelled without mutation", async ({ page }) => {
    await mockThreadRoute(page, threadDetail({}));
    await mockGuidedCommandsRoute(page, {
      onCommand: () => ({
        status: 200,
        json: {
          presentation: basePresentation({
            retentionPreview: { retained: [], cleared: ["answers", "referenceIds"] },
          }),
        },
      }),
    });

    await page.goto(`/assistant?threadId=${THREAD_ID}`);

    const controls = assistantSurface(page).getByTestId("guided-flow-controls");
    await controls.getByRole("button", { name: /Reiniciar/i }).click();
    await expect(controls.locator('[role="status"]')).toBeVisible();
    await controls.getByRole("button", { name: "Cancelar" }).click();
    await expect(controls.locator('[role="status"]')).toHaveCount(0);
  });

  test("revision conflict surfaces accessible error on controls", async ({ page }) => {
    await mockThreadRoute(page, threadDetail({}));
    await mockGuidedCommandsRoute(page, {
      onCommand: () => ({
        status: 409,
        json: { error: "revisionConflict", message: "Outra aba atualizou a jornada." },
      }),
    });

    await page.goto(`/assistant?threadId=${THREAD_ID}`);

    const controls = assistantSurface(page).getByTestId("guided-flow-controls");
    await controls.getByRole("button", { name: /Voltar/i }).click();
    await expect(controls.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
  });

  test("retry clears recoverable error via clear_error control", async ({ page }) => {
    let cleared = false;
    let recoverableError: Record<string, unknown> | null = {
      code: "upload_failed",
      message: "Falha no upload da referência.",
    };

    await page.route(`**/api/assistant/threads/${THREAD_ID}`, async (route) => {
      await route.fulfill({
        json: threadDetail({
          recoverableError,
          presentation: {
            allowedCommands: recoverableError
              ? ["clear_error", "back"]
              : ["back", "preview_restart", "preview_switch"],
            recoverableError,
          },
        }),
      });
    });
    await page.route("**/api/assistant/threads?**", async (route) => {
      await route.fulfill({
        json: {
          threads: [
            {
              id: THREAD_ID,
              workspaceId: "workspace-e2e",
              clientProfileId: "client-e2e",
              campaignId: null,
              name: "Cenário guiado",
              isDefault: false,
              migratedFromThreadId: null,
              createdAt,
              updatedAt: createdAt,
            },
          ],
        },
      });
    });
    await mockGuidedCommandsRoute(page, {
      onCommand: (body) => {
        const command = (body.command as { type?: string })?.type;
        if (command === "clear_error") {
          cleared = true;
          recoverableError = null;
          return {
            status: 200,
            json: {
              presentation: basePresentation({
                recoverableError: null,
                allowedCommands: ["back", "preview_restart", "preview_switch"],
              }),
            },
          };
        }
        return { status: 200, json: { presentation: basePresentation({ revision: 4 }) } };
      },
    });

    await page.goto(`/assistant?threadId=${THREAD_ID}`);

    const banner = assistantSurface(page).getByTestId("guided-flow-resume-banner");
    await expect(banner).toContainText("Falha no upload da referência.");
    const controls = assistantSurface(page).getByTestId("guided-flow-controls");
    await controls.getByRole("button", { name: /Tentar novamente/i }).click();
    expect(cleared).toBe(true);
    await expect(banner).not.toContainText("Falha no upload da referência.");
  });

  test("stale action confirm keeps card pending when server rejects", async ({ page }) => {
    const detail = threadDetail({
      currentStep: "confirm_plan",
      presentation: {
        currentStep: "confirm_plan",
        allowedCommands: [],
      },
      messages: [
        {
          id: "message-stale",
          workspaceId: "workspace-e2e",
          threadId: THREAD_ID,
          sequence: 1,
          type: "action_card",
          content: "",
          actionRecordId: "action-stale",
          createdAt,
          payload: {
            actionRecordId: "action-stale",
            status: "pending",
            display: {
              label: "Criar plano criativo",
              actionType: "start_complete_campaign",
              riskLabel: "medium",
              confirmationPolicy: "required",
              creditImpact: { kind: "fixed", credits: 0 },
              riskCopyLines: ["Sem writes antes da confirmação."],
            },
          },
        },
      ],
    });
    await mockThreadRoute(page, detail);

    await page.route(
      "**/api/assistant/actions/action-stale/confirm",
      async (route) => {
        await route.fulfill({
          status: 409,
          json: { error: "stale_guided_action" },
        });
      }
    );

    await page.goto(`/assistant?threadId=${THREAD_ID}`);

    const actionCard = assistantSurface(page).getByTestId("assistant-action-card");
    await expect(actionCard).toBeVisible({ timeout: 15_000 });
    await actionCard.getByRole("button", { name: "Confirmar" }).click();
    await expect(actionCard).toHaveAttribute("data-status", "pending");
  });

  test("resource replacement posts set_references after swapping assets", async ({
    page,
  }) => {
    let postedReferenceIds: string[] | null = null;
    await mockThreadRoute(
      page,
      threadDetail({
        currentStep: "select_references",
        referenceIds: ["ref-1", "ref-2", "ref-3"],
        presentation: {
          currentStep: "select_references",
          referenceIds: ["ref-1", "ref-2", "ref-3"],
          allowedCommands: ["set_references", "back"],
        },
      })
    );
    await mockGuidedCommandsRoute(page, {
      onCommand: (body) => {
        const command = body.command as { type?: string; referenceIds?: string[] };
        if (command.type === "set_references") {
          postedReferenceIds = command.referenceIds ?? [];
          return {
            status: 200,
            json: {
              presentation: basePresentation({
                currentStep: "confirm_plan",
                referenceIds: postedReferenceIds,
                revision: 5,
              }),
            },
          };
        }
        return { status: 200, json: { presentation: basePresentation({ revision: 4 }) } };
      },
    });
    await page.route("**/api/workspace/assets?**", async (route) => {
      await route.fulfill({
        json: {
          assets: ["ref-1", "ref-2", "ref-3", "ref-4"].map((id) => ({
            id,
            workspaceId: "workspace-e2e",
            name: id,
            key: id,
            type: "image",
            size: 1000,
            width: 100,
            height: 100,
            tags: null,
            aiDescription: null,
            source: "upload",
            metadata: null,
            url: null,
            createdAt,
          })),
        },
      });
    });
    await page.route("**/api/client-profiles/client-e2e/references", async (route) => {
      await route.fulfill({ json: { references: [] } });
    });

    await page.goto(`/assistant?threadId=${THREAD_ID}`);

    const refsPanel = assistantSurface(page).getByTestId("from-zero-references-panel");
    await expect(refsPanel).toBeVisible({ timeout: 15_000 });
    await refsPanel.getByTestId("from-zero-ref-ref-1").click();
    await refsPanel.getByTestId("from-zero-ref-ref-4").click();
    await refsPanel.getByTestId("from-zero-continue-references").click();

    await expect.poll(() => postedReferenceIds).toEqual(["ref-2", "ref-3", "ref-4"]);
  });

  test("existing_creative path approves diagnosis and advances step", async ({
    page,
  }) => {
    let approved = false;
    let currentStep = "review_diagnosis";
    const diagnosisSlots = {
      diagnosis: { detectedConcept: "Campanha de tênis esportivo" },
      assumptions: ["Público jovem urbano"],
      recommendedAction: "quick_restyle",
    };

    await page.route(`**/api/assistant/threads/${THREAD_ID}`, async (route) => {
      await route.fulfill({
        json: threadDetail({
          path: "existing_creative",
          currentStep,
          slots: diagnosisSlots,
          presentation: {
            path: "existing_creative",
            currentStep,
            allowedCommands:
              currentStep === "review_diagnosis"
                ? ["correct_diagnosis_field", "approve_diagnosis"]
                : [],
            diagnosisReview: {
              assumptions: ["Público jovem urbano"],
              missingFields: [],
            },
          },
        }),
      });
    });
    await page.route("**/api/assistant/threads?**", async (route) => {
      await route.fulfill({
        json: {
          threads: [
            {
              id: THREAD_ID,
              workspaceId: "workspace-e2e",
              clientProfileId: "client-e2e",
              campaignId: null,
              name: "Cenário guiado",
              isDefault: false,
              migratedFromThreadId: null,
              createdAt,
              updatedAt: createdAt,
            },
          ],
        },
      });
    });
    await mockGuidedCommandsRoute(page, {
      onCommand: (body) => {
        const command = (body.command as { type?: string })?.type;
        if (command === "approve_diagnosis") {
          approved = true;
          currentStep = "confirm_improvement";
          return {
            status: 200,
            json: {
              presentation: basePresentation({
                path: "existing_creative",
                currentStep: "confirm_improvement",
                allowedCommands: [],
                revision: 5,
              }),
            },
          };
        }
        return { status: 200, json: { presentation: basePresentation({ revision: 4 }) } };
      },
    });

    await page.goto(`/assistant?threadId=${THREAD_ID}`);

    const panel = assistantSurface(page).getByTestId("creative-diagnosis-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel).toContainText("Campanha de tênis esportivo");
    await panel.getByTestId("acknowledge-diagnosis").click();

    expect(approved).toBe(true);
    await expect(panel).not.toBeVisible({ timeout: 10_000 });
    await expect(assistantSurface(page).getByTestId("guided-flow-resume-banner")).toContainText(
      "Confirmar melhoria"
    );
  });

  test("keyboard navigation focuses journey cards and activates with Enter", async ({
    page,
  }) => {
    let startedPath: string | null = null;
    const newThreadId = "thread-keyboard-e2e";

    await page.route("**/api/assistant/threads", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        json: {
          thread: {
            id: newThreadId,
            workspaceId: "workspace-e2e",
            clientProfileId: "client-e2e",
            campaignId: null,
            name: "Melhorar criativo existente",
            isDefault: false,
            migratedFromThreadId: null,
            createdAt,
            updatedAt: createdAt,
          },
        },
      });
    });
    await page.route(
      `**/api/assistant/threads/${newThreadId}/guided-flow/commands`,
      async (route) => {
        const body = route.request().postDataJSON() as {
          command?: { type?: string; path?: string };
        };
        if (body.command?.type === "select_path") {
          startedPath = body.command.path ?? null;
        }
        await route.fulfill({
          json: {
            guidedFlow: {
              id: "guided-flow-keyboard",
              threadId: newThreadId,
              path: startedPath ?? "from_zero",
              status: "active",
              currentStep: "collect_brief",
            },
            presentation: basePresentation({
              path: startedPath ?? "from_zero",
              revision: 1,
            }),
          },
        });
      }
    );
    await page.route(`**/api/assistant/threads/${newThreadId}`, async (route) => {
      await route.fulfill({
        json: threadDetail({
          path: (startedPath as "from_zero" | "existing_creative") ?? "from_zero",
        }),
      });
    });

    await page.goto("/assistant");

    const surface = assistantSurface(page);
    await expect(surface.getByTestId("assistant-journey-cards")).toBeVisible({
      timeout: 15_000,
    });

    let focusedCardId: string | null = null;
    for (let step = 0; step < 30; step += 1) {
      await page.keyboard.press("Tab");
      const testId = await page.locator(":focus").getAttribute("data-testid");
      if (testId?.startsWith("assistant-journey-card-")) {
        focusedCardId = testId;
        break;
      }
    }

    expect(focusedCardId).toMatch(/assistant-journey-card-(existing_creative|from_zero)/);
    await page.keyboard.press("Enter");
    await expect.poll(() => startedPath).toMatch(/existing_creative|from_zero/);
  });
});

test.describe("guided auth stability", () => {
  test("login helper reaches assistant shell", async ({ page }) => {
    await mockClientProfiles(page);
    await loginGuidedJourney(page);
    await page.goto("/assistant");
    await expect(assistantSurface(page).getByTestId("assistant-journey-cards")).toBeVisible({
      timeout: 15_000,
    });
    expect(GUIDED_E2E_EMAIL).toContain("@");
  });
});
