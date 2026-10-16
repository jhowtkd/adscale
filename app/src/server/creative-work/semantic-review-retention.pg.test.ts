/**
 * #470 — Jev closure and retention, behavioural, against real Postgres.
 *
 * Public entries under test: repository.expireObservations / cleanObservations /
 * cleanQuotaDays (semantic-review-repository.ts), plus the #469 processor as the
 * concurrent actor. HTTP is always a controlled `fetchImpl`; global fetch is a
 * sentinel that must never run. Every row is synthetic.
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/server/creative-work/semantic-review-retention.pg.test.ts
 *
 * Absent TEST_DATABASE_URL skips the suite — a skip is NOT evidence. Shares the
 * #468 advisory lock + isolated future clock (claimHermeticClock).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { SEMANTIC_REVIEW_VERSIONS, createSemanticReviewRepository } from "./semantic-review-repository";
import { collectSemanticReview } from "./semantic-review-collector";
import { processSemanticReviewObservation } from "./semantic-review-processor";
import { SEMANTIC_MODEL, SEMANTIC_OPTIONS, SEMANTIC_QUESTIONS } from "./semantic-review-offline";
import {
  DAY_MS, T0, assertSafeTestDatabaseUrl, claimHermeticClock, createScope, deleteScopes, insertWorks, minutes,
  openTestDatabase, policyInput, workSnapshot, type Scope, type TestDb,
} from "./semantic-review-collection.pg-helpers";

const URL_UNDER_TEST = process.env.TEST_DATABASE_URL;
const versions = SEMANTIC_REVIEW_VERSIONS as unknown as Record<string, string>;
const CREDENTIAL = "controlled-credential-470";

type Row = Record<string, unknown>;
type Overrides = Record<string, unknown>;
type Retention = {
  expireObservations(input: Row): Promise<Row>;
  cleanObservations(input: Row): Promise<Row>;
  cleanQuotaDays(input: Row): Promise<Row>;
};

function jevBody() {
  return {
    model: SEMANTIC_MODEL,
    answers: Object.fromEntries(SEMANTIC_QUESTIONS.map((question) => {
      const options = SEMANTIC_OPTIONS[question] as readonly string[];
      return [question, { type: "choice", choice: options[0], confidence: 0.9,
        probabilities: Object.fromEntries(options.map((option, index) => [option, index === 0 ? 1 : 0])) }];
    })),
    usage: { input_tokens: 120, output_tokens: 6 },
  };
}
function controlledFetch(during?: () => Promise<void> | void) {
  return vi.fn(async () => { await during?.(); return new Response(JSON.stringify(jevBody()), { status: 200 }); }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe.skipIf(!URL_UNDER_TEST)("semantic review closure and retention (PostgreSQL)", () => {
  let db: TestDb;
  let pool: Pool;
  let releaseClock: () => Promise<void>;
  let repository: ReturnType<typeof createSemanticReviewRepository>;
  let retention: Retention;
  const scopes: Scope[] = [];
  const globalFetch = vi.fn(() => { throw new Error("global_fetch_forbidden"); });

  /** Processor clock; collection happens at T0+5m. */
  const PROC = () => minutes(T0, 10);
  /** Expiry sweeps run an hour in: every pending queue of the seed is still inside its own 24h unless patched. */
  const EXP = () => minutes(T0, 60);
  /** Cleanup far past the 14-day window: seeded policies are expired without revocation. */
  const CLEAN = () => new Date(T0.getTime() + 45 * DAY_MS);
  const cutoffOf = (now: Date) => new Date(now.getTime() - 30 * DAY_MS);

  async function scope() {
    const created = await createScope(db, 1);
    scopes.push(created);
    return created;
  }
  const obsTable = schema.semanticReviewObservations;
  const rows = async (s: Scope) => (await db.select().from(obsTable).where(eq(obsTable.workspaceId, s.workspaceId))) as unknown as Row[];
  const row = async (id: string) => ((await db.select().from(obsTable).where(eq(obsTable.id, id))) as unknown as Row[])[0];
  const exists = async (id: string) => Boolean(await row(id));
  const attempts = async (s: Scope) => (await db.select().from(schema.semanticReviewQuotaDays)
    .where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId))).reduce((sum, item) => sum + item.attempts, 0);
  const markers = async (s: Scope) => (await rows(s)).filter((item) => item.sendStartedAt !== null).length;
  const patch = (id: string, values: Row) => db.update(obsTable).set(values as never).where(eq(obsTable.id, id));

  /** Enabled synthetic policy + `count` works + real collection → real queued observations. */
  async function seed(s: Scope, count = 1, policyOverrides: Overrides = {}) {
    const policy = await repository.registerPolicy(policyInput(s, versions, policyOverrides) as never, T0);
    await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
    const workIds = await insertWorks(db, s, count, { updatedAt: minutes(T0, 1) });
    for (let i = 0; i < 10 && (await rows(s)).length < count; i += 1) {
      await collectSemanticReview({ repository, enabled: true, now: minutes(T0, 5 + i) });
    }
    const observations = await rows(s);
    expect(observations).toHaveLength(count);
    return { policy, workIds, observationIds: observations.map((item) => item.id as string) };
  }
  /** Fabricates distinct observations of the same Trabalho/policy (identity differs by semanticHash). */
  async function fab(s: Scope, base: string, values: Row, count = 1) {
    const template = await row(base);
    const ids: string[] = [];
    for (let start = 0; start < count; start += 50) {
      const batch = Array.from({ length: Math.min(50, count - start) }, () => ({
        ...template, id: randomUUID(), semanticHash: randomBytes(32).toString("hex"), ...values }));
      await db.insert(obsTable).values(batch as never);
      ids.push(...batch.map((item) => item.id as string));
    }
    expect(ids.length).toBe(count);
    void s;
    return ids;
  }
  const closeWindow = (s: Scope, policyId: string) => repository.revokePolicy({ workspaceId: s.workspaceId, policyId }, minutes(T0, 6));
  const expire = (s: Scope, extra: Row = {}) => retention.expireObservations({ workspaceId: s.workspaceId, now: EXP(), ...extra });
  const clean = (s: Scope, extra: Row = {}) => retention.cleanObservations({ workspaceId: s.workspaceId, now: CLEAN(), ...extra });
  const run = (s: Scope, overrides: Row = {}) => processSemanticReviewObservation({
    repository, workspaceId: s.workspaceId, enabled: true, credential: CREDENTIAL, fetchImpl: controlledFetch(),
    clock: PROC, ...overrides } as never) as Promise<Row>;
  const withTimeout = <T,>(promise: Promise<T>, ms = 4_000) => Promise.race([promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("blocked_beyond_bound")), ms))]);
  async function lockRows(statements: Array<[string, unknown[]]>) {
    const client = await pool.connect();
    await client.query("begin");
    for (const [statement, params] of statements) await client.query(statement, params);
    return async () => { try { await client.query("rollback"); } finally { client.release(); } };
  }
  const snapshot = async (s: Scope) => JSON.stringify((await rows(s)).sort((a, b) => String(a.id).localeCompare(String(b.id))));

  beforeAll(async () => {
    ({ db, pool } = await openTestDatabase(assertSafeTestDatabaseUrl(URL_UNDER_TEST)));
    releaseClock = await claimHermeticClock(pool);
    repository = createSemanticReviewRepository(db);
    retention = repository as unknown as Retention;
  }, 120_000);
  beforeEach(() => {
    globalFetch.mockClear();
    vi.stubGlobal("fetch", globalFetch);
    vi.stubEnv("TYPESAFE_API_KEY", "");
    vi.stubEnv("JEV_OBSERVER_ENABLED", "");
  });
  afterEach(async () => {
    if (scopes.length) {
      await db.delete(schema.semanticReviewPolicies)
        .where(inArray(schema.semanticReviewPolicies.workspaceId, scopes.map((s) => s.workspaceId)));
    }
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    expect(globalFetch).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    if (!db) return;
    try { await deleteScopes(db, scopes); } finally { await releaseClock?.(); await pool.end(); }
  });

  describe("expireObservations", () => {
    it("expires queued observations at expiresAt<=now without HTTP; one millisecond earlier is kept", async () => {
      const s = await scope();
      const { observationIds: [base] } = await seed(s);
      const [due] = await fab(s, base, { expiresAt: EXP() });
      const [later] = await fab(s, base, { expiresAt: new Date(EXP().getTime() + 1) });
      await patch(base, { expiresAt: new Date(EXP().getTime() + DAY_MS) });
      const result = await expire(s);
      expect(result).toMatchObject({ workspaceId: s.workspaceId, expired: 1, recovered: 0, outcomeUnknown: 0 });
      expect(result.examined as number).toBeGreaterThanOrEqual(1);
      expect(await row(due)).toMatchObject({ state: "skipped", errorCode: "queue_expired", currentAtCompletion: false,
        sendStartedAt: null, ownerToken: null, leaseExpiresAt: null });
      expect((await row(due)).finishedAt).toBeInstanceOf(Date);
      expect(await row(later)).toMatchObject({ state: "queued", errorCode: null, finishedAt: null });
      expect(await row(base)).toMatchObject({ state: "queued" });
      expect(await attempts(s)).toBe(0);
      expect(await expire(s)).toMatchObject({ expired: 0, recovered: 0, outcomeUnknown: 0 });
    });

    it.each(["disabled", "revoked", "expired"] as const)("reaches queues and unknown sends of a %s policy", async (how) => {
      const s = await scope();
      const { observationIds: [base], policy } = await seed(s);
      const [stale, unknown] = await fab(s, base, { expiresAt: minutes(EXP(), -1) }, 2);
      await patch(unknown, { state: "running", ownerToken: randomUUID(), sendStartedAt: minutes(EXP(), -5), leaseExpiresAt: minutes(EXP(), -1), expiresAt: minutes(EXP(), 600) });
      let now = EXP();
      if (how === "disabled") await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: false }, minutes(T0, 8));
      if (how === "revoked") await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 8));
      if (how === "expired") now = new Date(T0.getTime() + 15 * DAY_MS);
      await patch(stale, { expiresAt: minutes(now, -1) });
      await patch(unknown, { leaseExpiresAt: minutes(now, -1), expiresAt: minutes(now, 600) });
      await patch(base, { expiresAt: minutes(now, 600) });
      expect(await retention.expireObservations({ workspaceId: s.workspaceId, now })).toMatchObject({ expired: 1, recovered: 0, outcomeUnknown: 1 });
      expect(await row(stale)).toMatchObject({ state: "skipped", errorCode: "queue_expired" });
      expect(await row(unknown)).toMatchObject({ state: "outcome_unknown", errorCode: "lease_expired_after_send", currentAtCompletion: false, leaseExpiresAt: null });
      expect(await row(base)).toMatchObject({ state: "queued" });
    });

    it("lease expired WITHOUT marker: back to the queue (owner/lease null) unless overdue; the recovered one is then sent exactly once", async () => {
      const s = await scope();
      const { observationIds: [fresh, overdue] } = await seed(s, 2);
      for (const id of [fresh, overdue]) await patch(id, { state: "running", ownerToken: randomUUID(), leaseExpiresAt: minutes(EXP(), -1), sendStartedAt: null });
      await patch(fresh, { expiresAt: minutes(EXP(), 600) });
      await patch(overdue, { expiresAt: EXP() });
      expect(await expire(s)).toMatchObject({ expired: 1, recovered: 1, outcomeUnknown: 0 });
      expect(await row(fresh)).toMatchObject({ state: "queued", ownerToken: null, leaseExpiresAt: null, sendStartedAt: null, finishedAt: null });
      expect(await row(overdue)).toMatchObject({ state: "skipped", errorCode: "queue_expired", ownerToken: null, leaseExpiresAt: null });
      const fetchImpl = controlledFetch();
      expect(await run(s, { observationId: fresh, fetchImpl })).toMatchObject({ status: "completed", sent: true });
      expect(await run(s, { observationId: fresh, fetchImpl })).toMatchObject({ status: "no_observation" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await attempts(s)).toBe(1);
    });

    it("never touches an active lease (even past expiresAt) nor terminal rows; unknown recovery is idempotent", async () => {
      const s = await scope();
      const { observationIds: [base] } = await seed(s);
      const live = await fab(s, base, { state: "running", ownerToken: randomUUID(), leaseExpiresAt: minutes(EXP(), 1), expiresAt: minutes(EXP(), -30) }, 2);
      await patch(live[1], { sendStartedAt: minutes(EXP(), -1) });
      const terminal = [];
      for (const state of ["completed", "failed", "skipped", "outcome_unknown"]) terminal.push(...await fab(s, base, { state, expiresAt: minutes(EXP(), -30), finishedAt: minutes(EXP(), -20) }));
      await patch(base, { expiresAt: minutes(EXP(), 600) });
      const before = await snapshot(s);
      expect(await expire(s)).toMatchObject({ expired: 0, recovered: 0, outcomeUnknown: 0 });
      expect(await snapshot(s)).toBe(before);
      const [unknown] = await fab(s, base, { state: "running", ownerToken: randomUUID(), sendStartedAt: minutes(EXP(), -5), leaseExpiresAt: minutes(EXP(), -1), expiresAt: minutes(EXP(), 600) });
      expect(await expire(s)).toMatchObject({ outcomeUnknown: 1 });
      const afterFirst = await row(unknown);
      expect(await expire(s)).toMatchObject({ expired: 0, recovered: 0, outcomeUnknown: 0 });
      expect(await row(unknown)).toEqual(afterFirst);
      expect(terminal).toHaveLength(4);
    });

    it("revalidates the clock after taking locks: a later clock() decides expiry and lease", async () => {
      const s = await scope();
      const { observationIds: [base] } = await seed(s);
      const [queued] = await fab(s, base, { expiresAt: minutes(EXP(), 1) });
      const [marked] = await fab(s, base, { state: "running", ownerToken: randomUUID(), sendStartedAt: minutes(EXP(), -1), leaseExpiresAt: minutes(EXP(), 1), expiresAt: minutes(EXP(), 600) });
      await patch(base, { expiresAt: minutes(EXP(), 600) });
      const clock = vi.fn(() => minutes(EXP(), 2));
      expect(await expire(s, { clock })).toMatchObject({ expired: 1, outcomeUnknown: 1 });
      expect(clock).toHaveBeenCalled();
      expect(await row(queued)).toMatchObject({ state: "skipped", finishedAt: minutes(EXP(), 2) });
      expect(await row(marked)).toMatchObject({ state: "outcome_unknown" });
      await expect(expire(s, { clock: () => new Date(Number.NaN) })).rejects.toThrow();
    });

    it("takes SKIP LOCKED locks on observations only: locked rows are skipped, Trabalho/policy locks never block", async () => {
      const s = await scope();
      const { observationIds: [base], workIds, policy } = await seed(s);
      const [free, held] = await fab(s, base, { expiresAt: minutes(EXP(), -1) }, 2);
      await patch(base, { expiresAt: minutes(EXP(), 600) });
      const unlock = await lockRows([
        ["select 1 from adscale_app.semantic_review_observations where id = $1 for update", [held]],
        ["select 1 from adscale_app.creative_work_items where id = $1 for update", [workIds[0]]],
        ["select 1 from adscale_app.semantic_review_policies where id = $1 for update", [policy.id]],
        ["select 1 from adscale_app.workspaces where id = $1 for update", [s.workspaceId]],
      ]);
      try {
        expect(await withTimeout(expire(s))).toMatchObject({ expired: 1 });
      } finally { await unlock(); }
      expect(await row(free)).toMatchObject({ state: "skipped" });
      expect(await row(held)).toMatchObject({ state: "queued", finishedAt: null });
      expect(await expire(s)).toMatchObject({ expired: 1 });
      expect(await row(held)).toMatchObject({ state: "skipped" });
    });

    it("pages at 100 by default, honours a smaller limit, drains in pages and rejects invalid limits", async () => {
      const s = await scope();
      const { observationIds: [base] } = await seed(s);
      await fab(s, base, { expiresAt: minutes(EXP(), -1) }, 150);
      await patch(base, { expiresAt: minutes(EXP(), 600) });
      expect(await expire(s, { limit: 10 })).toMatchObject({ expired: 10 });
      expect(await expire(s)).toMatchObject({ expired: 100 });
      expect(await expire(s, { limit: 100 })).toMatchObject({ expired: 40 });
      expect(await expire(s)).toMatchObject({ examined: 0, expired: 0 });
      for (const limit of [0, 101, -1, 1.5, Number.NaN]) await expect(expire(s, { limit })).rejects.toThrow();
      expect((await rows(s)).filter((item) => item.state === "skipped")).toHaveLength(150);
    });

    it("is scoped by workspace and validates it before touching the database", async () => {
      const a = await scope();
      const b = await scope();
      const { observationIds: [baseA] } = await seed(a);
      const { observationIds: [baseB] } = await seed(b);
      await fab(a, baseA, { expiresAt: minutes(EXP(), -1) }, 2);
      const [otherDue] = await fab(b, baseB, { expiresAt: minutes(EXP(), -1) });
      const before = await snapshot(b);
      expect(await expire(a)).toMatchObject({ workspaceId: a.workspaceId, expired: 2 });
      expect(await snapshot(b)).toBe(before);
      expect(await row(otherDue)).toMatchObject({ state: "queued" });
      for (const workspaceId of ["not-a-uuid", "", undefined]) await expect(retention.expireObservations({ workspaceId, now: EXP() })).rejects.toThrow();
    });

    it("changes only observations: Trabalho, policy, quota and billing are preserved", async () => {
      const s = await scope();
      const { observationIds: [base], workIds, policy } = await seed(s);
      await fab(s, base, { expiresAt: minutes(EXP(), -1) });
      await db.insert(schema.semanticReviewQuotaDays).values({ workspaceId: s.workspaceId, dayUtc: "2026-01-01", attempts: 3 });
      await db.insert(schema.creditTransactions).values({ userId: s.userId, workspaceId: s.workspaceId, amount: -1, type: "synthetic" });
      const world = async () => JSON.stringify([await workSnapshot(db, workIds[0]),
        await db.select().from(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.id, policy.id)),
        await db.select().from(schema.semanticReviewQuotaDays).where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId)),
        await db.select().from(schema.creditTransactions).where(eq(schema.creditTransactions.workspaceId, s.workspaceId)),
        await db.select().from(schema.clientProfiles).where(eq(schema.clientProfiles.id, s.brandIds[0]))]);
      const before = await world();
      expect(await expire(s)).toMatchObject({ expired: 1 });
      expect(await world()).toBe(before);
    });
  });

  describe("closure with the processor", () => {
    it("revocation during an in-flight send: it may finish, nothing else gets a marker, unknowns are recovered and never resent", async () => {
      const s = await scope();
      const { observationIds: [first, ...others], policy } = await seed(s, 4);
      for (const id of others) await patch(id, { expiresAt: minutes(EXP(), 600) });
      const [stale] = await fab(s, first, { state: "running", ownerToken: randomUUID(), sendStartedAt: minutes(PROC(), -5), leaseExpiresAt: minutes(PROC(), -1), expiresAt: minutes(EXP(), 600) });
      const started = deferred();
      const gate = deferred();
      const fetchImpl = controlledFetch(async () => { started.release(); await gate.promise; });
      const inFlight = run(s, { observationId: first, fetchImpl });
      await started.promise;
      expect(await markers(s)).toBe(2); // the in-flight marker + the fabricated unknown
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 9));
      // After revocation: repeated sweeps, by id and without, must not reserve or send anything.
      for (let i = 0; i < 4; i += 1) {
        expect(await run(s, { fetchImpl })).toMatchObject({ sent: false });
      }
      // An explicit id on a revoked policy is terminal-skipped, still without reserving or sending.
      expect(await run(s, { observationId: first, fetchImpl })).toMatchObject({ sent: false });
      expect(await markers(s)).toBe(2);
      expect(await attempts(s)).toBe(1);
      gate.release();
      expect(await inFlight).toMatchObject({ status: "completed", sent: true });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await row(first)).toMatchObject({ state: "completed" });
      // Recovery: the unknown becomes outcome_unknown (by an id-less sweep or by expire, whoever got there first) and is never resent.
      const recovered = await expire(s);
      expect(recovered.outcomeUnknown as number).toBeLessThanOrEqual(1);
      expect(await run(s, { observationId: stale, fetchImpl })).toMatchObject({ sent: false });
      expect(await row(stale)).toMatchObject({ state: "outcome_unknown", errorCode: "lease_expired_after_send" });
      expect(await markers(s)).toBe(2);
      expect(await attempts(s)).toBe(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      // Pending leftovers expire only explicitly, long after.
      expect(await retention.expireObservations({ workspaceId: s.workspaceId, now: minutes(EXP(), 700) })).toMatchObject({ expired: 3 });
      for (const id of others) expect(await row(id)).toMatchObject({ state: "skipped", errorCode: "queue_expired", sendStartedAt: null });
    });

    it("an in-flight lease survives a concurrent expiry sweep, and completes", async () => {
      const s = await scope();
      const { observationIds: [only] } = await seed(s);
      const started = deferred();
      const gate = deferred();
      const fetchImpl = controlledFetch(async () => { started.release(); await gate.promise; });
      const inFlight = run(s, { fetchImpl });
      await started.promise;
      // Same instant as the processor: the lease (60s) is active, the observation is not overdue.
      expect(await retention.expireObservations({ workspaceId: s.workspaceId, now: PROC() })).toMatchObject({ expired: 0, recovered: 0, outcomeUnknown: 0 });
      // Even if the sweep is overdue for the observation, an active lease is untouched.
      await patch(only, { expiresAt: PROC() });
      expect(await retention.expireObservations({ workspaceId: s.workspaceId, now: PROC() })).toMatchObject({ expired: 0 });
      expect(await row(only)).toMatchObject({ state: "running" });
      gate.release();
      expect(await inFlight).toMatchObject({ sent: true });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("racing expire against processors never double-sends and every observation reaches one terminal outcome", async () => {
      const s = await scope();
      await seed(s, 6);
      const fetchImpl = controlledFetch();
      const sweeps = Array.from({ length: 6 }, () => run(s, { fetchImpl }));
      const expiries = Array.from({ length: 3 }, () => retention.expireObservations({ workspaceId: s.workspaceId, now: PROC() }));
      await Promise.all([...sweeps, ...expiries]);
      expect(fetchImpl.mock.calls.length).toBe((await rows(s)).filter((item) => item.sendStartedAt !== null).length);
      expect(fetchImpl.mock.calls.length).toBe(await attempts(s));
      expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(6);
      for (const item of await rows(s)) expect(["queued", "completed"]).toContain(item.state);
    });
  });

  describe("renewal and reactivation", () => {
    it("a renewed policy never re-sends a terminal observation of the same identity (touched Trabalho, same hash)", async () => {
      const s = await scope();
      const { observationIds: [id], policy, workIds } = await seed(s);
      const fetchImpl = controlledFetch();
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "completed", sent: true });
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 20));
      const renewed = await repository.registerPolicy(policyInput(s, versions, { authorizedAt: minutes(T0, 30), expiresAt: minutes(T0, 30 + 60) }) as never, minutes(T0, 30));
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: renewed.id, enabled: true }, minutes(T0, 30));
      await db.update(schema.creativeWorkItems).set({ updatedAt: minutes(T0, 31) }).where(eq(schema.creativeWorkItems.id, workIds[0]));
      let created = 0;
      for (let i = 0; i < 4; i += 1) {
        const summary = await collectSemanticReview({ repository, enabled: true, now: minutes(T0, 35 + i) }) as unknown as Row;
        created += (summary.unique as number | undefined) ?? 0;
      }
      expect(created).toBe(0);
      expect(await rows(s)).toHaveLength(1);
      expect(await run(s, { fetchImpl, clock: () => minutes(T0, 40) })).toMatchObject({ status: "no_observation", sent: false });
      expect(await run(s, { fetchImpl, observationId: id, clock: () => minutes(T0, 40) })).toMatchObject({ status: "no_observation", sent: false });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await attempts(s)).toBe(1);
    });

    it("an expired policy cannot be reactivated, and a new authorization cannot exceed 14 days", async () => {
      const s = await scope();
      const { policy } = await seed(s);
      const after = new Date(T0.getTime() + 14 * DAY_MS + 1);
      await expect(repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, after)).rejects.toThrow("policy_not_valid");
      await expect(repository.registerPolicy(policyInput(s, versions, { expiresAt: new Date(T0.getTime() + 14 * DAY_MS + 1) }) as never, T0)).rejects.toThrow("invalid_policy");
    });
  });

  describe("cleanObservations", () => {
    it("is dry-run by default, reports exactly what apply removes, and never touches pending, active-lease or fresh rows", async () => {
      const s = await scope();
      const { observationIds: [base] } = await seed(s);
      const now = CLEAN();
      const old = new Date(now.getTime() - 31 * DAY_MS);
      const eligible: string[] = [];
      for (const state of ["completed", "failed", "skipped", "outcome_unknown"]) eligible.push(...await fab(s, base, { state, createdAt: old, finishedAt: old }));
      const keep = [
        ...await fab(s, base, { state: "completed", createdAt: cutoffOf(now), finishedAt: old }),           // exactly at the cutoff
        ...await fab(s, base, { state: "completed", createdAt: new Date(now.getTime() - 29 * DAY_MS) }),   // fresh
        ...await fab(s, base, { state: "queued", createdAt: old, expiresAt: minutes(old, 60 * 24) }),      // pending, overdue, never implicit
        ...await fab(s, base, { state: "running", createdAt: old, ownerToken: randomUUID(), sendStartedAt: old, leaseExpiresAt: minutes(now, -1) }), // expired lease w/ marker, still pending
        ...await fab(s, base, { state: "running", createdAt: old, ownerToken: randomUUID(), leaseExpiresAt: minutes(now, 1) }), // active lease
        ...await fab(s, base, { state: "completed", createdAt: old, leaseExpiresAt: minutes(now, 1) }),    // terminal but a lease is still active
      ];
      await patch(base, { createdAt: old });
      await patch(base, { state: "queued" });
      keep.push(base);
      await closeWindow(s, (await repository.listObservations({ workspaceId: s.workspaceId })).find((item) => item.id === base)!.policyId);
      const before = await snapshot(s);

      const dry = await clean(s);
      expect(dry).toMatchObject({ workspaceId: s.workspaceId, status: "ready", mode: "dry_run", deleted: 0, cutoff: cutoffOf(now).toISOString() });
      expect([...(dry.observationIds as string[])].sort()).toEqual([...eligible].sort());
      expect(dry.eligible as number).toBeGreaterThanOrEqual(eligible.length);
      expect(await snapshot(s)).toBe(before);
      expect(await clean(s, { apply: false })).toEqual(dry);
      expect(await snapshot(s)).toBe(before);

      const applied = await clean(s, { apply: true });
      expect(applied).toMatchObject({ status: "ready", mode: "apply", deleted: eligible.length, cutoff: dry.cutoff });
      expect([...(applied.observationIds as string[])].sort()).toEqual([...eligible].sort());
      for (const id of eligible) expect(await exists(id)).toBe(false);
      for (const id of keep) expect(await exists(id)).toBe(true);
      expect(await clean(s, { apply: true })).toMatchObject({ status: "ready", deleted: 0, observationIds: [] });
    });

    it("blocks (safe result, no exception, no deletion) while any enabled or still-valid, unrevoked policy exists", async () => {
      const s = await scope();
      const { observationIds: [base], policy } = await seed(s);
      const now = minutes(T0, 60);
      const old = new Date(now.getTime() - 31 * DAY_MS);
      const [terminal] = await fab(s, base, { state: "completed", createdAt: old, finishedAt: old });
      const before = await snapshot(s);
      const expectBlocked = async () => {
        const dry = await retention.cleanObservations({ workspaceId: s.workspaceId, now });
        const applied = await retention.cleanObservations({ workspaceId: s.workspaceId, now, apply: true });
        expect(dry).toMatchObject({ status: "blocked_active_pilot_window", mode: "dry_run", eligible: 0, deleted: 0, observationIds: [] });
        expect(applied).toMatchObject({ status: "blocked_active_pilot_window", mode: "apply", eligible: 0, deleted: 0, observationIds: [] });
        expect(await snapshot(s)).toBe(before);
        expect(await exists(terminal)).toBe(true);
      };
      await expectBlocked();                                  // enabled
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: false }, minutes(T0, 8));
      await expectBlocked();                                  // disabled but valid
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 9));
      expect(await retention.cleanObservations({ workspaceId: s.workspaceId, now })).toMatchObject({ status: "ready", observationIds: [terminal] });
      // Boundary: a valid unrevoked policy blocks until exactly its expiresAt.
      const s2 = await scope();
      const seeded = await seed(s2);
      const [t2] = await fab(s2, seeded.observationIds[0], { state: "failed", createdAt: old });
      await repository.setPolicyEnabled({ workspaceId: s2.workspaceId, policyId: seeded.policy.id, enabled: false }, minutes(T0, 8));
      const expiresAt = new Date(T0.getTime() + 14 * DAY_MS);
      expect(await retention.cleanObservations({ workspaceId: s2.workspaceId, now: new Date(expiresAt.getTime() - 1) })).toMatchObject({ status: "blocked_active_pilot_window" });
      expect(await retention.cleanObservations({ workspaceId: s2.workspaceId, now: expiresAt, apply: false })).toMatchObject({ status: "ready" });
      expect(await exists(t2)).toBe(true);
    });

    it("blocked window: an old terminal observation survives, a touched Trabalho (same hash) is deduplicated and nothing is resent", async () => {
      const s = await scope();
      const { observationIds: [id], workIds } = await seed(s);
      const fetchImpl = controlledFetch();
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "completed" });
      const now = minutes(T0, 60);
      await patch(id, { createdAt: new Date(now.getTime() - 31 * DAY_MS) });
      expect(await retention.cleanObservations({ workspaceId: s.workspaceId, now, apply: true })).toMatchObject({ status: "blocked_active_pilot_window", deleted: 0 });
      await db.update(schema.creativeWorkItems).set({ updatedAt: minutes(T0, 61) }).where(eq(schema.creativeWorkItems.id, workIds[0]));
      let created = 0;
      for (let i = 0; i < 4; i += 1) created += (await collectSemanticReview({ repository, enabled: true, now: minutes(T0, 62 + i) }) as unknown as Row).unique as number;
      expect(created).toBe(0);
      expect(await rows(s)).toHaveLength(1);
      expect(await run(s, { fetchImpl, clock: () => minutes(T0, 70) })).toMatchObject({ status: "no_observation", sent: false });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await attempts(s)).toBe(1);
    });

    it("pages at 100 by default and drains with repeated applications; invalid limits are rejected", async () => {
      const s = await scope();
      const { observationIds: [base], policy } = await seed(s);
      const old = new Date(CLEAN().getTime() - 31 * DAY_MS);
      await closeWindow(s, policy.id);
      await patch(base, { state: "completed", createdAt: old });
      await fab(s, base, { state: "completed", createdAt: old, finishedAt: old }, 149);
      const dry = await clean(s);
      expect((dry.observationIds as string[]).length).toBe(100);
      expect(await clean(s, { limit: 7, apply: true })).toMatchObject({ deleted: 7 });
      expect(await clean(s, { apply: true })).toMatchObject({ deleted: 100 });
      expect(await clean(s, { limit: 100, apply: true })).toMatchObject({ deleted: 43 });
      expect(await clean(s, { apply: true })).toMatchObject({ deleted: 0, observationIds: [] });
      expect(await rows(s)).toHaveLength(0);
      for (const limit of [0, 101, -1, 1.5, Number.NaN]) await expect(clean(s, { limit })).rejects.toThrow();
      for (const workspaceId of ["not-a-uuid", "", undefined]) await expect(retention.cleanObservations({ workspaceId, now: CLEAN() })).rejects.toThrow();
    });

    it("pending states are only cleaned after an explicit expiry", async () => {
      const s = await scope();
      const { observationIds: [base], policy } = await seed(s);
      const now = CLEAN();
      const old = new Date(now.getTime() - 40 * DAY_MS);
      await closeWindow(s, policy.id);
      await patch(base, { createdAt: old, expiresAt: minutes(old, 60 * 24) });
      const [lease] = await fab(s, base, { state: "running", createdAt: old, ownerToken: randomUUID(), leaseExpiresAt: minutes(now, -1), expiresAt: minutes(old, 60 * 24) });
      expect(await clean(s, { apply: true })).toMatchObject({ status: "ready", deleted: 0, observationIds: [] });
      expect(await rows(s)).toHaveLength(2);
      expect(await retention.expireObservations({ workspaceId: s.workspaceId, now })).toMatchObject({ expired: 2 });
      expect(await row(lease)).toMatchObject({ state: "skipped", errorCode: "queue_expired" });
      expect(await clean(s, { apply: true })).toMatchObject({ deleted: 2 });
      expect(await rows(s)).toHaveLength(0);
    });

    it("is isolated by workspace: a blocked or unrelated workspace never affects (or is affected by) another", async () => {
      const a = await scope();
      const b = await scope();
      const seededA = await seed(a);
      const seededB = await seed(b);
      const old = new Date(CLEAN().getTime() - 31 * DAY_MS);
      await closeWindow(a, seededA.policy.id);
      const [oldA] = await fab(a, seededA.observationIds[0], { state: "completed", createdAt: old });
      const [oldB] = await fab(b, seededB.observationIds[0], { state: "completed", createdAt: old });
      const beforeB = await snapshot(b);
      expect(await clean(a, { apply: true })).toMatchObject({ status: "ready", deleted: 1, observationIds: [oldA] });
      expect(await snapshot(b)).toBe(beforeB);
      expect(await clean(b, { apply: true })).toMatchObject({ status: "blocked_active_pilot_window" });
      expect(await exists(oldB)).toBe(true);
      expect(await retention.cleanObservations({ workspaceId: randomUUID(), now: CLEAN(), apply: true })).toMatchObject({ deleted: 0, observationIds: [] });
    });

    it("preserves Trabalho, brand, policy, quota, billing; cascades from Trabalho/workspace deletion stay coherent", async () => {
      const s = await scope();
      const { observationIds: [base], workIds, policy } = await seed(s);
      const now = CLEAN();
      const old = new Date(now.getTime() - 31 * DAY_MS);
      await closeWindow(s, policy.id);
      const [victim] = await fab(s, base, { state: "completed", createdAt: old });
      await db.insert(schema.semanticReviewQuotaDays).values({ workspaceId: s.workspaceId, dayUtc: "2026-01-01", attempts: 3 });
      await db.insert(schema.creditTransactions).values({ userId: s.userId, workspaceId: s.workspaceId, amount: -1, type: "synthetic" });
      const world = async () => JSON.stringify([await workSnapshot(db, workIds[0]),
        await db.select().from(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.id, policy.id)),
        await db.select().from(schema.semanticReviewPolicyBrands).where(eq(schema.semanticReviewPolicyBrands.policyId, policy.id)),
        await db.select().from(schema.semanticReviewQuotaDays).where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId)),
        await db.select().from(schema.creditTransactions).where(eq(schema.creditTransactions.workspaceId, s.workspaceId)),
        await db.select().from(schema.clientProfiles).where(eq(schema.clientProfiles.id, s.brandIds[0]))]);
      const before = await world();
      expect(await clean(s, { apply: true })).toMatchObject({ deleted: 1, observationIds: [victim] });
      expect(await world()).toBe(before);
      // Referential deletion still cascades the rest of the observations.
      expect(await exists(base)).toBe(true);
      await db.delete(schema.creativeWorkItems).where(and(eq(schema.creativeWorkItems.id, workIds[0]), eq(schema.creativeWorkItems.workspaceId, s.workspaceId)));
      expect(await rows(s)).toHaveLength(0);
      const t = await scope();
      const seededT = await seed(t);
      await fab(t, seededT.observationIds[0], { state: "completed" }, 3);
      await db.delete(schema.workspaces).where(eq(schema.workspaces.id, t.workspaceId));
      expect(await rows(t)).toHaveLength(0);
    });

    it("races: applying twice concurrently deletes each row once; an in-flight send keeps its row and finishes", async () => {
      const s = await scope();
      const { observationIds: [first], policy } = await seed(s);
      const now = minutes(T0, 10).getTime() + 30_000; // inside the 60s lease of the in-flight processor
      const cleanNow = new Date(now);
      const old = new Date(cleanNow.getTime() - 31 * DAY_MS);
      const stale = await fab(s, first, { state: "completed", createdAt: old, finishedAt: old }, 120);
      await patch(first, { createdAt: old });
      const started = deferred();
      const gate = deferred();
      const fetchImpl = controlledFetch(async () => { started.release(); await gate.promise; });
      const inFlight = run(s, { observationId: first, fetchImpl });
      await started.promise;
      await closeWindow(s, policy.id);
      const results = await Promise.all([1, 2].map(() => retention.cleanObservations({ workspaceId: s.workspaceId, now: cleanNow, apply: true, limit: 100 })));
      const deletedIds = results.flatMap((item) => item.observationIds as string[]);
      expect(new Set(deletedIds).size).toBe(deletedIds.length);
      expect(results.reduce((sum, item) => sum + (item.deleted as number), 0)).toBe(deletedIds.length);
      expect(await row(first)).toMatchObject({ state: "running" });
      gate.release();
      expect(await inFlight).toMatchObject({ status: "completed", sent: true });
      // Drain the rest; the now-terminal first row is eligible too.
      let total = deletedIds.length;
      for (let i = 0; i < 3; i += 1) total += (await retention.cleanObservations({ workspaceId: s.workspaceId, now: new Date(now + 120_000), apply: true }) as Row).deleted as number;
      expect(total).toBe(stale.length + 1);
      expect(await rows(s)).toHaveLength(0);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("SKIP LOCKED: a row locked elsewhere is neither waited for nor deleted; Trabalho/policy locks never block", async () => {
      const s = await scope();
      const { observationIds: [base], workIds, policy } = await seed(s);
      const old = new Date(CLEAN().getTime() - 31 * DAY_MS);
      await closeWindow(s, policy.id);
      const [free, held] = await fab(s, base, { state: "completed", createdAt: old }, 2);
      await patch(base, { state: "completed", createdAt: old });
      const unlock = await lockRows([
        ["select 1 from adscale_app.semantic_review_observations where id = $1 for update", [held]],
        ["select 1 from adscale_app.creative_work_items where id = $1 for update", [workIds[0]]],
        ["select 1 from adscale_app.semantic_review_policies where id = $1 for update", [policy.id]],
      ]);
      try {
        const result = await withTimeout(clean(s, { apply: true }));
        expect(result.observationIds).not.toContain(held);
        expect(result.observationIds).toContain(free);
      } finally { await unlock(); }
      expect(await exists(held)).toBe(true);
      expect(await clean(s, { apply: true })).toMatchObject({ observationIds: expect.arrayContaining([held]) });
    });
  });

  describe("cleanQuotaDays", () => {
    const NOWQ = () => new Date("2026-12-31T12:00:00.000Z");
    const days = async (s: Scope) => (await db.select({ day: schema.semanticReviewQuotaDays.dayUtc }).from(schema.semanticReviewQuotaDays)
      .where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId))).map((item) => item.day).sort();
    const quotaClean = (s: Scope, extra: Row = {}) => retention.cleanQuotaDays({ workspaceId: s.workspaceId, now: NOWQ(), ...extra });

    it("dry run by default; removes only days strictly before the UTC date of now-30d and keeps the boundary day; works with an active policy", async () => {
      const s = await scope();
      const { observationIds } = await seed(s); // enabled policy: active window, quota cleanup does not depend on it
      // now-30d = 2026-12-01T12:00Z → cutoff day 2026-12-01, kept
      const all = ["2026-10-01", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-31"];
      await db.insert(schema.semanticReviewQuotaDays).values(all.map((dayUtc) => ({ workspaceId: s.workspaceId, dayUtc, attempts: 1 })));
      const before = await snapshot(s);
      const dry = await quotaClean(s);
      expect(dry).toMatchObject({ workspaceId: s.workspaceId, mode: "dry_run", cutoffDayUtc: "2026-12-01", deleted: 0 });
      expect([...(dry.dayUtc as string[])].sort()).toEqual(["2026-10-01", "2026-11-30"]);
      expect(dry.eligible).toBe(2);
      expect(await days(s)).toEqual(all);
      expect(await quotaClean(s, { apply: false })).toEqual(dry);
      const applied = await quotaClean(s, { apply: true });
      expect(applied).toMatchObject({ mode: "apply", deleted: 2, cutoffDayUtc: "2026-12-01" });
      expect(await days(s)).toEqual(["2026-12-01", "2026-12-02", "2026-12-31"]);
      expect(await snapshot(s)).toBe(before);
      expect(await row(observationIds[0])).toMatchObject({ state: "queued" });
      expect(await quotaClean(s, { apply: true })).toMatchObject({ deleted: 0, dayUtc: [] });
    });

    it("pages by limit, validates input and is isolated by workspace", async () => {
      const a = await scope();
      const b = await scope();
      const dayList = Array.from({ length: 130 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
      for (const s of [a, b]) await db.insert(schema.semanticReviewQuotaDays).values(dayList.map((dayUtc) => ({ workspaceId: s.workspaceId, dayUtc, attempts: 1 })));
      expect(await quotaClean(a, { apply: true })).toMatchObject({ deleted: 100 });
      expect(await quotaClean(a, { apply: true, limit: 10 })).toMatchObject({ deleted: 10 });
      expect(await quotaClean(a, { apply: true })).toMatchObject({ deleted: 20 });
      expect(await days(a)).toHaveLength(0);
      expect(await days(b)).toHaveLength(130);
      for (const limit of [0, 101, 1.5, Number.NaN]) await expect(quotaClean(a, { limit })).rejects.toThrow();
      await expect(retention.cleanQuotaDays({ workspaceId: "nope", now: NOWQ() })).rejects.toThrow();
    });

    it("does not block on locked observations, Trabalho or policy rows", async () => {
      const s = await scope();
      const { observationIds: [id], workIds, policy } = await seed(s);
      await db.insert(schema.semanticReviewQuotaDays).values({ workspaceId: s.workspaceId, dayUtc: "2026-01-01", attempts: 1 });
      const unlock = await lockRows([
        ["select 1 from adscale_app.semantic_review_observations where id = $1 for update", [id]],
        ["select 1 from adscale_app.creative_work_items where id = $1 for update", [workIds[0]]],
        ["select 1 from adscale_app.semantic_review_policies where id = $1 for update", [policy.id]],
      ]);
      try { expect(await withTimeout(quotaClean(s, { apply: true }))).toMatchObject({ deleted: 1 }); } finally { await unlock(); }
    });
  });
});
