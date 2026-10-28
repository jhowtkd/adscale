/**
 * Keyset pagination of GET /api/campaigns/[id]/derivations and /assets against REAL Postgres (#503, §9.2).
 * The real route handlers run with only the workspace access and the signed URL mocked.
 * Every row is seeded with an explicit `created_at` (microseconds included); there are no sleeps.
 *
 *   TZ=UTC TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/server/repositories/derivation-page.pg.test.ts
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Mocked modules are imported statically: a dynamic import next to the route can hand the route another mock instance.
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

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock("@/server/storage", () => ({
  objectStorage: { signedDownloadUrl: vi.fn(async (key: string) => `https://signed.test/${key}`) },
}));

const RUN = `${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

async function load() {
  const [free, dRoute, aRoute, keyset, schema] = await Promise.all([
    import("@/server/equipe/module/testing/free-pg"),
    import("@/app/api/campaigns/[id]/derivations/route"),
    import("@/app/api/campaigns/[id]/assets/route"),
    import("@/lib/keyset-page"),
    import("@/server/db/schema"),
  ]);
  return { free, dRoute, aRoute, keyset, schema };
}
type Mods = Awaited<ReturnType<typeof load>>;

type DRow = {
  id: string;
  at: string; // YYYY-MM-DDTHH:MM:SS.ffffffZ
  status: string;
  scoreStatus?: string;
  qualityScore?: number | null;
  isPreview?: boolean;
  qualityGatedAt?: string | null;
  updatedAt?: string; // same shape as `at`; default = at
  outputKey?: string | null;
};
type ARow = { id: string; at: string; role: string; key: string };

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const atString = (ms: number, micros: number) =>
  `${new Date(ms).toISOString().slice(0, 19)}.${pad(Math.floor(ms % 1000), 3)}${pad(micros, 3)}Z`;
const sqlTs = (iso: string) => iso.replace("T", " ").replace("Z", "");
/** Expected order: at (µs) desc, then uuid (lowercase hex) desc. */
const byOrder = <T extends { id: string; at: string }>(a: T, b: T) =>
  a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1;

describe.skipIf(!ENABLED)("GET /api/campaigns/[id]/derivations and /assets keyset (pg)", () => {
  let m: Mods;
  let h: ReturnType<Mods["free"]["openPool"]>;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  type Ws = { workspaceId: string; userId: string; campaignA: string; campaignB: string };
  async function newWorkspace(label: string): Promise<Ws> {
    const seed = await m.free.seedWorkspace(h);
    workspaceIds.push(seed.workspaceId);
    userIds.push(seed.userId);
    const [a, b] = await h.db
      .insert(m.schema.campaigns)
      .values([
        { workspaceId: seed.workspaceId, name: `Campanha A ${RUN} ${label}` },
        { workspaceId: seed.workspaceId, name: `Campanha B ${RUN} ${label}` },
      ])
      .returning();
    return { workspaceId: seed.workspaceId, userId: seed.userId, campaignA: a!.id, campaignB: b!.id };
  }

  async function insertDerivations(ws: Ws, campaignId: string, rows: DRow[]) {
    if (rows.length === 0) return;
    const payload = JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        score_status: r.scoreStatus ?? "analyzed",
        quality_score: r.qualityScore ?? null,
        is_preview: r.isPreview ?? false,
        quality_gated_at: r.qualityGatedAt ? sqlTs(r.qualityGatedAt) : null,
        output_key: r.outputKey === undefined ? `out/${r.id}.png` : r.outputKey,
        at: sqlTs(r.at),
        upd: sqlTs(r.updatedAt ?? r.at),
      }))
    );
    await h.db.execute(sql`
      insert into adscale_app.derivations
        (id, campaign_id, workspace_id, status, score_status, quality_score, is_preview, quality_gated_at, output_key, created_at, updated_at)
      select t.id, ${campaignId}::uuid, ${ws.workspaceId}::uuid, t.status, t.score_status, t.quality_score, t.is_preview,
             t.quality_gated_at::timestamp, t.output_key, t.at::timestamp, t.upd::timestamp
      from jsonb_to_recordset(${payload}::jsonb)
        as t(id uuid, status text, score_status text, quality_score int, is_preview boolean, quality_gated_at text,
             output_key text, at text, upd text)`);
  }

  async function insertAssets(ws: Ws, campaignId: string, rows: ARow[]) {
    if (rows.length === 0) return;
    const payload = JSON.stringify(rows.map((r) => ({ id: r.id, role: r.role, key: r.key, at: sqlTs(r.at) })));
    await h.db.execute(sql`
      insert into adscale_app.campaign_assets (id, campaign_id, workspace_id, key, type, role, created_at)
      select t.id, ${campaignId}::uuid, ${ws.workspaceId}::uuid, t.key, 'image', t.role, t.at::timestamp
      from jsonb_to_recordset(${payload}::jsonb) as t(id uuid, role text, key text, at text)`);
  }

  function asUser(ws: { workspaceId: string; userId: string }) {
    vi.mocked(requireWorkspaceAccess).mockResolvedValue({
      workspace: { id: ws.workspaceId, name: "t", slug: "t" },
      user: { id: ws.userId, email: "t@example.com", name: "t" },
    } as never);
  }
  type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  async function callD(ws: Ws, campaignId: string, query = "") {
    asUser(ws);
    const res = await m.dRoute.GET(
      new Request(`http://localhost/api/campaigns/${campaignId}/derivations${query ? `?${query}` : ""}`),
      { params: Promise.resolve({ id: campaignId }) }
    );
    return { status: res.status, body: (await res.json()) as Json };
  }
  async function callA(ws: Ws, campaignId: string, query = "") {
    asUser(ws);
    const res = await m.aRoute.GET(
      new Request(`http://localhost/api/campaigns/${campaignId}/assets${query ? `?${query}` : ""}`),
      { params: Promise.resolve({ id: campaignId }) }
    );
    return { status: res.status, body: (await res.json()) as Json };
  }

  /** Walks every page; returns pages in order. */
  async function walk(kind: "derivations" | "assets", ws: Ws, campaignId: string, limit: number) {
    const call = kind === "derivations" ? callD : callA;
    const pages: { ids: string[]; nextCursor: string | null; body: Json }[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 1000; i += 1) {
      const { status, body } = await call(ws, campaignId, `limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`);
      expect(status).toBe(200);
      pages.push({ ids: body[kind].map((r: { id: string }) => r.id), nextCursor: body.nextCursor, body });
      cursor = body.nextCursor;
      if (!cursor) return pages;
    }
    throw new Error("walk did not terminate");
  }

  beforeAll(async () => {
    if (UNSAFE) throw new Error(`unsafe TEST_DATABASE_URL: ${UNSAFE}`);
    m = await load();
    h = m.free.openPool(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(h, TEST_DATABASE_URL!);
  }, 60_000);

  afterAll(async () => {
    if (!ENABLED || !h) return;
    await m.free.cleanup(h, workspaceIds, userIds);
    await h.pool.end();
  });

  const STATUSES = ["completed", "approved", "queued", "processing", "failed", "rejected"];

  /** Spread rows plus exact ties, µs ties inside one millisecond and pairs. */
  function dRows(count = 40): DRow[] {
    const rows: DRow[] = [];
    for (let i = 0; i < count; i += 1) {
      const ms = Date.UTC(2026, 8 + (i % 2), 1 + ((i * 7) % 28), (i * 5) % 24, (i * 13) % 60, (i * 29) % 60, (i * 37) % 1000);
      rows.push({
        id: crypto.randomUUID(),
        at: atString(ms, (i * 7919) % 1000),
        status: STATUSES[i % STATUSES.length]!,
        scoreStatus: i % 7 === 0 ? "pending" : "analyzed",
        qualityScore: (i * 11) % 100,
      });
    }
    for (let i = 0; i < 8; i += 1) {
      rows.push({ id: crypto.randomUUID(), at: "2026-10-01T12:00:00.123456Z", status: "completed", qualityScore: 50 });
    }
    for (let i = 0; i < 5; i += 1) {
      rows.push({ id: crypto.randomUUID(), at: `2026-10-01T12:00:00.222${pad(i * 3 + 1, 3)}Z`, status: "completed", qualityScore: 60 });
    }
    return rows;
  }

  function aRows(count = 30): ARow[] {
    const rows: ARow[] = [];
    for (let i = 0; i < count; i += 1) {
      const ms = Date.UTC(2026, 8, 1 + ((i * 5) % 28), (i * 3) % 24, (i * 17) % 60, (i * 23) % 60, (i * 41) % 1000);
      const id = crypto.randomUUID();
      rows.push({ id, at: atString(ms, (i * 6007) % 1000), role: i % 5 === 0 ? "style_reference" : "base", key: `assets/${id}` });
    }
    for (let i = 0; i < 6; i += 1) {
      const id = crypto.randomUUID();
      rows.push({ id, at: "2026-10-02T08:00:00.500500Z", role: "base", key: `assets/${id}` });
    }
    for (let i = 0; i < 4; i += 1) {
      const id = crypto.randomUUID();
      rows.push({ id, at: `2026-10-02T08:00:00.777${pad(i * 2 + 1, 3)}Z`, role: "style_reference", key: `assets/${id}` });
    }
    return rows;
  }

  it("derivations: walks the whole Campanha with limits 1..7, order (created_at DESC, id DESC), no loss, no duplicate", async () => {
    const ws = await newWorkspace("d-walk");
    const rows = dRows();
    await insertDerivations(ws, ws.campaignA, rows);
    const expected = [...rows].sort(byOrder).map((r) => r.id);
    for (let limit = 1; limit <= 7; limit += 1) {
      const pages = await walk("derivations", ws, ws.campaignA, limit);
      const flat = pages.flatMap((p) => p.ids);
      expect(flat, `limit ${limit}`).toEqual(expected);
      expect(new Set(flat).size).toBe(flat.length);
      for (const p of pages.slice(0, -1)) {
        expect(p.ids).toHaveLength(limit);
        expect(p.nextCursor).not.toBeNull();
      }
      expect(pages.at(-1)!.nextCursor).toBeNull();
      // Only the first page carries the summary and the produce surface.
      expect(Object.keys(pages[0]!.body).sort()).toEqual(["derivations", "nextCursor", "produceSurface", "summary"]);
      for (const p of pages.slice(1)) expect(Object.keys(p.body).sort()).toEqual(["derivations", "nextCursor"]);
    }
    // Default limit (24) and max limit (48).
    const def = await callD(ws, ws.campaignA);
    expect(def.body.derivations).toHaveLength(24);
    const max = await callD(ws, ws.campaignA, "limit=48");
    expect(max.body.derivations).toHaveLength(48);
    expect(max.body.derivations.map((d: { id: string }) => d.id)).toEqual(expected.slice(0, 48));
  });

  it("assets: walks the whole Campanha with limits 1..7, order (created_at DESC, id DESC), no loss, no duplicate", async () => {
    const ws = await newWorkspace("a-walk");
    const rows = aRows();
    await insertAssets(ws, ws.campaignA, rows);
    const expected = [...rows].sort(byOrder).map((r) => r.id);
    for (let limit = 1; limit <= 7; limit += 1) {
      const pages = await walk("assets", ws, ws.campaignA, limit);
      const flat = pages.flatMap((p) => p.ids);
      expect(flat, `limit ${limit}`).toEqual(expected);
      expect(new Set(flat).size).toBe(flat.length);
      expect(Object.keys(pages[0]!.body).sort()).toEqual(["assets", "featured", "nextCursor", "total"]);
      for (const p of pages.slice(1)) expect(Object.keys(p.body).sort()).toEqual(["assets", "nextCursor"]);
    }
  });

  it("derivations: status, score and updated_at changes between pages cause no duplicate and no loss", async () => {
    const ws = await newWorkspace("d-mutate");
    const rows = dRows(30);
    await insertDerivations(ws, ws.campaignA, rows);
    const expected = [...rows].sort(byOrder).map((r) => r.id);

    const p1 = await callD(ws, ws.campaignA, "limit=5");
    expect(p1.body.derivations.map((d: { id: string }) => d.id)).toEqual(expected.slice(0, 5));

    // Mutate rows already returned AND rows not returned yet: none of these columns is in the key.
    for (const id of [expected[1]!, expected[4]!, expected[9]!, expected[15]!, expected[20]!]) {
      await h.db.execute(sql`
        update adscale_app.derivations
        set status = 'approved', score_status = 'heuristic', quality_score = 1, updated_at = '2031-01-01 00:00:00.000001'
        where id = ${id}::uuid`);
    }
    const tail: string[] = [];
    let cursor: string | null = p1.body.nextCursor;
    while (cursor) {
      const r = await callD(ws, ws.campaignA, `limit=5&cursor=${cursor}`);
      expect(r.status).toBe(200);
      tail.push(...r.body.derivations.map((d: { id: string }) => d.id));
      cursor = r.body.nextCursor;
    }
    expect(tail).toEqual(expected.slice(5));
    // A fresh walk keeps the same order and shows the new values.
    const full = await callD(ws, ws.campaignA, "limit=48");
    expect(full.body.derivations.map((d: { id: string }) => d.id)).toEqual(expected);
    const moved = full.body.derivations.find((d: { id: string }) => d.id === expected[15]);
    expect(moved.status).toBe("approved");
    expect(moved.scoreStatus).toBe("heuristic");

    // A newer insert between pages does not enter the later pages.
    const p1b = await callD(ws, ws.campaignA, "limit=5");
    const newer: DRow = { id: crypto.randomUUID(), at: "2031-06-01T00:00:00.000001Z", status: "queued" };
    await insertDerivations(ws, ws.campaignA, [newer]);
    const rest = await callD(ws, ws.campaignA, `limit=48&cursor=${p1b.body.nextCursor}`);
    expect(rest.body.derivations.map((d: { id: string }) => d.id)).toEqual(expected.slice(5));
  });

  it("assets: changing a non-key column between pages causes no duplicate and no loss", async () => {
    const ws = await newWorkspace("a-mutate");
    const rows = aRows(20);
    await insertAssets(ws, ws.campaignA, rows);
    const expected = [...rows].sort(byOrder).map((r) => r.id);
    const p1 = await callA(ws, ws.campaignA, "limit=4");
    for (const id of [expected[0]!, expected[6]!, expected[12]!]) {
      await h.db.execute(sql`update adscale_app.campaign_assets set role = 'style_reference', analysis_status = 'done' where id = ${id}::uuid`);
    }
    const tail: string[] = [];
    let cursor: string | null = p1.body.nextCursor;
    while (cursor) {
      const r = await callA(ws, ws.campaignA, `limit=4&cursor=${cursor}`);
      tail.push(...r.body.assets.map((a: { id: string }) => a.id));
      cursor = r.body.nextCursor;
    }
    expect(tail).toEqual(expected.slice(4));
  });

  it("isolation: other workspace and other Campanha never appear, with a cursor or with ids=", async () => {
    const a = await newWorkspace("iso-a");
    const b = await newWorkspace("iso-b");
    const mine = dRows(12);
    const sibling = dRows(12); // same workspace, other Campanha
    const foreign = dRows(12); // other workspace
    await insertDerivations(a, a.campaignA, mine);
    await insertDerivations(a, a.campaignB, sibling);
    await insertDerivations(b, b.campaignA, foreign);
    const mineIds = new Set(mine.map((r) => r.id));

    const pages = await walk("derivations", a, a.campaignA, 5);
    const flat = pages.flatMap((p) => p.ids);
    expect(new Set(flat)).toEqual(mineIds);
    expect(pages[0]!.body.summary.total).toBe(mine.length);

    // A cursor minted in A's Campanha, used on B's Campanha / workspace, only yields that scope's rows.
    const cursorFromA = pages[0]!.nextCursor!;
    const viaSibling = await callD(a, a.campaignB, `limit=48&cursor=${cursorFromA}`);
    expect(viaSibling.status).toBe(200);
    const siblingIds = new Set(sibling.map((r) => r.id));
    for (const d of viaSibling.body.derivations) expect(siblingIds.has(d.id)).toBe(true);
    const viaForeign = await callD(b, b.campaignA, `limit=48&cursor=${cursorFromA}`);
    const foreignIds = new Set(foreign.map((r) => r.id));
    for (const d of viaForeign.body.derivations) {
      expect(foreignIds.has(d.id)).toBe(true);
      expect(d.workspaceId).toBe(b.workspaceId);
    }

    // ids= mixing own, sibling, foreign and unknown ids returns only the own ones.
    const own = mine.slice(0, 3).map((r) => r.id);
    const mixed = [own[0]!, sibling[0]!.id, own[1]!, foreign[0]!.id, crypto.randomUUID(), own[2]!];
    const r = await callD(a, a.campaignA, `ids=${mixed.join(",")}`);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).toEqual(["derivations"]);
    expect(r.body.derivations.map((d: { id: string }) => d.id).sort()).toEqual([...own].sort());
    // Only foreign / sibling ids: empty answer, no hint about existence.
    const none = await callD(a, a.campaignA, `ids=${sibling[0]!.id},${foreign[0]!.id}`);
    expect(none.status).toBe(200);
    expect(none.body).toEqual({ derivations: [] });

    // Campanha of another workspace: 404 on /derivations.
    const cross = await callD(a, b.campaignA);
    expect(cross.status).toBe(404);
    expect((await callD(a, b.campaignA, "limit=5")).status).toBe(404);
    expect((await callD(a, b.campaignA, `ids=${foreign[0]!.id}`)).status).toBe(404);
    expect((await callD(a, b.campaignA, `limit=5&cursor=${cursorFromA}`)).status).toBe(404);
  });

  it("isolation (assets): other workspace and Campanha never appear; out-of-scope Campanha is 200 []", async () => {
    const a = await newWorkspace("aiso-a");
    const b = await newWorkspace("aiso-b");
    const mine = aRows(12);
    const sibling = aRows(12);
    const foreign = aRows(12);
    await insertAssets(a, a.campaignA, mine);
    await insertAssets(a, a.campaignB, sibling);
    await insertAssets(b, b.campaignA, foreign);

    const pages = await walk("assets", a, a.campaignA, 5);
    expect(new Set(pages.flatMap((p) => p.ids))).toEqual(new Set(mine.map((r) => r.id)));
    expect(pages[0]!.body.total).toBe(mine.length);

    const own = mine.slice(0, 2).map((r) => r.id);
    const mixed = [own[0]!, sibling[0]!.id, foreign[0]!.id, crypto.randomUUID(), own[1]!];
    const r = await callA(a, a.campaignA, `ids=${mixed.join(",")}`);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).toEqual(["assets"]);
    expect(r.body.assets.map((x: { id: string }) => x.id).sort()).toEqual([...own].sort());

    const cursorFromA = pages[0]!.nextCursor!;
    const viaForeign = await callA(b, b.campaignA, `limit=48&cursor=${cursorFromA}`);
    const foreignIds = new Set(foreign.map((x) => x.id));
    for (const x of viaForeign.body.assets) expect(foreignIds.has(x.id)).toBe(true);

    // Campanha outside the workspace: 200 with no rows and no featured/total (R7).
    for (const q of ["", "limit=5", `limit=5&cursor=${cursorFromA}`]) {
      const out = await callA(a, b.campaignA, q);
      expect(out.status, q).toBe(200);
      expect(out.body).toEqual({ assets: [], nextCursor: null });
    }
    const outIds = await callA(a, b.campaignA, `ids=${foreign[0]!.id}`);
    expect(outIds.status).toBe(200);
    expect(outIds.body).toEqual({ assets: [] });
  });

  it("derivations: page 1 summary, counts and approvedIds cover every Peça, even an approved one outside page 1", async () => {
    const ws = await newWorkspace("d-summary");
    const rows: DRow[] = [];
    const base = Date.UTC(2026, 9, 10, 12, 0, 0, 0);
    const mk = (i: number, over: Partial<DRow>): DRow => ({
      id: crypto.randomUUID(),
      at: atString(base - i * 60_000, (i * 13) % 1000),
      status: "completed",
      ...over,
    });
    const fresh = atString(Date.now(), 0); // active rows must not look stale to failStaleActiveDerivations
    rows.push(mk(0, { status: "queued", scoreStatus: "pending", updatedAt: fresh }));
    rows.push(mk(1, { status: "completed", scoreStatus: "analyzed" }));
    rows.push(mk(2, { status: "processing", scoreStatus: "pending", updatedAt: fresh }));
    rows.push(mk(3, { status: "failed" }));
    rows.push(mk(4, { status: "approved" }));
    rows.push(mk(5, { status: "completed", scoreStatus: "heuristic" }));
    rows.push(mk(6, { status: "completed", isPreview: true, qualityGatedAt: null }));
    rows.push(mk(7, { status: "approved" })); // oldest approved, far from page 1
    await insertDerivations(ws, ws.campaignA, rows);
    const sorted = [...rows].sort(byOrder);

    const { body } = await callD(ws, ws.campaignA, "limit=2");
    expect(body.derivations).toHaveLength(2);
    const approved = sorted.filter((r) => r.status === "approved").map((r) => r.id);
    expect(approved).toHaveLength(2);
    expect(body.derivations.map((d: { id: string }) => d.id)).not.toContain(approved[1]);
    expect(body.summary).toEqual({
      total: rows.length,
      approvedCount: 2,
      reviewCount: 2, // queued + processing read as generating
      isGenerating: true,
      hasPendingWork: true,
      approvedIds: approved, // newest first
    });
    expect(body.produceSurface).toBeTruthy();

    // No pending work at all: false flags, even with a big history.
    const calm = await newWorkspace("d-calm");
    await insertDerivations(calm, calm.campaignA, [
      mk(0, { status: "completed", scoreStatus: "analyzed" }),
      mk(1, { status: "approved", scoreStatus: "analyzed" }),
      mk(2, { status: "failed", scoreStatus: "failed" }),
    ]);
    const c = await callD(calm, calm.campaignA, "limit=1");
    expect(c.body.summary).toMatchObject({ total: 3, isGenerating: false, hasPendingWork: false, approvedCount: 1 });

    // Empty Campanha.
    const empty = await callD(calm, calm.campaignB);
    expect(empty.status).toBe(200);
    expect(empty.body.derivations).toEqual([]);
    expect(empty.body.nextCursor).toBeNull();
    expect(empty.body.summary).toMatchObject({ total: 0, approvedCount: 0, reviewCount: 0, hasPendingWork: false, approvedIds: [] });
  });

  it("assets: page 1 featured and total cover every material, including ones outside page 1", async () => {
    const ws = await newWorkspace("a-featured");
    const rows = aRows(30);
    await insertAssets(ws, ws.campaignA, rows);
    const sorted = [...rows].sort(byOrder);
    const newestBase = sorted.find((r) => r.role === "base")!;
    const { body } = await callA(ws, ws.campaignA, "limit=1");
    expect(body.assets).toHaveLength(1);
    expect(body.total).toBe(rows.length);
    expect(body.featured).toEqual({ base: expect.objectContaining({ id: newestBase.id }) });
    expect(body.featured.base.url).toBe(`https://signed.test/${newestBase.key}`);

    // Only materials of another role: no featured.
    const styleOnly = await newWorkspace("a-style");
    await insertAssets(styleOnly, styleOnly.campaignA, [{ id: crypto.randomUUID(), at: "2026-10-01T00:00:00.000001Z", role: "style_reference", key: "k/style" }]);
    const s = await callA(styleOnly, styleOnly.campaignA);
    expect(s.body.featured).toEqual({ base: null });
    expect(s.body.total).toBe(1);

    // Empty Campanha.
    const e = await callA(styleOnly, styleOnly.campaignB);
    expect(e.body).toEqual({ assets: [], nextCursor: null, featured: { base: null }, total: 0 });
  });

  it("failStaleActiveDerivations: a stale queued Peça fails only on the GET without cursor and without ids", async () => {
    const ws = await newWorkspace("d-stale");
    const old = "2020-01-01T00:00:00.000000Z";
    const stale: DRow = { id: crypto.randomUUID(), at: "2026-10-01T10:00:00.000001Z", updatedAt: old, status: "queued", scoreStatus: "pending" };
    const staleProcessing: DRow = { id: crypto.randomUUID(), at: "2026-10-01T09:00:00.000001Z", updatedAt: old, status: "processing", scoreStatus: "pending" };
    const fresh: DRow = { id: crypto.randomUUID(), at: "2026-10-01T08:00:00.000001Z", status: "queued", scoreStatus: "pending", updatedAt: atString(Date.now(), 0) };
    const filler: DRow = { id: crypto.randomUUID(), at: "2026-10-01T11:00:00.000001Z", status: "completed" };
    await insertDerivations(ws, ws.campaignA, [stale, staleProcessing, fresh, filler]);
    const statusOf = async (id: string) =>
      ((await h.db.execute(sql`select status from adscale_app.derivations where id = ${id}::uuid`)).rows[0] as { status: string }).status;

    const cursor = m.keyset.encodeKeysetCursor({ at: "2026-10-02T00:00:00.000000Z", id: crypto.randomUUID() });
    const withCursor = await callD(ws, ws.campaignA, `cursor=${cursor}`);
    expect(withCursor.status).toBe(200);
    expect(withCursor.body.derivations.map((d: { id: string }) => d.id)).toContain(stale.id);
    const withIds = await callD(ws, ws.campaignA, `ids=${stale.id},${staleProcessing.id}`);
    expect(withIds.status).toBe(200);
    expect(withIds.body.derivations.map((d: { status: string }) => d.status)).toEqual(["queued", "processing"]);
    expect(await statusOf(stale.id)).toBe("queued");
    expect(await statusOf(staleProcessing.id)).toBe("processing");

    const first = await callD(ws, ws.campaignA);
    expect(first.status).toBe(200);
    expect(await statusOf(stale.id)).toBe("failed");
    expect(await statusOf(staleProcessing.id)).toBe("failed");
    expect(await statusOf(fresh.id)).toBe("queued");
    expect(await statusOf(filler.id)).toBe("completed");
    // The first page already reports the failure and the pending work left.
    const byId = new Map(first.body.derivations.map((d: { id: string; status: string }) => [d.id, d.status]));
    expect(byId.get(stale.id)).toBe("failed");
    expect(first.body.summary.isGenerating).toBe(true); // `fresh` is still queued
  });

  it("rejects invalid input with 400 (never 500), on both routes", async () => {
    const ws = await newWorkspace("bad");
    const id = crypto.randomUUID();
    const goodCursor = m.keyset.encodeKeysetCursor({ at: "2026-10-01T00:00:00.000000Z", id: crypto.randomUUID() });
    // Year 0 is valid in JS but refused by Postgres: it must stop at the parser (lesson F1 of #789).
    const yearZero = m.keyset.encodeKeysetCursor({ at: "0000-01-01T00:00:00.000000Z", id: crypto.randomUUID() });
    const impossible = m.keyset.encodeKeysetCursor({ at: "2026-02-31T00:00:00.000000Z", id: crypto.randomUUID() });
    const badId = m.keyset.encodeKeysetCursor({ at: "2026-10-01T00:00:00.000000Z", id: "not-a-uuid" });
    const ids49 = Array.from({ length: 49 }, () => crypto.randomUUID()).join(",");
    const ids48 = Array.from({ length: 48 }, () => crypto.randomUUID()).join(",");
    const queries = [
      "limit=0", "limit=49", "limit=abc", "limit=-1", "limit=1.5", "limit=",
      "cursor=%%corrupt", "cursor=AAAA", `cursor=${yearZero}`, `cursor=${impossible}`, `cursor=${badId}`,
      `limit=0&cursor=${goodCursor}`,
      `ids=${id}&cursor=${goodCursor}`,
      `ids=${ids49}`, `ids=${id},not-a-uuid`, "ids=", "ids=,", `ids=${id},`, "ids=%00",
      `ids=${id}&limit=0`,
    ];
    for (const q of queries) {
      const d = await callD(ws, ws.campaignA, q);
      expect(d.status, `derivations ?${q}`).toBe(400);
      const a = await callA(ws, ws.campaignA, q);
      expect(a.status, `assets ?${q}`).toBe(400);
    }
    // The boundaries themselves are accepted.
    expect((await callD(ws, ws.campaignA, "limit=1")).status).toBe(200);
    expect((await callD(ws, ws.campaignA, "limit=48")).status).toBe(200);
    expect((await callD(ws, ws.campaignA, `ids=${ids48}`)).status).toBe(200);
    expect((await callA(ws, ws.campaignA, `ids=${ids48}`)).status).toBe(200);
    // A 400 comes before the Campanha lookup: a foreign Campanha with bad input is still 400.
    const other = await newWorkspace("bad-other");
    expect((await callD(ws, other.campaignA, "limit=0")).status).toBe(400);
    expect((await callA(ws, other.campaignA, "limit=0")).status).toBe(400);
  });

  it("the cursor carries only a position (no key, no URL) and is decoded as {v, at, id}", async () => {
    const ws = await newWorkspace("cursor");
    const rows = dRows(10);
    await insertDerivations(ws, ws.campaignA, rows);
    const { body } = await callD(ws, ws.campaignA, "limit=3");
    const decoded = JSON.parse(Buffer.from(body.nextCursor, "base64url").toString("utf8"));
    expect(Object.keys(decoded).sort()).toEqual(["at", "id", "v"]);
    expect(decoded.id).toBe(body.derivations.at(-1).id);
    expect(JSON.stringify(decoded)).not.toMatch(/out\/|signed\.test|https?:/);
  });
});
