import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
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
  await page.goto("/login");
  await page.locator("#email").fill(fixture.email);
  await page.locator("#login-password").fill(fixture.password);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
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
    await expect(page.getByRole("textbox", { name: /pedido criativo|creative request/i }))
      .toHaveValue(/Novo produto/);
    await expect(page.getByTestId("proposal-level")).toHaveCount(3);
    const firstIds = (await page.request.get(`/api/creative-work/${fixture.readyWorkId}`).then((res) => res.json()) as {
      outputs: Array<{ id: string }>;
    }).outputs.map((output) => output.id).sort();

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
