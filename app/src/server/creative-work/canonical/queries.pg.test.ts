/**
 * Criações by brand against REAL Postgres (spec 2026-10-07 §3): `listCanonicalWorksPage(ws, { clientProfileId })`
 * keeps one brand's campaigns and creative works, still inside the workspace, still on the shared keyset cursor.
 * Campaigns with no brand (classic name-only ones) stay visible under every brand, as the Library does for unbranded
 * assets; creative works stay strict because their brand column is NOT NULL.
 *
 *   TEST_DATABASE_URL=postgres://… npx vitest run --config config/vitest.config.ts src/server/creative-work/canonical/queries.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveEquipeTestDatabaseUrl } from "@/server/equipe/data/test-database";
import { decodeCatalogCursor } from "@/lib/catalog-page";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;

type Mods = Awaited<ReturnType<typeof load>>;
async function load() {
  const [free, schema, queries] = await Promise.all([
    import("@/server/equipe/module/testing/free-pg"),
    import("@/server/db/schema"),
    import("./queries"),
  ]);
  return { free, schema, queries };
}

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 12, minutes));

describe.skipIf(!ENABLED)("Criações by brand (pg)", () => {
  let m: Mods;
  let H: ReturnType<Mods["free"]["openPool"]>;
  const workspaces: string[] = [];
  const users: string[] = [];

  beforeAll(async () => {
    m = await load();
    H = m.free.openPool(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(H, TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    if (!ENABLED) return;
    await m.free.cleanup(H, workspaces, users);
    await H.pool.end();
  });

  async function world() {
    const ws = await m.free.seedWorkspace(H);
    const other = await m.free.seedWorkspace(H);
    workspaces.push(ws.workspaceId, other.workspaceId);
    users.push(ws.userId, other.userId);

    const profile = async (workspaceId: string, name: string) =>
      (await H.db.insert(m.schema.clientProfiles).values({ workspaceId, name }).returning())[0]!;
    const campaign = async (workspaceId: string, clientProfileId: string | null, name: string, minutes: number) =>
      (await H.db.insert(m.schema.campaigns).values({
        workspaceId, clientProfileId, name, createdAt: at(minutes), updatedAt: at(minutes),
      }).returning())[0]!;
    const work = async (workspaceId: string, userId: string, clientProfileId: string, title: string, minutes: number) =>
      (await H.db.insert(m.schema.creativeWorkItems).values({
        workspaceId, clientProfileId, createdByUserId: userId, title, request: title, toolKind: "variations",
        status: "draft", format: "4:5", settings: { targetFormats: [] }, createdAt: at(minutes), updatedAt: at(minutes),
      }).returning())[0]!;

    const brandA = await profile(ws.workspaceId, "Marca A");
    const brandB = await profile(ws.workspaceId, "Marca B");
    const foreignBrand = await profile(other.workspaceId, "Marca de fora");

    const items = {
      campaignB: await campaign(ws.workspaceId, brandB.id, "campanha B", 60),
      campaignA: await campaign(ws.workspaceId, brandA.id, "campanha A", 50),
      workA1: await work(ws.workspaceId, ws.userId, brandA.id, "peça A1", 40),
      workB: await work(ws.workspaceId, ws.userId, brandB.id, "peça B", 35),
      unbranded: await campaign(ws.workspaceId, null, "campanha sem marca", 30),
      workA2: await work(ws.workspaceId, ws.userId, brandA.id, "peça A2", 20),
      workA3: await work(ws.workspaceId, ws.userId, brandA.id, "peça A3", 10),
      foreignCampaign: await campaign(other.workspaceId, foreignBrand.id, "campanha de fora", 55),
      foreignUnbranded: await campaign(other.workspaceId, null, "sem marca de fora", 45),
      foreignWork: await work(other.workspaceId, other.userId, foreignBrand.id, "peça de fora", 25),
    };
    return { ws, other, brandA, brandB, foreignBrand, items };
  }

  const ids = (page: { items: Array<{ originId: string }> }) => page.items.map((i) => i.originId);

  it("lists one brand's campaigns and works plus the unbranded campaigns, nothing of the other brand or workspace", async () => {
    const w = await world();
    const page = await m.queries.listCanonicalWorksPage(w.ws.workspaceId, { clientProfileId: w.brandA.id, limit: 24 });

    expect(ids(page)).toEqual([
      w.items.campaignA.id, w.items.workA1.id, w.items.unbranded.id, w.items.workA2.id, w.items.workA3.id,
    ]);
    expect(page.nextCursor).toBeNull();
    expect(page.items.every((i) => i.workspaceId === w.ws.workspaceId)).toBe(true);
  });

  it("without a brand keeps the whole workspace, still nothing of another workspace", async () => {
    const w = await world();
    const page = await m.queries.listCanonicalWorksPage(w.ws.workspaceId, { limit: 24 });

    expect(new Set(ids(page))).toEqual(new Set([
      w.items.campaignB.id, w.items.campaignA.id, w.items.workA1.id, w.items.workB.id,
      w.items.unbranded.id, w.items.workA2.id, w.items.workA3.id,
    ]));
  });

  it("a brand of another workspace brings none of its works into this one; only the unbranded campaign shows", async () => {
    const w = await world();
    const here = await m.queries.listCanonicalWorksPage(w.ws.workspaceId, { clientProfileId: w.foreignBrand.id, limit: 24 });
    expect(ids(here)).toEqual([w.items.unbranded.id]);

    // The same brand id inside its own workspace: its works and ITS unbranded campaign, never this workspace's.
    const there = await m.queries.listCanonicalWorksPage(w.other.workspaceId, { clientProfileId: w.foreignBrand.id, limit: 24 });
    expect(ids(there)).toEqual([w.items.foreignCampaign.id, w.items.foreignUnbranded.id, w.items.foreignWork.id]);
  });

  it("pages one brand's list with the keyset cursor: no skip, no duplicate, same order as one big page", async () => {
    const w = await world();
    const whole = ids(await m.queries.listCanonicalWorksPage(w.ws.workspaceId, { clientProfileId: w.brandA.id, limit: 24 }));
    expect(whole).toHaveLength(5);

    const paged: string[] = [];
    let cursor: ReturnType<typeof decodeCatalogCursor> | null = null;
    let pages = 0;
    do {
      const page = await m.queries.listCanonicalWorksPage(w.ws.workspaceId, {
        clientProfileId: w.brandA.id, limit: 2, cursor,
      });
      paged.push(...ids(page));
      cursor = page.nextCursor ? decodeCatalogCursor(page.nextCursor) : null;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(paged).toEqual(whole);
    expect(new Set(paged).size).toBe(paged.length);
  });
});
