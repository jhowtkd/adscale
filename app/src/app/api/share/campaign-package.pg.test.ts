import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { campaigns, derivations, shareLinks, workspaces } from "@/server/db/schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test")) {
    throw new Error("Campaign share tests require a loopback test database");
  }
  process.env.DATABASE_URL = databaseUrl;
}

const scope = vi.hoisted(() => ({ workspaceId: "" }));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(async () => ({ user: { id: "share-test" }, workspace: { id: scope.workspaceId } })),
}));
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en"),
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/with-rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/server/beta-analytics/record", () => ({ recordBetaAnalyticsEvent: vi.fn(async () => undefined) }));
vi.mock("@/server/beta-analytics/share-analytics", () => ({ recordShareLinkOpened: vi.fn(async () => undefined) }));
vi.mock("@/server/storage", () => ({
  objectStorage: { signedDownloadUrl: vi.fn(async (key: string) => `https://storage.example/${key}`) },
}));

async function load() {
  const [route, page, asset, repository] = await Promise.all([
    import("./route"),
    import("@/app/share/[token]/page"),
    import("./[token]/asset/[derivationId]/route"),
    import("@/server/repositories/share-link"),
  ]);
  return { route, page: page.default, asset, repository };
}

describe.skipIf(!databaseUrl)("campaign share tenant binding (Postgres)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  let modules: Awaited<ReturnType<typeof load>>;
  let workspaceIds: string[] = [];
  let ownCampaign: string;
  let siblingCampaign: string;
  let victimCampaign: string;
  let ownPiece: string;
  let siblingPiece: string;
  let foreignPiece: string;
  let unfinishedPiece: string;
  let inconsistentPiece: string;

  beforeAll(async () => {
    modules = await load();
    const rows = await db.insert(workspaces).values(["a", "b"].map((label) => ({
      name: `Share ${label}`, slug: `share-${label}-${crypto.randomUUID()}`,
    }))).returning();
    workspaceIds = rows.map((row) => row.id);
    scope.workspaceId = workspaceIds[0];
    const seededCampaigns = await db.insert(campaigns).values([
      { workspaceId: workspaceIds[0], name: "own campaign", client: "own client", notes: "own notes" },
      { workspaceId: workspaceIds[0], name: "sibling campaign" },
      { workspaceId: workspaceIds[1], name: "victim campaign", client: "victim client", notes: "victim notes" },
    ]).returning();
    [ownCampaign, siblingCampaign, victimCampaign] = seededCampaigns.map((row) => row.id);
    const pieces = await db.insert(derivations).values([
      { workspaceId: workspaceIds[0], campaignId: ownCampaign, status: "completed", outputKey: "own.png", ctaText: "own CTA" },
      { workspaceId: workspaceIds[0], campaignId: siblingCampaign, outputKey: "sibling.png", ctaText: "sibling CTA" },
      { workspaceId: workspaceIds[1], campaignId: victimCampaign, outputKey: "victim.png", ctaText: "victim CTA" },
      { workspaceId: workspaceIds[0], campaignId: ownCampaign, outputKey: null },
      { workspaceId: workspaceIds[1], campaignId: ownCampaign, outputKey: "inconsistent.png" },
    ]).returning();
    [ownPiece, siblingPiece, foreignPiece, unfinishedPiece, inconsistentPiece] = pieces.map((row) => row.id);
  }, 15_000);

  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await pool.end();
  });

  function create(campaignId: string, derivationIds: string[]) {
    return modules.route.POST(new Request("http://localhost/api/share", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, derivationIds }),
    }));
  }

  async function html(token: string) {
    return renderToStaticMarkup(await modules.page({ params: Promise.resolve({ token }) }));
  }

  function download(token: string, derivationId: string) {
    return modules.asset.GET(new Request("http://localhost"), {
      params: Promise.resolve({ token, derivationId }),
    });
  }

  async function legacyLink(campaignId: string, derivationIds: string[]) {
    return modules.repository.createShareLink({
      token: crypto.randomUUID(), workspaceId: scope.workspaceId, campaignId, derivationIds,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
  }

  it("rejects a foreign campaign without creating a public capability", async () => {
    const before = await db.select().from(shareLinks).where(eq(shareLinks.workspaceId, scope.workspaceId));
    expect((await create(victimCampaign, [ownPiece])).status).toBe(404);
    expect(await db.select().from(shareLinks).where(eq(shareLinks.workspaceId, scope.workspaceId))).toEqual(before);
  });

  it.each(["foreign", "sibling", "missing", "unfinished", "inconsistent"])("rejects an entire selection containing a %s piece", async (kind) => {
    const bad = { foreign: foreignPiece, sibling: siblingPiece, missing: crypto.randomUUID(), unfinished: unfinishedPiece, inconsistent: inconsistentPiece }[kind]!;
    const before = await db.select().from(shareLinks).where(eq(shareLinks.workspaceId, scope.workspaceId));
    expect((await create(ownCampaign, [ownPiece, bad])).status).toBe(404);
    expect(await db.select().from(shareLinks).where(eq(shareLinks.workspaceId, scope.workspaceId))).toEqual(before);
  });

  it.each(["foreign campaign", "foreign piece", "sibling piece", "inconsistent piece"])("blocks a persisted package with a %s at both public sinks", async (kind) => {
    const campaignId = kind === "foreign campaign" ? victimCampaign : ownCampaign;
    const bad = { "foreign campaign": ownPiece, "foreign piece": foreignPiece, "sibling piece": siblingPiece, "inconsistent piece": inconsistentPiece }[kind]!;
    const link = await legacyLink(campaignId, [ownPiece, bad]);
    const rendered = await html(link.token);
    for (const secret of ["victim campaign", "victim client", "victim notes", "victim CTA", "sibling CTA", "own campaign", "own CTA"]) {
      expect(rendered).not.toContain(secret);
    }
    expect((await download(link.token, ownPiece)).status).toBe(404);
  });

  it("keeps completed outputs, duplicate UUID aliases, metadata and downloads working", async () => {
    const response = await create(ownCampaign.toUpperCase(), [ownPiece, ownPiece.toUpperCase(), ownPiece]);
    expect(response.status).toBe(200);
    const { shareUrl } = await response.json();
    const token = shareUrl.split("/").at(-1)!;
    const rendered = await html(token);
    for (const text of ["own campaign", "own client", "own notes", "own CTA"]) expect(rendered).toContain(text);
    const asset = await download(token, ownPiece);
    expect(asset.status).toBe(302);
    expect(asset.headers.get("location")).toBe("https://storage.example/own.png");
  });

  it("preserves available assets when another authorized asset was deleted", async () => {
    const link = await legacyLink(ownCampaign, [ownPiece, crypto.randomUUID()]);
    expect(await html(link.token)).toContain("own CTA");
    expect((await download(link.token, ownPiece)).status).toBe(302);
  });
});
