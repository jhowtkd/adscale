/**
 * #469 — Jev observation processing, behavioural, against real Postgres.
 *
 * Public entry under test: processSemanticReviewObservation (semantic-review-processor.ts).
 * Real repository, real projector hashes (observations come from collectSemanticReview),
 * controlled HTTP (`fetchImpl`). Pausing between steps is done by decorating the public
 * `authorizeObservationSend` / fetch only; no internal mocks.
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/server/creative-work/semantic-review-processing.pg.test.ts
 *
 * Absent TEST_DATABASE_URL skips the suite (repo convention) — a skip is NOT evidence.
 * Shares the #468 advisory lock + isolated future clock.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { SEMANTIC_REVIEW_VERSIONS, createSemanticReviewRepository } from "./semantic-review-repository";
import { collectSemanticReview } from "./semantic-review-collector";
import { processSemanticReviewObservation } from "./semantic-review-processor";
import { JEV_ENDPOINT, parseJevResponse } from "./semantic-review-http";
import { SEMANTIC_MODEL, SEMANTIC_OPTIONS, SEMANTIC_QUESTIONS } from "./semantic-review-offline";
import {
  T0, assertSafeTestDatabaseUrl, claimHermeticClock, createScope, deleteScopes, insertWorks, minutes, openTestDatabase,
  policyInput, workRow, workSnapshot, type Scope, type TestDb,
} from "./semantic-review-collection.pg-helpers";

const URL_UNDER_TEST = process.env.TEST_DATABASE_URL;
const versions = SEMANTIC_REVIEW_VERSIONS as unknown as Record<string, string>;
const CREDENTIAL = "controlled-credential-469";
const EDITED_HEADLINE = "Edited in flight headline 469";

type Row = Record<string, unknown>;
type Overrides = Record<string, unknown>;

function jevBody(choices: Partial<Record<(typeof SEMANTIC_QUESTIONS)[number], string>> = {}) {
  return {
    model: SEMANTIC_MODEL,
    answers: Object.fromEntries(SEMANTIC_QUESTIONS.map((question) => {
      const options = SEMANTIC_OPTIONS[question] as readonly string[];
      const choice = choices[question] ?? options[0];
      return [question, {
        type: "choice", choice, confidence: 0.9,
        probabilities: Object.fromEntries(options.map((option) => [option, option === choice ? 1 : 0])),
      }];
    })),
    usage: { input_tokens: 120, output_tokens: 6 },
  };
}

type FetchBehavior = {
  status?: number;
  body?: unknown;
  raw?: string;
  throws?: Error;
  hang?: boolean;
  /** Runs inside the HTTP call, i.e. after the durable marker and outside any transaction. */
  during?: () => Promise<void> | void;
};
function controlledFetch(behavior: FetchBehavior = {}) {
  return vi.fn(async () => {
    await behavior.during?.();
    if (behavior.throws) throw behavior.throws;
    if (behavior.hang) return new Promise<Response>(() => undefined);
    const payload = behavior.raw ?? JSON.stringify(behavior.body ?? jevBody());
    return new Response(payload, { status: behavior.status ?? 200 });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe.skipIf(!URL_UNDER_TEST)("semantic review processing (PostgreSQL)", () => {
  let db: TestDb;
  let pool: Pool;
  let releaseClock: () => Promise<void>;
  let repository: ReturnType<typeof createSemanticReviewRepository>;
  const scopes: Scope[] = [];
  const globalFetch = vi.fn(() => { throw new Error("global_fetch_forbidden"); });

  /** Processing clock: after collection (T0+5m), inside the observation's 24h queue life. */
  const NOW = () => minutes(T0, 10);

  async function scope(brands = 1) {
    const created = await createScope(db, brands);
    scopes.push(created);
    return created;
  }

  /** Enabled synthetic policy + `count` works + real collection → queued observation ids. */
  async function seed(s: Scope, count = 1, policyOverrides: Overrides = {}, collectAt = minutes(T0, 5)) {
    const policy = await repository.registerPolicy(policyInput(s, versions, policyOverrides) as never, T0);
    await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
    const workIds = await insertWorks(db, s, count, { updatedAt: minutes(T0, 1) });
    for (let i = 0; i < 5; i += 1) {
      const summary = await collectSemanticReview({ repository, enabled: true, now: minutes(collectAt, i) });
      if (summary.status !== "collected" || summary.windowComplete) break;
    }
    const observations = (await rows(s)).filter((row) => workIds.includes(row.workItemId as string));
    expect(observations).toHaveLength(count);
    return { policy, workIds, observationIds: observations.map((row) => row.id as string) };
  }

  const rows = async (s: Scope) => (await db.select().from(schema.semanticReviewObservations)
    .where(eq(schema.semanticReviewObservations.workspaceId, s.workspaceId))) as unknown as Row[];
  const row = async (id: string) => ((await db.select().from(schema.semanticReviewObservations)
    .where(eq(schema.semanticReviewObservations.id, id))) as unknown as Row[])[0];
  const attempts = async (s: Scope) => {
    const quota = await db.select().from(schema.semanticReviewQuotaDays).where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId));
    return quota.reduce((sum, item) => sum + item.attempts, 0);
  };


  /** Holds a row lock from a separate connection until `release()`. */
  async function holdLock(statement: string, params: unknown[]) {
    const client = await pool.connect();
    await client.query("begin");
    await client.query(statement, params);
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      try { await client.query("commit"); } finally { client.release(); }
    };
  }
  /** Polls (25ms steps, short bound) until a backend is blocked on a lock in a statement mentioning `table`. */
  async function waitForBlockedBackend(table: string) {
    for (let i = 0; i < 60; i += 1) {
      const { rows } = await pool.query(
        `select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike $1 and pid <> pg_backend_pid()`,
        [`%${table}%`]);
      if (rows.length) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("no_backend_blocked");
  }

  function run(s: Scope, overrides: Overrides = {}) {
    return processSemanticReviewObservation({
      repository, workspaceId: s.workspaceId, enabled: true, credential: CREDENTIAL,
      fetchImpl: controlledFetch(), clock: NOW, ...overrides,
    } as never) as Promise<Row>;
  }
  const edit = async (workId: string, updatedAt: Date) => {
    const [work] = await db.select().from(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.id, workId));
    await db.update(schema.creativeWorkItems)
      .set({ copy: { ...work.copy!, headline: EDITED_HEADLINE }, updatedAt })
      .where(eq(schema.creativeWorkItems.id, workId));
  };
  /** Public repository with `authorizeObservationSend` paused on a gate. */
  function pausedAtAuthorize() {
    const reached = deferred();
    const gate = deferred();
    const decorated = {
      ...repository,
      authorizeObservationSend: async (...args: unknown[]) => {
        reached.release();
        await gate.promise;
        return (repository.authorizeObservationSend as (...a: unknown[]) => unknown)(...args);
      },
    };
    return { repository: decorated, reached: reached.promise, release: gate.release };
  }
  /** Temporary trigger rejecting UPDATEs of one workspace that move a row to any of `states`. */
  async function installUpdateFailure(s: Scope, states: string[]) {
    const table = "adscale_app.semantic_review_observations";
    const name = `jev469_fail_${s.workspaceId.replace(/-/g, "")}`;
    const list = states.map((state) => `'${state}'`).join(",");
    await pool.query(`create function adscale_app.${name}() returns trigger language plpgsql as $$ begin
      if new.workspace_id = '${s.workspaceId}' and new.state in (${list}) then raise exception 'jev469_forced_failure'; end if;
      return new; end $$`);
    await pool.query(`create trigger ${name} before update on ${table} for each row execute function adscale_app.${name}()`);
    return async () => {
      await pool.query(`drop trigger if exists ${name} on ${table}`);
      await pool.query(`drop function if exists adscale_app.${name}()`);
    };
  }

  beforeAll(async () => {
    ({ db, pool } = await openTestDatabase(assertSafeTestDatabaseUrl(URL_UNDER_TEST)));
    releaseClock = await claimHermeticClock(pool);
    repository = createSemanticReviewRepository(db);
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
    vi.restoreAllMocks();
    expect(globalFetch).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    if (!db) return;
    try {
      await deleteScopes(db, scopes);
    } finally {
      await releaseClock?.();
      await pool.end();
    }
  });

  describe("happy path and safe output", () => {
    it("claims, marks, calls once, and persists completed even for a negative decision", async () => {
      const s = await scope();
      const { observationIds, workIds } = await seed(s);
      const before = await workSnapshot(db, workIds[0]);
      const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
      let midFlight: Row | undefined;
      const fetchImpl = controlledFetch({
        body: jevBody({ headline_claims: "unsupported", intent_alignment: "divergent" }),
        during: async () => { midFlight = await row(observationIds[0]); },
      });
      const result = await run(s, { fetchImpl });

      expect(result).toMatchObject({ status: "completed", sent: true, workspaceId: s.workspaceId, observationId: observationIds[0] });
      expect(result).not.toHaveProperty("currentAtCompletion");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit];
      expect(url).toBe(JEV_ENDPOINT);
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${CREDENTIAL}`);
      // Durable marker + owner + 60s lease existed before the HTTP call, outside any transaction.
      expect(midFlight).toMatchObject({ state: "running" });
      expect(midFlight!.sendStartedAt).toBeInstanceOf(Date);
      expect(midFlight!.ownerToken).toEqual(expect.any(String));
      expect((midFlight!.leaseExpiresAt as Date).getTime() - NOW().getTime()).toBe(60_000);

      const done = await row(observationIds[0]);
      expect(done).toMatchObject({ state: "completed", currentAtCompletion: true, returnedModel: SEMANTIC_MODEL });
      expect(done.decisions).toMatchObject({ headline_claims: "unsupported", intent_alignment: "divergent" });
      expect(done.confidence).toBeTruthy();
      expect(done.probabilities).toBeTruthy();
      expect(done.usage).toMatchObject({ input_tokens: 120, output_tokens: 6 });
      expect(done.finishedAt).toBeInstanceOf(Date);
      expect(await attempts(s)).toBe(1);

      // Observer only: the Trabalho is untouched; nothing sensitive in output or logs.
      expect(await workSnapshot(db, workIds[0])).toBe(before);
      const printed = JSON.stringify(result) + JSON.stringify(logs.map((spy) => spy.mock.calls));
      expect(printed).not.toContain(CREDENTIAL);
      expect(printed).not.toMatch(/synthetic request|headline/i);
    });

    it("sends only frozen projection text, never ids or storage keys", async () => {
      const s = await scope();
      await seed(s);
      const fetchImpl = controlledFetch();
      await run(s, { fetchImpl });
      const body = String((vi.mocked(fetchImpl).mock.calls[0][1] as RequestInit).body);
      expect(body).not.toContain(s.workspaceId);
      expect(body).not.toContain(s.brandIds[0]);
      expect(body).not.toContain(CREDENTIAL);
    });
  });

  describe("gates", () => {
    it("disabled: no claim, no HTTP; flag defaults from JEV_OBSERVER_ENABLED", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const fetchImpl = controlledFetch();
      const result = await run(s, { enabled: undefined, fetchImpl });
      expect(result).toMatchObject({ status: "disabled", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observationIds[0])).toMatchObject({ state: "queued", ownerToken: null, sendStartedAt: null });
      vi.stubEnv("JEV_OBSERVER_ENABLED", "true");
      expect(await run(s, { enabled: undefined, fetchImpl })).toMatchObject({ status: "completed", sent: true });
    });

    it("missing credential: not_configured without claiming or spending quota", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const fetchImpl = controlledFetch();
      expect(await run(s, { credential: undefined, fetchImpl })).toMatchObject({ status: "not_configured", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observationIds[0])).toMatchObject({ state: "queued", ownerToken: null });
      expect(await attempts(s)).toBe(0);
      vi.stubEnv("TYPESAFE_API_KEY", CREDENTIAL);
      expect(await run(s, { credential: undefined, fetchImpl })).toMatchObject({ status: "completed" });
    });

    it("no_observation when empty, and never reaches across workspaces", async () => {
      const a = await scope();
      const b = await scope();
      const { observationIds } = await seed(a);
      const fetchImpl = controlledFetch();
      expect(await run(b, { fetchImpl })).toMatchObject({ status: "no_observation", sent: false });
      expect(await run(b, { observationId: observationIds[0], fetchImpl })).toMatchObject({ status: "no_observation", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observationIds[0])).toMatchObject({ state: "queued", ownerToken: null });
    });
  });

  describe("quota and dedupe", () => {
    it("concurrently spends only the last unit of the workspace/day quota", async () => {
      const s = await scope();
      const { policy } = await seed(s, 4, { dailyAttemptLimit: 3 });
      expect(policy.dailyAttemptLimit).toBe(3);
      await db.insert(schema.semanticReviewQuotaDays).values({ workspaceId: s.workspaceId, dayUtc: NOW().toISOString().slice(0, 10), attempts: 2 });
      const fetchImpl = controlledFetch();
      const results = await Promise.all([1, 2, 3, 4].map(() => run(s, { fetchImpl })));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(results.filter((result) => result.sent)).toHaveLength(1);
      expect(results.filter((result) => result.status === "completed")).toHaveLength(1);
      expect(await attempts(s)).toBe(3);
      const states = (await rows(s)).map((item) => item.state);
      expect(states.filter((state) => state === "completed")).toHaveLength(1);
      expect(results.filter((result) => result.status === "deferred")).toHaveLength(3);
      for (const result of results.filter((item) => item.status === "deferred")) expect(result).toMatchObject({ code: "quota_exhausted", sent: false });
      expect(states.filter((state) => state === "queued")).toHaveLength(3);
      for (const item of await rows(s)) if (item.state === "queued") expect(item.sendStartedAt).toBeNull();
    });

    it("never exceeds the cap over many concurrent rounds", async () => {
      const s = await scope();
      await seed(s, 4, { dailyAttemptLimit: 2 });
      const fetchImpl = controlledFetch();
      await Promise.all([1, 2, 3, 4].map(() => run(s, { fetchImpl })));
      await Promise.all([1, 2, 3, 4].map(() => run(s, { fetchImpl })));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect((await rows(s)).filter((item) => item.state === "queued")).toHaveLength(2);
      expect(await attempts(s)).toBe(2);
    });

    it("keeps usage when the policy is replaced on the same day, and isolates workspaces", async () => {
      const a = await scope();
      const b = await scope();
      const first = await seed(a, 1, { dailyAttemptLimit: 1 });
      await seed(b, 1, { dailyAttemptLimit: 1 });
      expect(await run(a)).toMatchObject({ status: "completed" });
      // Workspace B is unaffected by A's consumption.
      expect(await run(b)).toMatchObject({ status: "completed" });

      await repository.revokePolicy({ workspaceId: a.workspaceId, policyId: first.policy.id }, minutes(T0, 20));
      const second = await repository.registerPolicy(policyInput(a, versions, { dailyAttemptLimit: 1, authorizedAt: minutes(T0, 20) }) as never, minutes(T0, 20));
      await repository.setPolicyEnabled({ workspaceId: a.workspaceId, policyId: second.id, enabled: true }, minutes(T0, 20));
      await insertWorks(db, a, 1, { updatedAt: minutes(T0, 21) });
      await collectSemanticReview({ repository, enabled: true, now: minutes(T0, 25) });
      const fetchImpl = controlledFetch();
      const result = await run(a, { fetchImpl, clock: () => minutes(T0, 30) });
      expect(result).toMatchObject({ status: "deferred", code: "quota_exhausted", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await attempts(a)).toBe(1);
    });

    it("counts per UTC day: yesterday's usage does not block the next day", async () => {
      const s = await scope();
      const midnight = new Date(Date.UTC(T0.getUTCFullYear(), T0.getUTCMonth(), T0.getUTCDate() + 2));
      const { observationIds } = await seed(s, 2, { dailyAttemptLimit: 1 }, new Date(midnight.getTime() - 30 * 60_000));
      expect(await run(s, { clock: () => new Date(midnight.getTime() - 10 * 60_000) })).toMatchObject({ status: "completed" });
      const fetchImpl = controlledFetch();
      const sameDay = await run(s, { fetchImpl, clock: () => new Date(midnight.getTime() - 5 * 60_000) });
      expect(sameDay).toMatchObject({ status: "deferred", code: "quota_exhausted", sent: false });
      expect(await run(s, { fetchImpl, clock: () => new Date(midnight.getTime() + 10 * 60_000) })).toMatchObject({ status: "completed", sent: true });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await attempts(s)).toBe(2);
      expect((await rows(s)).filter((item) => item.state === "completed")).toHaveLength(2);
      expect(observationIds).toHaveLength(2);
    });

    it("dedupes: a terminal identity is never sent again, even concurrently", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const fetchImpl = controlledFetch();
      const results = await Promise.all([1, 2, 3].map(() => run(s, { observationId: observationIds[0], fetchImpl })));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(results.filter((result) => result.sent)).toHaveLength(1);
      expect(await run(s, { observationId: observationIds[0], fetchImpl })).toMatchObject({ status: "no_observation", sent: false });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await rows(s)).toHaveLength(1);
      expect(await attempts(s)).toBe(1);
    });
  });

  describe("owner and recovery", () => {
    it("loses ownership before the send: nothing is written over the new owner and no HTTP happens", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const gate = pausedAtAuthorize();
      const fetchImpl = controlledFetch();
      const pending = run(s, { repository: gate.repository, fetchImpl });
      await gate.reached;
      const stranger = crypto.randomUUID();
      await db.update(schema.semanticReviewObservations)
        .set({ ownerToken: stranger } as never).where(eq(schema.semanticReviewObservations.id, observationIds[0]));
      gate.release();
      expect(await pending).toMatchObject({ status: "ownership_lost", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observationIds[0])).toMatchObject({ state: "running", ownerToken: stranger, finishedAt: null });
    });

    it("loses ownership during HTTP: late result does not overwrite the other owner", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const stranger = crypto.randomUUID();
      const fetchImpl = controlledFetch({
        during: async () => {
          await db.update(schema.semanticReviewObservations)
            .set({ ownerToken: stranger } as never).where(eq(schema.semanticReviewObservations.id, observationIds[0]));
        },
      });
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "ownership_lost", sent: true });
      const after = await row(observationIds[0]);
      expect(after).toMatchObject({ state: "running", ownerToken: stranger, finishedAt: null, decisions: null });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("a live lease with a marker cannot be claimed by another processor", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      await db.update(schema.semanticReviewObservations).set({
        state: "running", ownerToken: crypto.randomUUID(), sendStartedAt: NOW(), leaseExpiresAt: new Date(NOW().getTime() + 30_000),
      } as never).where(eq(schema.semanticReviewObservations.id, observationIds[0]));
      const fetchImpl = controlledFetch();
      const result = await run(s, { fetchImpl });
      expect(result.sent).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observationIds[0])).toMatchObject({ state: "running" });
    });

    it("expired lease WITHOUT marker returns to the queue and is sent exactly once", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const stale = crypto.randomUUID();
      await db.update(schema.semanticReviewObservations).set({
        state: "running", ownerToken: stale, sendStartedAt: null, leaseExpiresAt: new Date(NOW().getTime() - 1_000),
      } as never).where(eq(schema.semanticReviewObservations.id, observationIds[0]));
      const fetchImpl = controlledFetch();
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "completed", sent: true });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect((await row(observationIds[0])).ownerToken).not.toBe(stale);
      expect(await attempts(s)).toBe(1);
    });

    it("expired lease WITH marker becomes outcome_unknown: no resend, quota not refunded", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      await db.insert(schema.semanticReviewQuotaDays).values({ workspaceId: s.workspaceId, dayUtc: NOW().toISOString().slice(0, 10), attempts: 1 });
      await db.update(schema.semanticReviewObservations).set({
        state: "running", ownerToken: crypto.randomUUID(), sendStartedAt: minutes(NOW(), -5), leaseExpiresAt: new Date(NOW().getTime() - 1_000),
      } as never).where(eq(schema.semanticReviewObservations.id, observationIds[0]));
      const fetchImpl = controlledFetch();
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "outcome_unknown", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observationIds[0])).toMatchObject({ state: "outcome_unknown" });
      expect(await attempts(s)).toBe(1);
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "no_observation" });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe("revocation and stale input", () => {
    it("revoked before the send: skipped (terminal), no HTTP, no quota spent", async () => {
      const s = await scope();
      const { observationIds, policy } = await seed(s);
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 8));
      const fetchImpl = controlledFetch();
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "skipped", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observationIds[0])).toMatchObject({ state: "skipped", finishedAt: expect.any(Date) });
      expect(await attempts(s)).toBe(0);
    });

    it("disabled (reversible) is deferred/policy_disabled: stays queued, and runs after re-enable", async () => {
      const s = await scope();
      const { observationIds, policy } = await seed(s);
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: false }, minutes(T0, 8));
      const fetchImpl = controlledFetch();
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "deferred", code: "policy_disabled", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observationIds[0])).toMatchObject({ state: "queued", sendStartedAt: null, finishedAt: null });
      expect(await attempts(s)).toBe(0);
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, minutes(T0, 9));
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "completed", sent: true });
    });

    it("revoked after reserve, before the send: skipped, no HTTP, quota kept", async () => {
      const s = await scope();
      const { observationIds, policy } = await seed(s);
      const gate = pausedAtAuthorize();
      const fetchImpl = controlledFetch();
      const pending = run(s, { repository: gate.repository, fetchImpl });
      await gate.reached;
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 9));
      gate.release();
      expect(await pending).toMatchObject({ status: "skipped", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect((await row(observationIds[0])).state).toBe("skipped");
      // The attempt was already reserved and marked: own cancellation without HTTP keeps the quota.
      expect(await attempts(s)).toBe(1);
    });

    it("work edited before the send: skipped/stale_input, nothing sent", async () => {
      const s = await scope();
      const { observationIds, workIds } = await seed(s);
      await edit(workIds[0], minutes(T0, 8));
      const fetchImpl = controlledFetch();
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "skipped", code: "stale_input", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observationIds[0])).toMatchObject({ state: "skipped", errorCode: "stale_input" });
      expect(await attempts(s)).toBe(0);
    });

    it("work edited between claim and marker: skipped/stale_input", async () => {
      const s = await scope();
      const { workIds } = await seed(s);
      const gate = pausedAtAuthorize();
      const fetchImpl = controlledFetch();
      const pending = run(s, { repository: gate.repository, fetchImpl });
      await gate.reached;
      await edit(workIds[0], minutes(T0, 9));
      gate.release();
      expect(await pending).toMatchObject({ status: "skipped", code: "stale_input", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("work edited during HTTP: completed with currentAtCompletion=false", async () => {
      const s = await scope();
      const { observationIds, workIds } = await seed(s);
      const fetchImpl = controlledFetch({ during: () => edit(workIds[0], minutes(T0, 11)) });
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "completed", sent: true });
      expect(await row(observationIds[0])).toMatchObject({ state: "completed", currentAtCompletion: false });
      expect(await attempts(s)).toBe(1);
    });

    it("policy revoked during HTTP: completed with currentAtCompletion=false", async () => {
      const s = await scope();
      const { observationIds, policy } = await seed(s);
      const fetchImpl = controlledFetch({
        during: async () => { await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 11)); },
      });
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "completed", sent: true });
      expect(await row(observationIds[0])).toMatchObject({ currentAtCompletion: false });
    });

    it("work deleted during HTTP: no throw, nothing written for it", async () => {
      const s = await scope();
      const { observationIds, workIds } = await seed(s);
      const fetchImpl = controlledFetch({
        during: async () => { await db.delete(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.id, workIds[0])); },
      });
      const result = await run(s, { fetchImpl });
      expect(result.sent).toBe(true);
      expect(result.status).not.toBe("completed");
      expect(await row(observationIds[0])).toBeUndefined();
    });
  });

  describe("budget, timeout and failure classification", () => {
    it("no call unless timeout (5s) + 2s of budget remain; exactly 7s is enough", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const fetchImpl = controlledFetch();
      const short = await run(s, { fetchImpl, deadline: new Date(NOW().getTime() + 6_999) });
      expect(short).toMatchObject({ status: "deferred", code: "budget_insufficient", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observationIds[0])).toMatchObject({ state: "queued", sendStartedAt: null });
      expect(await attempts(s)).toBe(0);
      expect(await run(s, { fetchImpl, deadline: new Date(NOW().getTime() + 7_000) })).toMatchObject({ status: "completed" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("budget consumed between prepare and reserve: skipped without HTTP, quota kept", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      let now = NOW();
      const decorated = {
        ...repository,
        reserveObservationAttempt: async (...args: unknown[]) => {
          now = new Date(now.getTime() + 15_000); // 20s default budget, 5s left < 7s needed
          return (repository.reserveObservationAttempt as (...a: unknown[]) => unknown)(...args);
        },
      };
      const fetchImpl = controlledFetch();
      const result = await run(s, { repository: decorated, fetchImpl, clock: () => now });
      // Reserve already marked and spent the attempt: the own cancellation is skipped, quota kept.
      expect(result).toMatchObject({ status: "skipped", code: "budget_insufficient", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect((await row(observationIds[0])).state).toBe("skipped");
      expect(await attempts(s)).toBe(1);
    });

    it("timeout is outcome_unknown: quota kept and never resent", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const fetchImpl = controlledFetch({ hang: true });
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "outcome_unknown", sent: true });
      expect(await row(observationIds[0])).toMatchObject({ state: "outcome_unknown", errorCode: expect.any(String) });
      expect(await attempts(s)).toBe(1);
      expect(await run(s, { fetchImpl })).toMatchObject({ status: "no_observation", sent: false });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }, 30_000);

    it.each([
      ["HTTP 500", { status: 500, raw: "{}" }, "outcome_unknown"],
      ["HTTP 503", { status: 503, raw: "{}" }, "outcome_unknown"],
      ["network error", { throws: new Error("socket hang up") }, "outcome_unknown"],
      ["HTTP 400", { status: 400, raw: "{}" }, "failed"],
      ["HTTP 429", { status: 429, raw: "{}" }, "failed"],
      ["invalid response", { raw: "not json" }, "failed"],
      ["wrong model", { body: { ...jevBody(), model: "jev-latest" } }, "failed"],
    ] as Array<[string, FetchBehavior, string]>)("%s → %s, no refund, no resend", async (_label, behavior, expected) => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const fetchImpl = controlledFetch(behavior);
      const result = await run(s, { fetchImpl });
      expect(result).toMatchObject({ status: expected, sent: true });
      expect(await row(observationIds[0])).toMatchObject({ state: expected, decisions: null });
      expect(await attempts(s)).toBe(1);
      await run(s, { fetchImpl });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
    });
  });

  describe("payload, usage and scoped writes", () => {
    it("oversized (valid) projection: skipped/request_too_large before reserving, no quota, no HTTP", async () => {
      const s = await scope();
      const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
      const base = workRow(s, { updatedAt: minutes(T0, 1) });
      const snapshot = structuredClone(base.inputSnapshot) as unknown as { factPack: { brand: { requiredElements: string[] } } };
      snapshot.factPack.brand.requiredElements = ["texto seguro ".repeat(4000)];
      await db.insert(schema.creativeWorkItems).values({ ...base, inputSnapshot: snapshot as never });
      const summary = await collectSemanticReview({ repository, enabled: true, now: minutes(T0, 5) });
      expect(summary).toMatchObject({ unique: 1, invalid: 0 });
      const [observation] = await rows(s);
      const fetchImpl = controlledFetch();
      const result = await run(s, { fetchImpl });
      expect(result).toMatchObject({ status: "skipped", code: "request_too_large", sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await row(observation.id as string)).toMatchObject({ state: "skipped", sendStartedAt: null, errorCode: "request_too_large" });
      expect(await attempts(s)).toBe(0);
      expect(JSON.stringify(result)).not.toContain("texto seguro");
    });

    it("response without usage persists usage as null", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const withoutUsage: Record<string, unknown> = { ...jevBody() };
      delete withoutUsage.usage;
      expect(await run(s, { fetchImpl: controlledFetch({ body: withoutUsage }) })).toMatchObject({ status: "completed" });
      expect((await row(observationIds[0])).usage).toBeNull();
    });

    it("finish/skip with a wrong owner or workspace write nothing", async () => {
      const a = await scope();
      const b = await scope();
      const { observationIds } = await seed(a);
      const id = observationIds[0];
      const owner = crypto.randomUUID();
      const claimed = await repository.claimObservation({ workspaceId: a.workspaceId, observationId: id, ownerToken: owner, now: NOW() });
      expect(claimed).toBeTruthy();
      const before = JSON.stringify(await row(id));
      const wrongOwner = { workspaceId: a.workspaceId, observationId: id, ownerToken: crypto.randomUUID(), now: NOW() };
      const wrongWorkspace = { workspaceId: b.workspaceId, observationId: id, ownerToken: owner, now: NOW() };
      for (const scoped of [wrongOwner, wrongWorkspace]) {
        expect(await repository.skipObservation({ ...scoped, code: "x" } as never)).toBe(false);
        expect(await repository.finishObservation({ ...scoped, state: "failed", code: "x" } as never)).toBe(false);
        expect(await repository.finishObservation({ ...scoped, state: "completed", result: parseJevResponse(jevBody()), currentAtCompletion: true } as never)).toBe(false);
      }
      expect(JSON.stringify(await row(id))).toBe(before);
      // The real owner can still close it.
      expect(await repository.skipObservation({ workspaceId: a.workspaceId, observationId: id, ownerToken: owner, now: NOW(), code: "x" } as never)).toBe(true);
      expect((await row(id)).state).toBe("skipped");
    });

    it("lease expired DURING HTTP: the late result is not accepted", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const fetchImpl = controlledFetch({
        during: async () => {
          await db.update(schema.semanticReviewObservations)
            .set({ leaseExpiresAt: new Date(NOW().getTime() - 1_000) } as never).where(eq(schema.semanticReviewObservations.id, observationIds[0]));
        },
      });
      const result = await run(s, { fetchImpl });
      expect(result.sent).toBe(true);
      expect(result.status).not.toBe("completed");
      const after = await row(observationIds[0]);
      expect(after.state).not.toBe("completed");
      expect(after.decisions ?? null).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await attempts(s)).toBe(1);
    });
  });

  describe("clock aging while waiting for locks", () => {
    const FAR = () => new Date(T0.getTime() + 100 * 86_400_000);

    it("lease ages while preparing blocked on the work lock: nothing sent, no quota", async () => {
      const s = await scope();
      const { observationIds, workIds } = await seed(s);
      let at = NOW();
      const release = await holdLock("select id from adscale_app.creative_work_items where id = $1 for update", [workIds[0]]);
      try {
        const fetchImpl = controlledFetch();
        const pending = run(s, { fetchImpl, clock: () => at, deadline: FAR() });
        await waitForBlockedBackend("creative_work_items");
        at = new Date(NOW().getTime() + 61_000); // lease (60s) expires while waiting
        await release();
        const result = await pending;
        expect(result).toMatchObject({ status: "ownership_lost", sent: false });
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(await attempts(s)).toBe(0);
        expect(await row(observationIds[0])).toMatchObject({ sendStartedAt: null, decisions: null });
        expect((await row(observationIds[0])).state).not.toBe("completed");
      } finally {
        await release();
      }
    });

    it("lease ages while finishing blocked on the work lock: late result is not accepted", async () => {
      const s = await scope();
      const { observationIds, workIds } = await seed(s);
      let at = NOW();
      let release: (() => Promise<void>) | undefined;
      let watcher: Promise<void> | undefined;
      const fetchImpl = controlledFetch({
        during: async () => {
          release = await holdLock("select id from adscale_app.creative_work_items where id = $1 for update", [workIds[0]]);
          at = new Date(NOW().getTime() + 59_000); // still inside the lease when the response returns
          watcher = (async () => {
            await waitForBlockedBackend("creative_work_items");
            at = new Date(NOW().getTime() + 61_000); // lease gone while finish waits
            await release!();
          })();
        },
      });
      try {
        const result = await run(s, { fetchImpl, clock: () => at, deadline: FAR() });
        await watcher;
        expect(result).toMatchObject({ status: "ownership_lost", sent: true });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const after = await row(observationIds[0]);
        expect(after.state).not.toBe("completed");
        expect(after.decisions ?? null).toBeNull();
        expect(await attempts(s)).toBe(1);
      } finally {
        await release?.();
      }
    });

    it("UTC day changes while reserving blocked on the quota row: deferred, old day not incremented", async () => {
      const s = await scope();
      const midnight = new Date(Date.UTC(T0.getUTCFullYear(), T0.getUTCMonth(), T0.getUTCDate() + 2));
      const { observationIds } = await seed(s, 1, {}, new Date(midnight.getTime() - 30 * 60_000));
      const day = new Date(midnight.getTime() - 1).toISOString().slice(0, 10);
      await db.insert(schema.semanticReviewQuotaDays).values({ workspaceId: s.workspaceId, dayUtc: day, attempts: 0 });
      let at = new Date(midnight.getTime() - 10_000);
      const release = await holdLock("update adscale_app.semantic_review_quota_days set attempts = attempts where workspace_id = $1", [s.workspaceId]);
      try {
        const fetchImpl = controlledFetch();
        const pending = run(s, { fetchImpl, clock: () => at, deadline: FAR() });
        await waitForBlockedBackend("semantic_review_quota_days");
        at = new Date(midnight.getTime() + 5_000); // lease (60s) still alive, but the UTC day moved on
        await release();
        const result = await pending;
        expect(result).toMatchObject({ status: "deferred", code: "quota_day_changed", sent: false });
        expect(fetchImpl).not.toHaveBeenCalled();
        const quota = await db.select().from(schema.semanticReviewQuotaDays).where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId));
        expect(quota).toEqual([expect.objectContaining({ dayUtc: day, attempts: 0 })]);
        expect(await row(observationIds[0])).toMatchObject({ state: "queued", sendStartedAt: null, ownerToken: null });
      } finally {
        await release();
      }
    });
  });

  describe("final persistence failure", () => {
    it("completed write fails: recorded outcome_unknown, never resent", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const remove = await installUpdateFailure(s, ["completed"]);
      try {
        const fetchImpl = controlledFetch();
        const result = await run(s, { fetchImpl });
        expect(result).toMatchObject({ status: "outcome_unknown", sent: true });
        expect(await row(observationIds[0])).toMatchObject({ state: "outcome_unknown", decisions: null });
        expect(await run(s, { fetchImpl })).toMatchObject({ status: "no_observation" });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(await attempts(s)).toBe(1);
      } finally {
        await remove();
      }
    });

    it("even the fallback write fails: row stays running with marker; lease expiry yields outcome_unknown without resend", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const remove = await installUpdateFailure(s, ["completed", "outcome_unknown"]);
      const fetchImpl = controlledFetch();
      try {
        // The public entry never rejects; it returns a safe summary.
        const settled = await run(s, { fetchImpl });
        expect(settled).toMatchObject({ sent: true, workspaceId: s.workspaceId });
        expect(JSON.stringify(settled)).not.toMatch(new RegExp(`${CREDENTIAL}|jev469_forced_failure`));
        expect(await row(observationIds[0])).toMatchObject({ state: "running", sendStartedAt: expect.any(Date) });
      } finally {
        await remove();
      }
      const later = () => minutes(NOW(), 2);
      expect(await run(s, { fetchImpl, clock: later })).toMatchObject({ status: "outcome_unknown", sent: false });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await attempts(s)).toBe(1);
    });
  });

  describe("diagnostics", () => {
    beforeEach(() => { vi.stubEnv("OBSERVABILITY_ENABLED", "true"); });

    it("emits nothing while OBSERVABILITY_ENABLED is off (default)", async () => {
      vi.stubEnv("OBSERVABILITY_ENABLED", "");
      const s = await scope();
      await seed(s);
      const events: unknown[] = [];
      expect(await run(s, { diagnosticSink: (event: unknown) => { events.push(event); } })).toMatchObject({ status: "completed" });
      expect(events).toHaveLength(0);
    });

    it("emits one safe operation + model.call sequence: semantic_review, no stage, no content", async () => {
      const s = await scope();
      await seed(s);
      const events: unknown[] = [];
      const result = await run(s, { diagnosticSink: (event: unknown) => { events.push(event); } });
      expect(result.status).toBe("completed");
      const text = JSON.stringify(events);
      expect(events.length).toBeGreaterThan(0);
      expect(text).toContain("semantic_review");
      expect(text).toMatch(/model\.call/);
      expect(text).not.toMatch(/"stage"/);
      expect(text).not.toContain(CREDENTIAL);
      expect(text).not.toMatch(/headline|synthetic request|"body"|"cta"/i);
      const names = events.map((event) => (event as { event: string }).event);
      expect(names.filter((name) => name.startsWith("operation"))).not.toHaveLength(0);
      expect(names.filter((name) => name === "model.call.started")).toHaveLength(1);
      expect(names.filter((name) => name === "model.call.completed" || name === "model.call.failed")).toHaveLength(1);
    });

    it("a failing sink never changes processing", async () => {
      const s = await scope();
      const { observationIds } = await seed(s);
      const result = await run(s, { diagnosticSink: () => { throw new Error("journal_down"); } });
      expect(result).toMatchObject({ status: "completed", sent: true });
      expect((await row(observationIds[0])).state).toBe("completed");
    });

    it("unknown outcomes are reported as failed/unknown model.call, once", async () => {
      const s = await scope();
      await seed(s);
      const events: Array<{ event: string }> = [];
      await run(s, { fetchImpl: controlledFetch({ status: 500, raw: "{}" }), diagnosticSink: (event: { event: string }) => { events.push(event); } });
      expect(events.filter((event) => event.event === "model.call.started")).toHaveLength(1);
      expect(events.filter((event) => event.event === "model.call.completed")).toHaveLength(0);
      expect(events.filter((event) => event.event === "model.call.failed")).toHaveLength(1);
    });
  });
});
