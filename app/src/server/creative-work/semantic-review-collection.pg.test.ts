/**
 * #468 — Jev policy + manual collection, behavioural, against real Postgres.
 *
 * Entry points under test: createSemanticReviewRepository (policy commands) and
 * collectSemanticReview (collection). No internal mocks. `fetch` is a sentinel
 * that must never be called: collection sends nothing to the provider.
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/server/creative-work/semantic-review-collection.pg.test.ts
 *
 * Absent TEST_DATABASE_URL skips the suite (repo convention) — a skip is NOT
 * evidence. A supplied URL that is not a loopback `*_test` database fails.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { SEMANTIC_REVIEW_VERSIONS, createSemanticReviewRepository } from "./semantic-review-repository";
import { collectSemanticReview } from "./semantic-review-collector";
import {
  DAY_MS, T0, assertSafeTestDatabaseUrl, createScope, deleteScopes, insertWorks, minutes, openTestDatabase,
  policyInput, workRow, workSnapshot, type Scope, type TestDb,
} from "./semantic-review-collection.pg-helpers";

const URL_UNDER_TEST = process.env.TEST_DATABASE_URL;
const versions = SEMANTIC_REVIEW_VERSIONS as unknown as Record<string, string>;

describe.skipIf(!URL_UNDER_TEST)("semantic review policy and collection (PostgreSQL)", () => {
  let db: TestDb;
  let pool: Pool;
  let repository: ReturnType<typeof createSemanticReviewRepository>;
  const scopes: Scope[] = [];
  const fetchSentinel = vi.fn(() => { throw new Error("http_forbidden_in_collection"); });

  async function scope(brands = 1) {
    const created = await createScope(db, brands);
    scopes.push(created);
    return created;
  }
  async function enabledPolicy(s: Scope, overrides: Record<string, unknown> = {}) {
    const policy = await repository.registerPolicy(policyInput(s, versions, overrides) as never, T0);
    await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
    return policy;
  }
  const collect = (now: Date) => collectSemanticReview({ repository, enabled: true, now });
  /** Collect until the window is complete; returns every summary. */
  async function collectWindow(start: Date, max = 40) {
    const summaries = [];
    for (let i = 0; i < max; i += 1) {
      const summary = await collect(minutes(start, i));
      summaries.push(summary);
      if (summary.status !== "collected" || summary.windowComplete) break;
    }
    return summaries;
  }
  const observations = (s: Scope) => db.select().from(schema.semanticReviewObservations)
    .where(eq(schema.semanticReviewObservations.workspaceId, s.workspaceId));
  const sum = (summaries: Array<Record<string, unknown>>, key: string) => summaries.reduce((n, item) => n + ((item[key] as number | undefined) ?? 0), 0);

  beforeAll(async () => {
    ({ db, pool } = await openTestDatabase(assertSafeTestDatabaseUrl(URL_UNDER_TEST)));
    repository = createSemanticReviewRepository(db);
  });
  beforeEach(async () => {
    fetchSentinel.mockClear();
    vi.stubGlobal("fetch", fetchSentinel);
  });
  afterEach(async () => {
    // Only what this suite created: its own policies, so none leaks into the next sweep.
    if (scopes.length) {
      await db.delete(schema.semanticReviewPolicies)
        .where(inArray(schema.semanticReviewPolicies.workspaceId, scopes.map((s) => s.workspaceId)));
    }
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    expect(fetchSentinel).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    if (!db) return;
    await deleteScopes(db, scopes);
    await pool.end();
  });

  describe("policy command", () => {
    it("is born disabled and exposes its brands without enabling anything", async () => {
      const s = await scope(2);
      const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
      expect(policy.state).toBe("disabled");
      const stored = await repository.getPolicy({ workspaceId: s.workspaceId, policyId: policy.id });
      expect(stored!.state).toBe("disabled");
      expect([...stored!.clientProfileIds].sort()).toEqual([...s.brandIds].sort());
    });

    it("rejects brands of another workspace, validity over 14 days and a ceiling over 100", async () => {
      const a = await scope();
      const b = await scope();
      await expect(repository.registerPolicy(policyInput(a, versions, { clientProfileIds: [...a.brandIds, ...b.brandIds] }) as never, T0))
        .rejects.toThrow("invalid_policy_scope");
      await expect(repository.registerPolicy(policyInput(a, versions, { clientProfileIds: b.brandIds }) as never, T0))
        .rejects.toThrow("invalid_policy_scope");
      await expect(repository.registerPolicy(policyInput(a, versions, { expiresAt: new Date(T0.getTime() + 14 * DAY_MS + 1) }) as never, T0))
        .rejects.toThrow("invalid_policy");
      await expect(repository.registerPolicy(policyInput(a, versions, { dailyAttemptLimit: 101 }) as never, T0))
        .rejects.toThrow("invalid_policy");
      await expect(repository.registerPolicy(policyInput(a, versions, { dailyAttemptLimit: 0 }) as never, T0))
        .rejects.toThrow("invalid_policy");
      await expect(repository.registerPolicy(policyInput(a, versions, { expiresAt: T0 }) as never, T0))
        .rejects.toThrow("invalid_policy");
      await expect(repository.registerPolicy(policyInput(a, versions, { clientProfileIds: [] }) as never, T0))
        .rejects.toThrow("invalid_policy");
      // Boundaries that must be accepted.
      await expect(repository.registerPolicy(policyInput(a, versions, { dailyAttemptLimit: 100, expiresAt: new Date(T0.getTime() + 14 * DAY_MS) }) as never, T0))
        .resolves.toMatchObject({ state: "disabled" });
      const rows = await db.select().from(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.workspaceId, a.workspaceId));
      expect(rows).toHaveLength(1);
    });

    it("accepts synthetic extremes 0/100 but real data only at 10%, with fixed versions only", async () => {
      const s = await scope();
      for (const samplePercent of [0, 100]) {
        await expect(repository.registerPolicy(policyInput(s, versions, { samplePercent }) as never, T0)).resolves.toBeTruthy();
      }
      await expect(repository.registerPolicy(policyInput(s, versions, { dataOrigin: "authorized", samplePercent: 10 }) as never, T0)).resolves.toBeTruthy();
      for (const samplePercent of [0, 50, 100]) {
        await expect(repository.registerPolicy(policyInput(s, versions, { dataOrigin: "authorized", samplePercent }) as never, T0))
          .rejects.toThrow("invalid_policy");
      }
      await expect(repository.registerPolicy(policyInput(s, versions, { samplePercent: 101 }) as never, T0)).rejects.toThrow("invalid_policy");
      await expect(repository.registerPolicy(policyInput(s, versions, { model: "jev-latest" }) as never, T0)).rejects.toThrow("invalid_policy");
      await expect(repository.registerPolicy(policyInput(s, versions, { provider: "other" }) as never, T0)).rejects.toThrow("invalid_policy");
    });

    it("allows a single enabled policy per workspace, and another once the first is revoked", async () => {
      const s = await scope();
      const first = await enabledPolicy(s);
      const second = await repository.registerPolicy(policyInput(s, versions) as never, T0).catch((error: Error) => error);
      if (second instanceof Error) {
        expect(second.message).toBe("policy_already_active");
      } else {
        await expect(repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: second.id, enabled: true }, T0))
          .rejects.toThrow("policy_already_active");
      }
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: first.id }, minutes(T0, 5));
      const third = await repository.registerPolicy(policyInput(s, versions) as never, minutes(T0, 5));
      await expect(repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: third.id, enabled: true }, minutes(T0, 5)))
        .resolves.toBeTruthy();
    });

    it("never reaches another workspace's policy", async () => {
      const a = await scope();
      const b = await scope();
      const policy = await repository.registerPolicy(policyInput(a, versions) as never, T0);
      expect(await repository.getPolicy({ workspaceId: b.workspaceId, policyId: policy.id })).toBeNull();
      await expect(repository.setPolicyEnabled({ workspaceId: b.workspaceId, policyId: policy.id, enabled: true }, T0)).rejects.toThrow("policy_not_found");
      await expect(repository.revokePolicy({ workspaceId: b.workspaceId, policyId: policy.id }, T0)).rejects.toThrow("policy_not_found");
      expect((await repository.getPolicy({ workspaceId: a.workspaceId, policyId: policy.id }))!.state).toBe("disabled");
    });

    it("refuses to enable an expired policy and a revoked one", async () => {
      const s = await scope();
      const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
      await expect(repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, new Date(T0.getTime() + 15 * DAY_MS)))
        .rejects.toThrow("policy_not_valid");
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 1));
      await expect(repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, minutes(T0, 2)))
        .rejects.toThrow("policy_not_valid");
    });
  });

  describe("authorization gates collection", () => {
    it("collects nothing when the flag is off, even with an enabled policy", async () => {
      const s = await scope();
      await enabledPolicy(s);
      await insertWorks(db, s, 3, { updatedAt: minutes(T0, 1) });
      expect(await collectSemanticReview({ repository, enabled: false, now: minutes(T0, 60) })).toMatchObject({ status: "disabled" });
      vi.stubEnv("JEV_OBSERVER_ENABLED", "false");
      expect(await collectSemanticReview({ repository, now: minutes(T0, 60) })).toMatchObject({ status: "disabled" });
      expect(await observations(s)).toHaveLength(0);
    });

    it("reads the flag from JEV_OBSERVER_ENABLED when not given", async () => {
      const s = await scope();
      await enabledPolicy(s);
      await insertWorks(db, s, 2, { updatedAt: minutes(T0, 1) });
      vi.stubEnv("JEV_OBSERVER_ENABLED", "true");
      expect(await collectSemanticReview({ repository, now: minutes(T0, 60) })).toMatchObject({ status: "collected", unique: 2 });
    });

    it("does nothing for a policy that is disabled, expired or revoked", async () => {
      const s = await scope();
      const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
      await insertWorks(db, s, 2, { updatedAt: minutes(T0, 1) });
      expect(await collect(minutes(T0, 60))).toMatchObject({ status: "no_policy" });
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
      expect(await collect(new Date(T0.getTime() + 15 * DAY_MS))).toMatchObject({ status: "no_policy" });
      expect(await observations(s)).toHaveLength(0);
    });

    it("honours a short validity exactly at its UTC boundary", async () => {
      const s = await scope();
      await enabledPolicy(s, { expiresAt: minutes(T0, 60) });
      await insertWorks(db, s, 1, { updatedAt: minutes(T0, 1) });
      expect(await collect(minutes(T0, 59))).toMatchObject({ status: "collected", unique: 1 });
      expect(await collect(new Date(minutes(T0, 60).getTime() + 1))).toMatchObject({ status: "no_policy" });
    });

    it("stops after revocation, keeping what was already observed", async () => {
      const s = await scope();
      const policy = await enabledPolicy(s);
      await insertWorks(db, s, 3, { updatedAt: minutes(T0, 1) });
      await collect(minutes(T0, 60));
      expect(await observations(s)).toHaveLength(3);
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 61));
      await insertWorks(db, s, 2, { updatedAt: minutes(T0, 62) });
      expect(await collect(minutes(T0, 120))).toMatchObject({ status: "no_policy" });
      expect(await observations(s)).toHaveLength(3);
      expect((await repository.getPolicy({ workspaceId: s.workspaceId, policyId: policy.id }))!.state).toBe("revoked");
    });
  });

  describe("collection", () => {
    it("observes eligible works once, stores only keys/hashes/versions/state and leaves works untouched", async () => {
      const s = await scope();
      const policy = await enabledPolicy(s);
      const ids = await insertWorks(db, s, 3, { updatedAt: minutes(T0, 1) });
      const before = await Promise.all(ids.map((id) => workSnapshot(db, id)));
      const summary = await collect(minutes(T0, 60));
      expect(summary).toMatchObject({ status: "collected", policyId: policy.id, workspaceId: s.workspaceId, consulted: 3, eligible: 3, unique: 3, duplicates: 0, outOfScope: 0, invalid: 0, notSampled: 0, windowComplete: true });
      expect(await Promise.all(ids.map((id) => workSnapshot(db, id)))).toEqual(before);

      const rows = await observations(s);
      expect(rows).toHaveLength(3);
      expect(new Set(rows.map((row) => row.workItemId))).toEqual(new Set(ids));
      for (const row of rows) {
        expect(row).toMatchObject({ state: "queued", policyId: policy.id, workspaceId: s.workspaceId, ...versions });
        expect(row.semanticHash).toMatch(/^[0-9a-f]{64}$/);
      }
      // No parallel text storage: nothing of request/copy/facts in any persisted Jev row.
      const persisted = JSON.stringify([
        rows,
        await db.select().from(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.workspaceId, s.workspaceId)),
        await repository.listObservations({ workspaceId: s.workspaceId }),
      ]);
      for (const text of ["Anuncie o curso", "Curso por R$ 99", "Conheça o curso", "Saiba mais", "Marca Exemplo", "Apresentar o produto"]) {
        expect(persisted).not.toContain(text);
      }
    });

    it("reports a summary whose categories add up and gives each exclusion a reason", async () => {
      const s = await scope(2);
      await enabledPolicy(s, { clientProfileIds: [s.brandIds[0]] });
      await insertWorks(db, s, 2, { updatedAt: minutes(T0, 1) });
      await insertWorks(db, s, 1, { updatedAt: minutes(T0, 1), toolKind: "variations" });
      await insertWorks(db, s, 1, { updatedAt: minutes(T0, 1), training: true });
      await insertWorks(db, s, 1, { updatedAt: minutes(T0, 1), brandIndex: 1 });
      await insertWorks(db, s, 1, { updatedAt: minutes(T0, 1), staleSnapshot: true });
      const summary = await collect(minutes(T0, 60));
      expect(summary).toMatchObject({ consulted: 6, eligible: 2, unique: 2, duplicates: 0, invalid: 1, outOfScope: 3, notSampled: 0, windowComplete: true });
      expect(summary.consulted).toBe(summary.eligible + summary.outOfScope + summary.invalid);
      expect(summary.eligible).toBe(summary.unique + summary.duplicates + summary.notSampled);
      expect(Object.values(summary.exclusions).reduce((n: number, v) => n + (v as number), 0)).toBe(summary.outOfScope + summary.invalid);
      expect(summary.exclusions).toMatchObject({ protocol: 1, training: 1, outside_policy_scope: 1 });
      const rows = await observations(s);
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.clientProfileId === s.brandIds[0])).toBe(true);
    });

    it("paginates 26 works sharing one timestamp: 25 then 1, none lost or repeated", async () => {
      const s = await scope();
      await enabledPolicy(s);
      const ids = await insertWorks(db, s, 26, { updatedAt: minutes(T0, 1) });
      const first = await collect(minutes(T0, 60));
      expect(first).toMatchObject({ consulted: 25, unique: 25, windowComplete: false });
      expect(await observations(s)).toHaveLength(25);
      const second = await collect(minutes(T0, 61));
      expect(second).toMatchObject({ consulted: 1, unique: 1, duplicates: 0, windowComplete: true });
      const rows = await observations(s);
      expect(rows.map((row) => row.workItemId).sort()).toEqual([...ids].sort());
    });

    it("advances the cursor over excluded works, with reasons, across pages", async () => {
      const s = await scope();
      await enabledPolicy(s);
      await insertWorks(db, s, 26, { updatedAt: minutes(T0, 1), toolKind: "carousel" });
      await insertWorks(db, s, 1, { updatedAt: minutes(T0, 2) });
      const summaries = await collectWindow(minutes(T0, 60));
      expect(sum(summaries, "consulted")).toBe(27);
      expect(sum(summaries, "outOfScope")).toBe(26);
      expect(sum(summaries, "unique")).toBe(1);
      expect(summaries.at(-1)!.windowComplete).toBe(true);
      expect(summaries.at(-1)!.exclusions).toBeDefined();
    });

    it("starts at the authorization date, with no automatic history", async () => {
      const s = await scope();
      await enabledPolicy(s);
      await insertWorks(db, s, 3, { updatedAt: minutes(T0, -24 * 60) });
      const recent = await insertWorks(db, s, 2, { updatedAt: minutes(T0, 5) });
      const summaries = await collectWindow(minutes(T0, 60));
      expect(sum(summaries, "unique")).toBe(2);
      expect((await observations(s)).map((row) => row.workItemId).sort()).toEqual([...recent].sort());
    });

    it("repeating a collection never creates a new observation for the same identity", async () => {
      const s = await scope();
      await enabledPolicy(s);
      await insertWorks(db, s, 4, { updatedAt: minutes(T0, 55) });
      expect(await collect(minutes(T0, 60))).toMatchObject({ unique: 4, duplicates: 0 });
      const repeat = await collect(minutes(T0, 61));
      expect(repeat).toMatchObject({ unique: 0, duplicates: 4, eligible: 4 });
      expect(await observations(s)).toHaveLength(4);
    });

    it("keeps a stable upper bound: later updates wait for the next window, with overlap not repeating observations", async () => {
      const s = await scope();
      await enabledPolicy(s);
      await insertWorks(db, s, 26, { updatedAt: minutes(T0, 1) });
      await collect(minutes(T0, 60)); // window upper = T0+60min, page 1 of 2
      const [late] = await insertWorks(db, s, 1, { updatedAt: minutes(T0, 90) });
      const second = await collect(minutes(T0, 120));
      expect(second).toMatchObject({ consulted: 1, unique: 1, windowComplete: true });
      expect((await observations(s)).some((row) => row.workItemId === late)).toBe(false);
      const third = await collect(minutes(T0, 121));
      expect(third).toMatchObject({ unique: 1 });
      expect((await observations(s)).filter((row) => row.workItemId === late)).toHaveLength(1);
      expect(await observations(s)).toHaveLength(27);
    });

    it("a work edited during pagination yields one observation per distinct revision", async () => {
      const s = await scope();
      await enabledPolicy(s);
      await insertWorks(db, s, 26, { updatedAt: minutes(T0, 1) });
      await collect(minutes(T0, 60));
      const [collected] = await observations(s);
      await db.update(schema.creativeWorkItems)
        .set({ copy: { headline: "Nova headline sintética", body: "Conheça o curso.", cta: "Saiba mais" }, updatedAt: minutes(T0, 30) })
        .where(eq(schema.creativeWorkItems.id, collected.workItemId));
      const second = await collect(minutes(T0, 61));
      expect(second).toMatchObject({ consulted: 2, unique: 2, windowComplete: true });
      const revisions = (await observations(s)).filter((row) => row.workItemId === collected.workItemId);
      expect(revisions).toHaveLength(2);
      expect(new Set(revisions.map((row) => row.semanticHash)).size).toBe(2);
    });

    it("an edit that changes no semantic input does not create another observation", async () => {
      const s = await scope();
      await enabledPolicy(s);
      const [id] = await insertWorks(db, s, 1, { updatedAt: minutes(T0, 55) });
      await collect(minutes(T0, 60));
      await db.update(schema.creativeWorkItems).set({ updatedAt: minutes(T0, 58) }).where(eq(schema.creativeWorkItems.id, id));
      expect(await collect(minutes(T0, 61))).toMatchObject({ unique: 0, duplicates: 1 });
      expect(await observations(s)).toHaveLength(1);
    });

    it("rolls cursor and inserts back together when an insert fails, and recovers afterwards", async () => {
      const s = await scope();
      const policy = await enabledPolicy(s);
      await insertWorks(db, s, 3, { updatedAt: minutes(T0, 1) });
      const table = `adscale_app.semantic_review_observations`;
      const name = `jev468_fail_${s.workspaceId.replace(/-/g, "")}`;
      await pool.query(`create function adscale_app.${name}() returns trigger language plpgsql as $$ begin
        if new.workspace_id = '${s.workspaceId}' and (select count(*) from ${table} where workspace_id = new.workspace_id) >= 1 then
          raise exception 'jev468_forced_failure'; end if; return new; end $$`);
      await pool.query(`create trigger ${name} before insert on ${table} for each row execute function adscale_app.${name}()`);
      try {
        const before = await repository.getPolicy({ workspaceId: s.workspaceId, policyId: policy.id });
        await expect(collect(minutes(T0, 60))).rejects.toThrow();
        expect(await observations(s)).toHaveLength(0);
        expect(await repository.getPolicy({ workspaceId: s.workspaceId, policyId: policy.id })).toEqual(before);
      } finally {
        await pool.query(`drop trigger if exists ${name} on ${table}`);
        await pool.query(`drop function if exists adscale_app.${name}()`);
      }
      expect(await collect(minutes(T0, 61))).toMatchObject({ unique: 3, windowComplete: true });
      expect(await observations(s)).toHaveLength(3);
    });
  });

  describe("sampling", () => {
    async function collectAllWorks(s: Scope, start: Date) {
      const summaries = await collectWindow(start, 60);
      expect(summaries.at(-1)!.windowComplete).toBe(true);
      return summaries;
    }

    it("0% observes nothing, 100% observes everything, 10% is a stable strict subset", async () => {
      const s = await scope();
      await insertWorks(db, s, 200, { updatedAt: minutes(T0, 1) });

      const zero = await enabledPolicy(s, { samplePercent: 0 });
      const zeroSummaries = await collectAllWorks(s, minutes(T0, 60));
      expect(sum(zeroSummaries, "unique")).toBe(0);
      expect(sum(zeroSummaries, "notSampled")).toBe(200);
      expect(await observations(s)).toHaveLength(0);
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: zero.id }, minutes(T0, 100));

      const hundred = await repository.registerPolicy(policyInput(s, versions, { samplePercent: 100 }) as never, minutes(T0, 100));
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: hundred.id, enabled: true }, minutes(T0, 100));
      const all = await collectAllWorks(s, minutes(T0, 110));
      expect(sum(all, "unique")).toBe(200);
      expect(sum(all, "notSampled")).toBe(0);
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: hundred.id }, minutes(T0, 200));

      const sampledIn = async (offset: number) => {
        await db.delete(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.workspaceId, s.workspaceId));
        const policy = await repository.registerPolicy(policyInput(s, versions, { samplePercent: 10 }) as never, minutes(T0, offset));
        await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, minutes(T0, offset));
        const summaries = await collectAllWorks(s, minutes(T0, offset + 10));
        await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, offset + 50));
        expect(sum(summaries, "unique") + sum(summaries, "notSampled")).toBe(200);
        return new Set((await observations(s)).map((row) => row.workItemId));
      };
      const firstRun = await sampledIn(300);
      const secondRun = await sampledIn(500);
      expect(firstRun.size).toBeGreaterThan(0);
      expect(firstRun.size).toBeLessThan(60);
      expect(secondRun).toEqual(firstRun);
    });
  });

  describe("isolation and fairness", () => {
    it("never observes works of other workspaces or of brands outside the policy", async () => {
      const a = await scope(2);
      const b = await scope();
      await enabledPolicy(a, { clientProfileIds: [a.brandIds[0]] });
      await insertWorks(db, a, 2, { updatedAt: minutes(T0, 1) });
      await insertWorks(db, a, 2, { updatedAt: minutes(T0, 1), brandIndex: 1 });
      await insertWorks(db, b, 5, { updatedAt: minutes(T0, 1) });
      await collectWindow(minutes(T0, 60));
      expect(await observations(b)).toHaveLength(0);
      const rows = await observations(a);
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.clientProfileId === a.brandIds[0])).toBe(true);
      expect(await repository.listObservations({ workspaceId: b.workspaceId })).toHaveLength(0);
    });

    it("scopes each policy's quota/cursor to its own workspace", async () => {
      const a = await scope();
      const b = await scope();
      const pa = await enabledPolicy(a);
      const pb = await enabledPolicy(b);
      await insertWorks(db, a, 26, { updatedAt: minutes(T0, 1) });
      await insertWorks(db, b, 1, { updatedAt: minutes(T0, 1) });
      const seen: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        const summary = await collect(minutes(T0, 60 + i));
        if (summary.policyId) seen.push(summary.policyId);
      }
      expect(await observations(a)).toHaveLength(26);
      expect(await observations(b)).toHaveLength(1);
      expect(new Set(seen)).toEqual(new Set([pa.id, pb.id]));
    });

    it("sweeps exactly one policy per run, in a fair rotation without starvation", async () => {
      const group = await Promise.all([scope(), scope(), scope()]);
      const policies = [];
      for (const s of group) {
        policies.push(await enabledPolicy(s));
        await insertWorks(db, s, 1, { updatedAt: minutes(T0, 1) });
      }
      const firstThree = [];
      for (let i = 0; i < 3; i += 1) {
        const summary = await collect(minutes(T0, 60 + i));
        expect(summary.status).toBe("collected");
        firstThree.push(summary.policyId);
      }
      expect(new Set(firstThree)).toEqual(new Set(policies.map((policy) => policy.id)));
      for (const s of group) expect(await observations(s)).toHaveLength(1);
    });

    it("removes observations with their work, brand and workspace (no parallel storage)", async () => {
      const s = await scope();
      await enabledPolicy(s);
      const [workId] = await insertWorks(db, s, 2, { updatedAt: minutes(T0, 1) });
      await collect(minutes(T0, 60));
      await db.delete(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.id, workId));
      expect(await observations(s)).toHaveLength(1);
      await db.delete(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId));
      expect(await observations(s)).toHaveLength(0);
      expect(await db.select().from(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.workspaceId, s.workspaceId))).toHaveLength(0);
      expect(await db.select().from(schema.semanticReviewPolicyBrands).where(inArray(schema.semanticReviewPolicyBrands.clientProfileId, s.brandIds))).toHaveLength(0);
    });
  });

  describe("microseconds, concurrency and scope integrity", () => {
    it("pages 26 works sharing a microsecond timestamp without loss or repeat, keeping the cursor string exact", async () => {
      const s = await scope();
      const policy = await enabledPolicy(s);
      const ids = await insertWorks(db, s, 26, { updatedAt: minutes(T0, 1) });
      await db.execute(sql`update adscale_app.creative_work_items set updated_at = '2026-10-01 00:01:00.000123' where id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
      const first = await collect(minutes(T0, 60));
      expect(first).toMatchObject({ consulted: 25, unique: 25, windowComplete: false });
      const midway = await db.select().from(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.id, policy.id));
      expect(midway[0].cursorUpdatedAt).toMatch(/00:01:00\.000123$/);
      expect(await collect(minutes(T0, 61))).toMatchObject({ consulted: 1, unique: 1, duplicates: 0, windowComplete: true });
      expect((await observations(s)).map((row) => row.workItemId).sort()).toEqual([...ids].sort());
    });

    it("lets exactly one of two concurrently enabled policies of a workspace win", async () => {
      const s = await scope();
      const a = await repository.registerPolicy(policyInput(s, versions) as never, T0);
      const b = await repository.registerPolicy(policyInput(s, versions) as never, T0);
      const results = await Promise.allSettled([a, b].map((policy) =>
        repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0)));
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const lost = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect(lost.reason.message).toBe("policy_already_active");
      const rows = await db.select().from(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.workspaceId, s.workspaceId));
      expect(rows.filter((row) => row.state === "enabled")).toHaveLength(1);
    });

    it("keeps dedupe and cursor intact under concurrent public collections of one policy", async () => {
      const s = await scope();
      const policy = await enabledPolicy(s);
      const ids = await insertWorks(db, s, 26, { updatedAt: minutes(T0, 1) });
      for (let round = 0; round < 6; round += 1) {
        const settled = await Promise.allSettled([collect(minutes(T0, 60 + round)), collect(minutes(T0, 60 + round))]);
        expect(settled.every((result) => result.status === "fulfilled")).toBe(true);
        if ((await observations(s)).length === 26) break;
      }
      const rows = await observations(s);
      expect(rows).toHaveLength(26);
      expect(rows.map((row) => row.workItemId).sort()).toEqual([...ids].sort());
      expect(new Set(rows.map((row) => `${row.workItemId}:${row.semanticHash}`)).size).toBe(26);
      expect((await repository.getPolicy({ workspaceId: s.workspaceId, policyId: policy.id }))!.state).toBe("enabled");
    });

    it("drops the brand link when the last brand is deleted, keeping the policy, and collects nothing", async () => {
      const s = await scope();
      const policy = await enabledPolicy(s);
      await insertWorks(db, s, 2, { updatedAt: minutes(T0, 1) });
      await db.delete(schema.clientProfiles).where(eq(schema.clientProfiles.id, s.brandIds[0]));
      expect(await db.select().from(schema.semanticReviewPolicyBrands).where(eq(schema.semanticReviewPolicyBrands.policyId, policy.id))).toHaveLength(0);
      expect(await repository.getPolicy({ workspaceId: s.workspaceId, policyId: policy.id })).not.toBeNull();
      const summary = await collect(minutes(T0, 60));
      expect(summary.unique ?? 0).toBe(0);
      expect(await observations(s)).toHaveLength(0);
    });

    it("rejects, in the database, a brand link that crosses workspaces", async () => {
      const a = await scope();
      const b = await scope();
      const policy = await repository.registerPolicy(policyInput(a, versions) as never, T0);
      await expect(db.insert(schema.semanticReviewPolicyBrands).values({ policyId: policy.id, workspaceId: a.workspaceId, clientProfileId: b.brandIds[0] }))
        .rejects.toThrow();
    });
  });

  describe("query plan", () => {
    it("pages a workspace by (updated_at, id) without scanning the whole table at synthetic volume", async () => {
      const target = await scope();
      const filler = await scope();
      const rows = (owner: Scope, n: number) => Array.from({ length: n }, (_, i) => workRow(owner, { updatedAt: minutes(T0, i) }));
      for (let i = 0; i < 6; i += 1) await db.insert(schema.creativeWorkItems).values(rows(filler, 1000).map((r) => ({ ...r, inputSnapshot: null, copy: null, brief: null })));
      await db.insert(schema.creativeWorkItems).values(rows(target, 500).map((r) => ({ ...r, inputSnapshot: null, copy: null, brief: null })));
      await pool.query("analyze adscale_app.creative_work_items");
      const { rows: plan } = await pool.query(
        `explain (format json) select id, workspace_id, client_profile_id, tool_kind, status, training_session_id, training_round, training_slot,
           request, brief, settings, input_snapshot, copy, format, updated_at, updated_at::text as cursor_timestamp
         from adscale_app.creative_work_items
         where workspace_id = $1 and updated_at >= $2::timestamp and updated_at <= $3::timestamp and (updated_at, id) > ($4::timestamp, $5::uuid)
         order by updated_at, id limit 25`,
        [target.workspaceId, T0.toISOString(), minutes(T0, 600).toISOString(), minutes(T0, 10).toISOString(), "00000000-0000-0000-0000-000000000000"],
      );
      const text = JSON.stringify(plan[0]["QUERY PLAN"]);
      process.stdout.write(`[#468 query plan] ${text}\n`);
      expect(text).not.toContain('"Node Type":"Seq Scan"');
    });
  });
});
