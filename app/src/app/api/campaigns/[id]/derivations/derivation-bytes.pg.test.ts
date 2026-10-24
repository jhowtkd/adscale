/**
 * Payload size of the Campaign adapter lists, before vs after pagination (#503, §9.3 item 1):
 * GET /api/campaigns/[id]/derivations per page and per polling cycle, and GET .../assets.
 * Only imports modules that exist both before and after the change, so the SAME file runs on `main`
 * (where both routes still return everything) to record the real "before".
 *
 *   TZ=UTC TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts "src/app/api/campaigns/[id]/derivations/derivation-bytes.pg.test.ts"
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Static on purpose: importing the mocked module in the same Promise.all as the
// route can hand the route another instance of the mock (intermittent 500).
import { requireWorkspaceAccess } from "@/server/auth/workspace";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || null;
const ENABLED = TEST_DATABASE_URL !== null;
// The CI step "Run pagination pg tests" sets REQUIRE_PAGINATION_PG: a skip there
// would pass with 0 tests, so a missing TEST_DATABASE_URL fails the file instead.
if (process.env.REQUIRE_PAGINATION_PG && !ENABLED) {
  throw new Error("REQUIRE_PAGINATION_PG is set but TEST_DATABASE_URL is missing");
}

function unsafeReason(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid url";
  }
  if (!parsed.pathname.slice(1).endsWith("_test")) return "database name must end with _test";
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname)) return "host must be loopback";
  return null;
}
const UNSAFE = TEST_DATABASE_URL ? unsafeReason(TEST_DATABASE_URL) : null;
if (TEST_DATABASE_URL && !UNSAFE) process.env.DATABASE_URL = TEST_DATABASE_URL;

// A signed URL shaped like the real R2 one (462 bytes in the proposal's Appendix A), deterministic per key.
const signedUrl = (key: string) =>
  `https://acct.r2.cloudflarestorage.com/adscale-prod/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256` +
  "&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=0123456789abcdef0123456789abcdef%2F20261023%2Fauto%2Fs3%2Faws4_request" +
  `&X-Amz-Date=20261023T123456Z&X-Amz-Expires=300&X-Amz-Signature=${"a".repeat(64)}&X-Amz-SignedHeaders=host&x-id=GetObject`;

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock("@/server/storage", () => ({
  objectStorage: { signedDownloadUrl: vi.fn(async (key: string) => signedUrl(key)) },
}));

const RUN = `${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
const PIECE_COUNT = 60;
const ASSET_COUNT = 30;
const PAGE = 24;

async function load() {
  const [derivationsRoute, assetsRoute, derivationRepo, assetRepo, campaignRepo, observability, brief, produce, pg] =
    await Promise.all([
      import("./route"),
      import("../assets/route"),
      import("@/server/repositories/derivation"),
      import("@/server/repositories/asset"),
      import("@/server/repositories/campaign"),
      import("@/server/ai/derivation-auto-retry-observability"),
      import("@/server/ai/regeneration-correction-brief"),
      import("@/server/application/resolve-workspace-produce-surface"),
      import("pg"),
    ]);
  return { derivationsRoute, assetsRoute, derivationRepo, assetRepo, campaignRepo, observability, brief, produce, pg };
}
type Mods = Awaited<ReturnType<typeof load>>;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const stamp = (ms: number, micros: number) =>
  `${new Date(ms).toISOString().slice(0, 19).replace("T", " ")}.${pad(ms % 1000, 3)}${pad(micros, 3)}`;
const bytes = (value: string) => Buffer.byteLength(value);
const words = (seed: number, length: number) => {
  const vocabulary = ["oferta", "marca", "verão", "coleção", "contraste", "tipografia", "legível", "chamada", "produto", "fundo"];
  let text = "";
  for (let i = 0; text.length < length; i++) text += `${vocabulary[(seed + i * 7) % vocabulary.length]} `;
  return text.slice(0, length);
};

/** A Peça row with fixed-size text and jsonb, close to what generation, scoring and the quality gate store. */
function pieceRow(i: number, campaignId: string, workspaceId: string, createdAt: string) {
  const status = i < 3 ? "processing" : i < 6 ? "queued" : i === 30 ? "approved" : i % 11 === 0 ? "failed" : "completed";
  const ctaText = ["Compre agora", "Saiba mais", "Garanta o seu"][i % 3];
  const format = ["1:1", "4:5", "9:16"][i % 3];
  const done = status === "completed" || status === "approved";
  return {
    id: crypto.randomUUID(),
    campaign_id: campaignId,
    workspace_id: workspaceId,
    status,
    prompt: words(i, 1400),
    input_prompt: words(i + 1, 700),
    output_key: done ? `outputs/${workspaceId}/${pad(i, 3)}-${format.replace(":", "x")}.png` : null,
    format,
    generation_mode: "art_variation",
    variant_index: i % 3,
    cta_text: ctaText,
    score_status: done ? "analyzed" : "pending",
    quality_score: done ? 70 + (i % 25) : null,
    score_breakdown: done
      ? { ctaClarity: 8, textLegibility: 7, briefMatch: 8, visualQuality: 9, formatFit: 8, informationPreservation: 7 }
      : null,
    score_issues: done && i % 5 === 0 ? [words(i + 2, 90), words(i + 3, 110)] : [],
    qa_status: done ? "ready" : "pending",
    qa_checklist: done
      ? Object.fromEntries(
          ["cta", "legibility", "brand", "format", "contrast", "copy"].map((k) => [k, { status: "pass", note: words(i + k.length, 80) }]),
        )
      : null,
    quality_verdict: done ? "acceptable" : null,
    creative_contract: {
      generationMode: "art_variation",
      targetFormat: format,
      ctaSemantics: { text: ctaText, intent: "purchase", urgency: "medium" },
      baseAssetId: null,
      styleAssetId: null,
      client: "Marca Sintética",
      product: words(i + 4, 60),
      offer: words(i + 5, 80),
      constraints: words(i + 6, 240),
    },
    prompt_provenance: { layers: Array.from({ length: 6 }, (_, k) => ({ source: `layer-${k}`, text: words(i + k, 160) })) },
    frozen_legacy_guidance: { rules: Array.from({ length: 4 }, (_, k) => words(i + k + 9, 120)) },
    olhar_verdict: done
      ? {
          value: "entra",
          axes: { figura: 3, gestalt: 3, voz: 2, convite: 3 },
          whatWorks: [words(i + 7, 90), words(i + 8, 70)],
          whatBlocks: [words(i + 9, 80)],
          directionNote: words(i + 10, 120),
          source: "quality_gate",
          evaluatedAt: "2026-10-23T12:00:00.000Z",
        }
      : null,
    candidates: done
      ? [0, 1].map((k) => ({
          provider: "openai",
          model: "gpt-image-2",
          outputKey: `candidates/${workspaceId}/${pad(i, 3)}-${k}.png`,
          durationMs: 18000 + k * 1000,
          score: 80 - k * 5,
          quality: "acceptable",
          costCredits: 1,
          rawRequestId: `req_${pad(i, 3)}_${k}`,
          winner: k === 0,
        }))
      : null,
    generation_log: { steps: Array.from({ length: 5 }, (_, k) => ({ step: `step-${k}`, note: words(i + k, 100) })) },
    created_at: createdAt,
  };
}

describe.skipIf(!ENABLED)("campaign adapter payload bytes (pg)", () => {
  let m: Mods;
  let pool: InstanceType<Mods["pg"]["Pool"]>;
  let workspaceId = "";
  let campaignId = "";

  async function get(route: "derivations" | "assets", query = ""): Promise<string> {
    vi.mocked(requireWorkspaceAccess).mockResolvedValue({
      workspace: { id: workspaceId, name: "t", slug: "t" },
      user: { id: `user-${RUN}`, email: "t@example.com", name: "t" },
    } as never);
    const handler = route === "derivations" ? m.derivationsRoute.GET : m.assetsRoute.GET;
    const res = await handler(new Request(`http://localhost/api/campaigns/${campaignId}/${route}${query}`), {
      params: Promise.resolve({ id: campaignId }),
    });
    expect(res.status, `${route}${query}`).toBe(200);
    return res.text();
  }

  /** The exact serialization of the pre-pagination GET /derivations (46e2a710). */
  async function legacyDerivationsPayload(): Promise<string> {
    const campaign = await m.campaignRepo.getCampaignById(campaignId, workspaceId);
    const items = await m.derivationRepo.getDerivationsByCampaign(campaignId, workspaceId);
    const derivations = items.map((d) => {
      const base = m.observability.serializeDerivationForApi({ ...d, imageUrl: d.outputKey ? signedUrl(d.outputKey) : null });
      if (!m.brief.derivationHasRegenerationPreview(d)) return base;
      const preview = m.brief.deriveRegenerationPreview(d, m.brief.resolveContractForDerivationRow(d));
      return { ...base, regenerationPrimaryReason: preview.primaryReason, regenerationIssueBreakdown: preview.issueBreakdown };
    });
    const produceSurface = m.produce.resolveWorkspaceProduceSurface({
      campaign: {
        generationMode: campaign!.generationMode,
        creativeLevel: campaign!.creativeLevel,
        ctaVariants: campaign!.ctaVariants,
        targetFormats: campaign!.targetFormats,
      },
      derivations: derivations.map((d) => ({
        id: d.id,
        isPreview: d.isPreview,
        status: d.status,
        imageUrl: d.imageUrl,
        outputKey: d.outputKey,
        qualityVerdict: d.qualityVerdict ?? null,
        hardFailures: d.hardFailures ?? null,
      })) as Parameters<Mods["produce"]["resolveWorkspaceProduceSurface"]>[0]["derivations"],
    });
    return JSON.stringify({ derivations, produceSurface });
  }

  /** The exact serialization of the pre-pagination GET /assets (46e2a710). */
  async function legacyAssetsPayload(): Promise<string> {
    const assets = await m.assetRepo.getAssetsByCampaign(campaignId, workspaceId);
    return JSON.stringify({ assets: assets.map((asset) => ({ ...asset, url: signedUrl(asset.key) })) });
  }

  /** The requests one refetch makes with `pages` pages loaded: page 1, then each following cursor. */
  async function pollingCycle(route: "derivations" | "assets", pages: number) {
    const bodies: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < pages; i++) {
      const body = await get(route, cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
      bodies.push(body);
      cursor = (JSON.parse(body) as { nextCursor?: string | null }).nextCursor ?? null;
      if (!cursor) break;
    }
    return { requests: bodies.length, bytes: bodies.reduce((sum, body) => sum + bytes(body), 0) };
  }

  beforeAll(async () => {
    if (UNSAFE) throw new Error(`unsafe TEST_DATABASE_URL: ${UNSAFE}`);
    m = await load();
    pool = new m.pg.Pool({ connectionString: TEST_DATABASE_URL!, max: 2 });
    const { rows } = await pool.query("select current_database() as name");
    if (rows[0].name !== new URL(TEST_DATABASE_URL!).pathname.slice(1) || !rows[0].name.endsWith("_test")) {
      throw new Error("campaign_bytes_database_mismatch");
    }

    const ws = await pool.query(`insert into adscale_app.workspaces (id, name, slug) values (gen_random_uuid(), $1, $1) returning id`, [
      `campaign-bytes-${RUN}`,
    ]);
    workspaceId = ws.rows[0].id;
    const camp = await pool.query(
      `insert into adscale_app.campaigns (id, workspace_id, name, generation_mode, cta_variants)
       values (gen_random_uuid(), $1, $2, 'art_variation', array['Compre agora','Saiba mais','Garanta o seu']) returning id`,
      [workspaceId, "Lançamento Primavera — Coleção Verão"],
    );
    campaignId = camp.rows[0].id;

    // 60 Peças, one every 10 minutes from 2026-10-01; deterministic text and jsonb sizes.
    const start = Date.UTC(2026, 9, 1, 9);
    const pieces = Array.from({ length: PIECE_COUNT }, (_, i) =>
      pieceRow(PIECE_COUNT - 1 - i, campaignId, workspaceId, stamp(start + i * 600_000, (i * 37) % 1000)),
    );
    await pool.query(
      `insert into adscale_app.derivations (id, campaign_id, workspace_id, status, prompt, input_prompt, output_key, format,
         generation_mode, variant_index, cta_text, score_status, quality_score, score_breakdown, score_issues, qa_status,
         qa_checklist, quality_verdict, creative_contract, prompt_provenance, frozen_legacy_guidance, olhar_verdict,
         candidates, generation_log, created_at)
       select p.id, p.campaign_id, p.workspace_id, p.status, p.prompt, p.input_prompt, p.output_key, p.format,
         p.generation_mode, p.variant_index, p.cta_text, p.score_status, p.quality_score, p.score_breakdown, p.score_issues,
         p.qa_status, p.qa_checklist, p.quality_verdict, p.creative_contract, p.prompt_provenance, p.frozen_legacy_guidance,
         p.olhar_verdict, p.candidates, p.generation_log, p.created_at::timestamp
       from jsonb_to_recordset($1::jsonb) as p(id uuid, campaign_id uuid, workspace_id uuid, status text, prompt text,
         input_prompt text, output_key text, format text, generation_mode text, variant_index int, cta_text text,
         score_status text, quality_score int, score_breakdown jsonb, score_issues jsonb, qa_status text, qa_checklist jsonb,
         quality_verdict text, creative_contract jsonb, prompt_provenance jsonb, frozen_legacy_guidance jsonb,
         olhar_verdict jsonb, candidates jsonb, generation_log jsonb, created_at text)`,
      [JSON.stringify(pieces)],
    );

    // 30 materials: the oldest is the base, the rest are style references (the
    // only two roles `campaign_assets_role_check` accepts).
    const assets = Array.from({ length: ASSET_COUNT }, (_, i) => ({
      id: crypto.randomUUID(),
      key: `assets/${workspaceId}/${pad(i, 3)}-${i === 0 ? "base" : "style"}.png`,
      role: i === 0 ? "base" : "style_reference",
      at: stamp(start + i * 3_600_000, (i * 53) % 1000),
    }));
    await pool.query(
      `insert into adscale_app.campaign_assets (id, campaign_id, workspace_id, key, type, size, width, height, role, metadata,
         analysis_status, created_at)
       select a.id, $2::uuid, $3::uuid, a.key, 'image/png', 812345, 1080, 1350, a.role,
         jsonb_build_object('originalName', a.key, 'dominantColors', jsonb_build_array('#112233', '#445566')),
         'completed', a.at::timestamp
       from jsonb_to_recordset($1::jsonb) as a(id uuid, key text, role text, at text)`,
      [JSON.stringify(assets), campaignId, workspaceId],
    );
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    if (workspaceId) await pool.query("delete from adscale_app.workspaces where id = $1", [workspaceId]);
    await pool.end();
  });

  it("the first page and the polling cycle are smaller than the legacy payload", async () => {
    const legacyDerivations = bytes(await legacyDerivationsPayload());
    const legacyAssets = bytes(await legacyAssetsPayload());

    const firstPage = bytes(await get("derivations"));
    const cycleOnePage = await pollingCycle("derivations", 1);
    const cycleTwoPages = await pollingCycle("derivations", 2);
    const cycleAllPages = await pollingCycle("derivations", Math.ceil(PIECE_COUNT / PAGE));
    const assetsFirstPage = bytes(await get("assets"));

    const ratio = (after: number, before: number) => Number((after / before).toFixed(4));
    const report = {
      pieces: PIECE_COUNT,
      assets: ASSET_COUNT,
      results: [
        { scenario: "derivations-first-page", beforeBytes: legacyDerivations, afterBytes: firstPage, ratio: ratio(firstPage, legacyDerivations) },
        {
          scenario: "derivations-polling-cycle-1-page-loaded",
          beforeBytes: legacyDerivations,
          afterBytes: cycleOnePage.bytes,
          requests: cycleOnePage.requests,
          ratio: ratio(cycleOnePage.bytes, legacyDerivations),
        },
        {
          scenario: "derivations-polling-cycle-2-pages-loaded",
          beforeBytes: legacyDerivations,
          afterBytes: cycleTwoPages.bytes,
          requests: cycleTwoPages.requests,
          ratio: ratio(cycleTwoPages.bytes, legacyDerivations),
        },
        {
          scenario: "derivations-polling-cycle-all-pages-loaded",
          beforeBytes: legacyDerivations,
          afterBytes: cycleAllPages.bytes,
          requests: cycleAllPages.requests,
          ratio: ratio(cycleAllPages.bytes, legacyDerivations),
        },
        { scenario: "assets-first-page", beforeBytes: legacyAssets, afterBytes: assetsFirstPage, ratio: ratio(assetsFirstPage, legacyAssets) },
      ],
    };
    console.log(JSON.stringify(report));

    expect(firstPage).toBeLessThan(legacyDerivations);
    expect(cycleOnePage.bytes).toBeLessThan(legacyDerivations);
    expect(cycleTwoPages.bytes).toBeLessThan(legacyDerivations);
    expect(assetsFirstPage).toBeLessThan(legacyAssets);
    // With every page loaded, a cycle refetches the whole list in 3 requests (R5): it may cost about
    // what the legacy single request did, never a multiple of it.
    expect(cycleAllPages.bytes).toBeLessThan(legacyDerivations * 1.05);
  });
});
