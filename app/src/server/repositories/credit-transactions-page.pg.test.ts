/**
 * Keyset pagination of GET /api/billing/history against REAL Postgres (#497, §9.1).
 * The real route handler runs with only the workspace access and the billing balance mocked.
 * Every row is seeded with an explicit `created_at` (microseconds included); there are no sleeps.
 *
 *   TZ=UTC TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/server/repositories/credit-transactions-page.pg.test.ts
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Static on purpose: importing the mocked modules in the same Promise.all as the
// route can hand the route another instance of the mock (intermittent 500).
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceBillingAccess } from "@/server/billing/access";

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
vi.mock("@/server/billing/access", () => ({ getWorkspaceBillingAccess: vi.fn() }));

const BALANCE = 777;
const RUN = `${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

async function load() {
  const [free, route, repo, keyset, schema] = await Promise.all([
    import("@/server/equipe/module/testing/free-pg"),
    import("@/app/api/billing/history/route"),
    import("@/server/repositories/credit-transactions"),
    import("@/lib/keyset-page"),
    import("@/server/db/schema"),
  ]);
  return { free, route, repo, keyset, schema };
}
type Mods = Awaited<ReturnType<typeof load>>;

type Row = {
  id: string;
  at: string; // YYYY-MM-DDTHH:MM:SS.ffffffZ
  amount: number;
  type: string;
  campaignId: string | null;
  description: string;
};
type Filters = { from?: string; to?: string; campaignId?: string };

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const atString = (ms: number, micros: number) =>
  `${new Date(ms).toISOString().slice(0, 19)}.${pad(Math.floor(ms % 1000), 3)}${pad(micros, 3)}Z`;
/** Expected order: at (µs) desc, then uuid (lowercase hex) desc. */
const byOrder = (a: Row, b: Row) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1);

describe.skipIf(!ENABLED)("GET /api/billing/history keyset (pg)", () => {
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

  const payload = (rows: Row[]) =>
    JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        campaign_id: r.campaignId,
        amount: r.amount,
        type: r.type,
        description: r.description,
        at: r.at.replace("T", " ").replace("Z", ""),
      }))
    );

  async function insertTransactions(ws: Ws, rows: Row[]) {
    if (rows.length === 0) return;
    await h.db.execute(sql`
      insert into adscale_app.credit_transactions (id, user_id, workspace_id, campaign_id, amount, type, description, created_at)
      select t.id, ${ws.userId}, ${ws.workspaceId}::uuid, t.campaign_id, t.amount, t.type, t.description, t.at::timestamp
      from jsonb_to_recordset(${payload(rows)}::jsonb)
        as t(id uuid, campaign_id uuid, amount int, type text, description text, at text)`);
  }

  async function insertGrants(ws: Ws, rows: Row[]) {
    if (rows.length === 0) return;
    await h.db.execute(sql`
      insert into adscale_app.credit_grants (id, workspace_id, source, amount, remaining, created_at)
      select t.id, ${ws.workspaceId}::uuid, 'beta_tester', abs(t.amount), abs(t.amount), t.at::timestamp
      from jsonb_to_recordset(${payload(rows)}::jsonb)
        as t(id uuid, amount int, at text)`);
  }

  async function call(ws: { workspaceId: string; userId: string }, query: string) {
    vi.mocked(requireWorkspaceAccess).mockResolvedValue({
      workspace: { id: ws.workspaceId, name: "t", slug: "t" },
      user: { id: ws.userId, email: "t@example.com", name: "t" },
    } as never);
    const res = await m.route.GET(new Request(`http://localhost/api/billing/history?${query}`));
    return { status: res.status, body: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  /** Walks every page; returns pages in order. */
  async function walk(ws: Ws, query: string, limit: number, key: "transactions" | "grants") {
    const pages: { ids: string[]; nextCursor: string | null; body: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    let cursor: string | null = null;
    for (let i = 0; i < 1000; i += 1) {
      const q = `${query}${query ? "&" : ""}limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`;
      const { status, body } = await call(ws, q);
      expect(status).toBe(200);
      pages.push({ ids: body[key].map((r: { id: string }) => r.id), nextCursor: body.nextCursor, body });
      cursor = body.nextCursor;
      if (!cursor) return pages;
    }
    throw new Error("walk did not terminate");
  }

  function qs(f: Filters, extra = "") {
    const p = new URLSearchParams();
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (f.campaignId) p.set("campaignId", f.campaignId);
    return [p.toString(), extra].filter(Boolean).join("&");
  }

  function applyFilters(rows: Row[], f: Filters): Row[] {
    return rows.filter(
      (r) =>
        (!f.from || r.at >= `${f.from}T00:00:00.000000Z`) &&
        (!f.to || r.at <= `${f.to}T23:59:59.999000Z`) &&
        (!f.campaignId || r.campaignId === f.campaignId)
    );
  }

  function expectedSummary(rows: Row[]) {
    const totalSpent = rows.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
    const distinct = new Set(rows.map((r) => r.campaignId).filter(Boolean)).size;
    return {
      totalSpent,
      remainingCredits: BALANCE,
      averagePerCampaign: distinct > 0 ? Math.round(totalSpent / distinct) : 0,
      transactionCount: rows.length,
    };
  }

  function expectedSeries(rows: Row[]) {
    const perDay = new Map<string, number>();
    for (const r of rows) {
      if (r.type === "usage" && r.amount < 0) {
        const day = r.at.slice(0, 10);
        perDay.set(day, (perDay.get(day) ?? 0) + Math.abs(r.amount));
      }
    }
    return [...perDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, amount]) => ({ date, amount }));
  }

  beforeAll(async () => {
    if (UNSAFE) throw new Error(`unsafe TEST_DATABASE_URL: ${UNSAFE}`);
    m = await load();
    h = m.free.openPool(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(h, TEST_DATABASE_URL!);
    vi.mocked(getWorkspaceBillingAccess).mockResolvedValue({ creditBalance: BALANCE } as never);
  }, 60_000);

  afterAll(async () => {
    if (!ENABLED || !h) return;
    await m.free.cleanup(h, workspaceIds, userIds);
    await h.pool.end();
  });

  function mainRows(ws: Ws): Row[] {
    const rows: Row[] = [];
    for (let i = 0; i < 130; i += 1) {
      const month = 7 + (i % 3); // Aug, Sep, Oct (0-based 7..9)
      const day = 1 + ((i * 7) % 28);
      const ms = Date.UTC(2026, month, day, (i * 5) % 24, (i * 13) % 60, (i * 29) % 60, (i * 37) % 1000);
      const kind = i % 11 === 0 ? "purchase" : i % 4 === 0 ? "refund" : "usage";
      rows.push({
        id: crypto.randomUUID(),
        at: atString(ms, (i * 7919) % 1000),
        amount: kind === "usage" ? -((i % 9) + 1) * 3 : ((i % 9) + 1) * 10,
        type: kind,
        campaignId: i % 3 === 0 ? ws.campaignA : i % 3 === 1 ? ws.campaignB : null,
        description: `linha ${i}`,
      });
    }
    return rows;
  }

  it("page 1 summary and usageSeries equal independent aggregates for every filter combination", async () => {
    const ws = await newWorkspace("main");
    const rows = mainRows(ws);
    await insertTransactions(ws, rows);
    const froms = [undefined, "2026-09-01"];
    const tos = [undefined, "2026-09-30"];
    const campaigns = [undefined, ws.campaignA, ws.campaignB];
    let combos = 0;
    for (const from of froms) {
      for (const to of tos) {
        for (const campaignId of campaigns) {
          const f: Filters = { from, to, campaignId };
          const expected = applyFilters(rows, f).sort(byOrder);
          const { status, body } = await call(ws, qs(f, "limit=50"));
          expect(status).toBe(200);
          expect(body.transactions.map((t: { id: string }) => t.id)).toEqual(expected.slice(0, 50).map((r) => r.id));
          expect(body.nextCursor !== null).toBe(expected.length > 50);
          expect(body.summary).toEqual(expectedSummary(expected));
          expect(body.usageSeries).toEqual(expectedSeries(expected));
          // The campaign options stay all-time regardless of the filter.
          expect(body.campaigns.map((c: { id: string }) => c.id).sort()).toEqual([ws.campaignA, ws.campaignB].sort());
          combos += 1;
        }
      }
    }
    expect(combos).toBe(12);
  });

  it("walks the whole filtered set, with and without filters, matching (created_at DESC, id DESC)", async () => {
    const ws = await newWorkspace("walk");
    const rows = mainRows(ws);
    await insertTransactions(ws, rows);
    for (const f of [{}, { from: "2026-09-01", to: "2026-09-30" }, { campaignId: ws.campaignA }] as Filters[]) {
      const expected = applyFilters(rows, f).sort(byOrder).map((r) => r.id);
      for (const limit of [7, 50]) {
        const pages = await walk(ws, qs(f), limit, "transactions");
        expect(pages.flatMap((p) => p.ids)).toEqual(expected);
        // Intermediate pages are full and carry a cursor; the last one does not.
        for (const p of pages.slice(0, -1)) {
          expect(p.ids).toHaveLength(limit);
          expect(p.nextCursor).not.toBeNull();
        }
        expect(pages.at(-1)!.nextCursor).toBeNull();
        // Later pages carry no summary, series or campaigns.
        for (const p of pages.slice(1)) expect(Object.keys(p.body).sort()).toEqual(["nextCursor", "transactions"]);
      }
    }
  });

  it("never leaks workspace B rows, not even with a cursor minted in workspace A", async () => {
    const a = await newWorkspace("iso-a");
    const b = await newWorkspace("iso-b");
    const rowsA = mainRows(a);
    const rowsB = mainRows(b);
    await insertTransactions(a, rowsA);
    await insertTransactions(b, rowsB);
    const idsA = new Set(rowsA.map((r) => r.id));
    const idsB = new Set(rowsB.map((r) => r.id));

    const pagesA = await walk(a, "", 10, "transactions");
    for (const id of pagesA.flatMap((p) => p.ids)) expect(idsB.has(id)).toBe(false);

    const cursorFromA = pagesA[0]!.nextCursor!;
    const { status, body } = await call(b, `limit=100&cursor=${cursorFromA}`);
    expect(status).toBe(200);
    const returned = body.transactions.map((t: { id: string; workspaceId: string }) => t);
    for (const t of returned) {
      expect(idsA.has(t.id)).toBe(false);
      expect(t.workspaceId).toBe(b.workspaceId);
    }
    const { body: first } = await call(b, "limit=100");
    expect(first.summary.transactionCount).toBe(rowsB.length);
  });

  function tieRows(ws: Ws): Row[] {
    const rows: Row[] = [];
    // 10 rows with the exact same created_at.
    for (let i = 0; i < 10; i += 1) {
      rows.push({ id: crypto.randomUUID(), at: "2026-10-01T12:00:00.123456Z", amount: -1, type: "usage", campaignId: ws.campaignA, description: `tie ${i}` });
    }
    // 5 rows in the same millisecond with different microseconds.
    for (let i = 0; i < 5; i += 1) {
      rows.push({ id: crypto.randomUUID(), at: `2026-10-01T12:00:00.222${pad(i * 3 + 1, 3)}Z`, amount: -2, type: "usage", campaignId: null, description: `us ${i}` });
    }
    // 2 more tied pairs around, plus a few distinct rows.
    for (let i = 0; i < 4; i += 1) {
      rows.push({ id: crypto.randomUUID(), at: "2026-10-01T11:59:59.999999Z", amount: 5, type: "refund", campaignId: ws.campaignB, description: `pair ${i}` });
    }
    for (let i = 0; i < 3; i += 1) {
      rows.push({ id: crypto.randomUUID(), at: atString(Date.UTC(2026, 8, 20 + i, 8, 0, 0, 0), 0), amount: -3, type: "usage", campaignId: null, description: `d ${i}` });
    }
    return rows;
  }

  it("breaks ties on id: limits 1, 3 and 7 reproduce the exact order, no loss, no duplicate (limits 1..7)", async () => {
    const ws = await newWorkspace("ties");
    const rows = tieRows(ws);
    await insertTransactions(ws, rows);
    const expected = [...rows].sort(byOrder).map((r) => r.id);
    for (let limit = 1; limit <= 7; limit += 1) {
      const pages = await walk(ws, "", limit, "transactions");
      const flat = pages.flatMap((p) => p.ids);
      expect(flat, `limit ${limit}`).toEqual(expected);
      expect(new Set(flat).size).toBe(flat.length);
    }
  });

  it("returns [] and a null cursor for empty workspaces, empty filters and a cursor past the last row", async () => {
    const empty = await newWorkspace("empty");
    const first = await call(empty, "");
    expect(first.status).toBe(200);
    expect(first.body.transactions).toEqual([]);
    expect(first.body.nextCursor).toBeNull();
    expect(first.body.summary).toEqual({ totalSpent: 0, remainingCredits: BALANCE, averagePerCampaign: 0, transactionCount: 0 });
    expect(first.body.usageSeries).toEqual([]);
    expect((await call(empty, "view=grants")).body).toEqual({ grants: [], nextCursor: null });

    const ws = await newWorkspace("empty-filter");
    await insertTransactions(ws, tieRows(ws));
    const none = await call(ws, "from=2030-01-01&to=2030-01-31");
    expect(none.body.transactions).toEqual([]);
    expect(none.body.nextCursor).toBeNull();
    expect(none.body.summary.transactionCount).toBe(0);

    const past = m.keyset.encodeKeysetCursor({ at: "2000-01-01T00:00:00.000000Z", id: crypto.randomUUID() });
    const after = await call(ws, `cursor=${past}`);
    expect(after.body).toEqual({ transactions: [], nextCursor: null });
    // Filtered page with a cursor past the end.
    const afterFiltered = await call(ws, `campaignId=${ws.campaignA}&cursor=${past}`);
    expect(afterFiltered.body).toEqual({ transactions: [], nextCursor: null });
  });

  it("rejects invalid limit and corrupted cursors with 400", async () => {
    const ws = await newWorkspace("bad");
    // Year 0 is valid in JS but refused by Postgres: it must stop at the parser, not answer 500.
    const yearZero = m.keyset.encodeKeysetCursor({ at: "0000-01-01T00:00:00.000000Z", id: crypto.randomUUID() });
    for (const q of [
      "limit=0", "limit=101", "limit=abc", "cursor=%%corrupt", "view=nope", "view=grants&limit=0",
      `cursor=${yearZero}`, `view=grants&cursor=${yearZero}`, "from=0000-01-01T00:00:00Z", "to=0000-01-01",
    ]) {
      expect((await call(ws, q)).status, q).toBe(400);
    }
  });

  it("a newer insert between pages does not enter later pages, and a non-key update does not move a row", async () => {
    const ws = await newWorkspace("mutate");
    const rows = mainRows(ws).slice(0, 12);
    await insertTransactions(ws, rows);
    const expected = [...rows].sort(byOrder).map((r) => r.id);

    const p1 = await call(ws, "limit=3");
    expect(p1.body.transactions.map((t: { id: string }) => t.id)).toEqual(expected.slice(0, 3));

    const newer: Row = { id: crypto.randomUUID(), at: "2030-01-01T00:00:00.000001Z", amount: -9, type: "usage", campaignId: null, description: "novo" };
    await insertTransactions(ws, [newer]);
    const target = expected[5]!;
    await h.db.execute(sql`update adscale_app.credit_transactions set description = 'editado' where id = ${target}::uuid`);

    const rest = await walk(ws, "", 3, "transactions"); // fresh walk sees the new row first
    expect(rest[0]!.ids[0]).toBe(newer.id);
    // Continue from the old cursor: only the original remainder, in the same order.
    const tail: string[] = [];
    let cursor: string | null = p1.body.nextCursor;
    while (cursor) {
      const r = await call(ws, `limit=3&cursor=${cursor}`);
      tail.push(...r.body.transactions.map((t: { id: string }) => t.id));
      cursor = r.body.nextCursor;
    }
    expect(tail).toEqual(expected.slice(3));
    expect(tail).not.toContain(newer.id);
    const edited = await call(ws, `limit=100`);
    const idx = edited.body.transactions.findIndex((t: { id: string }) => t.id === target);
    expect(edited.body.transactions[idx].description).toBe("editado");
    expect(edited.body.transactions.map((t: { id: string }) => t.id).filter((id: string) => id !== newer.id)).toEqual(expected);
  });

  it("view=grants: empty, ties, full walk, isolation and filter independence", async () => {
    const ws = await newWorkspace("grants");
    const other = await newWorkspace("grants-other");
    const rows = tieRows(ws);
    await insertGrants(ws, rows);
    await insertGrants(other, tieRows(other));
    const expected = [...rows].sort(byOrder).map((r) => r.id);
    for (let limit = 1; limit <= 7; limit += 1) {
      const pages = await walk(ws, "view=grants", limit, "grants");
      const flat = pages.flatMap((p) => p.ids);
      expect(flat, `limit ${limit}`).toEqual(expected);
      expect(new Set(flat).size).toBe(flat.length);
      expect(pages.every((p) => Object.keys(p.body).sort().join() === "grants,nextCursor")).toBe(true);
    }
    // Filters never apply to grants.
    const filtered = await call(ws, "view=grants&from=2030-01-01&campaignId=nope&limit=100");
    expect(filtered.body.grants.map((g: { id: string }) => g.id)).toEqual(expected);
    // Past the end.
    const past = m.keyset.encodeKeysetCursor({ at: "2000-01-01T00:00:00.000000Z", id: crypto.randomUUID() });
    expect((await call(ws, `view=grants&cursor=${past}`)).body).toEqual({ grants: [], nextCursor: null });
    // A cursor from this workspace never exposes the other one's grants.
    const cur = (await call(ws, "view=grants&limit=2")).body.nextCursor;
    const viaOther = await call(other, `view=grants&limit=100&cursor=${cur}`);
    expect(viaOther.body.grants.length).toBeGreaterThan(0);
    for (const g of viaOther.body.grants) expect(expected).not.toContain(g.id);
  });

  it("R9: a 23:30 -03:00 usage row lands on the UTC day the old client rule gave", async () => {
    const ws = await newWorkspace("r9");
    const instant = new Date("2026-09-30T23:30:00-03:00"); // 2026-10-01T02:30:00Z
    const row: Row = { id: crypto.randomUUID(), at: atString(instant.getTime(), 0), amount: -4, type: "usage", campaignId: null, description: "noite" };
    expect(row.at.startsWith("2026-10-01T02:30")).toBe(true);
    await insertTransactions(ws, [row]);
    const { body } = await call(ws, "");
    const oldRuleDay = body.transactions[0].createdAt.split("T")[0];
    expect(oldRuleDay).toBe("2026-10-01");
    expect(body.usageSeries).toEqual([{ date: oldRuleDay, amount: 4 }]);
  });

  it("records the EXPLAIN of creditTransactionPageQuery", async () => {
    const ws = await newWorkspace("explain");
    await insertTransactions(ws, mainRows(ws));
    const cursor = m.keyset.decodeKeysetCursor(m.keyset.encodeKeysetCursor({ at: "2026-09-15T00:00:00.000000Z", id: crypto.randomUUID() }));
    for (const [label, page] of [
      ["first page", { limit: 50, cursor: null }],
      ["with cursor", { limit: 50, cursor }],
    ] as const) {
      const q = m.repo.creditTransactionPageQuery(ws.workspaceId, {}, page).toSQL();
      const plan = await h.pool.query(`EXPLAIN ${q.sql}`, q.params as unknown[]);
      const text = plan.rows.map((r: Record<string, string>) => r["QUERY PLAN"]).join("\n");
      console.log(`EXPLAIN creditTransactionPageQuery (${label}):\n${text}`);
      expect(text).toContain("credit_transactions");
    }
  });
});
