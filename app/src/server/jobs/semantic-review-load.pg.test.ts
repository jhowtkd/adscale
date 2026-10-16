/**
 * #472 — Jev observer off/on load harness (opt-in, local only; never run by CI).
 *
 *   JEV_LOAD_HARNESS=true \
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/server/jobs/semantic-review-load.pg.test.ts
 *
 * REAL `prepareCreativeWork` against real Postgres (global pool, shared with the observer — that is
 * the point). External models are controlled: copy generation and storage are mocks, the Jev HTTP is
 * a `fetchImpl` stub, global fetch is a sentinel. Every row is synthetic. Same synthetic load
 * (identical seeds, recreated per arm) for each arm. Result: one JSON line on stdout
 * (`JEV_LOAD_RESULT {...}`), also written to JEV_LOAD_OUT when set.
 *
 * Verdict is conservative: "inconclusive" (never masked as pass) when the sample is small or when
 * the off-vs-off spread (noise) exceeds the target; "fail" only on a measurable regression, any new
 * error or any change in generation/effect counts. Inconclusive blocks real enablement.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Pool } from "pg";

const ENABLED = process.env.JEV_LOAD_HARNESS === "true" && Boolean(process.env.TEST_DATABASE_URL);

const COPY_DELAY_MS = 15;
const SAMPLE_PER_ARM = Number(process.env.JEV_LOAD_SAMPLE ?? 30);
const CONCURRENCY = Number(process.env.JEV_LOAD_CONCURRENCY ?? 4);
const MIN_POOLED_SAMPLE = 200; // per condition; far above the default 60 on purpose: default runs are always inconclusive

const copyCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/server/storage", () => ({ objectStorage: { head: vi.fn(async () => ({ contentLength: 1024 })) } }));
vi.mock("@/server/creative-work/copy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/creative-work/copy")>();
  return {
    ...actual,
    generateSocialPostCopy: vi.fn(async () => {
      copyCalls.count += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { headline: "Titulo medido", body: "Corpo medido", cta: "Acao" };
    }),
  };
});
vi.mock("@/server/jobs/client", () => ({
  inngest: { createFunction: (opts: unknown, fn: unknown) => ({ opts, fn }) },
}));

// observer_off = flag off with the SAME policy + synthetic queue as observer_on (main baseline); no_observer = nothing seeded or swept (extra reference).
type ArmKind = "no_observer" | "observer_off" | "observer_on" | "observer_provider_unavailable";
type ArmResult = {
  kind: ArmKind;
  pair: number | null;
  samples: number;
  errors: number;
  outcomes: Record<string, number>;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  copyCalls: number;
  outputRows: number;
  attemptRows: number;
  jevQueue: { queued: number; markers: number; quotaAttempts: number; completed: number; outcomeUnknown: number; maxQueuedAgeMs: number };
  observer: { sweeps: number; sweepErrors: number; httpCalls: number; statuses: Record<string, number> };
  pool: { maxTotal: number; maxWaiting: number; minIdle: number; samples: number };
};
/** Raw per-arm durations: kept internal, stripped from the printed JSON; pooled percentiles use these. */
const rawDurations = new WeakMap<ArmResult, number[]>();

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};
const round = (value: number) => Math.round(value * 100) / 100;

describe.skipIf(!ENABLED)("semantic review observer — off/on preparation load harness", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any;
  let releaseClock: () => Promise<void>;
  let pool: Pool;
  const createdWorkspaces: string[] = [];
  const createdUsers: string[] = [];
  const globalFetch = vi.fn(() => { throw new Error("global_fetch_forbidden"); });

  beforeAll(async () => {
    const helpers = await import("../creative-work/semantic-review-collection.pg-helpers");
    const url = helpers.assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
    // The global `db` reads DATABASE_URL: it must be the very same throwaway database.
    if (process.env.DATABASE_URL !== url) throw new Error("DATABASE_URL must equal TEST_DATABASE_URL for the load harness");
    pool = new Pool({ connectionString: url, max: 2 }); // own pool: lock + clock, never competes with the app pool
    releaseClock = await helpers.claimHermeticClock(pool);
    const { db } = await import("@/server/db");
    const schema = await import("@/server/db/schema");
    const { prepareCreativeWork } = await import("@/server/application/prepare-creative-work");
    const { createSemanticReviewRepository } = await import("../creative-work/semantic-review-repository");
    const observerModule = await import("./semantic-review");
    ctx = { helpers, db, schema, prepareCreativeWork, createSemanticReviewRepository, observerModule };
    vi.stubGlobal("fetch", globalFetch);
  }, 120_000);

  afterAll(async () => {
    if (!ctx) return;
    try {
      const { db, schema } = ctx;
      if (createdWorkspaces.length) {
        await db.delete(schema.creativeWorkPreparationAttempts).where(inArray(schema.creativeWorkPreparationAttempts.workspaceId, createdWorkspaces));
        await db.delete(schema.creativeWorkSources).where(inArray(schema.creativeWorkSources.workspaceId, createdWorkspaces));
        await db.delete(schema.workspaces).where(inArray(schema.workspaces.id, createdWorkspaces));
        await db.delete(schema.user).where(inArray(schema.user.id, createdUsers));
      }
    } finally {
      vi.unstubAllGlobals();
      await releaseClock?.();
      await pool?.end();
    }
  }, 120_000);

  /** Same shape as tests/integration/creative-work-preparation-concurrency.test.ts#createWork. */
  async function seedPreparationLoad(arm: string, count: number) {
    const { db, schema } = ctx;
    const tag = `jev472load-${arm}-${randomUUID().slice(0, 8)}`;
    const userId = `user-${tag}`;
    await db.insert(schema.user).values({ id: userId, name: "Jev 472 load", email: `${tag}@example.com`, emailVerified: true });
    const [workspace] = await db.insert(schema.workspaces).values({ name: tag, slug: tag }).returning();
    const [profile] = await db.insert(schema.clientProfiles).values({ workspaceId: workspace.id, name: tag }).returning();
    createdUsers.push(userId);
    createdWorkspaces.push(workspace.id);
    const workIds: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const [work] = await db.insert(schema.creativeWorkItems).values({
        workspaceId: workspace.id, clientProfileId: profile.id, createdByUserId: userId, title: "Jev 472 load",
        request: "Anunciar a promocao de primavera da loja com desconto de 20%", toolKind: "variations", status: "draft",
        format: "4:5", settings: { targetFormats: [] },
      }).returning();
      const [asset] = await db.insert(schema.workspaceAssets).values({
        workspaceId: workspace.id, name: "base.png", key: `creative-work/${randomUUID()}/base.png`, type: "image/png", size: 2048, source: "upload",
      }).returning();
      await db.insert(schema.creativeWorkSources).values({
        workspaceId: workspace.id, workItemId: work.id, assetId: asset.id, usage: "both", usageConfirmed: true, status: "ready",
      });
      workIds.push(work.id);
    }
    return { workspaceId: workspace.id, workIds };
  }

  /** Observer-side synthetic scope: enabled policy + works the collector can turn into queued observations. */
  async function seedObserverLoad(works = 12) {
    const { helpers, db, createSemanticReviewRepository } = ctx;
    const { SEMANTIC_REVIEW_VERSIONS } = await import("../creative-work/semantic-review-repository");
    const scope = await helpers.createScope(db, 1);
    createdWorkspaces.push(scope.workspaceId);
    createdUsers.push(scope.userId);
    const repository = createSemanticReviewRepository(db);
    const policy = await repository.registerPolicy(
      helpers.policyInput(scope, SEMANTIC_REVIEW_VERSIONS as unknown as Record<string, string>) as never, helpers.T0);
    await repository.setPolicyEnabled({ workspaceId: scope.workspaceId, policyId: policy.id, enabled: true }, helpers.T0);
    await helpers.insertWorks(db, scope, works, { updatedAt: helpers.minutes(helpers.T0, 1) });
    return { scope, repository, policyId: policy.id };
  }

  async function jevBody() {
    const { SEMANTIC_MODEL, SEMANTIC_OPTIONS, SEMANTIC_QUESTIONS } = await import("../creative-work/semantic-review-offline");
    return {
      model: SEMANTIC_MODEL,
      answers: Object.fromEntries(SEMANTIC_QUESTIONS.map((question: string) => {
        const options = (SEMANTIC_OPTIONS as Record<string, readonly string[]>)[question];
        return [question, { type: "choice", choice: options[0], confidence: 0.9,
          probabilities: Object.fromEntries(options.map((option, index) => [option, index === 0 ? 1 : 0])) }];
      })),
      usage: { input_tokens: 120, output_tokens: 6 },
    };
  }

  async function runArm(kind: ArmKind, pair: number | null): Promise<ArmResult> {
    const { db, schema, prepareCreativeWork, observerModule, helpers } = ctx;
    const prep = await seedPreparationLoad(kind, SAMPLE_PER_ARM);
    const observed = kind === "no_observer" ? null : await seedObserverLoad();
    const body = await jevBody();
    let httpCalls = 0;
    const fetchImpl = (kind === "observer_provider_unavailable"
      ? vi.fn(async () => { httpCalls += 1; throw new Error("provider_unavailable"); })
      : vi.fn(async () => { httpCalls += 1; await new Promise((r) => setTimeout(r, 25)); return new Response(JSON.stringify(body), { status: 200 }); })) as unknown as typeof fetch;

    const started = performance.now();
    const clock = () => new Date(helpers.T0.getTime() + 10 * 60_000 + Math.round(performance.now() - started));
    const job = observed ? observerModule.createSemanticReviewObserverJob({
      repository: observed.repository, enabled: kind !== "observer_off", credential: "controlled-credential-472",
      clock, fetchImpl, diagnosticSink: () => {},
    }) : null;
    const step = { run: async (_name: string, fn: () => Promise<unknown>) => fn() };

    const appPool = (db as unknown as { $client: Pool }).$client;
    const poolStats = { maxTotal: 0, maxWaiting: 0, minIdle: Number.POSITIVE_INFINITY, samples: 0 };
    const sampler = setInterval(() => {
      poolStats.maxTotal = Math.max(poolStats.maxTotal, appPool.totalCount);
      poolStats.maxWaiting = Math.max(poolStats.maxWaiting, appPool.waitingCount);
      poolStats.minIdle = Math.min(poolStats.minIdle, appPool.idleCount);
      poolStats.samples += 1;
    }, 25);

    let stop = false;
    const observer = { sweeps: 0, sweepErrors: 0, httpCalls: 0, statuses: {} as Record<string, number> };
    const sweeps = (async () => {
      if (!job) return;
      while (!stop) {
        try {
          const summary = await (job as unknown as { fn: (a: unknown) => Promise<unknown> }).fn({ step }) as Record<string, unknown> | undefined;
          const status = String(summary?.status ?? "n/a");
          observer.statuses[status] = (observer.statuses[status] ?? 0) + 1;
        } catch { observer.sweepErrors += 1; }
        observer.sweeps += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    })();

    const durations: number[] = [];
    const outcomes: Record<string, number> = {};
    const copyBefore = copyCalls.count;
    const queue = [...prep.workIds];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const workItemId = queue.shift();
        if (!workItemId) return;
        const t0 = performance.now();
        let label: string;
        try {
          const result = await prepareCreativeWork({ workspaceId: prep.workspaceId, workItemId });
          label = result.ok ? "ok" : `error:${result.error.code}`;
        } catch (error) { label = `throw:${(error as Error).name}`; }
        durations.push(performance.now() - t0);
        outcomes[label] = (outcomes[label] ?? 0) + 1;
      }
    }));
    stop = true;
    await sweeps;
    clearInterval(sampler);
    observer.httpCalls = httpCalls;

    const outputRows = (await db.select({ id: schema.creativeWorkOutputs.id }).from(schema.creativeWorkOutputs)
      .where(eq(schema.creativeWorkOutputs.workspaceId, prep.workspaceId))).length;
    const attemptRows = (await db.select({ id: schema.creativeWorkPreparationAttempts.id }).from(schema.creativeWorkPreparationAttempts)
      .where(eq(schema.creativeWorkPreparationAttempts.workspaceId, prep.workspaceId))).length;
    const jev = { queued: 0, markers: 0, quotaAttempts: 0, completed: 0, outcomeUnknown: 0, maxQueuedAgeMs: 0 };
    if (observed) {
      const rows = await db.select().from(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.workspaceId, observed.scope.workspaceId));
      jev.queued = rows.filter((r: { state: string }) => r.state === "queued").length;
      jev.maxQueuedAgeMs = Math.max(0, ...rows.filter((r: { state: string }) => r.state === "queued").map((r: { createdAt: Date }) => clock().getTime() - r.createdAt.getTime()));
      jev.completed = rows.filter((r: { state: string }) => r.state === "completed").length;
      jev.outcomeUnknown = rows.filter((r: { state: string }) => r.state === "outcome_unknown").length;
      jev.markers = rows.filter((r: { sendStartedAt: Date | null }) => r.sendStartedAt !== null).length;
      const quota = await db.select().from(schema.semanticReviewQuotaDays).where(eq(schema.semanticReviewQuotaDays.workspaceId, observed.scope.workspaceId));
      jev.quotaAttempts = quota.reduce((sum: number, q: { attempts: number }) => sum + q.attempts, 0);
      // The next arm must not share a policy/queue with this one.
      await db.delete(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.workspaceId, observed.scope.workspaceId));
    }
    expect(globalFetch).not.toHaveBeenCalled();
    const result: ArmResult = {
      kind, pair, samples: durations.length,
      errors: Object.entries(outcomes).filter(([k]) => k !== "ok").reduce((s, [, n]) => s + n, 0), outcomes,
      p50Ms: round(percentile(durations, 0.5)), p95Ms: round(percentile(durations, 0.95)), maxMs: round(Math.max(...durations)),
      copyCalls: copyCalls.count - copyBefore, outputRows, attemptRows, jevQueue: jev, observer,
      pool: { maxTotal: poolStats.maxTotal, maxWaiting: poolStats.maxWaiting, minIdle: Number.isFinite(poolStats.minIdle) ? poolStats.minIdle : 0, samples: poolStats.samples },
    };
    rawDurations.set(result, durations);
    return result;
  }

  it("compares preparation p95, errors and generation effects with the observer off, on and provider-unavailable", async () => {
    // Alternating order cancels warm-up/drift: pair 1 off→on, pair 2 on→off; then the two reference/safety arms.
    const plan: Array<[ArmKind, number | null]> = [
      ["observer_off", 1], ["observer_on", 1], ["observer_on", 2], ["observer_off", 2],
      ["no_observer", null], ["observer_provider_unavailable", null],
    ];
    const arms: ArmResult[] = [];
    for (const [kind, pair] of plan) arms.push(await runArm(kind, pair));

    const of = (kind: ArmKind) => arms.filter((a) => a.kind === kind);
    const offs = of("observer_off");
    const ons = of("observer_on");
    const pooledDurations = (kind: ArmKind) => of(kind).flatMap((a) => rawDurations.get(a) ?? []);
    // True pooled percentile over the concatenated raw samples (never a mean of per-arm p95s).
    const pooledP95 = (kind: ArmKind) => round(percentile(pooledDurations(kind), 0.95));
    const baselineP95 = pooledP95("observer_off");
    const onP95 = pooledP95("observer_on");
    const targetMs = round(Math.max(50, 0.05 * baselineP95));
    const deltaMs = round(onP95 - baselineP95);
    const noiseMs = offs.length > 1 ? round(Math.abs(offs[0].p95Ms - offs[1].p95Ms)) : null;
    const limitations: string[] = [
      `sample per arm ${SAMPLE_PER_ARM}, concurrency ${CONCURRENCY}, pooled ${pooledDurations("observer_off").length}/${pooledDurations("observer_on").length} per condition (minimum for a conclusive verdict: ${MIN_POOLED_SAMPLE})`,
      `copy model stubbed (${COPY_DELAY_MS} ms), Jev HTTP stubbed (25 ms); local Postgres, single process, other processes/builds add noise`,
      "p95 of ~30 samples is the 2nd-highest value: highly noise-sensitive",
      "app pool max 10 shared by preparation and observer; sweep every ~100 ms, far denser than the 5-minute cron",
      "a within-target result is NOT enablement evidence: real enablement still needs authorization, production-like pool/load and a human decision",
    ];

    const expectedOk = SAMPLE_PER_ARM;
    const healthy = (a: ArmResult) => a.errors === 0 && a.outcomes.ok === expectedOk && a.copyCalls === expectedOk && a.attemptRows === expectedOk && a.outputRows === 0;
    const baselineHealthy = [...offs, ...of("no_observer")].every(healthy);
    const effectsEqual = arms.every((a) => a.copyCalls === offs[0].copyCalls && a.outputRows === offs[0].outputRows
      && a.attemptRows === offs[0].attemptRows && JSON.stringify(a.outcomes) === JSON.stringify(offs[0].outcomes));
    const newErrors = arms.filter((a) => a.kind !== "observer_off" && a.kind !== "no_observer").reduce((s, a) => s + a.errors, 0);
    let verdict: "fail" | "inconclusive" | "within_target";
    const reasons: string[] = [];
    if (!baselineHealthy) { verdict = "fail"; reasons.push("baseline arms are not healthy (errors or unexpected preparation/copy/attempt counts)"); }
    else if (newErrors > 0 || !effectsEqual) { verdict = "fail"; reasons.push("new errors or changed returns/effects/generation-call counts"); }
    else if (pooledDurations("observer_off").length < MIN_POOLED_SAMPLE || pooledDurations("observer_on").length < MIN_POOLED_SAMPLE) { verdict = "inconclusive"; reasons.push("pooled sample too small"); }
    else if (deltaMs > targetMs) { verdict = noiseMs !== null && noiseMs > targetMs ? "inconclusive" : "fail"; reasons.push(noiseMs !== null && noiseMs > targetMs ? "delta above target but off-vs-off noise exceeds target" : "p95 increase above target"); }
    else if (noiseMs !== null && noiseMs > targetMs) { verdict = "inconclusive"; reasons.push("off-vs-off noise exceeds target; delta within target cannot be trusted"); }
    else if (!ons.some((a) => a.observer.httpCalls > 0)) { verdict = "inconclusive"; reasons.push("observer never sent: load not exercised"); }
    else verdict = "within_target";

    const result = { harness: "jev-472-load", verdict, enablementEvidence: false, reasons, pooledP95: true, targetMs, deltaMs, noiseMs,
      baselineP95Ms: baselineP95, observerOnP95Ms: onP95, concurrency: CONCURRENCY, samplePerArm: SAMPLE_PER_ARM, limitations, arms };
    const line = JSON.stringify(result);
    process.stdout.write(`JEV_LOAD_RESULT ${line}\n`);
    if (process.env.JEV_LOAD_OUT) writeFileSync(process.env.JEV_LOAD_OUT, JSON.stringify(result, null, 2));

    // Hard invariants, independent of the latency verdict.
    expect(baselineHealthy).toBe(true);
    expect(newErrors).toBe(0);
    expect(effectsEqual).toBe(true);
    expect(offs.every((a) => a.observer.httpCalls === 0 && a.jevQueue.markers === 0)).toBe(true);
    expect(ons.every((a) => a.jevQueue.markers <= 3 * a.observer.sweeps)).toBe(true);
    expect(verdict).not.toBe("fail");
    // Silence unused-import lint for helpers kept for readability.
    void and; void sql;
  }, 1_200_000);
});
