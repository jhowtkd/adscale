/**
 * Payload size of GET /api/billing/history, before vs after pagination (#497, §9.3 item 1).
 * Only imports modules that exist both before and after the change, so the SAME file runs on `main`
 * (where the route still returns everything) to record the real "before".
 *
 *   TZ=UTC TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/app/api/billing/history/history-bytes.pg.test.ts
 */
import { desc, eq } from "drizzle-orm";
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

const BALANCE = 4200;
const RUN = `${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
const TX_COUNT = 1500;
const GRANT_COUNT = 20;

async function load() {
  const [route, repo, dbModule, schema, drizzleNodePg, pg] = await Promise.all([
    import("./route"),
    import("@/server/repositories/credit-transactions"),
    import("@/server/db"),
    import("@/server/db/schema"),
    import("drizzle-orm/node-postgres"),
    import("pg"),
  ]);
  return { route, repo, db: dbModule.db, schema, drizzleNodePg, pg };
}
type Mods = Awaited<ReturnType<typeof load>>;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const stamp = (ms: number, micros: number) =>
  `${new Date(ms).toISOString().slice(0, 19).replace("T", " ")}.${pad(ms % 1000, 3)}${pad(micros, 3)}`;
const bytes = (value: string) => Buffer.byteLength(value);

describe.skipIf(!ENABLED)("billing history payload bytes (pg)", () => {
  let m: Mods;
  let pool: InstanceType<Mods["pg"]["Pool"]>;
  let workspaceId = "";
  let userId = "";

  async function handler(query: string): Promise<string> {
    vi.mocked(requireWorkspaceAccess).mockResolvedValue({
      workspace: { id: workspaceId, name: "t", slug: "t" },
      user: { id: userId, email: "t@example.com", name: "t" },
    } as never);
    const res = await m.route.GET(new Request(`http://localhost/api/billing/history${query}`));
    expect(res.status).toBe(200);
    return res.text();
  }

  /** The exact serialization of the pre-pagination route (a4b9bf28^). */
  async function legacyPayload(filters: { from?: Date; to?: Date }): Promise<string> {
    const [transactions, summary, campaigns, grants] = await Promise.all([
      m.repo.getCreditTransactionsForWorkspace(workspaceId, filters),
      m.repo.getCreditTransactionSummary(workspaceId, filters),
      m.repo.getCampaignsWithTransactions(workspaceId),
      m.db
        .select()
        .from(m.schema.creditGrants)
        .where(eq(m.schema.creditGrants.workspaceId, workspaceId))
        .orderBy(desc(m.schema.creditGrants.createdAt)),
    ]);
    const distinctCampaigns = Number(summary.distinctCampaignCount ?? 0);
    const averagePerCampaign =
      distinctCampaigns > 0 ? Math.round(Number(summary.totalSpent) / distinctCampaigns) : 0;
    return JSON.stringify({
      grants: grants.map((grant) => ({
        id: grant.id,
        source: grant.source,
        amount: grant.amount,
        remaining: grant.remaining,
        createdAt: grant.createdAt?.toISOString() ?? null,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        userId: t.userId,
        workspaceId: t.workspaceId,
        campaignId: t.campaignId,
        campaignName: t.campaignName ?? null,
        derivationId: t.derivationId,
        amount: t.amount,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt?.toISOString() ?? null,
      })),
      summary: {
        totalSpent: Number(summary.totalSpent),
        remainingCredits: BALANCE,
        averagePerCampaign,
        transactionCount: Number(summary.transactionCount),
      },
      campaigns: campaigns.map((c) => ({ id: c.campaignId, name: c.campaignName ?? "—" })),
    });
  }

  beforeAll(async () => {
    if (UNSAFE) throw new Error(`unsafe TEST_DATABASE_URL: ${UNSAFE}`);
    m = await load();
    pool = new m.pg.Pool({ connectionString: TEST_DATABASE_URL!, max: 2 });
    const { rows } = await pool.query("select current_database() as name");
    if (rows[0].name !== new URL(TEST_DATABASE_URL!).pathname.slice(1) || !rows[0].name.endsWith("_test")) {
      throw new Error("history_bytes_database_mismatch");
    }
    vi.mocked(getWorkspaceBillingAccess).mockResolvedValue({ creditBalance: BALANCE } as never);

    userId = `user-bytes-${RUN}`;
    await pool.query(`insert into adscale_app."user" (id, name, email, email_verified) values ($1, 'Bytes', $2, true)`, [
      userId,
      `${userId}@example.com`,
    ]);
    const ws = await pool.query(`insert into adscale_app.workspaces (id, name, slug) values (gen_random_uuid(), $1, $1) returning id`, [
      `bytes-${RUN}`,
    ]);
    workspaceId = ws.rows[0].id;
    const camps = await pool.query(
      `insert into adscale_app.campaigns (id, workspace_id, name) values (gen_random_uuid(), $1, $2), (gen_random_uuid(), $1, $3) returning id`,
      [workspaceId, "Lançamento Primavera — Coleção Verão", "Black Friday Antecipada"]
    );
    const campaignIds: (string | null)[] = [camps.rows[0].id, camps.rows[1].id, null];

    // 1500 transactions over 90 days from 2026-07-01, deterministic.
    const start = Date.UTC(2026, 6, 1);
    const step = Math.floor((90 * 86_400_000) / TX_COUNT);
    const tx = Array.from({ length: TX_COUNT }, (_, i) => {
      const kind = i % 13 === 0 ? "refund" : i % 29 === 0 ? "purchase" : "usage";
      return {
        id: crypto.randomUUID(),
        campaign_id: campaignIds[i % 3],
        amount: kind === "usage" ? -(1 + (i % 7) * 2) : 10 + (i % 5) * 10,
        type: kind,
        description:
          kind === "usage"
            ? `Geração de peça #${i} — variação ${(i % 4) + 1} do criativo para Instagram Feed`
            : kind === "refund"
              ? `Estorno da geração #${i - 1}`
              : `Compra de créditos — pacote ${(i % 3) + 1}`,
        at: stamp(start + i * step, (i * 37) % 1000),
      };
    });
    await pool.query(
      `insert into adscale_app.credit_transactions (id, user_id, workspace_id, campaign_id, amount, type, description, created_at)
       select t.id, $2, $3::uuid, t.campaign_id, t.amount, t.type, t.description, t.at::timestamp
       from jsonb_to_recordset($1::jsonb) as t(id uuid, campaign_id uuid, amount int, type text, description text, at text)`,
      [JSON.stringify(tx), userId, workspaceId]
    );
    const grants = Array.from({ length: GRANT_COUNT }, (_, i) => ({
      id: crypto.randomUUID(),
      amount: 100 + i * 10,
      at: stamp(start + i * 4 * 86_400_000, (i * 53) % 1000),
    }));
    await pool.query(
      `insert into adscale_app.credit_grants (id, workspace_id, source, amount, remaining, created_at)
       select t.id, $2::uuid, 'stripe_invoice', t.amount, t.amount, t.at::timestamp
       from jsonb_to_recordset($1::jsonb) as t(id uuid, amount int, at text)`,
      [JSON.stringify(grants), workspaceId]
    );
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    if (workspaceId) await pool.query("delete from adscale_app.workspaces where id = $1", [workspaceId]);
    if (userId) await pool.query(`delete from adscale_app."user" where id = $1`, [userId]);
    await pool.end();
  });

  it("the paginated responses are smaller than the legacy payload in every scenario", async () => {
    const month = { from: new Date("2026-08-01T00:00:00.000Z"), to: new Date("2026-08-31T23:59:59.999Z") };
    const scenarios = [
      { name: "month-window-first-page", query: "?from=2026-08-01&to=2026-08-31", legacyFilters: month },
      { name: "all-period-first-page", query: "", legacyFilters: {} },
      { name: "billing-tab-grants", query: "?view=grants", legacyFilters: {} },
    ];
    const results = [];
    for (const s of scenarios) {
      const before = bytes(await legacyPayload(s.legacyFilters));
      const after = bytes(await handler(s.query));
      results.push({ scenario: s.name, beforeBytes: before, afterBytes: after, ratio: Number((after / before).toFixed(4)) });
    }
    const report = { transactions: TX_COUNT, grants: GRANT_COUNT, results };
    console.log(JSON.stringify(report));
    for (const r of results) expect(r.afterBytes, r.scenario).toBeLessThan(r.beforeBytes);
  });
});
