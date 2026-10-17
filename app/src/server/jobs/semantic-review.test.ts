/**
 * #472 — orchestration of the registered Jev observer function, no database.
 *
 * Collector/processor are mocked ONLY here to pin the sweep's sequencing, limits and
 * summary safety deterministically; the same scenarios run against real Postgres and the
 * real collector/processor in semantic-review.pg.test.ts. Always invoked through the
 * function registered with Inngest (opts + handler), never through a private helper.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbLoads: 0,
  collect: vi.fn(),
  process: vi.fn(),
}));

vi.mock("./client", () => ({
  inngest: { createFunction: (opts: unknown, fn: unknown) => ({ opts, fn }) },
}));
vi.mock("../db", () => ({
  get db() { mocks.dbLoads += 1; throw new Error("db_must_not_load"); },
}));
vi.mock("../creative-work/semantic-review-collector", () => ({ collectSemanticReview: mocks.collect }));
vi.mock("../creative-work/semantic-review-processor", () => ({ processSemanticReviewObservation: mocks.process }));

import { createSemanticReviewObserverJob } from "./semantic-review";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CREDENTIAL = "controlled-credential-472";
const SECRET = "postgres://admin:hunter2@db.internal:5432/prod";
const T0 = new Date("2026-11-01T12:00:00.000Z");

type Handler = (ctx: { step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const registered = (deps: Parameters<typeof createSemanticReviewObserverJob>[0]) =>
  createSemanticReviewObserverJob(deps) as unknown as { opts: Record<string, any>; fn: Handler }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A repository whose maintenance entries are spies and whose destructive ones must never run. */
function repo(overrides: Record<string, unknown> = {}) {
  const base: Record<string, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
    listWorkspacesWithExpirableObservations: vi.fn(async () => ({ workspaceIds: [], nextCursor: null })),
    expireObservations: vi.fn(async ({ workspaceId }: { workspaceId: string }) => ({ workspaceId, examined: 0, expired: 0, recovered: 0, outcomeUnknown: 0,
      observationIds: { expired: [], recovered: [], outcomeUnknown: [] } })),
    cleanObservations: vi.fn(),
    cleanQuotaDays: vi.fn(),
    ...overrides,
  };
  return base;
}
const collected = (workspaceId = WORKSPACE) => ({ status: "collected", workspaceId, policyId: OTHER, consulted: 1, eligible: 1, unique: 1,
  duplicates: 0, outOfScope: 0, invalid: 0, notSampled: 0, exclusions: {}, windowComplete: true });
const processed = (status: string, extra: Record<string, unknown> = {}) => ({ status, workspaceId: WORKSPACE, observationId: OTHER, sent: status === "completed", ...extra });

async function sweep(deps: Parameters<typeof createSemanticReviewObserverJob>[0], steps: string[] = []) {
  const job = registered(deps);
  const step = { run: vi.fn(async (name: string, fn: () => Promise<unknown>) => { steps.push(name); return fn(); }) };
  const summary = await job.fn({ step });
  return { summary, step, job };
}

describe("semantic review observer — registered function", () => {
  beforeEach(() => {
    mocks.dbLoads = 0;
    mocks.collect.mockReset();
    mocks.process.mockReset();
  });

  it("registers one cron function: */5, retries 0, concurrency 1, one step", async () => {
    const { job, step } = await sweep({ enabled: false });
    expect(job.opts).toMatchObject({ id: "semantic-review-observer", retries: 0, concurrency: 1 });
    expect(job.opts.triggers).toEqual([{ cron: "*/5 * * * *" }]);
    expect(step.run).toHaveBeenCalledTimes(1);
    expect(step.run.mock.calls[0][0]).toBe("semantic-review-sweep");
  });

  it("flag off returns before loading the database, policies, collector or provider", async () => {
    const repository = repo();
    const fetchImpl = vi.fn();
    const { summary } = await sweep({ repository: repository as never, enabled: false, credential: CREDENTIAL, fetchImpl: fetchImpl as never });
    expect(summary).toMatchObject({ status: "disabled", expiration: null, collection: null, processing: [] });
    expect(repository.listWorkspacesWithExpirableObservations).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("flag off with no injected repository never touches the lazy database", async () => {
    const { summary } = await sweep({ enabled: false, credential: CREDENTIAL });
    expect(summary.status).toBe("disabled");
    expect(mocks.dbLoads).toBe(0);
  });

  it.each([[undefined, "missing_credential"], ["", "missing_credential"], ["has space", "invalid_credential"], ["x".repeat(4097), "invalid_credential"]])(
    "credential %j is not_configured before any database load", async (credential, code) => {
      vi.stubEnv("TYPESAFE_API_KEY", "");
      const { summary } = await sweep({ enabled: true, credential });
      vi.unstubAllEnvs();
      expect(summary).toMatchObject({ status: "not_configured", code, collection: null, processing: [] });
      expect(mocks.dbLoads).toBe(0);
      expect(mocks.collect).not.toHaveBeenCalled();
    });

  it("zero policies: collection reports no_policy and nothing is processed", async () => {
    mocks.collect.mockResolvedValue({ ...collected(), status: "no_policy", workspaceId: undefined, policyId: undefined, consulted: 0, eligible: 0, unique: 0 });
    const { summary } = await sweep({ repository: repo() as never, enabled: true, credential: CREDENTIAL, clock: () => T0 });
    expect(summary).toMatchObject({ status: "completed", collection: { status: "no_policy" }, processing: [] });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("one policy per sweep: collects once, processes only that workspace, up to three sequentially, one shared deadline", async () => {
    mocks.collect.mockResolvedValue(collected());
    let running = 0;
    let maxRunning = 0;
    mocks.process.mockImplementation(async () => {
      running += 1; maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return processed("completed");
    });
    const fetchImpl = vi.fn() as never;
    const { summary } = await sweep({ repository: repo() as never, enabled: true, credential: CREDENTIAL, clock: () => T0, fetchImpl });
    expect(mocks.collect).toHaveBeenCalledTimes(1);
    expect(mocks.process).toHaveBeenCalledTimes(3); // queue larger than three
    expect(maxRunning).toBe(1);
    const calls = mocks.process.mock.calls.map(([options]) => options);
    expect(calls.every((options) => options.workspaceId === WORKSPACE)).toBe(true);
    expect(calls.every((options) => options.credential === CREDENTIAL && options.fetchImpl === fetchImpl)).toBe(true);
    expect(calls.every((options) => options.observationId === undefined)).toBe(true); // oldest eligible, never a chosen id
    const deadlines = new Set(calls.map((options) => (options.deadline as Date).getTime()));
    expect(deadlines.size).toBe(1);
    expect([...deadlines][0]).toBe(T0.getTime() + 20_000);
    expect(summary.processing).toHaveLength(3);
  });

  it.each(["deferred", "disabled", "not_configured", "no_observation"])("stops the loop after %s", async (status) => {
    mocks.collect.mockResolvedValue(collected());
    mocks.process.mockResolvedValueOnce(processed("completed")).mockResolvedValueOnce(processed(status)).mockResolvedValue(processed("completed"));
    const { summary } = await sweep({ repository: repo() as never, enabled: true, credential: CREDENTIAL, clock: () => T0 });
    expect(mocks.process).toHaveBeenCalledTimes(2);
    expect(summary.processing.map((item: { status: string }) => item.status)).toEqual(["completed", status]);
  });

  it("continues past skipped (revoked), failed and outcome_unknown outcomes up to three", async () => {
    mocks.collect.mockResolvedValue(collected());
    mocks.process.mockResolvedValueOnce(processed("skipped", { code: "authorization_revoked" }))
      .mockResolvedValueOnce(processed("failed", { code: "http_status" }))
      .mockResolvedValueOnce(processed("outcome_unknown", { code: "timeout", sent: true }));
    const { summary } = await sweep({ repository: repo() as never, enabled: true, credential: CREDENTIAL, clock: () => T0 });
    expect(summary.processing).toHaveLength(3);
    expect(mocks.process).toHaveBeenCalledTimes(3);
  });

  it("shared deadline: the clock passing 20 s stops further sends with a deferred budget summary", async () => {
    let now = T0.getTime();
    mocks.collect.mockResolvedValue(collected());
    mocks.process.mockImplementation(async () => { now += 12_000; return processed("completed"); });
    const { summary } = await sweep({ repository: repo() as never, enabled: true, credential: CREDENTIAL, clock: () => new Date(now) });
    expect(mocks.process).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ status: "deferred", code: "budget_insufficient", phase: "processing" });
    expect(summary.processing).toHaveLength(2);
  });

  it("the flag turned off mid-sweep stops before the next send", async () => {
    vi.stubEnv("JEV_OBSERVER_ENABLED", "true");
    mocks.collect.mockResolvedValue(collected());
    mocks.process.mockImplementation(async () => { vi.stubEnv("JEV_OBSERVER_ENABLED", "false"); return processed("completed"); });
    try {
      const { summary } = await sweep({ repository: repo() as never, credential: CREDENTIAL, clock: () => T0 });
      expect(summary.status).toBe("disabled");
      expect(mocks.process).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllEnvs(); }
  });

  it("collection failed still processes the queue of the selected workspace, on every sweep (no starvation)", async () => {
    mocks.collect.mockResolvedValue({ ...collected(), status: "failed", code: "collection_page_failed", consulted: 0, eligible: 0, unique: 0 });
    mocks.process.mockResolvedValue(processed("completed"));
    for (let round = 1; round <= 3; round += 1) {
      const { summary } = await sweep({ repository: repo() as never, enabled: true, credential: CREDENTIAL, clock: () => T0 });
      expect(summary.collection).toMatchObject({ status: "failed", code: "collection_page_failed", workspaceId: WORKSPACE });
      expect(summary.processing).toHaveLength(3);
      expect(mocks.process).toHaveBeenCalledTimes(3 * round);
    }
  });

  it("collection failed without a selected workspace processes nothing", async () => {
    mocks.collect.mockResolvedValue({ ...collected(), status: "failed", workspaceId: undefined });
    await sweep({ repository: repo() as never, enabled: true, credential: CREDENTIAL, clock: () => T0 });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("expiration is one workspace, one page of at most 100, and never cleans", async () => {
    const repository = repo({ listWorkspacesWithExpirableObservations: vi.fn(async () => ({ workspaceIds: [OTHER], nextCursor: OTHER })) });
    mocks.collect.mockResolvedValue({ ...collected(), status: "no_policy", workspaceId: undefined });
    const { summary } = await sweep({ repository: repository as never, enabled: true, credential: CREDENTIAL, clock: () => T0 });
    expect(repository.listWorkspacesWithExpirableObservations).toHaveBeenCalledTimes(1);
    expect(repository.listWorkspacesWithExpirableObservations.mock.calls[0][0].limit).toBe(1);
    expect(repository.expireObservations).toHaveBeenCalledTimes(1);
    expect(repository.expireObservations.mock.calls[0][0]).toMatchObject({ workspaceId: OTHER });
    expect(repository.expireObservations.mock.calls[0][0].limit).toBeLessThanOrEqual(100);
    expect(repository.cleanObservations).not.toHaveBeenCalled();
    expect(repository.cleanQuotaDays).not.toHaveBeenCalled();
    expect(summary.expiration).toMatchObject({ workspaceId: OTHER });
  });

  it("a failing database yields a safe failed summary: no throw, no raw message, no provider call", async () => {
    const boom = Object.assign(new Error(`connect failed ${SECRET} Bearer ${CREDENTIAL}`), { code: "08006" });
    const repository = repo({ listWorkspacesWithExpirableObservations: vi.fn(async () => { throw boom; }) });
    const fetchImpl = vi.fn();
    const { summary } = await sweep({ repository: repository as never, enabled: true, credential: CREDENTIAL, clock: () => T0, fetchImpl: fetchImpl as never });
    expect(summary).toMatchObject({ status: "failed", phase: "expiration", code: "db_unavailable" });
    expect(JSON.stringify(summary)).not.toMatch(/hunter2|postgres:|Bearer|controlled-credential/);
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a collector or processor that throws is contained with a safe code and the phase", async () => {
    mocks.collect.mockRejectedValueOnce(Object.assign(new Error(SECRET), { code: "57014" }));
    const first = await sweep({ repository: repo() as never, enabled: true, credential: CREDENTIAL, clock: () => T0 });
    expect(first.summary).toMatchObject({ status: "failed", phase: "collection", code: "db_statement_timeout" });
    mocks.collect.mockResolvedValue(collected());
    mocks.process.mockRejectedValueOnce(new Error(`${SECRET} headline: Segredo`));
    const second = await sweep({ repository: repo() as never, enabled: true, credential: CREDENTIAL, clock: () => T0 });
    expect(second.summary).toMatchObject({ status: "failed", phase: "processing", code: "persistence_failed" });
    expect(JSON.stringify([first.summary, second.summary])).not.toMatch(/hunter2|Segredo/);
  });

  it("what crosses the Inngest step is counts/ids/codes only", async () => {
    mocks.collect.mockResolvedValue(collected());
    mocks.process.mockResolvedValue(processed("completed"));
    const { summary } = await sweep({ repository: repo() as never, enabled: true, credential: CREDENTIAL, clock: () => T0 });
    expect(Object.keys(summary).sort()).toEqual(["collection", "expiration", "processing", "status"]);
    const forbidden = /snapshot|copy|headline|body|payload|response|decisions|probabilities|credential|authorization|bearer/i;
    const walk = (value: unknown, path: string): void => {
      if (value === null || ["number", "boolean"].includes(typeof value)) return;
      if (typeof value === "string") { expect(value, path).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/); return; }
      if (Array.isArray(value)) return value.forEach((item, i) => walk(item, `${path}[${i}]`));
      for (const [key, nested] of Object.entries(value as object)) { expect(key, path).not.toMatch(forbidden); walk(nested, `${path}.${key}`); }
    };
    walk(summary, "summary");
  });
});
