/**
 * `markTrainingAnalysisFailed` / `retryTrainingAnalysis` against REAL Postgres: each transition moves exactly one
 * source state to exactly one target, inside the workspace/profile/reference scope, and touches nothing else.
 * The `review_status` CHECK accepts `analysis_failed` and refuses anything unknown.
 *
 *   TEST_DATABASE_URL=postgres://… npx vitest run --config config/vitest.config.ts src/server/repositories/client-reference.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;

type Mods = Awaited<ReturnType<typeof load>>;
async function load() {
  const [free, schema, repo] = await Promise.all([
    import("../equipe/module/testing/free-pg"), import("@/server/db/schema"), import("./client-reference"),
  ]);
  return { free, schema, repo };
}

const STATUSES = [null, "pending_analysis", "analysis_failed", "pending_approval", "approved", "archived", "rejected"] as const;
type Status = (typeof STATUSES)[number];

describe.skipIf(!ENABLED)("training analysis transitions (pg)", () => {
  let m: Mods; let A: ReturnType<Mods["free"]["openPool"]>;
  const workspaces: string[] = []; const users: string[] = [];

  beforeAll(async () => {
    m = await load();
    A = m.free.openPool(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(A, TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    if (!ENABLED) return;
    await m.free.cleanup(A, workspaces, users);
    await A.pool.end();
  });

  async function world() {
    const ws = await m.free.seedWorkspace(A); const other = await m.free.seedWorkspace(A);
    workspaces.push(ws.workspaceId, other.workspaceId); users.push(ws.userId, other.userId);
    const profile = async (workspaceId: string, name: string) =>
      (await A.db.insert(m.schema.clientProfiles).values({ workspaceId, name }).returning())[0]!;
    return { ws, other, p1: await profile(ws.workspaceId, "P1"), p2: await profile(ws.workspaceId, "P2"), p3: await profile(other.workspaceId, "P3") };
  }
  async function ref(workspaceId: string, clientProfileId: string, reviewStatus: Status, label: string) {
    const [row] = await A.db.insert(m.schema.clientReferences).values({
      workspaceId, clientProfileId, reviewStatus, label, assetKey: `k/${label}`, notes: `n-${label}`, trainingCategory: "graphic", usageMode: "reference",
    }).returning();
    return row!;
  }
  const statusOf = async (id: string) => (await A.db.select().from(m.schema.clientReferences).where(eq(m.schema.clientReferences.id, id)))[0]!;
  const scopeOf = (r: { workspaceId: string; clientProfileId: string; id: string }) => ({ workspaceId: r.workspaceId, clientProfileId: r.clientProfileId, referenceId: r.id });

  async function seedAllStatuses(w: Awaited<ReturnType<typeof world>>) {
    const rows = new Map<Status, Awaited<ReturnType<typeof ref>>>();
    for (const s of STATUSES) rows.set(s, await ref(w.ws.workspaceId, w.p1.id, s, `p1-${s}`));
    return { rows };
  }

  const cases = [
    { name: "markTrainingAnalysisFailed", run: (s: ReturnType<typeof scopeOf>) => m.repo.markTrainingAnalysisFailed(s), from: "pending_analysis", to: "analysis_failed" },
    { name: "retryTrainingAnalysis", run: (s: ReturnType<typeof scopeOf>) => m.repo.retryTrainingAnalysis(s), from: "analysis_failed", to: "pending_analysis" },
  ] as const;

  for (const c of cases) {
    describe(c.name, () => {
      it(`moves ${c.from} to ${c.to} and returns that row; every other state answers null and stays as it was`, async () => {
        const w = await world();
        const { rows } = await seedAllStatuses(w);
        const before = new Map<Status, Awaited<ReturnType<typeof statusOf>>>();
        for (const [s, r] of rows) before.set(s, await statusOf(r.id));

        for (const s of STATUSES) {
          const out = await c.run(scopeOf(rows.get(s)!));
          if (s === c.from) {
            expect(out?.id).toBe(rows.get(s)!.id);
            expect(out?.reviewStatus).toBe(c.to);
          } else {
            expect(out).toBeNull();
          }
        }
        for (const s of STATUSES) {
          const now = await statusOf(rows.get(s)!.id);
          if (s === c.from) {
            // Only review_status changed: workspace, profile, id and every payload column are preserved.
            expect(now).toEqual({ ...before.get(s)!, reviewStatus: c.to });
          } else {
            expect(now).toEqual(before.get(s)!);
          }
        }
      });

      it("a second call finds the row already moved: null, one transition in total", async () => {
        const w = await world();
        const r = await ref(w.ws.workspaceId, w.p1.id, c.from, "once");
        expect((await c.run(scopeOf(r)))?.reviewStatus).toBe(c.to);
        expect(await c.run(scopeOf(r))).toBeNull();
        expect((await statusOf(r.id)).reviewStatus).toBe(c.to);
      });

      it("leaves sentinels in the same source state untouched (same profile, other profile, other workspace)", async () => {
        const w = await world();
        const target = await ref(w.ws.workspaceId, w.p1.id, c.from, "target");
        const sameProfile = await ref(w.ws.workspaceId, w.p1.id, c.from, "same-profile");
        const otherProfile = await ref(w.ws.workspaceId, w.p2.id, c.from, "other-profile");
        const otherWorkspace = await ref(w.other.workspaceId, w.p3.id, c.from, "other-workspace");

        expect((await c.run(scopeOf(target)))?.id).toBe(target.id);

        expect((await statusOf(target.id)).reviewStatus).toBe(c.to);
        for (const s of [sameProfile, otherProfile, otherWorkspace]) expect(await statusOf(s.id)).toEqual(s);
        const ids = [target.id, sameProfile.id, otherProfile.id, otherWorkspace.id];
        const moved = (await A.db.select().from(m.schema.clientReferences).where(inArray(m.schema.clientReferences.id, ids)))
          .filter((r) => r.reviewStatus === c.to);
        expect(moved.map((r) => r.id)).toEqual([target.id]);
      });

      it("a wrong scope against a real id in the source state does nothing: other workspace, other profile, workspace/profile mismatch", async () => {
        const w = await world();
        const real = await ref(w.ws.workspaceId, w.p1.id, c.from, "real");
        const good = scopeOf(real);
        const wrong = [
          { ...good, workspaceId: w.other.workspaceId },
          { ...good, clientProfileId: w.p2.id },
          { ...good, clientProfileId: w.p3.id },
          { ...good, workspaceId: w.other.workspaceId, clientProfileId: w.p3.id },
        ];
        for (const scope of wrong) expect(await c.run(scope)).toBeNull();
        expect(await statusOf(real.id)).toEqual(real);
        // And the right scope still works afterwards.
        expect((await c.run(good))?.reviewStatus).toBe(c.to);
      });
    });
  }

  describe("review_status CHECK", () => {
    it("accepts analysis_failed", async () => {
      const w = await world();
      const r = await ref(w.ws.workspaceId, w.p1.id, "analysis_failed", "ok");
      expect((await statusOf(r.id)).reviewStatus).toBe("analysis_failed");
    });

    it("refuses an unknown value with check_violation (23514) on client_references_review_status_check, on insert and on update", async () => {
      const w = await world();
      const violation = async (run: () => Promise<unknown>) => {
        const error = await run().then(() => null, (e: unknown) => e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } });
        const pg = error?.cause ?? error;
        expect(pg?.code).toBe("23514");
        expect(pg?.constraint).toBe("client_references_review_status_check");
      };
      await violation(() => ref(w.ws.workspaceId, w.p1.id, "bogus" as Status, "bad-insert"));
      const r = await ref(w.ws.workspaceId, w.p1.id, "pending_analysis", "bad-update");
      await violation(() => A.db.update(m.schema.clientReferences).set({ reviewStatus: "bogus" as Status }).where(eq(m.schema.clientReferences.id, r.id)));
      expect((await statusOf(r.id)).reviewStatus).toBe("pending_analysis");
    });
  });
});
