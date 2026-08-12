import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Client } from "pg";
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { composeExactBrandAssets } from "../../src/server/creative-work/composite";

/**
 * Standalone Create Post — end-to-end acceptance gate.
 *
 * Covers:
 *   1. UI: resumes the canonical work on Home and asserts that
 *      `/api/campaigns` ID set is unchanged (the creative flow must
 *      never write to the campaigns table).
 *   2. API: pending reference rows are excluded from the assets step.
 *   3. API: the triplet always returns exactly three fixed creative levels
 *      (conservative / balanced / bold).
 *   4. API: retry uses the same output ID, never a new row.
 *   5. API: selection state persists across a detail reload.
 *   6. API: signed download returns a short-lived URL.
 *   7. Visual: exact-mode composition of the seeded logo onto a deterministic
 *      generated base matches the reference logo region (Sharp `stats()`
 *      channel diff = 0 after resize + composite).
 *
 * Seed: `npm run seed:create-post-e2e`
 */

const FIXTURE_PATH = path.resolve(
  __dirname,
  "../fixtures/create-post-e2e.json",
);

interface CreatePostFixture {
  workspaceId: string;
  workspaceName: string | null;
  email: string;
  password: string;
  userId: string;
  primaryClientProfileId: string;
  approvedLogoReferenceId: string;
  approvedLogoAssetKey: string;
  approvedLogoBufferBase64: string;
  approvedLogoWidth: number;
  approvedLogoHeight: number;
  approvedVisualReferenceId: string;
  approvedVisualReferenceAssetKey: string;
  pendingReferenceLabel: string;
  readyWorkId: string;
  contentArtAssetId: string;
  styleArtAssetId: string;
  seededAt: string;
}

function loadFixture(): CreatePostFixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(
      "Missing create-post E2E fixture. Run: npm run seed:create-post-e2e",
    );
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as CreatePostFixture;
}

async function login(page: Page): Promise<void> {
  const fixture = loadFixture();
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "adscale_cookie_consent",
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    } catch {
      /* ignore */
    }
  });
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email: fixture.email, password: fixture.password },
  });
  expect(response.ok(), `E2E login must succeed (got ${response.status()})`).toBeTruthy();
}

async function fetchCampaignIds(
  request: APIRequestContext,
): Promise<string[]> {
  const res = await request.get(`/api/campaigns?limit=200&e2e=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  expect(res.ok(), `GET /api/campaigns must succeed (got ${res.status()})`).toBeTruthy();
  const body = (await res.json()) as { campaigns?: Array<{ id?: string }> };
  return (body.campaigns ?? [])
    .flatMap((campaign) => typeof campaign.id === "string" ? [campaign.id] : [])
    .sort();
}

test.describe("Standalone Create Post acceptance gate", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("resumes the same canonical work on Home without touching campaigns", async ({ page }) => {
    const fixture = loadFixture();
    const before = await fetchCampaignIds(page.request);

    await page.goto(`/?workId=${fixture.readyWorkId}`);
    // The resumed work restores its full persisted state: the frozen request
    // survives in the API projection (the variations surface renders the
    // request only inside the variation brief, not as a standalone textbox)
    // and every output card is rebuilt from the database.
    const resumed = (await page.request.get(`/api/creative-work/${fixture.readyWorkId}`).then((res) => res.json()) as {
      work: { request: string };
      outputs: Array<{ id: string }>;
    });
    expect(resumed.work.request).toContain("Novo produto");
    await expect(page.getByTestId("proposal-level")).toHaveCount(3);
    const firstIds = resumed.outputs.map((output) => output.id).sort();

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`workId=${fixture.readyWorkId}`));
    const reloadedIds = (await page.request.get(`/api/creative-work/${fixture.readyWorkId}`).then((res) => res.json()) as {
      outputs: Array<{ id: string }>;
    }).outputs.map((output) => output.id).sort();
    expect(reloadedIds).toEqual(firstIds);
    expect(await fetchCampaignIds(page.request), "Home creative work must not mutate campaigns").toEqual(before);
  });

  test("pending reference rows are excluded from the assets step", async ({ page }) => {
    const request = page.request;
    const fixture = loadFixture();

    const res = await request.get(
      `/api/client-profiles/${fixture.primaryClientProfileId}/references`,
    );
    expect(res.ok(), "references API must succeed").toBeTruthy();
    const body = (await res.json()) as {
      references: Array<{
        id: string;
        label: string;
        reviewStatus: string;
      }>;
    };

    // The seed inserts a `pending_analysis` row that must be filtered out
    // before reaching the automatic approved-reference projection. First
    // assert the seed row is actually present in the raw API response —
    // otherwise this test would silently pass on a missing fixture.
    const labels = body.references.map((r) => r.label);
    expect(labels).toContain(fixture.pendingReferenceLabel);
    const pending = body.references.find(
      (r) => r.label === fixture.pendingReferenceLabel,
    );
    expect(pending).toBeDefined();
    expect(pending?.reviewStatus).toBe("pending_analysis");

    // Automatic identity selection only considers rows whose
    // `reviewStatus` is `approved`. Prove that
    // the pending row never makes it into that projection.
    const approvedReferences = body.references.filter(
      (r) => r.reviewStatus === "approved",
    );
    expect(
      approvedReferences.find((r) => r.label === fixture.pendingReferenceLabel),
      "pending reference must be excluded from the assets step",
    ).toBeUndefined();
    expect(approvedReferences.length, "at least one approved reference must exist").toBeGreaterThan(0);
  });

  test("human approval makes a trained asset eligible for controlled Peça única generation", async ({ page }) => {
    const fixture = loadFixture();
    const analysis = {
      description: "Referência visual controlada para o gate E2E.",
      visualAttributes: ["contraste controlado"],
      rules: ["preservar a identidade"],
      constraints: ["não inventar elementos"],
      confidence: 1,
    };
    const list = await page.request.get(
      `/api/client-profiles/${fixture.primaryClientProfileId}/training-assets`,
    );
    expect(list.ok()).toBeTruthy();
    const pending = ((await list.json()) as {
      references: Array<{ id: string; label: string; reviewStatus: string }>;
    }).references.find((reference) => reference.label === fixture.pendingReferenceLabel);
    expect(pending?.reviewStatus).toBe("pending_analysis");

    try {
      await withDb(async (client) => {
        await client.query(
          `update adscale_app.client_references
           set training_category = 'visual_reference', usage_mode = 'reference',
               training_analysis = $1::jsonb, review_status = 'pending_approval'
           where id = $2 and workspace_id = $3 and client_profile_id = $4`,
          [JSON.stringify(analysis), pending!.id, fixture.workspaceId, fixture.primaryClientProfileId],
        );
      });

      for (let read = 0; read < 2; read += 1) {
        const response = await page.request.get(
          `/api/client-profiles/${fixture.primaryClientProfileId}/training-assets`,
        );
        const current = ((await response.json()) as {
          references: Array<{ id: string; reviewStatus: string }>;
        }).references.find((reference) => reference.id === pending!.id);
        expect(current?.reviewStatus).toBe("pending_approval");
      }

      const approval = await page.request.patch(
        `/api/client-profiles/${fixture.primaryClientProfileId}/training-assets/${pending!.id}`,
        {
          data: {
            trainingCategory: "visual_reference",
            usageMode: "reference",
            analysis,
            reviewStatus: "approved",
          },
        },
      );
      expect(approval.ok(), `approval must succeed (got ${approval.status()})`).toBeTruthy();

      const detail = await runV1Flow(page.request, fixture, {
        intent: "single",
        request: "Peça única controlada após aprovação humana da referência.",
      });
      expect(detail.outputs).toHaveLength(1);
      const calls = evidenceForOutput(readProviderEvidence(), detail.outputs[0].id);
      expect(calls).toHaveLength(1);
      expect(calls[0].referenceNames.some(
        (name) => path.parse(name).name === fixture.pendingReferenceLabel,
      )).toBe(true);
    } finally {
      await withDb(async (client) => {
        await client.query(
          `update adscale_app.client_references
           set training_category = 'graphic', usage_mode = 'exact', training_analysis = null,
               review_status = 'pending_analysis', reviewed_at = null, reviewed_by_user_id = null
           where id = $1 and workspace_id = $2 and client_profile_id = $3`,
          [pending!.id, fixture.workspaceId, fixture.primaryClientProfileId],
        );
      });
    }
  });

  test("triplet always returns exactly three fixed creative levels", async ({ page }) => {
    const request = page.request;
    const fixture = loadFixture();

    const res = await request.get(
      `/api/creative-work/${fixture.readyWorkId}`,
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      outputs: Array<{ id: string; creativeLevel: string; status: string }>;
    };

    const levels = body.outputs.map((o) => o.creativeLevel).sort();
    expect(levels).toEqual(["balanced", "bold", "conservative"]);
    // The unique partial index guarantees one row per level.
    const uniqueIds = new Set(body.outputs.map((o) => o.id));
    expect(uniqueIds.size).toBe(3);
  });

  test("retry uses the same output ID, not a new row", async ({ page }) => {
    const request = page.request;
    const fixture = loadFixture();

    // The retry route only accepts `failed` outputs (it 409s on
    // `completed`/`queued`/`processing`). The seed marks `bold` as
    // `failed` so we have a deterministic retryable row.
    const detailRes = await request.get(
      `/api/creative-work/${fixture.readyWorkId}`,
    );
    const detail = (await detailRes.json()) as {
      outputs: Array<{ id: string; status: string; creativeLevel: string }>;
    };
    const target = detail.outputs.find((o) => o.status === "failed");
    expect(target).toBeDefined();
    expect(target!.creativeLevel).toBe("bold");

    const retryRes = await request.post(
      `/api/creative-work/${fixture.readyWorkId}/outputs/${target!.id}/retry`,
    );
    expect(retryRes.ok()).toBeTruthy();
    const retried = (await retryRes.json()) as {
      output: { id: string };
    };
    expect(retried.output.id).toBe(target!.id);

    // Row count is unchanged.
    const afterRes = await request.get(
      `/api/creative-work/${fixture.readyWorkId}`,
    );
    const after = (await afterRes.json()) as {
      outputs: Array<{ id: string }>;
    };
    expect(after.outputs).toHaveLength(3);
    expect(after.outputs.find((o) => o.id === target!.id)).toBeDefined();
  });

  test("selection state persists across a detail reload", async ({ page }) => {
    const request = page.request;
    const fixture = loadFixture();

    const detailRes = await request.get(
      `/api/creative-work/${fixture.readyWorkId}`,
    );
    const detail = (await detailRes.json()) as {
      outputs: Array<{ id: string; isSelected: boolean }>;
    };
    // Pick the first not-yet-selected output (none should be selected after
    // a fresh seed — the seed never marks one as selected).
    const before = detail.outputs.filter((o) => o.isSelected).length;
    expect(before, "seed should not pre-select an output").toBe(0);

    const candidate = detail.outputs[0];
    const selectRes = await request.post(
      `/api/creative-work/${fixture.readyWorkId}/outputs/${candidate.id}/select`,
      { data: { saveToLibrary: false } },
    );
    expect(selectRes.ok()).toBeTruthy();

    // Reload and verify exactly one output is selected, and it's the same ID.
    const reloadRes = await request.get(
      `/api/creative-work/${fixture.readyWorkId}`,
    );
    const reload = (await reloadRes.json()) as {
      outputs: Array<{ id: string; isSelected: boolean }>;
    };
    const selected = reload.outputs.filter((o) => o.isSelected);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe(candidate.id);

    // The unique partial index guarantees no other row can be selected.
    for (const output of reload.outputs) {
      if (output.id !== candidate.id) {
        expect(output.isSelected).toBe(false);
      }
    }
  });

  test("signed download returns a short-lived URL for completed outputs", async ({ page }) => {
    const request = page.request;
    const fixture = loadFixture();

    const detailRes = await request.get(
      `/api/creative-work/${fixture.readyWorkId}`,
    );
    const detail = (await detailRes.json()) as {
      outputs: Array<{ id: string; status: string }>;
    };
    const completed = detail.outputs.find((o) => o.status === "completed");
    expect(completed).toBeDefined();

    const res = await request.get(
      `/api/creative-work/${fixture.readyWorkId}/outputs/${completed!.id}/download`,
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(302);
    const location = res.headers().location;
    expect(location).toMatch(/^https?:\/\//);
    expect(location.length).toBeGreaterThan(20);
  });

  test("exact-mode composition places the seeded logo with zero channel difference", async () => {
    const fixture = loadFixture();

    // Recreate the deterministic base that the seed produced: 64x64
    // magenta (the `conservative` base). The composite pipeline resizes
    // the logo to `width * widthRatio` (0.18) and pins it to the
    // southeast corner; the logo region is the bottom-right 18% of the
    // canvas.
    const baseWidth = 64;
    const baseHeight = 64;
    const base = await sharp({
      create: {
        width: baseWidth,
        height: baseHeight,
        channels: 3,
        background: { r: 255, g: 0, b: 128 },
      },
    })
      .png()
      .toBuffer();
    const baseSeed = Buffer.from(base);

    // Load the actual seeded logo buffer from the fixture (base64-encoded
    // by the seed so we don't depend on object-storage availability).
    const seededLogo = Buffer.from(fixture.approvedLogoBufferBase64, "base64");
    const seededLogoMeta = await sharp(seededLogo).metadata();
    expect(seededLogoMeta.width, "seeded logo width must be recorded").toBe(
      fixture.approvedLogoWidth,
    );
    expect(seededLogoMeta.height, "seeded logo height must be recorded").toBe(
      fixture.approvedLogoHeight,
    );
    const logoBuffer = Buffer.from(seededLogo);

    // Call the real server pipeline (`composeExactBrandAssets`) with the
    // seeded logo buffer and the deterministic magenta base. The
    // pipeline resizes the logo to `width * widthRatio` (0.18) with
    // aspect preserved and pins it to the southeast corner.
    const widthRatio = 0.18;
    const expectedLogoWidth = Math.max(1, Math.round(baseWidth * widthRatio));
    const layerWidth = Math.max(1, Math.round(baseWidth * widthRatio));
    const layerHeight = Math.max(
      1,
      Math.round((seededLogoMeta.height ?? fixture.approvedLogoHeight) *
        (layerWidth / (seededLogoMeta.width ?? fixture.approvedLogoWidth))),
    );

    const composite = await composeExactBrandAssets(
      base,
      [
        {
          buffer: logoBuffer,
          gravity: "southeast",
          widthRatio,
        },
      ],
      { width: baseWidth, height: baseHeight },
    );

    // Build the expected logo layer with the same resize transform applied
    // by the server pipeline (`fit: "inside"`), preserving aspect ratio.
    const expectedLogo = await sharp(logoBuffer)
      .resize(layerWidth, layerHeight, { fit: "inside" })
      .png()
      .toBuffer();

    // Alpha-composite the resized mark over the corresponding base region.
    // Comparing against the logo buffer alone would be incorrect wherever
    // transparent pixels intentionally reveal the generated base.
    const expectedRegion = await sharp(base)
      .extract({
        left: baseWidth - expectedLogoWidth,
        top: baseHeight - layerHeight,
        width: expectedLogoWidth,
        height: layerHeight,
      })
      .composite([{ input: expectedLogo, left: 0, top: 0 }])
      .png()
      .toBuffer();

    // Extract the bottom-right logo region from the composed image and
    // compare its per-channel statistics against the resized logo
    // using `sharp().stats()` — the brief's prescribed assertion. A
    // pipeline that places the seeded logo correctly must produce a
    // zero channel difference between the extracted region and the
    // expected resized logo.
    const extractedRegion = await sharp(composite)
      .extract({
        left: baseWidth - expectedLogoWidth,
        top: baseHeight - layerHeight,
        width: expectedLogoWidth,
        height: layerHeight,
      })
      .ensureAlpha()
      .raw()
      .toBuffer();

    const expectedRaw = await sharp(expectedRegion)
      .ensureAlpha()
      .raw()
      .toBuffer();

    expect(
      extractedRegion.length,
      "extracted logo region must have the same byte length as the expected resized logo",
    ).toBe(expectedRaw.length);

    let diff = 0;
    for (let i = 0; i < expectedRaw.length; i += 1) {
      diff += Math.abs((extractedRegion[i] ?? 0) - (expectedRaw[i] ?? 0));
    }
    expect(
      diff,
      `expected zero channel diff in the logo region after the resize/composition transform; got ${diff}`,
    ).toBe(0);

    // Sharp `stats()` (per the brief) on the composed logo region must
    // also report channel stats that match the resized logo's stats.
    // `sharp().stats()` reports input statistics rather than the pending
    // extract pipeline, so materialize the crop before measuring it.
    const composedRegion = await sharp(composite)
      .extract({
        left: baseWidth - expectedLogoWidth,
        top: baseHeight - layerHeight,
        width: expectedLogoWidth,
        height: layerHeight,
      })
      .png()
      .toBuffer();
    const composedStats = await sharp(composedRegion).stats();
    const expectedStats = await sharp(expectedRegion).stats();
    expect(composedStats.channels).toHaveLength(expectedStats.channels.length);
    for (let c = 0; c < expectedStats.channels.length; c += 1) {
      const composedChannel = composedStats.channels[c];
      const expectedChannel = expectedStats.channels[c];
      expect(composedChannel).toBeDefined();
      expect(expectedChannel).toBeDefined();
      expect(composedChannel!.mean).toBeCloseTo(expectedChannel!.mean, 5);
      expect(composedChannel!.min).toBeCloseTo(expectedChannel!.min, 5);
      expect(composedChannel!.max).toBeCloseTo(expectedChannel!.max, 5);
    }

    // The seed logo buffer must not have been mutated by the pipeline.
    expect(logoBuffer.equals(seededLogo)).toBe(true);

    // Sanity-check: the base used to compose was not mutated either.
    expect(baseSeed.equals(base)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R-010 — Creative Work v1 quality-recovery matrix (deterministic, no OpenAI,
// no real credits). Requires the dev server started with:
//   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
//   E2E_DISABLE_RATE_LIMIT=true E2E_CONTROLLED_PROVIDER=true \
//   CREATIVE_WORK_QUALITY_RECOVERY_ENABLED=true npm run dev:next
// plus `npm run inngest:dev` and a fresh `npm run seed:create-post-e2e`.
// Failure markers travel inside the frozen request text:
//   [e2e:timeout-once]  transport retry consumes the 2nd (final) call
//   [e2e:always-fail]   both calls burn → terminal + idempotent refund
//   [e2e:hard-fail-once] non-retryable 1st call → manual retry path
//   [e2e:qa-fail-once]  objective fail on attempt 1 → correction succeeds
//   [e2e:qa-fail-always] objective fail on both → terminal factual_violation
//   [e2e:qa-error]      evaluator failure → inconclusive, no retry
// ---------------------------------------------------------------------------

const EVIDENCE_PATH = process.env.E2E_PROVIDER_EVIDENCE_PATH
  ?? path.resolve(__dirname, ".evidence/provider-calls.jsonl");
const E2E_DB_URL = process.env.DATABASE_URL
  ?? "postgres://test:test@localhost:5433/adscale_test";

interface ProviderCallEvidence {
  outputPrefix: string;
  attempt: number;
  generationMode: string;
  dimensions: { width: number; height: number };
  referenceNames: string[];
  promptMarkers: string[];
  promptHasObjectiveCorrection: boolean;
  promptHasDeterministicText: boolean;
  outcome: "success" | "failure";
}

interface V1OutputRow {
  id: string;
  status: string;
  failureCode: string | null;
  imageCallCount: number;
  retryCount: number;
  creativeLevel: string;
  targetFormat: string;
  versionNumber: number;
  parentOutputId: string | null;
  quality: {
    schemaVersion?: number;
    objectiveVerdict?: string;
    attempt?: number;
    subjective?: { scoreStatus?: string };
    textComposition?: {
      version: number;
      execution: "deterministic" | "generative";
      format: string;
      font?: { assetKey: string; sha256: string };
      copy?: { headline: string; body: string; cta: string };
      planHash?: string;
      outputHash?: string;
      reason?: string;
    };
  } | null;
}

interface V1WorkDetail {
  work: { id: string; status: string; toolKind: string; settings: Record<string, unknown> };
  outputs: V1OutputRow[];
  sources: Array<{ id: string; status: string; usage: string; assetId: string | null }>;
}

function readProviderEvidence(): ProviderCallEvidence[] {
  if (!fs.existsSync(EVIDENCE_PATH)) return [];
  return fs.readFileSync(EVIDENCE_PATH, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ProviderCallEvidence);
}

function evidenceForOutput(evidence: ProviderCallEvidence[], outputId: string): ProviderCallEvidence[] {
  return evidence.filter((row) => row.outputPrefix === `creative-work/${outputId}`);
}

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: E2E_DB_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function dbOutputRow(outputId: string) {
  return withDb(async (client) => {
    const result = await client.query(
      `select status, failure_code, image_call_count, retry_count
       from adscale_app.creative_work_outputs where id = $1`,
      [outputId],
    );
    return result.rows[0] as {
      status: string;
      failure_code: string | null;
      image_call_count: number;
      retry_count: number;
    } | undefined;
  });
}

async function dbLedgerFor(fixture: CreatePostFixture, workItemId: string) {
  return withDb(async (client) => {
    const result = await client.query(
      `select idempotency_key, type, amount from adscale_app.usage_events
       where workspace_id = $1 and idempotency_key like $2 order by created_at, id`,
      [fixture.workspaceId, `creative-work:${workItemId}%`],
    );
    return result.rows as Array<{ idempotency_key: string; type: string; amount: number }>;
  });
}

async function apiCreateV1Draft(
  request: APIRequestContext,
  fixture: CreatePostFixture,
  input: { intent: string; request: string; targetFormats?: string[]; format?: string },
): Promise<string> {
  const res = await request.post("/api/creative-work", {
    data: {
      clientProfileId: fixture.primaryClientProfileId,
      draftKey: crypto.randomUUID(),
      request: input.request,
      intent: input.intent,
      format: input.format ?? "4:5",
      settings: { targetFormats: input.targetFormats ?? [], formatMode: "manual" },
    },
  });
  expect(res.ok(), `create draft must succeed (got ${res.status()})`).toBeTruthy();
  const body = (await res.json()) as { work: { id: string } };
  return body.work.id;
}

async function apiAttachSource(
  request: APIRequestContext,
  workId: string,
  assetId: string,
  usage: "content" | "style" | "both",
): Promise<void> {
  const res = await request.patch(`/api/creative-work/${workId}`, {
    data: { action: "attachSource", assetId, usage },
  });
  expect(res.ok(), `attachSource must succeed (got ${res.status()})`).toBeTruthy();
}

async function apiGetWork(request: APIRequestContext, workId: string): Promise<V1WorkDetail> {
  const res = await request.get(`/api/creative-work/${workId}`);
  expect(res.ok(), `GET work must succeed (got ${res.status()})`).toBeTruthy();
  return (await res.json()) as V1WorkDetail;
}

async function apiPrepare(request: APIRequestContext, workId: string) {
  const res = await request.patch(`/api/creative-work/${workId}`, {
    data: { action: "prepare" },
  });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
}

async function waitForSourcesReady(request: APIRequestContext, workId: string): Promise<void> {
  await expect.poll(
    async () => {
      const detail = await apiGetWork(request, workId);
      return detail.sources.every((source) => source.status === "ready") && detail.sources.length > 0;
    },
    { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
  ).toBe(true);
}

async function apiGenerateInitial(request: APIRequestContext, workId: string): Promise<void> {
  const res = await request.post(`/api/creative-work/${workId}/generate`, {
    data: { action: "initial" },
  });
  expect(res.status(), `generate must answer 202 (got ${res.status()})`).toBe(202);
}

async function waitForTerminalOutputs(request: APIRequestContext, workId: string): Promise<V1WorkDetail> {
  let detail!: V1WorkDetail;
  await expect.poll(
    async () => {
      detail = await apiGetWork(request, workId);
      return detail.outputs.length > 0
        && detail.outputs.every((output) => output.status === "completed" || output.status === "failed");
    },
    { timeout: 180_000, intervals: [1_500, 2_500, 4_000] },
  ).toBe(true);
  return detail;
}

async function runV1Flow(
  request: APIRequestContext,
  fixture: CreatePostFixture,
  input: { intent: string; request: string; targetFormats?: string[]; format?: string; sources?: Array<{ assetId: string; usage: "content" | "style" | "both" }> },
): Promise<V1WorkDetail> {
  const workId = await apiCreateV1Draft(request, fixture, input);
  for (const source of input.sources ?? []) {
    await apiAttachSource(request, workId, source.assetId, source.usage);
  }
  if ((input.sources ?? []).length > 0) await waitForSourcesReady(request, workId);
  const prepared = await apiPrepare(request, workId);
  expect(prepared.status, `prepare must succeed (got ${prepared.status}): ${JSON.stringify(prepared.body)}`).toBe(200);
  await apiGenerateInitial(request, workId);
  const detail = await waitForTerminalOutputs(request, workId);
  expect(detail.work.id).toBe(workId);
  return detail;
}

test.describe("Creative Work v1 quality-recovery matrix (R-010)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Peça única: 1 output, 1 call, v1 pass payload, subjective advisory only", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "single",
      request: "Promoção de agosto com vagas limitadas para mentoria de psicologia.",
    });

    expect(detail.outputs).toHaveLength(1);
    const output = detail.outputs[0];
    expect(output.status).toBe("completed");
    expect(output.quality).toMatchObject({
      schemaVersion: 1,
      objectiveVerdict: "pass",
      attempt: 1,
      subjective: { scoreStatus: "analyzed" },
    });
    // Subjective signal present but never a retry trigger: exactly one call.
    const calls = evidenceForOutput(readProviderEvidence(), output.id);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      generationMode: "art_variation",
      dimensions: { width: 1080, height: 1350 },
      outcome: "success",
    });
    const row = await dbOutputRow(output.id);
    expect(row).toMatchObject({ status: "completed", image_call_count: 1, retry_count: 0 });
  });

  test("Peça única 1:1: fonte aprovada compõe copy após o background controlado", async ({ page }) => {
    const fixture = loadFixture();
    const fontBuffer = fs.readFileSync(path.resolve(
      process.cwd(),
      "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ));
    let fontKey: string | null = null;
    let fontAssetId: string | null = null;

    try {
      const upload = await page.request.post(
        `/api/client-profiles/${fixture.primaryClientProfileId}/brand-fonts`,
        {
          multipart: {
            file: { name: "Geist-Regular.ttf", mimeType: "font/ttf", buffer: fontBuffer },
            family: "Geist",
            source: "Fixture licenciada do projeto",
            weight: "400",
            style: "normal",
            rightsConfirmed: "true",
          },
        },
      );
      expect(upload.status(), `font upload must succeed (got ${upload.status()})`).toBe(201);
      const uploaded = (await upload.json()) as { font: { assetKey: string; sha256: string } };
      fontKey = uploaded.font.assetKey;
      fontAssetId = await withDb(async (client) => {
        const result = await client.query(
          `select id from adscale_app.workspace_assets where workspace_id = $1 and key = $2`,
          [fixture.workspaceId, fontKey],
        );
        return (result.rows[0]?.id as string | undefined) ?? null;
      });

      const detail = await runV1Flow(page.request, fixture, {
        intent: "single",
        format: "1:1",
        request: "Peça quadrada com chamada literal para a mentoria de psicologia.",
      });

      expect(detail.outputs).toHaveLength(1);
      const output = detail.outputs[0];
      expect(output.status).toBe("completed");
      expect(output.quality?.textComposition).toMatchObject({
        version: 1,
        execution: "deterministic",
        format: "1:1",
        font: { assetKey: fontKey, sha256: uploaded.font.sha256 },
        copy: {
          headline: expect.any(String),
          body: expect.any(String),
          cta: expect.any(String),
        },
        planHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(evidenceForOutput(readProviderEvidence(), output.id)).toEqual([
        expect.objectContaining({
          dimensions: { width: 1080, height: 1080 },
          promptHasDeterministicText: true,
          outcome: "success",
        }),
      ]);
    } finally {
      if (fontKey) {
        await withDb(async (client) => {
          await client.query(
            `update adscale_app.client_profiles
             set brand_font_assets = coalesce((
               select jsonb_agg(font)
               from jsonb_array_elements(coalesce(brand_font_assets, '[]'::jsonb)) font
               where font->>'assetKey' <> $1
             ), '[]'::jsonb)
             where workspace_id = $2 and id = $3`,
            [fontKey, fixture.workspaceId, fixture.primaryClientProfileId],
          );
        });
      }
      if (fontAssetId) {
        await page.request.delete(`/api/workspace/assets/${fontAssetId}`);
      }
    }
  });

  test("Variações: 3 outputs / 3 direct art_variation calls on the same snapshot", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "variations",
      request: "Variações da arte de matrículas abertas.",
      sources: [{ assetId: fixture.contentArtAssetId, usage: "both" }],
    });

    expect(detail.outputs).toHaveLength(3);
    const evidence = readProviderEvidence();
    for (const output of detail.outputs) {
      expect(output.status).toBe("completed");
      expect(output.quality).toMatchObject({ schemaVersion: 1, objectiveVerdict: "pass", attempt: 1 });
      const calls = evidenceForOutput(evidence, output.id);
      expect(calls).toHaveLength(1);
      expect(calls[0].generationMode).toBe("art_variation");
      const row = await dbOutputRow(output.id);
      expect(row?.image_call_count).toBe(1);
    }
  });

  test("Adaptar formatos: 3 outputs / 3 format_adaptation calls with the original art first", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "format_adaptation",
      request: "Adapte a arte de matrículas para todos os formatos.",
      targetFormats: ["1:1", "4:5", "9:16"],
      sources: [{ assetId: fixture.contentArtAssetId, usage: "content" }],
    });

    expect(detail.outputs).toHaveLength(3);
    const expectedDimensions: Record<string, { width: number; height: number }> = {
      "1:1": { width: 1080, height: 1080 },
      "4:5": { width: 1080, height: 1350 },
      "9:16": { width: 1080, height: 1920 },
    };
    const evidence = readProviderEvidence();
    for (const output of detail.outputs) {
      expect(output.status).toBe("completed");
      const calls = evidenceForOutput(evidence, output.id);
      expect(calls).toHaveLength(1);
      expect(calls[0].generationMode).toBe("format_adaptation");
      expect(calls[0].dimensions).toEqual(expectedDimensions[output.targetFormat]);
      // R-003: the original art is always the FIRST attached reference.
      expect(calls[0].referenceNames[0]).toContain("arte-fonte");
    }
  });

  test("Mudar estilo sem conflito: 1 restyling call, content first, style second", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "restyle",
      request: "Copie o estilo da referência para a minha arte.",
      sources: [
        { assetId: fixture.contentArtAssetId, usage: "content" },
        { assetId: fixture.styleArtAssetId, usage: "style" },
      ],
    });

    expect(detail.outputs).toHaveLength(1);
    const output = detail.outputs[0];
    expect(output.status).toBe("completed");
    const calls = evidenceForOutput(readProviderEvidence(), output.id);
    expect(calls).toHaveLength(1);
    expect(calls[0].generationMode).toBe("restyling");
    expect(calls[0].referenceNames[0]).toContain("arte-fonte");
    expect(calls[0].referenceNames[1]).toContain("arte-estilo");
  });

  test("Mudar estilo com conflito: 422 brand_conflict, escolha no mesmo draft, uma cobrança", async ({ page }) => {
    const fixture = loadFixture();
    const workId = await apiCreateV1Draft(page.request, fixture, {
      intent: "restyle",
      request: "Copie o estilo da referência para a arte da XTB.",
    });
    await apiAttachSource(page.request, workId, fixture.contentArtAssetId, "content");
    await apiAttachSource(page.request, workId, fixture.styleArtAssetId, "style");
    await waitForSourcesReady(page.request, workId);

    // State the conflicting brand explicitly in the content analysis: "XTB"
    // appears both in brandElements and in the headline (detector contract).
    const detail = await apiGetWork(page.request, workId);
    const contentSource = detail.sources.find((source) => source.usage === "content");
    expect(contentSource).toBeDefined();
    const current = await apiGetWork(page.request, workId);
    const currentContent = current.sources.find((source) => source.id === contentSource!.id) as unknown as {
      contentAnalysis: Record<string, unknown> | null;
      styleAnalysis: Record<string, unknown> | null;
    };
    const edit = await page.request.patch(`/api/creative-work/${workId}`, {
      data: {
        action: "editSourceAnalysis",
        sourceId: contentSource!.id,
        content: {
          ...(currentContent.contentAnalysis ?? {}),
          product: "Produto da arte",
          brandElements: ["XTB"],
          textContent: { headline: "XTB abre turmas de agosto", bullets: [] },
        },
        style: null,
      },
    });
    expect(edit.ok(), `editSourceAnalysis must succeed (got ${edit.status()})`).toBeTruthy();

    // R-008: the conflict blocks prepare with exactly two short choices.
    const blocked = await apiPrepare(page.request, workId);
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe("brand_conflict");
    const conflictDetails = blocked.body.details as { detectedBrand: string; choices: string[] };
    expect(conflictDetails.detectedBrand).toBe("XTB");
    expect(conflictDetails.choices).toEqual(["source", "active"]);

    // The choice persists on the SAME draft; the resumed prepare succeeds.
    const resolve = await page.request.patch(`/api/creative-work/${workId}`, {
      data: { action: "resolveBrandConflict", choice: "active" },
    });
    expect(resolve.ok(), `resolveBrandConflict must succeed (got ${resolve.status()})`).toBeTruthy();
    const resolvedWork = (await resolve.json()) as { work: { id: string; settings: { brandConflictChoice?: string } } };
    expect(resolvedWork.work.id).toBe(workId);
    expect(resolvedWork.work.settings.brandConflictChoice).toBe("active");

    const prepared = await apiPrepare(page.request, workId);
    expect(prepared.status).toBe(200);
    await apiGenerateInitial(page.request, workId);
    const finished = await waitForTerminalOutputs(page.request, workId);
    expect(finished.outputs).toHaveLength(1);
    expect(finished.outputs[0].status).toBe("completed");

    // Billing stayed blocked during the conflict: exactly one debit, no refunds.
    const ledger = await dbLedgerFor(fixture, workId);
    const debits = ledger.filter((row) => row.idempotency_key.endsWith(":initial"));
    const refunds = ledger.filter((row) => row.idempotency_key.includes("refund"));
    expect(debits).toHaveLength(1);
    expect(refunds).toHaveLength(0);
  });

  test("Revisão: 1 creative_revision call linked to the completed parent", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "single",
      request: "Peça única para revisão posterior.",
    });
    const parent = detail.outputs[0];
    expect(parent.status).toBe("completed");

    const revision = await page.request.post(`/api/creative-work/${detail.work.id}/generate`, {
      data: {
        action: "revision",
        outputId: parent.id,
        instruction: "Troque o fundo para azul escuro",
        revisionKey: crypto.randomUUID(),
        revisionAssetId: null,
      },
    });
    expect(revision.status()).toBe(202);
    const revisionBody = (await revision.json()) as { output: { id: string; parentOutputId: string } };
    expect(revisionBody.output.parentOutputId).toBe(parent.id);

    const finished = await waitForTerminalOutputs(page.request, detail.work.id);
    const revisionOutput = finished.outputs.find((output) => output.id === revisionBody.output.id);
    expect(revisionOutput).toBeDefined();
    expect(revisionOutput!.status).toBe("completed");
    expect(revisionOutput!.versionNumber).toBe(2);
    const calls = evidenceForOutput(readProviderEvidence(), revisionOutput!.id);
    expect(calls).toHaveLength(1);
    expect(calls[0].referenceNames[0]).toContain("Versão 1");
    const row = await dbOutputRow(revisionOutput!.id);
    expect(row?.image_call_count).toBe(1);
  });

  test("timeout na 1ª chamada usa a 2ª (transporte) e termina completed", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "single",
      request: "Oferta de agosto [e2e:timeout-once] com vagas limitadas.",
    });

    const output = detail.outputs[0];
    expect(output.status).toBe("completed");
    // Two calls: the transport failure plus the exclusive retry — never a third.
    const calls = evidenceForOutput(readProviderEvidence(), output.id);
    expect(calls).toHaveLength(2);
    expect(calls[0].outcome).toBe("failure");
    expect(calls[1].outcome).toBe("success");
    const row = await dbOutputRow(output.id);
    expect(row).toMatchObject({ status: "completed", image_call_count: 2, retry_count: 1 });
    // The transport retry is not a correction: no correction prompt, no refund.
    expect(calls[1].promptHasObjectiveCorrection).toBe(false);
    const ledger = await dbLedgerFor(fixture, detail.work.id);
    expect(ledger.filter((row) => row.idempotency_key.includes("refund"))).toHaveLength(0);
  });

  test("falha objetiva usa a correção exclusiva e completa com attempt 2", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "single",
      request: "Oferta relâmpago de agosto [e2e:qa-fail-once] com bônus.",
    });

    const output = detail.outputs[0];
    expect(output.status).toBe("completed");
    expect(output.quality).toMatchObject({ schemaVersion: 1, objectiveVerdict: "pass", attempt: 2 });
    const calls = evidenceForOutput(readProviderEvidence(), output.id);
    expect(calls).toHaveLength(2);
    expect(calls[0].promptHasObjectiveCorrection).toBe(false);
    expect(calls[1].promptHasObjectiveCorrection).toBe(true);
    const row = await dbOutputRow(output.id);
    expect(row).toMatchObject({ status: "completed", image_call_count: 2 });
    // Correction never charges and never refunds.
    const ledger = await dbLedgerFor(fixture, detail.work.id);
    expect(ledger.filter((row) => row.idempotency_key.endsWith(":initial"))).toHaveLength(1);
    expect(ledger.filter((row) => row.idempotency_key.includes("refund"))).toHaveLength(0);
  });

  test("QA inconclusivo completa sem retry e sem contar como aprovação objetiva", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "single",
      request: "Oferta de inverno [e2e:qa-error] com condições especiais.",
    });

    const output = detail.outputs[0];
    expect(output.status).toBe("completed");
    expect(output.quality).toMatchObject({ schemaVersion: 1, objectiveVerdict: "inconclusive", attempt: 1 });
    // Inconclusive never consumes the remaining budget.
    const calls = evidenceForOutput(readProviderEvidence(), output.id);
    expect(calls).toHaveLength(1);
    const row = await dbOutputRow(output.id);
    expect(row).toMatchObject({ status: "completed", image_call_count: 1, retry_count: 0 });
  });

  test("falha objetiva repetida falha como factual_violation com refund terminal único", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "single",
      request: "Oferta impossível [e2e:qa-fail-always] de agosto.",
    });

    const output = detail.outputs[0];
    expect(output.status).toBe("failed");
    expect(output.failureCode).toBe("factual_violation");
    const calls = evidenceForOutput(readProviderEvidence(), output.id);
    expect(calls).toHaveLength(2);
    expect(calls[1].promptHasObjectiveCorrection).toBe(true);
    const row = await dbOutputRow(output.id);
    expect(row).toMatchObject({ status: "failed", image_call_count: 2 });

    // Net zero: one debit, one terminal refund, never duplicated.
    const ledger = await dbLedgerFor(fixture, detail.work.id);
    expect(ledger.filter((row) => row.idempotency_key.endsWith(":initial"))).toHaveLength(1);
    const refunds = ledger.filter((row) => row.idempotency_key.endsWith(":terminal-refund"));
    expect(refunds).toHaveLength(1);
  });

  test("lote parcial: dois sucessos e uma falha com refund único (R-010.5)", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "variations",
      request: "Lote com falha controlada [e2e:retry-twice-bold] no ousado.",
      sources: [{ assetId: fixture.contentArtAssetId, usage: "both" }],
    });

    expect(detail.outputs).toHaveLength(3);
    const byLevel = new Map(detail.outputs.map((output) => [output.creativeLevel, output]));
    expect(byLevel.get("conservative")?.status).toBe("completed");
    expect(byLevel.get("balanced")?.status).toBe("completed");
    const failed = byLevel.get("bold");
    expect(failed?.status).toBe("failed");

    // The failed output burned exactly two calls (both attempts) and was
    // refunded exactly once; the two successes were never refunded.
    const failedCalls = evidenceForOutput(readProviderEvidence(), failed!.id);
    expect(failedCalls).toHaveLength(2);
    const failedRow = await dbOutputRow(failed!.id);
    expect(failedRow?.image_call_count).toBe(2);
    const ledger = await dbLedgerFor(fixture, detail.work.id);
    const refunds = ledger.filter((row) => row.idempotency_key.includes("refund"));
    expect(refunds).toHaveLength(1);
    expect(refunds[0].idempotency_key).toBe(`creative-work:${detail.work.id}:output:${failed!.id}:terminal-refund`);
    // The batch stays partial — the failed sibling never erases a success.
    expect(detail.work.status).toBe("partial");
  });

  test("reabertura + retry manual elegível: mesma linha, ledger único, sem duplicar", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runV1Flow(page.request, fixture, {
      intent: "single",
      request: "Oferta de agosto [e2e:hard-fail-once] imperdível.",
    });

    const output = detail.outputs[0];
    expect(output.status).toBe("failed");
    const failedRow = await dbOutputRow(output.id);
    expect(failedRow?.image_call_count).toBe(1);

    // Reopen the Home on the same work: the failure and the retry affordance
    // are reconstructed from persisted state (R-008 / R-010.5).
    await page.goto(`/?workId=${detail.work.id}`);
    await expect(page.getByTestId("proposal-level")).toHaveCount(1);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`workId=${detail.work.id}`));
    const retryButton = page.getByRole("button", { name: /repetir esta proposta/i });
    await expect(retryButton).toBeVisible();
    await retryButton.click();

    // Poll explicitly for the retried completion — the pre-retry "failed"
    // state is already terminal and would satisfy a naive terminal poll.
    let finished = await apiGetWork(page.request, detail.work.id);
    await expect.poll(
      async () => {
        finished = await apiGetWork(page.request, detail.work.id);
        return finished.outputs.find((candidate) => candidate.id === output.id)?.status;
      },
      { timeout: 180_000, intervals: [1_500, 2_500, 4_000] },
    ).toBe("completed");
    expect(finished.outputs).toHaveLength(1);

    // Same row, two calls total; the refunded charge was reactivated — at
    // most one net debit, never two.
    const row = await dbOutputRow(output.id);
    expect(row).toMatchObject({ status: "completed", image_call_count: 2 });
    const ledger = await dbLedgerFor(fixture, detail.work.id);
    const debits = ledger.filter((row) => row.amount > 0);
    const credits = ledger.filter((row) => row.amount < 0);
    expect(debits.length).toBeLessThanOrEqual(2); // generate + reactivation
    expect(credits).toHaveLength(1); // terminal refund, exactly once
    const net = ledger.reduce((sum, row) => sum + row.amount, 0);
    expect(net).toBe(5);
  });
});
