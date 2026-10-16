/**
 * #471 — blind export reconstruction and end-to-end evaluation, against real PostgreSQL.
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/server/creative-work/semantic-review-export.pg.test.ts
 *
 * Absent TEST_DATABASE_URL skips the suite (a skip is NOT evidence). All rows are synthetic;
 * the "human" judgments are test fixtures (referenceKind synthetic_fixture), never real evidence.
 * Shares the #468 advisory lock + isolated future clock.
 */
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { SEMANTIC_REVIEW_VERSIONS, createSemanticReviewRepository } from "./semantic-review-repository";
import { collectSemanticReview } from "./semantic-review-collector";
import { processSemanticReviewObservation } from "./semantic-review-processor";
import { createSemanticReviewExportRepository } from "./semantic-review-export-repository";
import { judgmentSchema, LABEL_VERSIONS, semanticDigest } from "./semantic-review-evaluation";
import { SEMANTIC_MODEL, SEMANTIC_OPTIONS, SEMANTIC_QUESTIONS, type SemanticDecisions } from "./semantic-review-offline";
import { exportSemanticReviewCases, importSemanticReviewJudgment, writeSemanticEvaluationReport } from "../../../scripts/jev-evaluate";
import {
  T0, assertSafeTestDatabaseUrl, claimHermeticClock, createScope, deleteScopes, insertWorks, minutes, openTestDatabase,
  policyInput, type Scope, type TestDb,
} from "./semantic-review-collection.pg-helpers";

const URL_UNDER_TEST = process.env.TEST_DATABASE_URL;
const versions = SEMANTIC_REVIEW_VERSIONS as unknown as Record<string, string>;
const CREDENTIAL = "controlled-credential-471";

const CLEAR: SemanticDecisions = {
  briefing_claims: "supported", headline_claims: "supported", body_claims: "supported", cta_claims: "supported",
  intent_alignment: "aligned", prohibited_claims: "compliant",
};
const ALERT: SemanticDecisions = { ...CLEAR, body_claims: "unsupported" };

function jevBody(decisions: SemanticDecisions) {
  return {
    model: SEMANTIC_MODEL,
    answers: Object.fromEntries(SEMANTIC_QUESTIONS.map((question) => {
      const options = SEMANTIC_OPTIONS[question] as readonly string[];
      const choice = decisions[question];
      return [question, { type: "choice", choice, confidence: 0.9, probabilities: Object.fromEntries(options.map((option) => [option, option === choice ? 1 : 0])) }];
    })),
    usage: { input_tokens: 120, output_tokens: 6 },
  };
}

const CLOCK = new Date();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(CLOCK.getTime() + ms);

describe.skipIf(!URL_UNDER_TEST)("blind export and evaluation (PostgreSQL)", () => {
  let db: TestDb;
  let pool: Pool;
  let releaseClock: () => Promise<void>;
  let repository: ReturnType<typeof createSemanticReviewRepository>;
  let exporter: ReturnType<typeof createSemanticReviewExportRepository>;
  const scopes: Scope[] = [];
  const dirs: string[] = [];
  const globalFetch = vi.fn(() => { throw new Error("global_fetch_forbidden"); });
  const NOW = () => minutes(T0, 10);

  const scope = async (brands = 1) => { const s = await createScope(db, brands); scopes.push(s); return s; };
  const outDir = () => { const root = realpathSync(mkdtempSync(join(tmpdir(), "jev471pg-"))); dirs.push(root); return join(root, "run"); };

  /** Enabled synthetic policy + one work per headline + real collection → observation ids in the headline order. */
  async function seed(s: Scope, headlines: string[], brandIndexes: number[] = headlines.map(() => 0)) {
    const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
    await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
    const workIds: string[] = [];
    for (const [i, headline] of headlines.entries()) {
      const [id] = await insertWorks(db, s, 1, { updatedAt: minutes(T0, 1), headline, brandIndex: brandIndexes[i] });
      workIds.push(id);
    }
    for (let i = 0; i < 6; i += 1) {
      const summary = await collectSemanticReview({ repository, enabled: true, now: minutes(T0, 5 + i) });
      if (summary.status !== "collected" || summary.windowComplete) break;
    }
    const observations = await db.select().from(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.workspaceId, s.workspaceId));
    const observationIds = workIds.map((workId) => observations.find((row) => row.workItemId === workId)!.id);
    expect(observationIds).toHaveLength(headlines.length);
    return { policy, workIds, observationIds };
  }
  const complete = (s: Scope, observationId: string, decisions: SemanticDecisions) => processSemanticReviewObservation({
    repository, workspaceId: s.workspaceId, observationId, enabled: true, credential: CREDENTIAL, clock: NOW,
    fetchImpl: vi.fn(async () => new Response(JSON.stringify(jevBody(decisions)), { status: 200 })) as unknown as typeof fetch,
  } as never);

  const planFor = (s: Scope, observationIds: string[], split: (i: number) => "calibration" | "holdout" = (i) => (i % 2 ? "calibration" : "holdout")) => ({
    version: 1 as const, workspaceId: s.workspaceId, selectedAt: at(-2 * DAY).toISOString(), selectedBy: "synthetic-selector", selectedBeforeResults: true as const,
    entries: observationIds.map((reviewId, i) => ({ reviewId, familyId: `family-secret-${i}`, split: split(i), primary: true })),
  });
  const authFor = (s: Scope, plan: ReturnType<typeof planFor>, over: Record<string, unknown> = {}) => ({
    reference: "https://example.com/approvals/blind-export-471", authorizedBy: "synthetic-owner", approvedAt: at(-HOUR).toISOString(), expiresAt: at(7 * DAY).toISOString(),
    purpose: "blind_semantic_review_export", workspaceId: s.workspaceId, clientProfileIds: [...s.brandIds], reviewIds: plan.entries.map((e) => e.reviewId),
    planHash: semanticDigest(plan), ...over,
  });
  const exportRun = (s: Scope, plan: ReturnType<typeof planFor>, dir: string, over: Record<string, unknown> = {}) =>
    exportSemanticReviewCases({ repository: exporter as never, authorization: authFor(s, plan, over), plan, outputDir: dir, evaluationRoot: dirname(dir), clock: () => CLOCK });
  const reconstructFor = (s: Scope, observationIds: string[], over: Record<string, unknown> = {}) => {
    const plan = planFor(s, observationIds);
    return exporter.reconstruct({ authorization: authFor(s, plan, over), plan, now: CLOCK });
  };
  type BlindCase = { caseId: string; familyId: string; caseHash: string };
  type MapRow = { reviewId: string; caseId: string; familyId: string; available: boolean; baselineAlert: boolean | null; httpElapsedMs: number | null };
  type PrivateJson = { collectionHistoryComplete?: boolean; exportId: string; planHash: string; blindHash: string; cases: BlindCase[]; rows: MapRow[]; collectionRuns: unknown[]; provenance: Record<string, unknown> };
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as PrivateJson;

  /** Reviewer files are produced from blind.json only. */
  function judge(dir: string, kind: "review" | "adjudication", reviewerId: string, labels: Record<number, { d: SemanticDecisions; ambiguous?: boolean }>, entries: Array<{ reviewId: string }>, resolves?: unknown[]) {
    const blind = json(join(dir, "blind.json")), map = json(join(dir, "private-map.json"));
    const cases = Object.entries(labels).map(([index, label]) => {
      const row = map.rows.find((r: MapRow) => r.reviewId === entries[Number(index)].reviewId);
      const c = blind.cases.find((x: BlindCase) => x.caseId === row.caseId);
      return { caseId: c.caseId, familyId: c.familyId, caseHash: c.caseHash, versions: LABEL_VERSIONS, labels: label.d, ambiguous: label.ambiguous ?? false };
    });
    return {
      version: 1, kind, exportId: blind.exportId, planHash: blind.planHash, blindHash: map.blindHash, reviewerId,
      createdAt: at(kind === "review" ? HOUR : 2 * HOUR).toISOString(), referenceKind: "synthetic_fixture", cases,
      ...(resolves ? { resolves: resolves.map((r) => semanticDigest(judgmentSchema.parse(r))) } : {}),
    };
  }

  const snapshot = async (s: Scope) => JSON.stringify({
    works: await db.select().from(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.workspaceId, s.workspaceId)).orderBy(schema.creativeWorkItems.id),
    observations: await db.select().from(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.workspaceId, s.workspaceId)).orderBy(schema.semanticReviewObservations.id),
    policies: await db.select().from(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.workspaceId, s.workspaceId)),
    runs: await db.select().from(schema.semanticReviewCollectionRuns).where(eq(schema.semanticReviewCollectionRuns.workspaceId, s.workspaceId)).orderBy(schema.semanticReviewCollectionRuns.id),
    quota: await db.select().from(schema.semanticReviewQuotaDays).where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId)),
  });

  beforeAll(async () => {
    ({ db, pool } = await openTestDatabase(assertSafeTestDatabaseUrl(URL_UNDER_TEST)));
    releaseClock = await claimHermeticClock(pool);
    repository = createSemanticReviewRepository(db);
    exporter = createSemanticReviewExportRepository(db);
  }, 120_000);
  beforeEach(() => {
    globalFetch.mockClear();
    vi.stubGlobal("fetch", globalFetch);
  });
  afterEach(async () => {
    if (scopes.length) {
      await db.delete(schema.semanticReviewPolicies).where(inArray(schema.semanticReviewPolicies.workspaceId, scopes.map((s) => s.workspaceId)));
    }
    vi.unstubAllGlobals();
    expect(globalFetch).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    if (!db) return;
    try { await deleteScopes(db, scopes); } finally { await releaseClock?.(); await pool.end(); }
  });

  it("exports, imports two judgments with an adjudication and reports a known matrix from persisted rows", async () => {
    const s = await scope(2);
    const headlines = ["Headline A 471", "Headline B 471", "Headline C 471", "Headline D 471", "Headline E 471", "Headline F 471"];
    const { observationIds, workIds, policy } = await seed(s, headlines, [0, 0, 1, 1, 0, 1]);
    // A TP, B TN, C FP, D FN, E never sent (queued), F edited after observation.
    await complete(s, observationIds[0], ALERT);
    await complete(s, observationIds[1], CLEAR);
    await complete(s, observationIds[2], ALERT);
    await complete(s, observationIds[3], CLEAR);
    const [work] = await db.select().from(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.id, workIds[5]));
    await db.update(schema.creativeWorkItems).set({ copy: { ...work.copy!, headline: "Edited after observation 471" }, updatedAt: minutes(T0, 20) }).where(eq(schema.creativeWorkItems.id, workIds[5]));
    const before = await snapshot(s);

    const plan = planFor(s, observationIds);
    const dir = outDir();
    const summary = await exportRun(s, plan, dir);
    expect(summary).toMatchObject({ selected: 6, exported: 5, unavailable: 1 });
    expect(await snapshot(s)).toBe(before);                      // read-only: no business, observation or policy mutation

    const blindText = readFileSync(join(dir, "blind.json"), "utf8");
    const mapText = readFileSync(join(dir, "private-map.json"), "utf8");
    for (const secret of [s.workspaceId, ...s.brandIds, policy.id, ...workIds, ...observationIds, "family-secret", "Edited after observation"]) expect(blindText).not.toContain(secret);
    expect(blindText.toLowerCase()).not.toContain('"confidence"');
    expect(blindText).not.toContain("semanticHash");
    expect(blindText).not.toContain((json(join(dir, "private-map.json")) as unknown as { blindingSeed: string }).blindingSeed);
    expect(blindText).toContain("Headline A 471");
    expect(mapText).not.toContain("Headline A 471");
    for (const forbidden of ["jev-1", "single_shadow", "typesafe", "probabilit", "baseline", "httpElapsed", "returnedModel"]) expect(blindText.toLowerCase()).not.toContain(forbidden.toLowerCase());

    const map = json(join(dir, "private-map.json"));
    const rowOf = (i: number) => map.rows.find((r: MapRow) => r.reviewId === observationIds[i]);
    expect(rowOf(5)).toMatchObject({ available: false, unavailableReason: "hash_mismatch" });
    expect(rowOf(4)).toMatchObject({ available: true, state: "queued", sendStartedAt: null, httpElapsedMs: null, decisions: null });
    expect(rowOf(0)).toMatchObject({ available: true, state: "completed", dataOrigin: "synthetic" });
    expect(typeof rowOf(0).baselineAlert).toBe("boolean");
    expect(typeof rowOf(0).httpElapsedMs).toBe("number");        // measured, not self-declared
    expect(rowOf(0).httpElapsedMs).toBeGreaterThanOrEqual(0);
    const dbRuns = await db.select().from(schema.semanticReviewCollectionRuns).where(eq(schema.semanticReviewCollectionRuns.workspaceId, s.workspaceId));
    expect(dbRuns.length).toBeGreaterThan(0);
    expect(map.collectionRuns).toHaveLength(dbRuns.length);
    expect((map.collectionRuns as Array<{ initialPage: boolean }>)[0].initialPage).toBe(true);

    const ana = judge(dir, "review", "Ana", { 0: { d: ALERT }, 1: { d: CLEAR }, 2: { d: CLEAR }, 3: { d: ALERT }, 4: { d: CLEAR } }, plan.entries);
    const bia = judge(dir, "review", "bia ", { 0: { d: ALERT }, 1: { d: CLEAR }, 2: { d: CLEAR }, 3: { d: CLEAR }, 4: { d: CLEAR } }, plan.entries);
    const carla = judge(dir, "adjudication", "carla", { 3: { d: ALERT } }, plan.entries, [ana, bia]);
    for (const j of [ana, bia, carla]) importSemanticReviewJudgment({ directory: dir, judgment: j, now: at(3 * HOUR) });
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: ana, now: at(3 * HOUR) })).toThrow();

    const { report } = writeSemanticEvaluationReport({ directory: dir, now: at(DAY) });
    const cohort = report.cohorts.find((c) => c.dataOrigin === "synthetic")!;
    expect(report.cohorts).toHaveLength(1);
    expect(report.humanReference).toBe("synthetic_or_not_collected");
    expect(report).toMatchObject({ selected: 6, recoverable: 5, unavailable: 1 });
    expect(cohort.metrics.counts).toMatchObject({ tp: 1, fp: 1, tn: 1, fn: 1, clearHuman: 5, validClearHuman: 4, missingCandidate: 1 });
    expect(cohort.metrics.precision).toMatchObject({ numerator: 1, denominator: 2 });
    expect(cohort.metrics.falseAlert).toMatchObject({ numerator: 1, denominator: 2 });
    expect(cohort.counts).toMatchObject({ sendsStarted: 4, validResponses: 4, recoverable: 5, clearLabels: 5 });
    expect(cohort.counts.referenceStates).toMatchObject({ clear: 5, unavailable: 1 });
    expect(cohort.httpElapsedMs.count).toBe(4);
    expect(cohort.usage).toMatchObject({ reported: 4, missing: 0, totals: { input_tokens: 480, output_tokens: 24 } });
    expect(cohort.cost).toBeNull();
    expect(Object.keys(cohort.byBrand).sort()).toEqual([...s.brandIds].sort());
    expect(cohort.byBrand[s.brandIds[0]].counts.selected).toBe(3);
    expect(cohort.byBrand[s.brandIds[1]].metrics.counts).toMatchObject({ fp: 1, fn: 1 });
    expect(cohort.splits.calibration.counts.selected + cohort.splits.holdout.counts.selected).toBe(6);
    const sum = (key: "consulted" | "unique" | "duplicates") => dbRuns.reduce((n, r) => n + r[key], 0);
    const processing = (report as unknown as { processing: { scope: string; coverageComplete: boolean; retainedObservations: number; counts: Record<string, number>; validResponseRate: { numerator: number; denominator: number } | null; knownValidResponseRate: { numerator: number; denominator: number } } }).processing;
    expect(processing).toMatchObject({ scope: "all_surviving_observations_of_selected_policies", retainedObservations: 6 });
    expect(processing.counts).toMatchObject({ sendsStarted: 4, validResponses: 4, queued: 2 });
    expect(processing.knownValidResponseRate).toMatchObject({ numerator: 4, denominator: 4 });
    const reconciles = map.collectionHistoryComplete === true && sum("unique") === 6;
    expect(processing.coverageComplete).toBe(reconciles);
    expect(processing.validResponseRate === null).toBe(!reconciles);
    expect(report.reconstructionRate).toMatchObject({ numerator: 5, denominator: 6 });
    expect(report.reconstructionBySplit.calibration.denominator + report.reconstructionBySplit.holdout.denominator).toBe(6);
    expect(report.collection).toMatchObject({ consulted: sum("consulted"), unique: sum("unique"), duplicates: sum("duplicates"), failedPages: dbRuns.filter((r) => r.status === "failed").length });
    expect(await snapshot(s)).toBe(before);
  }, 120_000);

  describe("reconstruction scope", () => {
    it("treats other-workspace and nonexistent review ids identically and never reveals foreign data", async () => {
      const a = await scope(), b = await scope();
      const seedA = await seed(a, ["Headline A scope"]);
      const seedB = await seed(b, ["Headline B scope secret"]);
      const missing = randomUUID();
      const result = await reconstructFor(a, [seedA.observationIds[0], seedB.observationIds[0], missing]);
      const [own, foreign, absent] = result.records;
      expect(own.projected).not.toBeNull();
      expect(foreign).toEqual({ ...absent, reviewId: seedB.observationIds[0] });
      expect(foreign).toMatchObject({ observation: null, policy: null, projected: null, unavailableReason: "observation_unavailable" });
      expect(JSON.stringify(result)).not.toContain("Headline B scope secret");
      expect(JSON.stringify(result)).not.toContain(b.workspaceId);
      // Using the other workspace's own scope does not reach workspace A's observation either.
      const reverse = await reconstructFor(b, [seedA.observationIds[0]]);
      expect(reverse.records[0]).toMatchObject({ observation: null, projected: null, unavailableReason: "observation_unavailable" });
      expect(result.collectionRuns.every((run) => run.workspaceId === a.workspaceId)).toBe(true);
    });

    it("denies an observation of a brand outside the authorized list, and exports nothing for it", async () => {
      const s = await scope(2);
      const { observationIds } = await seed(s, ["Headline brand 0", "Headline brand 1"], [0, 1]);
      await expect(reconstructFor(s, observationIds, { clientProfileIds: [s.brandIds[0]] })).rejects.toThrow("export_scope_denied");
      const plan = planFor(s, observationIds);
      const dir = outDir();
      await expect(exportRun(s, plan, dir, { clientProfileIds: [s.brandIds[0]] })).rejects.toThrow("export_scope_denied");
      expect(existsSync(dir)).toBe(false);
    });

    it("refuses to reconstruct without a valid approval bound to the plan, before reading anything", async () => {
      const s = await scope();
      const { observationIds } = await seed(s, ["Headline approval"]);
      const plan = planFor(s, observationIds);
      const reconstruct = (authorization: unknown, over: { plan?: unknown } = {}) => exporter.reconstruct({ authorization, plan: over.plan ?? plan, now: CLOCK });
      const queries = vi.spyOn(db, "transaction");
      await expect(reconstruct(undefined)).rejects.toThrow();
      await expect(reconstruct(null)).rejects.toThrow();
      await expect(reconstruct({})).rejects.toThrow();
      for (const over of [
        { expiresAt: at(-DAY).toISOString(), approvedAt: at(-3 * DAY).toISOString() }, { approvedAt: at(HOUR).toISOString() }, { planHash: "f".repeat(64) },
        { workspaceId: randomUUID() }, { reviewIds: [randomUUID()] }, { reviewIds: [...plan.entries.map((e) => e.reviewId), randomUUID()] },
        { purpose: "prepared_work_semantic_review" }, { clientProfileIds: [] },
      ]) await expect(reconstruct(authFor(s, plan, over))).rejects.toThrow();
      await expect(reconstruct(authFor(s, plan), { plan: { ...plan, entries: [] } })).rejects.toThrow();
      expect(queries).not.toHaveBeenCalled();
      await expect(reconstruct(authFor(s, plan))).resolves.toMatchObject({ records: [expect.objectContaining({ reviewId: observationIds[0] })] });
    });

    it("refuses an expired approval with the real repository before any data is read or written", async () => {
      const s = await scope();
      const { observationIds } = await seed(s, ["Headline expired"]);
      const plan = planFor(s, observationIds);
      const dir = outDir();
      const spy = vi.spyOn(exporter, "reconstruct");
      await expect(exportRun(s, plan, dir, { approvedAt: at(-3 * DAY).toISOString(), expiresAt: at(-DAY).toISOString() })).rejects.toThrow("invalid_export_authorization");
      expect(spy).not.toHaveBeenCalled();
      expect(existsSync(dir)).toBe(false);
    });
  });

  describe("unavailable evidence is counted, never fabricated", () => {
    it("reports edited, deleted, stale-snapshot and version-mismatched inputs as unavailable with the right reason", async () => {
      const s = await scope();
      const { observationIds, workIds } = await seed(s, ["Headline ok", "Headline edited", "Headline deleted", "Headline stale", "Headline version"]);
      for (const id of observationIds) await complete(s, id, CLEAR);
      const [edited] = await db.select().from(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.id, workIds[1]));
      await db.update(schema.creativeWorkItems).set({ copy: { ...edited.copy!, body: "Body edited later 471" }, updatedAt: minutes(T0, 30) }).where(eq(schema.creativeWorkItems.id, workIds[1]));
      await db.delete(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.id, workIds[2]));
      const [stale] = await db.select().from(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.id, workIds[3]));
      await db.update(schema.creativeWorkItems).set({ inputSnapshot: { ...(stale.inputSnapshot as object), request: "older request 471" } as never, updatedAt: minutes(T0, 30) }).where(eq(schema.creativeWorkItems.id, workIds[3]));
      await db.update(schema.semanticReviewObservations).set({ rubricVersion: "brief_copy_v0" }).where(eq(schema.semanticReviewObservations.id, observationIds[4]));

      const { records } = await reconstructFor(s, observationIds);
      expect(records.map((r) => r.unavailableReason)).toEqual([null, "hash_mismatch", "observation_unavailable", "context_unavailable", "version_mismatch"]);
      expect(records.map((r) => r.projected === null)).toEqual([false, true, true, true, true]);

      const plan = planFor(s, observationIds);
      const dir = outDir();
      expect(await exportRun(s, plan, dir)).toMatchObject({ selected: 5, exported: 1, unavailable: 4 });
      expect(json(join(dir, "blind.json")).cases).toHaveLength(1);
      const { report } = writeSemanticEvaluationReport({ directory: dir, now: at(DAY) });
      expect(report).toMatchObject({ selected: 5, recoverable: 1, unavailable: 4 });
      for (const text of [readFileSync(join(dir, "blind.json"), "utf8"), readFileSync(join(dir, "private-map.json"), "utf8")]) {
        expect(text).not.toContain("Body edited later 471");
        expect(text).not.toContain("older request 471");
      }
      expect(readdirSync(dir).filter((f) => f.startsWith("judgment-"))).toEqual([]);
    });
  });

  describe("processing coverage", () => {
    it("withholds the valid-response rate once surviving observations no longer reconcile with the persisted collection history", async () => {
      const s = await scope();
      const { observationIds } = await seed(s, ["Headline kept 471", "Headline lost 471"]);
      await complete(s, observationIds[0], CLEAR);
      await complete(s, observationIds[1], CLEAR);
      const plan = planFor(s, [observationIds[0]]);
      const intact = outDir();
      await exportRun(s, plan, intact);
      const before = writeSemanticEvaluationReport({ directory: intact, now: at(DAY) }).report as unknown as { processing: { retainedObservations: number; coverageComplete: boolean; validResponseRate: unknown } };
      expect(before.processing.retainedObservations).toBe(2);
      // Retention removes one observation: the collection history still says two were created.
      await db.delete(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.id, observationIds[1]));
      const lostPlan = { ...planFor(s, [observationIds[0]]), selectedBy: "synthetic-selector-2" };
      const lost = outDir();
      await exportRun(s, lostPlan, lost, { reference: "https://example.com/approvals/blind-export-471-b" });
      const after = writeSemanticEvaluationReport({ directory: lost, now: at(DAY) }).report as unknown as { processing: { retainedObservations: number; coverageComplete: boolean; validResponseRate: unknown; knownValidResponseRate: { numerator: number; denominator: number } } };
      expect(after.processing.retainedObservations).toBe(1);
      expect(after.processing.coverageComplete).toBe(false);
      expect(after.processing.validResponseRate).toBeNull();
      expect(after.processing.knownValidResponseRate).toMatchObject({ numerator: 1, denominator: 1 });
    });
  });

  describe("read-only guarantees", () => {
    it("does not take business locks: a held row lock on the work does not block reconstruction", async () => {
      const s = await scope();
      const { observationIds, workIds } = await seed(s, ["Headline lock"]);
      await complete(s, observationIds[0], CLEAR);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select 1 from adscale_app.creative_work_items where id = $1 for update", [workIds[0]]);
        await client.query("select 1 from adscale_app.semantic_review_observations where id = $1 for update", [observationIds[0]]);
        const result = await Promise.race([
          reconstructFor(s, observationIds),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("reconstruction_blocked")), 4_000)),
        ]);
        expect(result.records[0].projected).not.toBeNull();
      } finally { await client.query("rollback"); client.release(); }
    });

    it("cannot write: the reconstruction transaction is read only", async () => {
      const s = await scope();
      const { observationIds } = await seed(s, ["Headline readonly"]);
      const before = await snapshot(s);
      const writing = createSemanticReviewExportRepository({
        transaction: (fn: (tx: TestDb) => Promise<unknown>, config: unknown) => (db as unknown as { transaction: (run: (tx: TestDb) => Promise<unknown>, options: unknown) => Promise<unknown> }).transaction(async (tx) => {
          const result = fn(tx);
          await expect(tx.update(schema.semanticReviewObservations).set({ errorCode: "tampered" })
            .where(eq(schema.semanticReviewObservations.id, observationIds[0]))).rejects.toThrow();
          return result;
        }, config),
      } as never);
      const writePlan = planFor(s, observationIds);
      await writing.reconstruct({ authorization: authFor(s, writePlan), plan: writePlan, now: CLOCK }).catch(() => undefined);
      expect(await snapshot(s)).toBe(before);
    });
  });

  describe("measured telemetry persisted by the pipeline", () => {
    it("keeps http elapsed null/absent without a send and a measured number after one", async () => {
      const s = await scope();
      const { observationIds } = await seed(s, ["Headline sent", "Headline not sent"]);
      await complete(s, observationIds[0], CLEAR);
      const rows = await db.select().from(schema.semanticReviewObservations).where(and(eq(schema.semanticReviewObservations.workspaceId, s.workspaceId)));
      const sent = rows.find((r) => r.id === observationIds[0])!, queued = rows.find((r) => r.id === observationIds[1])!;
      expect(typeof sent.httpElapsedMs).toBe("number");
      expect(sent.httpElapsedMs).toBeGreaterThanOrEqual(0);
      expect(queued.httpElapsedMs).toBeNull();
      expect(queued.sendStartedAt).toBeNull();
      const { records } = await reconstructFor(s, observationIds);
      expect(records[0].observation!.httpElapsedMs).toBe(sent.httpElapsedMs);
      expect(records[1].observation!.httpElapsedMs).toBeNull();
    });

    it("persists collection page counters that satisfy the funnel identities", async () => {
      const s = await scope();
      await seed(s, ["Headline funnel 1", "Headline funnel 2"]);
      const runs = await db.select().from(schema.semanticReviewCollectionRuns).where(eq(schema.semanticReviewCollectionRuns.workspaceId, s.workspaceId));
      expect(runs.length).toBeGreaterThan(0);
      for (const run of runs) {
        expect(run.consulted).toBe(run.eligible + run.outOfScope + run.invalid);
        expect(run.eligible).toBe(run.unique + run.duplicates + run.notSampled);
        expect(run.status === "failed").toBe(run.errorCode === "collection_page_failed");
      }
      expect(runs.reduce((n, r) => n + r.unique, 0)).toBeGreaterThanOrEqual(2);
    });
  });
});

void sql;
