import fs from "fs";
import path from "path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Goal-oriented creative agent pilot E2E. Uses authoritative seeded goal state
 * (scripts/seed-goal-agent-e2e.ts) so every scenario asserts real UI surfaces
 * instead of silently passing when fixtures are absent.
 */

const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";

interface GoalAgentE2EFixture {
  clientProfileId: string;
  tripletThreadId: string;
  annotationThreadId: string;
  packageThreadId: string;
  selectedBaseVersionId: string | null;
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

async function openGoalThread(page: Page, threadId: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/assistant?threadId=${threadId}`);
  await expect(page.getByTestId("assistant-goal-workspace")).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("goal-oriented creative agent pilot", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("agent pilot composer is available to an eligible owner", async ({ page }) => {
    await page.goto("/assistant");
    const desktop = page.getByTestId("assistant-desktop-main");

    await expect(desktop.getByTestId("assistant-client-select")).toBeVisible({
      timeout: 15_000,
    });
    await expect(desktop.getByTestId("assistant-classic-flow-toggle")).toBeVisible();
  });

  test("classic fallback is reachable via the toggle", async ({ page }) => {
    await page.goto("/assistant");
    const desktop = page.getByTestId("assistant-desktop-main");
    await desktop.getByTestId("assistant-classic-flow-toggle").click();
    await expect(desktop.getByTestId("assistant-journey-cards")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("mandatory client selection drives the single composer start", async ({ page }) => {
    await page.goto("/assistant");
    const select = page
      .getByTestId("assistant-desktop-main")
      .getByTestId("assistant-client-select");
    await expect(select).toBeVisible({ timeout: 15_000 });
    const options = select.locator("option");
    await expect(options).not.toHaveCount(0);
  });
});

test.describe("goal-oriented creative agent seeded workspace", () => {
  let fixture: GoalAgentE2EFixture;

  test.beforeAll(() => {
    fixture = loadFixture();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("seeded triplet workspace renders three neutral candidates at equal weight", async ({
    page,
  }) => {
    await openGoalThread(page, fixture.tripletThreadId);

    const grid = page.getByTestId("assistant-triplet-grid");
    await expect(grid).toBeVisible();
    const cards = page.getByTestId(/^assistant-triplet-card-/);
    await expect(cards).toHaveCount(3);

    const firstClass = await cards.first().getAttribute("class");
    const lastClass = await cards.last().getAttribute("class");
    expect(firstClass).toBe(lastClass);
    await expect(grid.getByText(/recomend|melhor/i)).toHaveCount(0);
  });

  test("seeded annotation stage exposes the rectangle editor on the selected base", async ({
    page,
  }) => {
    await openGoalThread(page, fixture.annotationThreadId);

    await expect(page.getByTestId("assistant-annotation-editor")).toBeVisible();
    await expect(page.getByTestId("assistant-annotation-image")).toBeVisible();
    await expect(page.getByTestId("assistant-annotation-overlay")).toBeVisible();
  });

  test("seeded package review shows four separately approvable format slots", async ({
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

  test("desktop goal plan shows the four live steps on seeded workspace threads", async ({
    page,
  }) => {
    await openGoalThread(page, fixture.tripletThreadId);

    const plan = page.getByTestId("assistant-goal-plan");
    await expect(plan).toBeVisible();
    const steps = plan.locator("ol li");
    await expect(steps).toHaveCount(4);
  });

  test("rejects annotation drafts for a version outside the seeded goal thread", async ({
    page,
    request,
  }) => {
    await page.goto(`/assistant?threadId=${fixture.annotationThreadId}`);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");

    const response = await request.post(
      `/api/assistant/threads/${fixture.annotationThreadId}/goal/annotations`,
      {
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
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

    expect(response.status()).toBe(404);
  });

  test("select-base rejects a version outside the triplet campaign scope", async ({
    page,
    request,
  }) => {
    await page.goto(`/assistant?threadId=${fixture.tripletThreadId}`);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");

    const thread = await request.get(`/api/assistant/threads/${fixture.tripletThreadId}`, {
      headers: { cookie: cookieHeader },
    });
    const threadBody = (await thread.json()) as {
      goalProjection?: { revision: number };
    };
    const revision = threadBody.goalProjection?.revision ?? 0;

    const response = await request.post(
      `/api/assistant/threads/${fixture.tripletThreadId}/goal/select-base`,
      {
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        data: {
          versionId: "00000000-0000-4000-8000-000000000099",
          expectedRevision: revision,
        },
      }
    );

    expect(response.status()).toBe(400);
  });
});
