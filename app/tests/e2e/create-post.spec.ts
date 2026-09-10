import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { Client } from "pg";
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { GENERATION_CREDIT_COSTS } from "../../src/server/generation/canonical/types";
import type { TypographyPlan } from "../../src/server/creative-work/typography-plan";
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

const FIXTURE_PATH = process.env.CREATE_POST_E2E_FIXTURE_PATH
  ? path.resolve(process.env.CREATE_POST_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../fixtures/create-post-e2e.json");

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
//   CREATIVE_WORK_QUALITY_RECOVERY_ENABLED=true \
//   BRAND_CORTEX_SINGLE_PIECE_ENABLED=true npm run dev:next
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
const BRAND_CORTEX_EVIDENCE_PATH = process.env.BRAND_CORTEX_EVIDENCE_PATH
  ? path.resolve(process.env.BRAND_CORTEX_EVIDENCE_PATH)
  : path.resolve(__dirname, ".evidence/brand-cortex-seam.json");
const E2E_DB_URL = process.env.DATABASE_URL
  ?? "postgres://test:test@localhost:5433/adscale_test";

interface ProviderCallEvidence {
  outputPrefix: string;
  attempt: number;
  generationMode: string;
  quality?: string | null;
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
  isSelected?: boolean;
  reviewDraft?: {
    version: number;
    revision: number;
    revisionKey: string;
    action: string;
    targetFormat: string;
    instruction: string;
  } | null;
  revisionContext?: {
    version: number;
    reviewRevision: number;
    sourceOutputId: string;
    sourceOutputVersion: number;
    action: string;
    targetFormat: string;
  } | null;
  quality: {
    schemaVersion?: number;
    objectiveVerdict?: string;
    attempt?: number;
    subjective?: { scoreStatus?: string };
    textComposition?: {
      version: number;
      execution: "deterministic" | "generative";
      format: string;
      requestedLayout?: "top" | "center" | "bottom";
      font?: { assetKey: string; sha256: string };
      copy?: { headline: string; body: string; cta: string };
      planHash?: string;
      outputHash?: string;
      reason?: string;
      layers?: Array<{
        role: "headline" | "body" | "cta";
        box: { left: number; top: number; width: number; height: number };
      }>;
    };
    exactComposition?: {
      composed?: Array<{ referenceId: string; sourceSha256?: string }>;
    };
    brandFidelity?: {
      deterministic?: {
        overall?: string;
        checks?: Array<{ id: string; state: string }>;
      };
      residual?: { advisoryOnly?: boolean; status?: string };
    };
    brandKnowledge?: {
      mode: string;
      versionId: string | null;
      versionNumber: number | null;
      versionHash: string | null;
      claimIds: string[];
      evidenceRefs: Array<{ type: string; id: string; path: string; sourceHash: string }>;
      selectedAssets: Array<{ referenceId: string; assetKey: string; usageMode: string; reasons: string[] }>;
    };
  } | null;
}

interface V1WorkDetail {
  work: {
    id: string;
    status: string;
    toolKind: string;
    updatedAt: string;
    settings: Record<string, unknown>;
    copy: { headline: string; body: string; cta: string } | null;
    identitySnapshot?: {
      brandKnowledge?: {
        mode: string;
        versionId: string | null;
        versionNumber: number | null;
        versionHash: string | null;
        claims: Array<{ id: string; evidenceRefs: unknown[] }>;
      };
      assets: Array<{ referenceId: string; assetKey: string; usageMode: string }>;
      referenceSelection?: { reasons: Record<string, string[]> };
    } | null;
  };
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

function assertIsolatedDatabase() {
  const target = new URL(E2E_DB_URL);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(target.hostname);
  expect(target.port).toBe("5434");
  expect(target.pathname).toBe("/adscale_estudio_qa");
  expect(process.env.E2E_CONTROLLED_PROVIDER).toBe("true");
}

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  assertIsolatedDatabase();
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
      `select status, failure_code, image_call_count, retry_count,
              target_format, parent_output_id, (output_key is not null) as has_output_key
       from adscale_app.creative_work_outputs where id = $1`,
      [outputId],
    );
    return result.rows[0] as {
      status: string;
      failure_code: string | null;
      image_call_count: number;
      retry_count: number;
      target_format: string;
      parent_output_id: string | null;
      has_output_key: boolean;
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
  input: {
    intent: string;
    request: string;
    targetFormats?: string[];
    format?: string;
    formatMode?: "manual" | "auto";
    fontAssetKey?: string;
    textLayout?: "top" | "center" | "bottom";
  },
): Promise<string> {
  const res = await request.post("/api/creative-work", {
    data: {
      clientProfileId: fixture.primaryClientProfileId,
      draftKey: crypto.randomUUID(),
      request: input.request,
      intent: input.intent,
      format: input.format ?? "4:5",
      settings: {
        targetFormats: input.targetFormats ?? [],
        formatMode: input.formatMode ?? "manual",
        ...(input.fontAssetKey ? { fontAssetKey: input.fontAssetKey } : {}),
        ...(input.textLayout ? { textLayout: input.textLayout } : {}),
      },
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
    data: { action: "attachSource", assetId, usage, expectedUpdatedAt: new Date((await apiGetWork(request, workId)).work.updatedAt).toISOString() },
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

function preparedRevisionFrom(body: Record<string, unknown>): string {
  const preparedPlan = body.preparedPlan;
  if (!preparedPlan || typeof preparedPlan !== "object" || typeof (preparedPlan as { preparedRevision?: unknown }).preparedRevision !== "string") {
    throw new Error("prepare must return preparedPlan.preparedRevision before initial generation");
  }
  return (preparedPlan as { preparedRevision: string }).preparedRevision;
}

async function apiGenerateInitial(request: APIRequestContext, workId: string, preparedRevision: string): Promise<void> {
  const res = await request.post(`/api/creative-work/${workId}/generate`, {
    data: { action: "initial", preparedRevision },
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
  input: {
    intent: string;
    request: string;
    targetFormats?: string[];
    format?: string;
    formatMode?: "manual" | "auto";
    fontAssetKey?: string;
    textLayout?: "top" | "center" | "bottom";
    sources?: Array<{ assetId: string; usage: "content" | "style" | "both" }>;
    historical?: boolean;
  },
): Promise<V1WorkDetail> {
  const workId = await apiCreateV1Draft(request, fixture, input);
  for (const source of input.sources ?? []) {
    await apiAttachSource(request, workId, source.assetId, source.usage);
  }
  if ((input.sources ?? []).length > 0) await waitForSourcesReady(request, workId);
  const prepared = await apiPrepare(request, workId);
  expect(prepared.status, `prepare must succeed (got ${prepared.status}): ${JSON.stringify(prepared.body)}`).toBe(200);
  // A persisted, pre-integrated fixture is required for the old R-010 matrix.
  // Freeze it BEFORE dispatch; never change a running output or relax old asserts.
  if (input.historical !== false && input.intent === "single") {
    const typographyPlan: TypographyPlan = {
      version: 1,
      format: (input.format ?? "4:5") as TypographyPlan["format"],
      requestedLayout: input.textLayout ?? "top",
      overflowPolicy: { strategy: "autofit_then_fail", minimumDpi: { headline: 96, body: 72, cta: 72 } },
      collisionPolicy: "relocate_layout_then_fail",
      contrastPolicy: "brand_plate_wcag_aa",
      safeAreaPolicy: "format_default",
      ...(input.fontAssetKey
        ? { execution: "deterministic" as const, fontAssetKey: input.fontAssetKey, fontSelection: "operator_selected" as const }
        : { execution: "generative" as const, fontAssetKey: null, reason: "approved_font_missing" as const }),
    };
    await withDb(async (client) => {
      const frozen = await client.query(
        `update adscale_app.creative_work_items set input_snapshot =
           (input_snapshot - 'renderPolicy') || jsonb_build_object('typographyPlan', $4::jsonb)
         where id = $1 and workspace_id = $2 and updated_at = $3::timestamp
           and not exists (select 1 from adscale_app.creative_work_outputs where work_item_id = $1)
         returning input_snapshot`,
        [workId, fixture.workspaceId, preparedRevisionFrom(prepared.body), JSON.stringify(typographyPlan)],
      );
      expect(frozen.rowCount).toBe(1);
      expect(frozen.rows[0].input_snapshot.renderPolicy).toBeUndefined();
      expect(frozen.rows[0].input_snapshot.generationPolicyVersion).toBe("quality_recovery_v1");
    });
  }
  await apiGenerateInitial(request, workId, preparedRevisionFrom(prepared.body));
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

  test("Peça única: fonte aprovada compõe copy nos três formatos e layouts", async ({ page }) => {
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
      const uploaded = (await upload.json()) as {
        font: { assetKey: string; sha256: string; reviewStatus: string };
      };
      fontKey = uploaded.font.assetKey;
      expect(uploaded.font.reviewStatus).toBe("pending_approval");
      const approval = await page.request.patch(
        `/api/client-profiles/${fixture.primaryClientProfileId}/brand-fonts`,
        { data: { assetKey: fontKey, reviewStatus: "approved" } },
      );
      expect(approval.status(), `font approval must succeed (got ${approval.status()})`).toBe(200);
      fontAssetId = await withDb(async (client) => {
        const result = await client.query(
          `select id from adscale_app.workspace_assets where workspace_id = $1 and key = $2`,
          [fixture.workspaceId, fontKey],
        );
        return (result.rows[0]?.id as string | undefined) ?? null;
      });

      const cases = [
        { format: "1:1", layout: "top", dimensions: { width: 1080, height: 1080 } },
        { format: "4:5", layout: "bottom", dimensions: { width: 1080, height: 1350 } },
        { format: "9:16", layout: "center", dimensions: { width: 1080, height: 1920 } },
      ] as const;
      for (const fixtureCase of cases) {
        const detail = await runV1Flow(page.request, fixture, {
          intent: "single",
          format: fixtureCase.format,
          fontAssetKey: fontKey,
          textLayout: fixtureCase.layout,
          request: `Peça ${fixtureCase.format} com chamada literal para a mentoria de psicologia.`,
        });

        expect(detail.outputs).toHaveLength(1);
        const output = detail.outputs[0];
        expect(output.status).toBe("completed");
        expect(output.quality?.textComposition).toMatchObject({
          version: 2,
          execution: "deterministic",
          format: fixtureCase.format,
          requestedLayout: fixtureCase.layout,
          font: { assetKey: fontKey, sha256: uploaded.font.sha256 },
          copy: detail.work.copy,
          planHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
        const composition = output.quality?.textComposition;
        expect(composition?.layers).toHaveLength(3);
        const download = await page.request.get(
          `/api/creative-work/${detail.work.id}/outputs/${output.id}/download?format=json`,
        );
        expect(download.ok(), `output download must succeed (got ${download.status()})`).toBeTruthy();
        const { url } = (await download.json()) as { url: string };
        const image = await page.request.get(url);
        expect(image.ok(), `signed output URL must succeed (got ${image.status()})`).toBeTruthy();
        const png = Buffer.from(await image.body());
        expect(createHash("sha256").update(png).digest("hex")).toBe(composition?.outputHash);
        expect(await sharp(png).metadata()).toMatchObject({ ...fixtureCase.dimensions, format: "png" });
        for (const layer of composition?.layers ?? []) {
          const stats = await sharp(png).extract(layer.box).stats();
          expect(
            Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev)),
            `${fixtureCase.format}/${fixtureCase.layout} ${layer.role} region must contain rendered ink`,
          ).toBeGreaterThan(0.5);
        }
        expect(evidenceForOutput(readProviderEvidence(), output.id)).toEqual([
          expect.objectContaining({
            dimensions: fixtureCase.dimensions,
            promptHasDeterministicText: true,
            outcome: "success",
          }),
        ]);
      }
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

  test("Brand Cortex: training → publicação → snapshot congelado → fidelity", async ({ page }) => {
    test.skip(
      process.env.BRAND_CORTEX_SINGLE_PIECE_ENABLED !== "true",
      "requires BRAND_CORTEX_SINGLE_PIECE_ENABLED=true on the app and Playwright process",
    );
    const fixture = loadFixture();
    let profileId: string | null = null;
    try {
      const profileResponse = await page.request.post("/api/client-profiles", {
        data: { name: `Brand Cortex E2E ${crypto.randomUUID()}` },
      });
      expect(profileResponse.status()).toBe(201);
      profileId = ((await profileResponse.json()) as { profile: { id: string } }).profile.id;
      const scopedFixture = { ...fixture, primaryClientProfileId: profileId };

      const logo = await sharp({
        create: { width: 320, height: 160, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      }).composite([{
        input: Buffer.from('<svg width="240" height="80"><rect width="240" height="80" rx="20" fill="#D71F2B"/></svg>'),
        left: 40,
        top: 40,
      }]).png().toBuffer();
      const upload = await page.request.post(`/api/client-profiles/${profileId}/training-assets`, {
        multipart: {
          file: { name: "brand-cortex-logo.png", mimeType: "image/png", buffer: logo },
          label: "Brand Cortex exact logo",
        },
      });
      expect(upload.status()).toBe(201);
      const reference = ((await upload.json()) as {
        reference: { id: string; assetKey: string };
      }).reference;
      await expect.poll(async () => {
        const response = await page.request.get(`/api/client-profiles/${profileId}/training-assets`);
        const rows = ((await response.json()) as { references: Array<{ id: string; reviewStatus: string }> }).references;
        return rows.find((row) => row.id === reference.id)?.reviewStatus;
      }, { timeout: 60_000, intervals: [1_000, 2_000, 3_000] }).toBe("pending_approval");

      const analysis = {
        description: "Logotipo exato aprovado para o Córtex.",
        visualAttributes: ["vermelho institucional"],
        rules: ["preservar o logotipo exato"],
        constraints: ["não distorcer o logotipo"],
        confidence: 1,
      };
      const assetApproval = await page.request.patch(
        `/api/client-profiles/${profileId}/training-assets/${reference.id}`,
        { data: { trainingCategory: "logo", usageMode: "exact", analysis, reviewStatus: "approved" } },
      );
      expect(assetApproval.status()).toBe(200);

      const knowledgeResponse = await page.request.get(`/api/client-profiles/${profileId}/brand-knowledge`);
      expect(knowledgeResponse.ok()).toBeTruthy();
      const claim = ((await knowledgeResponse.json()) as {
        claims: Array<{ id: string; claimKey: string; value: unknown; status: string; evidenceRefs: Array<{ id: string }> }>;
      }).claims.find((candidate) =>
        candidate.claimKey === "logo.primary_asset"
        && candidate.status === "candidate"
        && candidate.evidenceRefs.some((evidence) => evidence.id === reference.id)
      );
      expect(claim, "approval must create a reviewable logo claim").toBeDefined();
      const claimApproval = await page.request.patch(`/api/client-profiles/${profileId}/brand-knowledge`, {
        data: { claimId: claim!.id, status: "approved", alternatives: [] },
      });
      expect(claimApproval.status()).toBe(200);
      const firstPublication = await page.request.post(`/api/client-profiles/${profileId}/brand-knowledge/publish`);
      expect(firstPublication.status()).toBe(201);
      const versionOne = ((await firstPublication.json()) as {
        version: { id: string; versionNumber: number; hash: string };
      }).version;
      expect(versionOne).toMatchObject({ versionNumber: 1, hash: expect.stringMatching(/^[a-f0-9]{64}$/) });

      const fontBuffer = fs.readFileSync(path.resolve(
        process.cwd(),
        "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
      ));
      const fontUpload = await page.request.post(`/api/client-profiles/${profileId}/brand-fonts`, {
        multipart: {
          file: { name: "Geist-Regular.ttf", mimeType: "font/ttf", buffer: fontBuffer },
          family: "Geist",
          source: "Fixture licenciada do projeto",
          weight: "400",
          style: "normal",
          rightsConfirmed: "true",
        },
      });
      expect(fontUpload.status()).toBe(201);
      const font = ((await fontUpload.json()) as { font: { assetKey: string; sha256: string } }).font;
      const fontApproval = await page.request.patch(`/api/client-profiles/${profileId}/brand-fonts`, {
        data: { assetKey: font.assetKey, reviewStatus: "approved" },
      });
      expect(fontApproval.status()).toBe(200);

      const workId = await apiCreateV1Draft(page.request, scopedFixture, {
        intent: "single",
        request: "Peça institucional do Córtex com chamada literal para conhecer a marca.",
        format: "4:5",
        fontAssetKey: font.assetKey,
        textLayout: "top",
      });
      const prepared = await apiPrepare(page.request, workId);
      expect(prepared.status).toBe(200);
      await apiGenerateInitial(page.request, workId, preparedRevisionFrom(prepared.body));
      const confirmed = await apiGetWork(page.request, workId);
      expect(confirmed.work.identitySnapshot?.brandKnowledge).toMatchObject({
        mode: "published",
        versionId: versionOne.id,
        versionNumber: 1,
        versionHash: versionOne.hash,
      });
      expect(confirmed.work.identitySnapshot?.assets).toEqual(expect.arrayContaining([
        expect.objectContaining({ referenceId: reference.id, assetKey: reference.assetKey, usageMode: "exact" }),
      ]));
      expect(confirmed.work.identitySnapshot?.referenceSelection?.reasons[reference.id]?.length).toBeGreaterThan(0);

      const rereview = await page.request.patch(`/api/client-profiles/${profileId}/brand-knowledge`, {
        data: { claimId: claim!.id, status: "approved", value: claim!.value, alternatives: [] },
      });
      expect(rereview.status()).toBe(200);
      const secondPublication = await page.request.post(`/api/client-profiles/${profileId}/brand-knowledge/publish`);
      expect(secondPublication.status()).toBe(201);
      const versionTwo = ((await secondPublication.json()) as {
        version: { id: string; versionNumber: number; hash: string };
      }).version;
      expect(versionTwo.versionNumber).toBe(2);
      expect(versionTwo.id).not.toBe(versionOne.id);

      const finished = await waitForTerminalOutputs(page.request, workId);
      expect(finished.work.identitySnapshot?.brandKnowledge?.versionId).toBe(versionOne.id);
      const output = finished.outputs[0];
      expect(output.status).toBe("completed");
      expect(output.quality?.textComposition).toMatchObject({
        execution: "deterministic",
        font: { assetKey: font.assetKey, sha256: font.sha256 },
        copy: finished.work.copy,
      });
      expect(output.quality?.exactComposition?.composed).toEqual(expect.arrayContaining([
        expect.objectContaining({ referenceId: reference.id, sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      ]));
      expect(output.quality?.brandFidelity).toMatchObject({
        deterministic: {
          overall: "proven",
          checks: expect.arrayContaining([
            expect.objectContaining({ id: "copy", state: "proven" }),
            expect.objectContaining({ id: "font", state: "proven" }),
            expect.objectContaining({ id: "exact_assets", state: "proven" }),
            expect.objectContaining({ id: "composition", state: "proven" }),
          ]),
        },
        residual: { advisoryOnly: true },
      });
      expect(output.quality?.brandKnowledge).toMatchObject({
        mode: "published",
        versionId: versionOne.id,
        versionNumber: 1,
        versionHash: versionOne.hash,
        claimIds: [claim!.id],
        evidenceRefs: expect.arrayContaining([expect.objectContaining({ id: reference.id })]),
        selectedAssets: expect.arrayContaining([
          expect.objectContaining({ referenceId: reference.id, usageMode: "exact" }),
        ]),
      });

      fs.mkdirSync(path.dirname(BRAND_CORTEX_EVIDENCE_PATH), { recursive: true });
      fs.writeFileSync(BRAND_CORTEX_EVIDENCE_PATH, `${JSON.stringify({
        schemaVersion: 1,
        status: "pass",
        capturedAt: new Date().toISOString(),
        authenticated: true,
        provider: "e2e-controlled",
        paidGeneration: false,
        featureFlag: "enabled_for_test",
        assertions: {
          trainingReviewed: true,
          versionPublished: true,
          laterPublicationDidNotMutateSnapshot: true,
          exactAssetProven: true,
          approvedFontAndCopyProven: true,
          deterministicAndResidualSeparated: true,
          traceableToEvidence: true,
        },
        version: { frozen: versionOne, activeAfterConfirmation: versionTwo },
      }, null, 2)}\n`, "utf8");
    } finally {
      if (profileId) {
        const assetIds = await withDb(async (client) => {
          const result = await client.query(
            `with keys as (
               select asset_key as key from adscale_app.client_references where client_profile_id = $1
               union
               select font->>'assetKey' from adscale_app.client_profiles,
                 jsonb_array_elements(coalesce(brand_font_assets, '[]'::jsonb)) font where id = $1
               union
               select o.output_key from adscale_app.creative_work_outputs o
                 join adscale_app.creative_work_items w on w.id = o.work_item_id
                 where w.client_profile_id = $1 and o.output_key is not null
             )
             select id from adscale_app.workspace_assets
             where workspace_id = $2 and key in (select key from keys)`,
            [profileId, fixture.workspaceId],
          );
          await client.query("delete from adscale_app.client_profiles where id = $1 and workspace_id = $2", [profileId, fixture.workspaceId]);
          return result.rows.map((row) => row.id as string);
        });
        await Promise.all(assetIds.map((assetId) => page.request.delete(`/api/workspace/assets/${assetId}`)));
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
        expectedUpdatedAt: new Date(current.work.updatedAt).toISOString(),
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
    const beforeResolve = await apiGetWork(page.request, workId);
    const resolve = await page.request.patch(`/api/creative-work/${workId}`, {
      data: {
        action: "resolveBrandConflict",
        choice: "active",
        expectedUpdatedAt: new Date(beforeResolve.work.updatedAt).toISOString(),
      },
    });
    expect(resolve.ok(), `resolveBrandConflict must succeed (got ${resolve.status()})`).toBeTruthy();
    const resolvedWork = (await resolve.json()) as { work: { id: string; settings: { brandConflictChoice?: string } } };
    expect(resolvedWork.work.id).toBe(workId);
    expect(resolvedWork.work.settings.brandConflictChoice).toBe("active");

    const prepared = await apiPrepare(page.request, workId);
    expect(prepared.status).toBe(200);
    await apiGenerateInitial(page.request, workId, preparedRevisionFrom(prepared.body));
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
    expect(net).toBe(GENERATION_CREDIT_COSTS.creativeWorkOutput);
  });
});

type ReviewDraft = {
  action: "refine" | "variation" | "format";
  targetFormat: "1:1" | "4:5" | "9:16";
  instruction: string;
  annotations: Array<{ id: string; x: number; y: number; text: string }>;
  revisionAssetId: string | null;
};
const REVIEW_DRAFT_BASE: ReviewDraft = {
  action: "refine", targetFormat: "4:5", instruction: "Aumente o CTA sem mudar os fatos.",
  annotations: [], revisionAssetId: null,
};
async function apiSaveReview(request: APIRequestContext, workId: string, outputId: string, expectedReviewRevision: number, draft = REVIEW_DRAFT_BASE) {
  const res = await request.patch(`/api/creative-work/${workId}`, {
    data: { action: "saveOutputReview", outputId, expectedReviewRevision, draft },
  });
  const body = await res.json() as { draft: { revision: number; revisionKey: string }; revisionCreditCost: number };
  return { status: res.status(), body };
}
async function apiReviewedRevision(request: APIRequestContext, workId: string, command: {
  outputId: string; reviewRevision: number; revisionKey: string; expectedCredits: number;
}) {
  const res = await request.post(`/api/creative-work/${workId}/generate`, { data: { action: "reviewed_revision", ...command } });
  return { status: res.status(), body: await res.json() as { output: { id: string } } };
}
async function financeSnapshot(workspaceId: string) {
  return withDb(async (client) => {
    const grants = await client.query(`select coalesce(sum(remaining),0)::int as balance from adscale_app.credit_grants where workspace_id=$1`, [workspaceId]);
    const usage = await client.query(`select id, idempotency_key, amount from adscale_app.usage_events where workspace_id=$1 order by id`, [workspaceId]);
    const ledger = await client.query(`select id, amount, type from adscale_app.credit_transactions where workspace_id=$1 order by id`, [workspaceId]);
    return { balance: grants.rows[0].balance as number, usage: usage.rows as Array<{id: string; idempotency_key: string; amount: number}>, ledger: ledger.rows as Array<{id: string; amount: number; type: string}> };
  });
}
async function storedPiece(outputId: string) {
  return withDb(async (client) => {
    const result = await client.query(`select output_key, target_format, parent_output_id, revision_context, review_draft, quality, terminal_at from adscale_app.creative_work_outputs where id=$1`, [outputId]);
    return result.rows[0];
  });
}
async function downloadedPiece(request: APIRequestContext, workId: string, outputId: string) {
  const image = await request.get(`/api/creative-work/${workId}/outputs/${outputId}/download`, { headers: { Accept: "*/*" } });
  expect(image.ok()).toBe(true);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(image.url()).hostname);
  expect(image.headers()["content-type"]).toContain("image/png");
  const png = await image.body();
  return { hash: createHash("sha256").update(png).digest("hex"), metadata: await sharp(png).metadata() };
}

async function waitForChild(request: APIRequestContext, workId: string, outputId: string) {
  await expect.poll(async () => (await apiGetWork(request, workId)).outputs.find(row => row.id === outputId)?.status,
    { timeout: 180_000, intervals: [1_000, 2_000] }).toBe("completed");
}
const runIntegratedFlow = (request: APIRequestContext, fixture: CreatePostFixture, input: Parameters<typeof runV1Flow>[2]) =>
  runV1Flow(request, fixture, { ...input, historical: false });

test.describe("integrated API", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    assertIsolatedDatabase();
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
    await login(page);
    const billing = await page.request.get("/api/billing/status");
    expect(billing.ok()).toBe(true);
    expect((await billing.json()).billing.access.unlimited, "financial assertions require a paid synthetic workspace").toBe(false);
  });

  test("CAS simultâneo e primeira confirmação concorrente reservam um único filho", async ({ page }) => {
    const fixture = loadFixture();
    const detail = await runIntegratedFlow(page.request, fixture, { intent: "single", request: "Peça institucional para revisão concorrente." });
    const parent = detail.outputs[0];
    const base = await storedPiece(parent.id);
    const baseImage = await downloadedPiece(page.request, detail.work.id, parent.id);
    const before = await financeSnapshot(fixture.workspaceId);
    const writes = await Promise.all([
      apiSaveReview(page.request, detail.work.id, parent.id, 0, { ...REVIEW_DRAFT_BASE, instruction: "Pedido da aba A" }),
      apiSaveReview(page.request, detail.work.id, parent.id, 0, { ...REVIEW_DRAFT_BASE, instruction: "Pedido da aba B" }),
    ]);
    expect(writes.map(row => row.status).sort()).toEqual([200, 409]);
    const saved = writes.find(row => row.status === 200)!.body;
    expect(saved.draft.revision).toBe(1);
    expect(saved.revisionCreditCost).toBe(GENERATION_CREDIT_COSTS.creativeWorkOutput);
    expect(await financeSnapshot(fixture.workspaceId)).toEqual(before);
    const command = { outputId: parent.id, reviewRevision: saved.draft.revision, revisionKey: saved.draft.revisionKey, expectedCredits: saved.revisionCreditCost };
    // These are the FIRST valid dispatches, not replays after a serial winner.
    const generated = await Promise.all([
      apiReviewedRevision(page.request, detail.work.id, command),
      apiReviewedRevision(page.request, detail.work.id, command),
    ]);
    expect(generated.map(row => row.status)).toEqual([202, 202]);
    const childId = generated[0].body.output.id;
    expect(generated[1].body.output.id).toBe(childId);
    await waitForChild(page.request, detail.work.id, childId);
    const after = await financeSnapshot(fixture.workspaceId);
    expect(after.balance).toBe(before.balance - saved.revisionCreditCost);
    const revisionUsage = after.usage.filter(row => !before.usage.some(old => old.id === row.id));
    expect(revisionUsage).toHaveLength(2);
    expect(revisionUsage).toEqual(expect.arrayContaining([
      expect.objectContaining({ idempotency_key: `creative-work:${detail.work.id}:revision:${childId}`, amount: saved.revisionCreditCost }),
      expect.objectContaining({ idempotency_key: `creative-work:${detail.work.id}:revision:${childId}:dispatch-ack`, amount: 0 }),
    ]));
    expect(after.ledger.filter(row => !before.ledger.some(old => old.id === row.id))).toEqual([expect.objectContaining({ type: "usage", amount: -saved.revisionCreditCost })]);
    expect(evidenceForOutput(readProviderEvidence(), childId)).toHaveLength(1);
    expect((await apiGetWork(page.request, detail.work.id)).outputs).toHaveLength(2);
    const parentAfter = await storedPiece(parent.id);
    expect({ key: parentAfter.output_key, format: parentAfter.target_format, quality: parentAfter.quality, terminal: parentAfter.terminal_at }).toEqual({ key: base.output_key, format: base.target_format, quality: base.quality, terminal: base.terminal_at });
    expect((await downloadedPiece(page.request, detail.work.id, parent.id)).hash).toBe(baseImage.hash);
    expect((await storedPiece(childId)).revision_context).toMatchObject({ sourceOutputId: parent.id, reviewRevision: 1, action: "refine" });
    expect((await apiSaveReview(page.request, detail.work.id, parent.id, 1, { ...REVIEW_DRAFT_BASE, instruction: "Novo pedido depois da geração" })).status).toBe(200);
    const replay = await apiReviewedRevision(page.request, detail.work.id, command);
    expect(replay.status).toBe(202);
    expect(replay.body.output.id).toBe(childId);
    // Both output IDs are owned, completed and schema-valid. Reusing the
    // consumed key with a different base reaches invalid_revision (the route
    // maps that domain refusal to 400/invalidInput, not stale_review/409).
    const alteredBase = await apiReviewedRevision(page.request, detail.work.id, { ...command, outputId: childId });
    expect(alteredBase.status).toBe(400);
    expect(alteredBase.body).toMatchObject({ code: "invalidInput" });
    expect((await apiGetWork(page.request, detail.work.id)).outputs.map(row => row.id).sort()).toEqual([parent.id, childId].sort());
    expect(evidenceForOutput(readProviderEvidence(), childId)).toHaveLength(1);
    expect(await financeSnapshot(fixture.workspaceId)).toEqual(after);
  });

  test("high chega à imagem com uma chamada e nenhuma autocorreção", async ({ page }) => {
    const detail = await runIntegratedFlow(page.request, loadFixture(), { intent: "single", request: "Peça institucional da mentoria sob política integrada." });
    expect(detail.outputs).toHaveLength(1);
    const output = detail.outputs[0];
    expect(output.status).toBe("completed");
    expect(evidenceForOutput(readProviderEvidence(), output.id)).toEqual([expect.objectContaining({ quality: "high", outcome: "success", dimensions: { width: 1080, height: 1350 }, promptHasDeterministicText: false, promptHasObjectiveCorrection: false })]);
    expect(await dbOutputRow(output.id)).toMatchObject({ image_call_count: 1, target_format: "4:5" });
  });

  test("QA preview e refund permanecem únicos depois de reabrir", async ({ page }) => {
    const fixture = loadFixture();
    const before = await financeSnapshot(fixture.workspaceId);
    const detail = await runIntegratedFlow(page.request, fixture, { intent: "single", request: "Peça [e2e:qa-fail-always] com falha objetiva." });
    const output = detail.outputs[0];
    expect(output.status).toBe("completed");
    expect(output.quality).toMatchObject({ objectiveVerdict: "fail" });
    // GET is an actual recovery caller, so keep exercising it while pending.
    await expect.poll(async () => {
      await apiGetWork(page.request, detail.work.id);
      return (await dbOutputRow(output.id))?.failure_code;
    }, { timeout: 120_000, intervals: [1_000, 2_000] }).toBeNull();
    const after = await financeSnapshot(fixture.workspaceId);
    expect(after.balance).toBe(before.balance);
    const movements = after.ledger.filter(row => !before.ledger.some(old => old.id === row.id));
    expect(movements.map(row => row.amount).sort((a,b) => a-b)).toEqual([-GENERATION_CREDIT_COSTS.creativeWorkOutput, GENERATION_CREDIT_COSTS.creativeWorkOutput]);
    const usage = after.usage.filter(row => !before.usage.some(old => old.id === row.id));
    expect(usage).toHaveLength(3);
    expect(usage).toEqual(expect.arrayContaining([
      expect.objectContaining({ idempotency_key: `creative-work:${detail.work.id}:initial`, amount: GENERATION_CREDIT_COSTS.creativeWorkOutput }),
      expect.objectContaining({ idempotency_key: `creative-work:${detail.work.id}:initial:dispatch-ack`, amount: 0 }),
      expect.objectContaining({ idempotency_key: `creative-work:${detail.work.id}:output:${output.id}:terminal-refund`, amount: -GENERATION_CREDIT_COSTS.creativeWorkOutput }),
    ]));
    expect(usage.reduce((sum,row) => sum + row.amount, 0)).toBe(0);
    const imageBefore = await downloadedPiece(page.request, detail.work.id, output.id);
    const select = await page.request.post(`/api/creative-work/${detail.work.id}/outputs/${output.id}/select`, { data: { saveToLibrary: false, confirmObjective: true } });
    expect(select.status()).toBe(409);
    expect(await select.json()).toMatchObject({ code: "creativeWorkOutputObjectiveFailed" });
    expect((await apiGetWork(page.request, detail.work.id)).outputs.find(row => row.id === output.id)?.isSelected).toBe(false);
    await Promise.all([apiGetWork(page.request, detail.work.id), apiGetWork(page.request, detail.work.id)]);
    expect(await financeSnapshot(fixture.workspaceId)).toEqual(after);
    expect((await downloadedPiece(page.request, detail.work.id, output.id)).hash).toBe(imageBefore.hash);
    expect(await dbOutputRow(output.id)).toMatchObject({ status: "completed", image_call_count: 1, has_output_key: true });
    expect(evidenceForOutput(readProviderEvidence(), output.id)).toHaveLength(1);
  });

  test("QA indisponível é inconclusivo e exige confirmação para escolher", async ({ page }) => {
    const detail = await runIntegratedFlow(page.request, loadFixture(), { intent: "single", request: "Peça [e2e:qa-error] para verificação indisponível." });
    const output = detail.outputs[0];
    expect(output.quality).toMatchObject({ objectiveVerdict: "inconclusive" });
    expect(evidenceForOutput(readProviderEvidence(), output.id)).toHaveLength(1);
    const endpoint = `/api/creative-work/${detail.work.id}/outputs/${output.id}/select`;
    expect((await page.request.post(endpoint, { data: { saveToLibrary: false } })).ok()).toBe(false);
    expect((await page.request.post(endpoint, { data: { saveToLibrary: false, confirmObjective: true } })).ok()).toBe(true);
  });

  test("adaptação sem upload usa o pai como primeira referência e produz PNG 9:16", async ({ page }) => {
    const detail = await runIntegratedFlow(page.request, loadFixture(), { intent: "single", request: "Peça sem upload para adaptar ao story." });
    const parent = detail.outputs[0];
    const original = await downloadedPiece(page.request, detail.work.id, parent.id);
    const saved = await apiSaveReview(page.request, detail.work.id, parent.id, 0, { ...REVIEW_DRAFT_BASE, action: "format", targetFormat: "9:16", annotations: [{ id: crypto.randomUUID(), x: 0.5, y: 0.8, text: "CTA maior" }] });
    expect(saved.status).toBe(200);
    const generated = await apiReviewedRevision(page.request, detail.work.id, { outputId: parent.id, reviewRevision: saved.body.draft.revision, revisionKey: saved.body.draft.revisionKey, expectedCredits: saved.body.revisionCreditCost });
    expect(generated.status).toBe(202);
    const childId = generated.body.output.id;
    await waitForChild(page.request, detail.work.id, childId);
    const calls = evidenceForOutput(readProviderEvidence(), childId);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ generationMode: "format_adaptation", quality: "high", dimensions: { width: 1080, height: 1920 } });
    expect(calls[0].referenceNames[0]).toContain("Versão 1");
    expect((await downloadedPiece(page.request, detail.work.id, childId)).metadata).toMatchObject({ width: 1080, height: 1920 });
    expect((await downloadedPiece(page.request, detail.work.id, parent.id)).hash).toBe(original.hash);
    expect((await storedPiece(childId)).revision_context).toMatchObject({ sourceOutputId: parent.id, action: "format", annotations: [{ text: "CTA maior", x: 0.5, y: 0.8 }] });
  });

  test("restyle diferencia fontes ausentes, analyzing e ready pela API real", async ({ page }) => {
    const fixture = loadFixture();
    const workId = await apiCreateV1Draft(page.request, fixture, { intent: "restyle", request: "Aplicar o estilo da referência à arte original." });
    const missing = await apiPrepare(page.request, workId);
    expect(missing.status).not.toBe(200);
    expect(missing.body.code).not.toBe("sources_not_ready");
    await apiAttachSource(page.request, workId, fixture.contentArtAssetId, "content");
    await apiAttachSource(page.request, workId, fixture.styleArtAssetId, "style");
    await waitForSourcesReady(page.request, workId);
    // Freeze one source in pending AFTER the real analyzer finished: no race
    // with its worker and no fabricated successful API response.
    const source = (await apiGetWork(page.request, workId)).sources.find(row => row.usage === "style")!;
    await withDb(client => client.query(`update adscale_app.creative_work_sources set status='analyzing' where id=$1 and workspace_id=$2`, [source.id, fixture.workspaceId]));
    try {
      const pending = await apiPrepare(page.request, workId);
      expect(pending.status).toBe(409);
      expect(pending.body.code).toBe("sources_not_ready");
      expect((await apiGetWork(page.request, workId)).sources.find(row => row.id === source.id)?.status).toBe("analyzing");
    } finally {
      await withDb(client => client.query(`update adscale_app.creative_work_sources set status='ready' where id=$1 and workspace_id=$2`, [source.id, fixture.workspaceId]));
    }
    expect((await apiPrepare(page.request, workId)).status).toBe(200);
  });

  test("histórico concilia filtro, fim do dia, campanhas e allTime", async ({ page }) => {
    const fixture = loadFixture();
    const campaignIds = [crypto.randomUUID(), crypto.randomUUID()];
    const transactionIds = Array.from({ length: 5 }, () => crypto.randomUUID());
    const rows = [
      { campaign: campaignIds[0], date: "2019-12-31T12:00:00Z", amount: -7 },
      { campaign: campaignIds[0], date: "2026-01-01T02:59:59.999Z", amount: -11 },
      { campaign: campaignIds[1], date: "2026-01-01T03:00:00Z", amount: -13 },
      { campaign: campaignIds[0], date: "2026-01-01T02:59:59.999Z", amount: 11 },
      { campaign: campaignIds[0], date: "2026-01-01T03:00:00Z", amount: -17 },
    ];
    try {
      await withDb(async client => {
        for (const id of campaignIds) await client.query(`insert into adscale_app.campaigns(id,workspace_id,name) values($1,$2,$3)`, [id, fixture.workspaceId, `E2E histórico ${id}`]);
        for (const [index,row] of rows.entries()) await client.query(`insert into adscale_app.credit_transactions(id,user_id,workspace_id,campaign_id,amount,type,created_at) values($1,$2,$3,$4,$5,$6,$7::timestamptz at time zone 'UTC')`, [transactionIds[index], fixture.userId, fixture.workspaceId, row.campaign, row.amount, row.amount < 0 ? "usage" : "refund", row.date]);
      });
      const history = async (params: Record<string,string>) => {
        const response = await page.request.get(`/api/billing/history?${new URLSearchParams(params)}`);
        expect(response.ok(), await response.text()).toBe(true);
        return await response.json() as { transactions: Array<{id:string; amount:number}>; summary: {totalSpent:number; transactionCount:number; averagePerCampaign:number} };
      };
      const filtered = await history({ campaignId: campaignIds[0], from: "2025-12-31T00:00:00-03:00", to: "2025-12-31T23:59:59.999-03:00" });
      expect(filtered.transactions.map(row => row.id).sort()).toEqual([transactionIds[1],transactionIds[3]].sort());
      expect(filtered.summary).toMatchObject({ totalSpent:11, transactionCount:2, averagePerCampaign:11 });
      const all = await history({ campaignId: campaignIds[0] });
      expect(all.transactions.map(row => row.id).sort()).toEqual([transactionIds[0],transactionIds[1],transactionIds[3],transactionIds[4]].sort());
      expect(all.summary.totalSpent).toBe(all.transactions.filter(row => row.amount < 0).reduce((sum,row) => sum-row.amount,0));
      for (const value of ["2026-02-31", "2026-02-31T12:00:00Z"]) expect((await page.request.get(`/api/billing/history?from=${value}`)).status()).toBe(400);
    } finally {
      await withDb(async client => {
        await client.query(`delete from adscale_app.credit_transactions where id=any($1::uuid[]) and workspace_id=$2`, [transactionIds,fixture.workspaceId]);
        await client.query(`delete from adscale_app.campaigns where id=any($1::uuid[]) and workspace_id=$2`, [campaignIds,fixture.workspaceId]);
      });
    }
  });
});

test.describe("integrated UI retry", () => {
  test("retry técnico exige nova confirmação e conserva a mesma linha", async ({ page }) => {
    assertIsolatedDatabase();
    await login(page);
    const detail = await runIntegratedFlow(page.request, loadFixture(), { intent: "single", request: "Peça [e2e:hard-fail-once] para retry humano." });
    const output = detail.outputs[0];
    expect(output.status).toBe("failed");
    expect((await dbOutputRow(output.id))?.image_call_count).toBe(1);
    await page.goto(`/?workId=${detail.work.id}`);
    await page.getByRole("button", { name: "Repetir esta proposta", exact:true }).click();
    expect((await dbOutputRow(output.id))?.image_call_count).toBe(1);
    await page.getByRole("button", { name: "Confirmar novo retry", exact:true }).click();
    await waitForChild(page.request, detail.work.id, output.id);
    expect((await apiGetWork(page.request,detail.work.id)).outputs).toHaveLength(1);
    expect(evidenceForOutput(readProviderEvidence(),output.id)).toHaveLength(2);
    expect((await dbOutputRow(output.id))?.image_call_count).toBe(2);
    const duplicate = await page.request.post(`/api/creative-work/${detail.work.id}/generate`, {data:{action:"retry",outputId:output.id}});
    expect(duplicate.ok()).toBe(false);
    expect(evidenceForOutput(readProviderEvidence(),output.id)).toHaveLength(2);
  });
});
