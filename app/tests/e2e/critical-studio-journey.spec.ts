import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * M01 critical journey: create → reload → complete → edit → export, plus
 * partial failure and isolation between brands. Deterministic doubles only.
 * Requires seed:create-post-e2e, E2E_CONTROLLED_PROVIDER, Inngest dev,
 * IMAGE_JOB_TARGET=web (or unset).
 */

const FIXTURE_PATH = process.env.CREATE_POST_E2E_FIXTURE_PATH
  ? path.resolve(process.env.CREATE_POST_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../fixtures/create-post-e2e.json");

type Fixture = {
  email: string;
  password: string;
  primaryClientProfileId: string;
  contentArtAssetId: string;
  insufficientBalance: { email: string; password: string };
};

type WorkDetail = {
  work: { id: string; status: string; updatedAt: string };
  outputs: Array<{
    id: string;
    status: "queued" | "processing" | "completed" | "failed";
    creativeLevel: string;
    isSelected: boolean;
  }>;
  sources: Array<{ id: string; status: string }>;
};

function fixture(): Fixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing fixture. Run npm run seed:create-post-e2e first.");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

async function signIn(request: APIRequestContext, email: string, password: string) {
  const response = await request.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function getWork(request: APIRequestContext, workId: string): Promise<WorkDetail> {
  const response = await request.get(`/api/creative-work/${workId}`);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<WorkDetail>;
}

async function waitForTerminalOutputs(
  request: APIRequestContext,
  workId: string,
): Promise<WorkDetail> {
  let detail!: WorkDetail;
  await expect.poll(async () => {
    detail = await getWork(request, workId);
    return detail.outputs.length > 0
      && detail.outputs.every((output) => output.status === "completed" || output.status === "failed");
  }, { timeout: 240_000, intervals: [1_500, 2_500, 4_000] }).toBe(true);
  return detail;
}

async function createGenerateAndWait(
  request: APIRequestContext,
  input: {
    intent: string;
    request: string;
    sources?: Array<{ assetId: string; usage: "content" | "style" | "both" }>;
  },
): Promise<WorkDetail> {
  const data = fixture();
  const created = await request.post("/api/creative-work", {
    data: {
      clientProfileId: data.primaryClientProfileId,
      draftKey: crypto.randomUUID(),
      request: input.request,
      intent: input.intent,
      format: "4:5",
      settings: { targetFormats: [], formatMode: "manual" },
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const workId = ((await created.json()) as { work: { id: string } }).work.id;

  for (const source of input.sources ?? []) {
    const current = await getWork(request, workId);
    const attached = await request.patch(`/api/creative-work/${workId}`, {
      data: {
        action: "attachSource",
        expectedUpdatedAt: new Date(current.work.updatedAt).toISOString(),
        assetId: source.assetId,
        usage: source.usage,
      },
    });
    expect(attached.ok(), await attached.text()).toBe(true);
  }
  if ((input.sources ?? []).length > 0) {
    await expect.poll(async () => {
      const detail = await getWork(request, workId);
      return detail.sources.length > 0 && detail.sources.every((row) => row.status === "ready");
    }, { timeout: 60_000 }).toBe(true);
  }

  const prepared = await request.patch(`/api/creative-work/${workId}`, { data: { action: "prepare" } });
  expect(prepared.status(), await prepared.text()).toBe(200);
  const body = (await prepared.json()) as { preparedPlan?: { preparedRevision?: string } };
  const preparedRevision = body.preparedPlan?.preparedRevision;
  expect(preparedRevision).toBeTruthy();

  const generated = await request.post(`/api/creative-work/${workId}/generate`, {
    data: { action: "initial", preparedRevision },
  });
  expect(generated.status(), await generated.text()).toBe(202);
  return waitForTerminalOutputs(request, workId);
}

test.describe("Critical studio journey (M01)", () => {
  test("creates, reloads, completes, edits, exports; isolates brands; keeps partial failure", async ({
    page,
    playwright,
  }) => {
    const data = fixture();
    await page.addInitScript(() => {
      localStorage.setItem(
        "adscale_cookie_consent",
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
    await signIn(page.request, data.email, data.password);

    const completed = await createGenerateAndWait(page.request, {
      intent: "single",
      request: "Peça crítica M01 com dublê determinístico.",
    });
    expect(completed.outputs).toHaveLength(1);
    expect(completed.outputs[0]?.status).toBe("completed");
    const workId = completed.work.id;
    const originalOutputId = completed.outputs[0]!.id;

    await page.goto(`/?workId=${workId}`);
    await expect(page).toHaveURL(new RegExp(`workId=${workId}`));
    const reloaded = await getWork(page.request, workId);
    expect(reloaded.outputs.map((output) => output.id)).toEqual([originalOutputId]);

    const revised = await page.request.post(`/api/creative-work/${workId}/generate`, {
      data: {
        action: "revision",
        revisionKey: crypto.randomUUID(),
        outputId: originalOutputId,
        instruction: "Aumente o contraste da peça.",
        revisionAssetId: null,
      },
    });
    expect(revised.ok(), await revised.text()).toBe(true);
    const afterEdit = await waitForTerminalOutputs(page.request, workId);
    const editedOutput = afterEdit.outputs.find((output) => output.id !== originalOutputId && output.status === "completed")
      ?? afterEdit.outputs.find((output) => output.status === "completed");
    expect(editedOutput).toBeTruthy();
    const outputId = editedOutput!.id;

    const selected = await page.request.post(
      `/api/creative-work/${workId}/outputs/${outputId}/select`,
      { data: { saveToLibrary: false, confirmObjective: true } },
    );
    expect(selected.ok(), await selected.text()).toBe(true);
    const afterSelect = await getWork(page.request, workId);
    expect(afterSelect.outputs.find((output) => output.id === outputId)?.isSelected).toBe(true);

    const exported = await page.request.get(
      `/api/creative-work/${workId}/outputs/${outputId}/download?format=json`,
    );
    expect(exported.ok(), await exported.text()).toBe(true);
    const exportBody = (await exported.json()) as { url?: string };
    expect(typeof exportBody.url).toBe("string");
    expect(exportBody.url?.length).toBeGreaterThan(0);

    const outsider = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    });
    await signIn(outsider, data.insufficientBalance.email, data.insufficientBalance.password);
    const isolated = await outsider.get(`/api/creative-work/${workId}`);
    expect([401, 403, 404]).toContain(isolated.status());
    await outsider.dispose();

    const partial = await createGenerateAndWait(page.request, {
      intent: "variations",
      request: "Lote parcial M01 [e2e:retry-twice-bold] no ousado.",
      sources: [{ assetId: data.contentArtAssetId, usage: "both" }],
    });
    expect(partial.outputs).toHaveLength(3);
    const byLevel = new Map(partial.outputs.map((output) => [output.creativeLevel, output]));
    expect(byLevel.get("conservative")?.status).toBe("completed");
    expect(byLevel.get("balanced")?.status).toBe("completed");
    expect(byLevel.get("bold")?.status).toBe("failed");
    expect(partial.work.status).toBe("partial");
  });
});
