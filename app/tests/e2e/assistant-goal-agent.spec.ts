import fs from "fs";
import path from "path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Goal-oriented creative agent pilot — 15 staging runbook scenarios.
 * Seed: npx tsx scripts/seed-goal-agent-e2e.ts
 */

const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";
const NON_REFUNDABLE_COPY =
  "Cobrança definitiva: não há estorno, inclusive se uma geração falhar.";

interface GoalAgentE2EFixture {
  clientProfileId: string;
  otherClientProfileId: string;
  workspaceId: string;
  tripletThreadId: string;
  tripletGoalRunId: string;
  annotationThreadId: string;
  packageThreadId: string;
  intakeThreadId: string;
  existingPieceThreadId: string;
  tripletActionThreadId: string;
  tripletPendingActionId: string;
  packageActionThreadId: string;
  packagePendingActionId: string;
  completedThreadId: string;
  completedGoalRunId: string;
  annotationHistoryThreadId: string;
  annotationHistoryOldVersionId: string;
  otherClientThreadId: string;
  selectedBaseVersionId: string | null;
  balancedTripletVersionId: string | null;
}

const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/goal-agent-e2e.json");

function loadFixture(): GoalAgentE2EFixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(
      "Missing goal-agent E2E fixture. Run: npx tsx scripts/seed-goal-agent-e2e.ts"
    );
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as GoalAgentE2EFixture;
}

async function login(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: true, marketing: true })
    );
  });
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });

  const clients = await page.request.get("/api/client-profiles");
  const { profiles } = (await clients.json()) as { profiles: unknown[] };
  if (profiles.length === 0) {
    await page.request.post("/api/client-profiles", {
      data: { name: "Cliente E2E" },
    });
  }
}

async function sessionCookieHeader(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function openGoalThread(page: Page, threadId: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/assistant?threadId=${threadId}`);
  await expect(page.getByTestId("assistant-goal-workspace")).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("goal-agent pilot — scenarios 1-2 (composer & fallback)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
  });

  test("1. agent pilot composer is available to an eligible owner", async ({ page }) => {
    await page.goto("/assistant");
    const desktop = page.getByTestId("assistant-desktop-main");

    await expect(desktop.getByTestId("assistant-client-select")).toBeVisible({
      timeout: 15_000,
    });
    await expect(desktop.getByTestId("assistant-classic-flow-toggle")).toBeVisible();
  });

  test("1b. classic fallback is reachable via the toggle", async ({ page }) => {
    await page.goto("/assistant");
    const desktop = page.getByTestId("assistant-desktop-main");
    await desktop.getByTestId("assistant-classic-flow-toggle").click();
    await expect(desktop.getByTestId("assistant-journey-cards")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("2. mandatory client selection drives the single composer start", async ({ page }) => {
    await page.goto("/assistant");
    const select = page
      .getByTestId("assistant-desktop-main")
      .getByTestId("assistant-client-select");
    await expect(select).toBeVisible({ timeout: 15_000 });
    const options = select.locator("option");
    await expect(options).not.toHaveCount(0);
  });
});

test.describe("goal-agent pilot — seeded workspace scenarios", () => {
  let fixture: GoalAgentE2EFixture;

  test.beforeAll(() => {
    fixture = loadFixture();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
  });

  test("3. from-zero brief shows remaining blockers one field at a time", async ({
    page,
    request,
  }) => {
    await page.goto(`/assistant?threadId=${fixture.intakeThreadId}`);
    const cookieHeader = await sessionCookieHeader(page);
    const thread = await request.get(
      `/api/assistant/threads/${fixture.intakeThreadId}`,
      { headers: { cookie: cookieHeader } }
    );
    const body = (await thread.json()) as {
      goalProjection?: { blockers: string[] };
    };
    expect(body.goalProjection?.blockers).toEqual(["audience", "constraints"]);
  });

  test("4. existing-piece path carries baseAssetId in the seeded brief", async ({
    page,
    request,
  }) => {
    await page.goto(`/assistant?threadId=${fixture.existingPieceThreadId}`);
    const cookieHeader = await sessionCookieHeader(page);
    const thread = await request.get(
      `/api/assistant/threads/${fixture.existingPieceThreadId}`,
      { headers: { cookie: cookieHeader } }
    );
    const body = (await thread.json()) as {
      goalProjection?: { assumptions: string[] };
    };
    expect(body.goalProjection?.assumptions).toContain("existing_piece");
  });

  test("4b. start composer exposes image attachment intake for existing-piece path", async ({
    page,
  }) => {
    await page.goto("/assistant");
    const desktop = page.getByTestId("assistant-desktop-main");
    await expect(desktop.getByTestId("assistant-start-file-input")).toBeAttached();
    await expect(
      desktop.getByRole("button", { name: "Adicionar imagem" })
    ).toBeVisible();
  });

  test("5. triplet action card shows exact 15-credit non-refundable copy", async ({
    page,
  }) => {
    await page.goto(`/assistant?threadId=${fixture.tripletActionThreadId}`);
    const actionCard = page
      .getByTestId("assistant-desktop-main")
      .getByTestId("assistant-action-card");
    await expect(actionCard).toBeVisible({ timeout: 15_000 });
    await expect(actionCard.getByText(NON_REFUNDABLE_COPY)).toBeVisible();
    await expect(actionCard.getByText(/15/)).toBeVisible();
  });

  test("6. triplet workspace renders three neutral candidates after reload", async ({
    page,
  }) => {
    await openGoalThread(page, fixture.tripletThreadId);
    const grid = page.getByTestId("assistant-triplet-grid");
    await expect(grid).toBeVisible();
    const cards = page.getByTestId(/^assistant-triplet-card-/);
    await expect(cards).toHaveCount(3);

    await page.reload();
    await expect(page.getByTestId("assistant-goal-workspace")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId(/^assistant-triplet-card-/)).toHaveCount(3);
    await expect(grid.getByText(/recomend|melhor/i)).toHaveCount(0);
  });

  test("7. base selection advances the triplet workspace", async ({ page, request }) => {
    await openGoalThread(page, fixture.tripletThreadId);
    const cookieHeader = await sessionCookieHeader(page);
    const thread = await request.get(`/api/assistant/threads/${fixture.tripletThreadId}`, {
      headers: { cookie: cookieHeader },
    });
    const threadBody = (await thread.json()) as {
      goalProjection?: { revision: number };
    };
    const revision = threadBody.goalProjection?.revision ?? 0;
    expect(fixture.balancedTripletVersionId).toBeTruthy();

    const response = await request.post(
      `/api/assistant/threads/${fixture.tripletThreadId}/goal/select-base`,
      {
        headers: { cookie: cookieHeader, "content-type": "application/json" },
        data: {
          versionId: fixture.balancedTripletVersionId,
          expectedRevision: revision,
        },
      }
    );
    expect(response.ok()).toBeTruthy();

    const updated = await request.get(`/api/assistant/threads/${fixture.tripletThreadId}`, {
      headers: { cookie: cookieHeader },
    });
    const body = (await updated.json()) as {
      goalProjection?: { selectedBaseVersionId: string | null; stage: string };
    };
    expect(body.goalProjection?.selectedBaseVersionId).toBe(
      fixture.balancedTripletVersionId
    );
    expect(["reviewing_base", "choosing_base"]).toContain(body.goalProjection?.stage);
  });

  test("8. two rectangle annotations can be submitted as one revision batch", async ({
    page,
    request,
  }) => {
    await page.goto(`/assistant?threadId=${fixture.annotationThreadId}`);
    const cookieHeader = await sessionCookieHeader(page);
    const thread = await request.get(
      `/api/assistant/threads/${fixture.annotationThreadId}`,
      { headers: { cookie: cookieHeader } }
    );
    const threadBody = (await thread.json()) as {
      goalProjection?: { id: string; selectedBaseVersionId: string | null };
    };
    const goalRunId = threadBody.goalProjection?.id;
    const versionId = threadBody.goalProjection?.selectedBaseVersionId;
    expect(goalRunId).toBeTruthy();
    expect(versionId).toBeTruthy();

    for (const [index, comment] of ["Região A", "Região B"].entries()) {
      const response = await request.post(
        `/api/assistant/threads/${fixture.annotationThreadId}/goal/annotations`,
        {
          headers: { cookie: cookieHeader, "content-type": "application/json" },
          data: {
            goalRunId,
            versionId,
            x: 0.1 + index * 0.2,
            y: 0.1,
            width: 0.15,
            height: 0.15,
            comment,
          },
        }
      );
      expect(response.ok()).toBeTruthy();
    }

    const listed = await request.get(
      `/api/assistant/threads/${fixture.annotationThreadId}/goal/annotations?goalRunId=${goalRunId}&versionId=${versionId}`,
      { headers: { cookie: cookieHeader } }
    );
    const annotations = (await listed.json()) as { annotations: unknown[] };
    expect(annotations.annotations.length).toBeGreaterThanOrEqual(2);
  });

  test("9. annotation history remains on the old version after base changes", async ({
    request,
    page,
  }) => {
    await page.goto(`/assistant?threadId=${fixture.annotationHistoryThreadId}`);
    const cookieHeader = await sessionCookieHeader(page);
    const thread = await request.get(
      `/api/assistant/threads/${fixture.annotationHistoryThreadId}`,
      { headers: { cookie: cookieHeader } }
    );
    const threadBody = (await thread.json()) as { goalProjection?: { id: string } };
    const historyListed = await request.get(
      `/api/assistant/threads/${fixture.annotationHistoryThreadId}/goal/annotations?goalRunId=${threadBody.goalProjection?.id}&versionId=${fixture.annotationHistoryOldVersionId}`,
      { headers: { cookie: cookieHeader } }
    );
    const history = (await historyListed.json()) as {
      annotations: Array<{ comment: string }>;
    };
    expect(history.annotations.some((a) => a.comment.includes("versão antiga"))).toBe(
      true
    );
  });

  test("10. base approval surfaces 15-credit package confirmation copy", async ({ page }) => {
    await page.goto(`/assistant?threadId=${fixture.packageActionThreadId}`);
    const actionCard = page
      .getByTestId("assistant-desktop-main")
      .getByTestId("assistant-action-card");
    await expect(actionCard).toBeVisible({ timeout: 15_000 });
    await expect(actionCard.getByText(NON_REFUNDABLE_COPY)).toBeVisible();
    await expect(actionCard.getByText(/15/)).toBeVisible();
  });

  test("11. package review shows four separately approvable format slots", async ({
    page,
  }) => {
    await openGoalThread(page, fixture.packageThreadId);

    const review = page.getByTestId("assistant-package-review");
    await expect(review).toBeVisible();
    const slots = page.getByTestId(/^assistant-package-slot-/);
    await expect(slots).toHaveCount(4);
    await expect(page.getByTestId("assistant-package-approve-all")).toHaveCount(0);
    await expect(page.getByTestId("assistant-package-progress")).toContainText("/4");
  });

  test("12. completed goal ZIP download returns application/zip", async ({
    page,
    request,
  }) => {
    await openGoalThread(page, fixture.completedThreadId);
    await expect(page.getByTestId("assistant-goal-download-zip")).toBeVisible();

    const cookieHeader = await sessionCookieHeader(page);
    const response = await request.post("/api/export/zip", {
      headers: { cookie: cookieHeader, "content-type": "application/json" },
      data: { goalRunId: fixture.completedGoalRunId },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/zip");
    const body = await response.body();
    expect(body.byteLength).toBeGreaterThan(0);
  });

  test("13a. stop before dispatch cancels a pending paid action", async ({
    page,
    request,
  }) => {
    await page.goto(`/assistant?threadId=${fixture.tripletActionThreadId}`);
    const cookieHeader = await sessionCookieHeader(page);
    const thread = await request.get(
      `/api/assistant/threads/${fixture.tripletActionThreadId}`,
      { headers: { cookie: cookieHeader } }
    );
    const threadBody = (await thread.json()) as {
      goalProjection?: { revision: number };
    };
    const revision = threadBody.goalProjection?.revision ?? 0;

    const response = await request.post(
      `/api/assistant/threads/${fixture.tripletActionThreadId}/goal`,
      {
        headers: { cookie: cookieHeader, "content-type": "application/json" },
        data: {
          type: "stop",
          expectedRevision: revision,
          pendingActionId: fixture.tripletPendingActionId,
        },
      }
    );
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as { stage: string };
    expect(payload.stage).toBe("stopped");
  });

  test("13b. stop after dispatch leaves charged running jobs and marks goal stopped", async ({
    page,
    request,
  }) => {
    await openGoalThread(page, fixture.tripletThreadId);
    const cookieHeader = await sessionCookieHeader(page);
    const thread = await request.get(`/api/assistant/threads/${fixture.tripletThreadId}`, {
      headers: { cookie: cookieHeader },
    });
    const threadBody = (await thread.json()) as {
      goalProjection?: { revision: number };
    };
    const revision = threadBody.goalProjection?.revision ?? 0;

    const response = await request.post(
      `/api/assistant/threads/${fixture.tripletThreadId}/goal`,
      {
        headers: { cookie: cookieHeader, "content-type": "application/json" },
        data: { type: "stop", expectedRevision: revision },
      }
    );
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as { stage: string };
    expect(payload.stage).toBe("stopped");
  });

  test("14. mobile can monitor but cannot draw rectangle annotations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/assistant?threadId=${fixture.annotationThreadId}`);
    await page.getByRole("button", { name: "Contexto" }).click();
    await expect(page.getByTestId("assistant-mobile-context")).toBeVisible();
    await expect(
      page.getByTestId("assistant-mobile-context").getByTestId("assistant-annotation-editor")
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByTestId("assistant-mobile-context").getByTestId("assistant-annotation-mobile-notice")
    ).toBeVisible();
    await expect(
      page.getByTestId("assistant-mobile-context").getByTestId("assistant-annotation-overlay")
    ).toHaveCount(0);
  });

  test("15. cross-client thread, version, and annotation access is rejected", async ({
    page,
    request,
  }) => {
    await page.goto(`/assistant?threadId=${fixture.annotationThreadId}`);
    const cookieHeader = await sessionCookieHeader(page);

    const annotationResponse = await request.post(
      `/api/assistant/threads/${fixture.otherClientThreadId}/goal/annotations`,
      {
        headers: { cookie: cookieHeader, "content-type": "application/json" },
        data: {
          goalRunId: "00000000-0000-4000-8000-000000000099",
          versionId: "00000000-0000-4000-8000-000000000099",
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.2,
          comment: "fora de escopo",
        },
      }
    );
    expect(annotationResponse.status()).toBe(404);

    const selectResponse = await request.post(
      `/api/assistant/threads/${fixture.tripletThreadId}/goal/select-base`,
      {
        headers: { cookie: cookieHeader, "content-type": "application/json" },
        data: {
          versionId: "00000000-0000-4000-8000-000000000099",
          expectedRevision: 0,
        },
      }
    );
    expect(selectResponse.status()).toBe(400);
  });
});
