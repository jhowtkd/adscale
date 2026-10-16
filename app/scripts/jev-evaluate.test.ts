/**
 * #471 — private blind export / judgment import / report. Filesystem + CLI behaviour with a fake read-only
 * repository (no database, no network). Everything is synthetic fixture data.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { workRow } from "../src/server/creative-work/semantic-review-collection.pg-helpers";
import { EVALUATION_VERSIONS, judgmentSchema, LABEL_VERSIONS, semanticBlindDigest, semanticDigest } from "../src/server/creative-work/semantic-review-evaluation";
import { projectSemanticReviewOffline, SEMANTIC_MODEL, type SemanticDecisions } from "../src/server/creative-work/semantic-review-offline";
import { exportSemanticReviewCases, importSemanticReviewJudgment, main, writeSemanticEvaluationReport } from "./jev-evaluate";

const CLEAR: SemanticDecisions = {
  briefing_claims: "supported", headline_claims: "supported", body_claims: "supported", cta_claims: "supported",
  intent_alignment: "aligned", prohibited_claims: "compliant",
};
const ALERT: SemanticDecisions = { ...CLEAR, body_claims: "unsupported" };
const ABSTAIN: SemanticDecisions = { ...CLEAR, cta_claims: "insufficient_context" };

const BASE = new Date("2026-10-10T12:00:00.000Z");
const at = (ms: number) => new Date(BASE.getTime() + ms);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const roots: string[] = [];
function tmp() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "jev471-")));
  roots.push(dir);
  return dir;
}
afterAll(() => { for (const dir of roots) rmSync(dir, { recursive: true, force: true }); });

type Item = { human: "alert" | "clear" | "ambiguous" | "disagree"; cand: SemanticDecisions | "queued" | "unavailable"; };
const ids = { workspaceId: randomUUID(), brandId: randomUUID(), policyId: randomUUID() };

function build(items: Item[], familyPrefix = "secret-family", splitOffset = 0) {
  const secrets = new Set<string>([ids.workspaceId, ids.brandId, ids.policyId]);
  const entries = items.map((_, i) => ({ reviewId: randomUUID(), familyId: `${familyPrefix}-${i}`, split: ((i + splitOffset) % 2 ? "calibration" : "holdout") as "calibration" | "holdout", primary: true }));
  const records = items.map((item, i) => {
    const workItemId = randomUUID();
    secrets.add(entries[i].reviewId); secrets.add(workItemId);
    const work = {
      ...workRow({ userId: "u", workspaceId: ids.workspaceId, brandIds: [ids.brandId] }, { updatedAt: at(-DAY), headline: `Unique headline marker ${i}` }),
      id: workItemId, createdAt: at(-DAY),
    };
    const projected = projectSemanticReviewOffline(work);
    if (!projected.ok) throw new Error("fixture_not_projectable");
    const completed = typeof item.cand === "object";
    const observation = {
      ...EVALUATION_VERSIONS, id: entries[i].reviewId, clientProfileId: ids.brandId, workItemId, policyId: ids.policyId, semanticHash: projected.hash,
      state: completed ? "completed" as const : "queued" as const,
      decisions: completed ? item.cand : null, confidence: completed ? { briefing_claims: 0.93 } : null,
      probabilities: completed ? { briefing_claims: { supported: 0.93, unsupported: 0.07 } } : null,
      usage: completed ? { input_tokens: 100, output_tokens: 6 } : null, returnedModel: completed ? SEMANTIC_MODEL : null,
      currentAtCompletion: completed ? true : null, errorCode: null, createdAt: at(-HOUR), sendStartedAt: completed ? at(-HOUR + 30_000) : null,
      finishedAt: completed ? at(-HOUR + 31_000) : null, httpElapsedMs: completed ? 800 : null,
    };
    if (item.cand === "unavailable") return { reviewId: entries[i].reviewId, observation, policy: { dataOrigin: "synthetic" as const }, projected: null, unavailableReason: "hash_mismatch" as const };
    return { reviewId: entries[i].reviewId, observation, policy: { dataOrigin: "synthetic" as const }, projected, unavailableReason: null };
  });
  const plan = { version: 1 as const, workspaceId: ids.workspaceId, selectedAt: at(-2 * DAY).toISOString(), selectedBy: "synthetic-selector", selectedBeforeResults: true as const, entries };
  const authorization = {
    reference: "https://example.com/approvals/blind-export-471", authorizedBy: "synthetic-owner", approvedAt: at(-HOUR).toISOString(),
    expiresAt: at(7 * DAY).toISOString(), purpose: "blind_semantic_review_export", workspaceId: ids.workspaceId, clientProfileIds: [ids.brandId],
    reviewIds: entries.map((e) => e.reviewId), planHash: semanticDigest(plan),
  };
  const reconstruct = vi.fn(async () => ({ records, collectionRuns: [] as never[], collectionHistoryComplete: false, processingObservations: [] as never[] }));
  return { items, entries, records, plan, authorization, repository: { reconstruct } as never, reconstruct, secrets };
}
type Built = ReturnType<typeof build>;

const run = (b: Built, dir: string, over: Partial<Parameters<typeof exportSemanticReviewCases>[0]> = {}) =>
  exportSemanticReviewCases({ repository: b.repository, authorization: b.authorization, plan: b.plan, outputDir: dir, evaluationRoot: dirname(dir), clock: () => BASE, ...over });
type BlindCase = { caseId: string; familyId: string; caseHash: string };
type MapRow = { reviewId: string; caseId: string; familyId: string; available: boolean; baselineAlert: boolean | null; httpElapsedMs: number | null };
type PrivateJson = { exportId: string; planHash: string; blindHash: string; cases: BlindCase[]; rows: MapRow[]; collectionRuns: unknown[]; provenance: Record<string, unknown> };
const keysDeep = (value: unknown): string[] => (Array.isArray(value) ? value.flatMap(keysDeep)
  : value && typeof value === "object" ? Object.entries(value).flatMap(([key, item]) => [key, ...keysDeep(item)]) : []);
const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as PrivateJson;
const mode = (path: string) => statSync(path).mode & 0o777;

/** The reviewer view: only blind.json is read. */
function review(dir: string, b: Built, reviewerId: string, pick: (index: number) => { labels: SemanticDecisions; ambiguous?: boolean } | null, over: Record<string, unknown> = {}) {
  const blind = json(join(dir, "blind.json"));
  const map = json(join(dir, "private-map.json"));
  const cases = b.entries.flatMap((entry, i) => {
    const row = map.rows.find((r: MapRow) => r.reviewId === entry.reviewId);
    const blindCase = blind.cases.find((c: BlindCase) => c.caseId === row.caseId);
    const choice = blindCase && pick(i);
    return blindCase && choice ? [{ caseId: blindCase.caseId, familyId: blindCase.familyId, caseHash: blindCase.caseHash, versions: LABEL_VERSIONS, labels: choice.labels, ambiguous: choice.ambiguous ?? false }] : [];
  });
  return {
    version: 1, kind: "review", exportId: blind.exportId, planHash: blind.planHash, blindHash: map.blindHash, reviewerId,
    createdAt: at(HOUR).toISOString(), referenceKind: "synthetic_fixture", cases, ...over,
  };
}
const adjudicate = (reviews: unknown[], base: ReturnType<typeof review>) => ({
  ...base, kind: "adjudication", createdAt: at(2 * HOUR).toISOString(), resolves: reviews.map((r) => semanticDigest(judgmentSchema.parse(r))),
});

/** Known matrix: A TP, B TN, C FP, D FN (adjudicated), E ambiguous, F unavailable. */
const MATRIX: Item[] = [
  { human: "alert", cand: ALERT }, { human: "clear", cand: CLEAR }, { human: "clear", cand: ALERT },
  { human: "disagree", cand: CLEAR }, { human: "ambiguous", cand: ALERT }, { human: "clear", cand: "unavailable" },
];
const labelFor = (item: Item, who: "a" | "b") => {
  if (item.human === "alert") return { labels: ALERT };
  if (item.human === "clear") return { labels: CLEAR };
  if (item.human === "ambiguous") return { labels: ABSTAIN, ambiguous: true };
  return { labels: who === "a" ? ALERT : CLEAR }; // disagree
};
const reviewers = (dir: string, b: Built) => {
  const a = review(dir, b, "Ana ", (i) => labelFor(b.items[i], "a"));
  const c = review(dir, b, "bia", (i) => labelFor(b.items[i], "b"));
  const adj = adjudicate([a, c], review(dir, b, "carla", (i) => (b.items[i].human === "disagree" ? { labels: ALERT } : null)));
  return { a, c, adj };
};

afterEach(() => vi.unstubAllEnvs());

describe("end to end with a known synthetic matrix", () => {
  it("exports blind cases, imports two judgments and an adjudication, and recomputes the report", async () => {
    const b = build(MATRIX);
    const dir = join(tmp(), "run");
    const summary = await run(b, dir);
    expect(summary).toMatchObject({ selected: 6, exported: 5, unavailable: 1 });
    expect(b.reconstruct).toHaveBeenCalledWith(expect.objectContaining({
      authorization: expect.objectContaining({ workspaceId: ids.workspaceId, clientProfileIds: [ids.brandId], reviewIds: b.entries.map((e) => e.reviewId) }),
      plan: expect.objectContaining({ workspaceId: ids.workspaceId }),
    }));

    const { a, c, adj } = reviewers(dir, b);
    expect(importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) })).toMatchObject({ kind: "review" });
    importSemanticReviewJudgment({ directory: dir, judgment: c, now: at(3 * HOUR) });
    importSemanticReviewJudgment({ directory: dir, judgment: adj, now: at(3 * HOUR) });

    const { report, filename } = writeSemanticEvaluationReport({ directory: dir, now: at(DAY) });
    expect(filename).toMatch(/^report-[0-9a-f]{64}\.json$/);
    expect(mode(join(dir, filename))).toBe(0o600);
    expect(report.selected).toBe(6);
    expect(report.unavailable).toBe(1);
    expect(report.humanReference).toBe("synthetic_or_not_collected"); // synthetic fixture is never human evidence
    expect(report.cohorts).toHaveLength(1);
    const cohort = report.cohorts.find((x) => x.dataOrigin === "synthetic")!;
    expect(cohort.metrics.counts).toMatchObject({ tp: 1, fp: 1, tn: 1, fn: 1, clearHuman: 4 });
    expect(cohort.metrics.precision).toMatchObject({ numerator: 1, denominator: 2 });
    expect(cohort.metrics.falseAlert).toMatchObject({ numerator: 1, denominator: 2 });
    expect(cohort.counts.referenceStates).toMatchObject({ clear: 4, ambiguous: 1 });
    expect(cohort.counts).toMatchObject({ sendsStarted: 5, validResponses: 5 });
    expect(cohort.httpElapsedMs).toMatchObject({ count: 5, p50: 800, p95: 800 });
    expect(cohort.cost).toBeNull();
    expect(JSON.parse(readFileSync(join(dir, filename), "utf8"))).toEqual(JSON.parse(JSON.stringify(report)));
  });

  it("keeps unresolved reference states explicit when only one reviewer or an unadjudicated disagreement exists", async () => {
    const b = build(MATRIX);
    const dir = join(tmp(), "run");
    await run(b, dir);
    const { a, c } = reviewers(dir, b);
    importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) });
    let { report } = writeSemanticEvaluationReport({ directory: dir, now: at(DAY) });
    expect(report.cohorts.find((x) => x.dataOrigin === "synthetic")!.counts.referenceStates.missing_second_review).toBe(4 + 1);
    importSemanticReviewJudgment({ directory: dir, judgment: c, now: at(3 * HOUR) });
    ({ report } = writeSemanticEvaluationReport({ directory: dir, now: at(DAY + HOUR) }));
    const states = report.cohorts.find((x) => x.dataOrigin === "synthetic")!.counts.referenceStates;
    expect(states.awaiting_adjudication).toBe(1);
    expect(states.clear).toBe(3);
    expect(report.cohorts.find((x) => x.dataOrigin === "synthetic")!.metrics.counts.fn).toBe(0);
  });
});

describe("private output layout and blind package", () => {
  const exported = async (items: Item[] = MATRIX) => {
    const b = build(items);
    const dir = join(tmp(), "run");
    await run(b, dir);
    return { b, dir };
  };

  it("creates a 0700 directory with exactly blind, map and completion files at 0600 and no leftover lock", async () => {
    const { dir } = await exported();
    expect(mode(dir)).toBe(0o700);
    expect(readdirSync(dir).sort()).toEqual(["blind.json", "complete.json", "private-map.json"]);
    for (const name of readdirSync(dir)) expect(mode(join(dir, name))).toBe(0o600);
  });

  it("exposes no real technical ids, Jev/provider names, outcomes, confidence or baseline in the reviewer file", async () => {
    const { b, dir } = await exported();
    const text = readFileSync(join(dir, "blind.json"), "utf8");
    const blind = JSON.parse(text);
    const map = json(join(dir, "private-map.json"));
    const allowedUuids = new Set<string>([blind.exportId, ...blind.cases.flatMap((c: BlindCase) => [c.caseId, c.familyId])]);
    for (const found of text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []) expect(allowedUuids.has(found)).toBe(true);
    for (const secret of b.secrets) expect(text).not.toContain(secret);
    for (const forbidden of ["secret-family", "jev-1", "single_shadow", "typesafe", "0.93", "0.07", "probabilit", "baseline", "usage", "returnedModel", "httpElapsed", "dataOrigin", "workItemId", "clientProfileId", "policyId", "reviewId", "sourceFamilyId"]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(Object.keys(blind).sort()).toEqual(["cases", "classes", "exportId", "planHash", "questions", "rubric", "version"].sort());
    for (const c of blind.cases) {
      expect(Object.keys(c).sort()).toEqual(["caseHash", "caseId", "context", "familyId", "versions"]);
      expect(Object.keys(c.context).sort()).toEqual(["brandName", "briefing", "copy", "facts", "format", "prohibitedElements", "request", "requiredElements"]);
    }
    expect(keysDeep(blind).map((key) => key.toLowerCase())).not.toContain("confidence");   // neither Jev's nor the inferred briefing's
    for (const field of ["message", "objective", "audience", "offer", "constraints"]) {
      for (const c of blind.cases as unknown as Array<{ context: { briefing: Record<string, Record<string, unknown>> } }>) expect(Object.keys(c.context.briefing[field]).sort()).toEqual(["state", "value"]);
    }
    // Only keyed hashes reach reviewers: no semantic hash, no seed; the order is a keyed shuffle, not the plan order.
    const seed = (map as unknown as { blindingSeed: string }).blindingSeed;
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(text).not.toContain(seed);
    expect(text).not.toContain("semanticHash");
    for (const row of map.rows as Array<MapRow & { semanticHash: string | null; caseHash: string }>) {
      if (row.semanticHash) expect(text).not.toContain(row.semanticHash);
      expect(row.caseHash).toBe(semanticBlindDigest(seed, { caseId: row.caseId, semanticHash: row.semanticHash }));
    }
    const order = blind.cases.map((c: BlindCase) => semanticBlindDigest(seed, c.caseId));
    expect(order).toEqual([...order].sort());
    expect(blind.cases).toHaveLength(5);                       // the unavailable case is not exported
    expect(text).toContain("Unique headline marker 0");        // legitimate textual context is present for fact review
    expect(text).toContain("Marca Exemplo");                   // brand name in text is allowed
    expect(new Set(blind.cases.map((c: BlindCase) => c.caseId)).size).toBe(5);
    expect(blind.cases.every((c: BlindCase) => map.rows.some((r: MapRow) => r.caseId === c.caseId && r.familyId === c.familyId))).toBe(true);
  });

  it("opaque case/family ids are fresh per export and not derived from real ids", async () => {
    const b = build(MATRIX);
    const d1 = join(tmp(), "run"), d2 = join(tmp(), "run");
    await run(b, d1); await run(b, d2);
    const first = json(join(d1, "blind.json")), second = json(join(d2, "blind.json"));
    expect(first.exportId).not.toBe(second.exportId);
    expect(first.cases.map((c: BlindCase) => c.caseId)).not.toEqual(second.cases.map((c: BlindCase) => c.caseId));
  });

  it("keeps original text out of the private map but its results and linking ids inside", async () => {
    const { dir } = await exported();
    const text = readFileSync(join(dir, "private-map.json"), "utf8");
    for (const marker of ["Unique headline marker", "Marca Exemplo", "Anuncie o curso", "Conheça o curso", "Saiba mais"]) expect(text).not.toContain(marker);
    const map = JSON.parse(text);
    expect(map.rows).toHaveLength(6);
    expect(map.rows.find((r: MapRow) => !r.available)).toMatchObject({ unavailableReason: "hash_mismatch", dataOrigin: "synthetic" });
    expect(map.provenance).toMatchObject({ assurance: "declared" });
    expect(map.blindHash).toBe(semanticDigest(json(join(dir, "blind.json"))));
  });
});

describe("authorization", () => {
  const rejected = async (b: Built, over: Partial<Parameters<typeof exportSemanticReviewCases>[0]> = {}) => {
    const dir = join(tmp(), "run");
    await expect(run(b, dir, over)).rejects.toThrow();
    expect(existsSync(dir)).toBe(false);
    return dir;
  };
  const withAuth = (b: Built, over: Record<string, unknown>) => ({ authorization: { ...b.authorization, ...over } });

  it.each([
    ["expired", { expiresAt: at(-1000).toISOString(), approvedAt: at(-DAY).toISOString() }],
    ["not yet valid", { approvedAt: at(HOUR).toISOString(), expiresAt: at(DAY).toISOString() }],
    ["longer than 14 days", { expiresAt: at(15 * DAY).toISOString() }],
    ["other purpose", { purpose: "prepared_work_semantic_review" }],
    ["other workspace", { workspaceId: randomUUID() }],
    ["other plan hash", { planHash: "f".repeat(64) }],
    ["http reference", { reference: "http://example.com/approval" }],
    ["reference with query", { reference: "https://example.com/approval?token=x" }],
    ["reference with credentials", { reference: "https://user:pw@example.com/approval" }],
    ["subset of review ids", { reviewIds: [randomUUID()] }],
    ["extra review id", { reviewIds: [...build(MATRIX).authorization.reviewIds] }],
    ["unknown field", { extra: true }],
    ["empty brands", { clientProfileIds: [] }],
  ])("refuses an approval that is %s, before reading data or writing files", async (_name, over) => {
    const b = build(MATRIX);
    await rejected(b, withAuth(b, over));
    expect(b.reconstruct).not.toHaveBeenCalled();
  });

  it("refuses a missing or malformed approval", async () => {
    const b = build(MATRIX);
    await rejected(b, { authorization: undefined });
    await rejected(b, { authorization: "yes" });
    expect(b.reconstruct).not.toHaveBeenCalled();
  });

  it("refuses when the approval expires while the data is being read", async () => {
    const b = build(MATRIX);
    let calls = 0;
    await rejected(b, { clock: () => (++calls === 1 ? BASE : at(8 * DAY)) });
    expect(b.reconstruct).toHaveBeenCalledTimes(1);
  });

  it("refuses a plan selected after the export time or with leaked families before reading data", async () => {
    const b = build(MATRIX);
    const future = { ...b.plan, selectedAt: at(HOUR).toISOString() };
    await rejected(b, { plan: future, authorization: { ...b.authorization, planHash: semanticDigest(future) } });
    const leaked = { ...b.plan, entries: b.plan.entries.map((e) => ({ ...e, familyId: "same", primary: true })) };
    await rejected(b, { plan: leaked });
    expect(b.reconstruct).not.toHaveBeenCalled();
  });

  it("propagates repository scope denial without writing anything", async () => {
    const b = build(MATRIX);
    const dir = join(tmp(), "run");
    const repository = { reconstruct: async () => { throw new Error("export_scope_denied"); } } as never;
    await expect(run(b, dir, { repository })).rejects.toThrow("export_scope_denied");
    expect(existsSync(dir)).toBe(false);
  });
});

describe("destination safety", () => {
  it("never overwrites an existing directory or file in the evaluation root and leaves it untouched", async () => {
    const b = build(MATRIX);
    const root = tmp();
    const existingDir = join(root, "existing");
    mkdirSync(existingDir, { mode: 0o700 });
    writeFileSync(join(existingDir, "blind.json"), "KEEP");
    await expect(run(b, existingDir)).rejects.toThrow();
    expect(readFileSync(join(existingDir, "blind.json"), "utf8")).toBe("KEEP");
    expect(readdirSync(existingDir)).toEqual(["blind.json"]);
    const other = tmp();
    const existingFile = join(other, "file");
    writeFileSync(existingFile, "KEEP");
    await expect(run(b, existingFile)).rejects.toThrow();
    expect(readFileSync(existingFile, "utf8")).toBe("KEEP");
    expect(readdirSync(other)).toEqual(["file"]);                 // nothing else (not even a lock) is left behind
  });

  it("rejects a symlink as destination, as root, or as a sibling, and writes nothing through it", async () => {
    const b = build(MATRIX);
    const root = tmp();
    const real = join(tmp(), "real");
    mkdirSync(real, { mode: 0o700 });
    symlinkSync(real, join(root, "link"));
    await expect(run(b, join(root, "link"))).rejects.toThrow();            // symlinked destination / sibling
    const linkedRoot = join(tmp(), "linked-root");
    symlinkSync(root, linkedRoot);
    await expect(run(b, join(linkedRoot, "run"))).rejects.toThrow();        // symlinked evaluation root
    expect(readdirSync(real)).toEqual([]);
    expect(existsSync(join(root, "run"))).toBe(false);
    const other = tmp();
    symlinkSync(join(other, "nowhere"), join(other, "dangling"));
    await expect(run(b, join(other, "dangling"))).rejects.toThrow();
    expect(existsSync(join(other, "nowhere"))).toBe(false);
  });

  it.each([
    ["relative path", "relative/run"],
    ["parent traversal", "<root>/a/../run"],
    ["current directory segment", "<root>/./run"],
    ["trailing slash", "<root>/run/"],
    ["empty path", ""],
    ["nested (not a direct child of the root)", "<root>/missing/run"],
  ])("refuses %s", async (_name, template) => {
    const b = build(MATRIX);
    const root = tmp();
    const path = template.replace("<root>", root);
    await expect(run(b, path, { evaluationRoot: root })).rejects.toThrow();
    expect(readdirSync(root)).toEqual([]);
  });

  it("requires an existing private (0700) evaluation root owned by the caller", async () => {
    const b = build(MATRIX);
    const root = tmp();
    chmodSync(root, 0o755);
    await expect(run(b, join(root, "run"))).rejects.toThrow("insecure_private_permissions");
    chmodSync(root, 0o700);
    await expect(run(b, join(root, "missing", "run"), { evaluationRoot: join(root, "missing") })).rejects.toThrow();
    expect(readdirSync(root)).toEqual([]);
  });

  it("serializes with a root lock, releases it on success and failure, and refuses a stale lock", async () => {
    const b = build(MATRIX);
    const root = tmp();
    await run(b, join(root, "one"));
    expect(readdirSync(root)).toEqual(["one"]);
    writeFileSync(join(root, "lock"), "", { mode: 0o600 });
    await expect(run(build(MATRIX, "other"), join(root, "two"))).rejects.toThrow();
    expect(readdirSync(root).sort()).toEqual(["lock", "one"]);
    rmSync(join(root, "lock"));
    const bad = build(MATRIX, "third");
    await expect(run(bad, join(root, "three"), { authorization: { ...bad.authorization, planHash: "f".repeat(64) } })).rejects.toThrow();
    expect(readdirSync(root)).toEqual(["one"]);
  });

  it("refuses a root containing a partial sibling export with a safe code, releases the lock and recovers once the sibling is removed", async () => {
    const root = tmp();
    const partials: Array<[string, string[]]> = [
      ["empty", []], ["blind only", ["blind.json"]],
    ];
    for (const [name, files] of partials) {
      const sibling = join(root, "partial");
      mkdirSync(sibling, { mode: 0o700 });
      for (const file of files) writeFileSync(join(sibling, file), "{}", { mode: 0o600 });
      const b = build(MATRIX);
      const failure = await run(b, join(root, "run")).then(() => null, (error: Error) => error);
      expect(failure?.message, name).toBe("incomplete_sibling_export");              // a stable code, no path or file content
      expect(failure?.message).not.toContain(root);
      expect(readdirSync(root), name).toEqual(["partial"]);                           // no new child, no stale lock
      expect(readdirSync(sibling).sort(), name).toEqual([...files].sort());          // the partial sibling is not modified
      expect(b.reconstruct, name).not.toHaveBeenCalled();                             // refused before reading any data
      rmSync(sibling, { recursive: true });
    }
    await expect(run(build(MATRIX), join(root, "run"))).resolves.toMatchObject({ selected: 6 });
    expect(readdirSync(root)).toEqual(["run"]);
  });

  it("keeps a specific error for a corrupt map in a sibling instead of calling it merely incomplete", async () => {
    const b = build(MATRIX);
    const root = tmp();
    mkdirSync(join(root, "corrupt"), { mode: 0o700 });
    for (const file of ["blind.json", "private-map.json", "complete.json"]) writeFileSync(join(root, "corrupt", file), "{}", { mode: 0o600 });
    const failure = await run(b, join(root, "run")).then(() => null, (error: Error) => error);
    expect(failure).not.toBeNull();
    expect(failure!.message).not.toBe("incomplete_sibling_export");
    expect(readdirSync(root)).toEqual(["corrupt"]);
    expect(b.reconstruct).not.toHaveBeenCalled();
  });

  it("still refuses an unreadable or foreign private directory in the root without leaking its contents", async () => {
    const b = build(MATRIX);
    const root = tmp();
    mkdirSync(join(root, "foreign"), { mode: 0o700 });
    writeFileSync(join(root, "foreign", "notes.txt"), "SECRET-NOTE", { mode: 0o600 });
    const failure = await run(b, join(root, "run")).then(() => null, (error: Error) => error);
    expect(failure).not.toBeNull();
    expect(failure!.message).not.toContain("SECRET-NOTE");
    expect(readdirSync(root)).toEqual(["foreign"]);
  });

  describe("exports sharing one evaluation root", () => {
    it("rejects reusing an approval, a review id, a family in another split, a second family representative and a work in another family", async () => {
      const first = build(MATRIX, "fam-a");
      const root = tmp();
      await run(first, join(root, "one"));
      // the very same approval
      await expect(run(first, join(root, "two"))).rejects.toThrow("export_authorization_reused");
      // a fresh approval over already exported review ids
      const sameIds = { ...first, authorization: { ...first.authorization, reference: "https://example.com/approvals/another-471" } };
      await expect(run(sameIds, join(root, "three"))).rejects.toThrow("review_already_exported");
      // same family names, opposite split, new review ids
      await expect(run(build(MATRIX, "fam-a", 1), join(root, "four"))).rejects.toThrow("family_split_leakage");
      // same family names and splits, but a second primary representative
      await expect(run(build(MATRIX, "fam-a"), join(root, "five"))).rejects.toThrow("duplicate_family_representative");
      // a work already exported under another family
      const reused = build(MATRIX, "fam-b");
      reused.records.forEach((record, i) => { record.observation.workItemId = first.records[i].observation.workItemId; });
      await expect(run(reused, join(root, "six"))).rejects.toThrow("work_family_mismatch");
      expect(readdirSync(root)).toEqual(["one"]);
      // an unrelated export still succeeds in the same root
      await expect(run(build(MATRIX, "fam-c"), join(root, "seven"))).resolves.toMatchObject({ selected: 6 });
      expect(readdirSync(root).sort()).toEqual(["one", "seven"]);
    });
  });

  it("does not leave a valid run behind when writing fails midway (completion file is written last)", async () => {
    const b = build(MATRIX);
    const dir = join(tmp(), "run");
    await run(b, dir);
    rmSync(join(dir, "complete.json"));
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: reviewers(dir, b).a, now: at(3 * HOUR) })).toThrow();
    expect(() => writeSemanticEvaluationReport({ directory: dir })).toThrow();
  });
});

describe("import and report safety", () => {
  const ready = async () => {
    const b = build(MATRIX);
    const dir = join(tmp(), "run");
    await run(b, dir);
    return { b, dir, ...reviewers(dir, b) };
  };
  const files = (dir: string) => readdirSync(dir).sort();

  it("stores each judgment once under its content hash with mode 0600 and never overwrites history", async () => {
    const { dir, a } = await ready();
    const { judgmentHash } = importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) });
    const name = `judgment-${judgmentHash}.json`;
    expect(files(dir)).toContain(name);
    expect(mode(join(dir, name))).toBe(0o600);
    const before = readFileSync(join(dir, name), "utf8");
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) })).toThrow();
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: { ...a, cases: a.cases.map((c) => ({ ...c, labels: CLEAR })) }, now: at(3 * HOUR) })).toThrow("duplicate_reviewer_judgment");
    expect(readFileSync(join(dir, name), "utf8")).toBe(before);
    expect(files(dir).filter((f) => f.startsWith("judgment-"))).toEqual([name]);
    expect(existsSync(join(dir, "lock"))).toBe(false);
  });

  it("canonicalizes the reviewer identity so the same person cannot review twice under another spelling", async () => {
    const { b, dir, a } = await ready();
    importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) }); // "Ana "
    const again = review(dir, b, " ANA", (i) => labelFor(b.items[i], "a"));
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: again, now: at(3 * HOUR) })).toThrow();
  });

  it("rejects judgments for another export, tampered hashes, human evidence for synthetic data and third reviews, writing nothing", async () => {
    const { b, dir, a, c } = await ready();
    const base = files(dir);
    const bad = [
      { ...a, exportId: randomUUID() }, { ...a, planHash: "0".repeat(64) }, { ...a, blindHash: "0".repeat(64) },
      { ...a, referenceKind: "independent_human" }, { ...a, createdAt: at(-DAY).toISOString() }, { ...a, extra: 1 },
      { ...a, cases: a.cases.map((x, i) => (i === 0 ? { ...x, caseHash: "0".repeat(64) } : x)) },
      { ...a, cases: a.cases.map((x, i) => (i === 0 ? { ...x, familyId: randomUUID() } : x)) },
      { ...a, cases: a.cases.map((x, i) => (i === 0 ? { ...x, labels: { ...x.labels, intent_alignment: "supported" } } : x)) },
      { ...a, cases: a.cases.map((x, i) => (i === 0 ? { ...x, versions: { ...x.versions, rubricHash: "0".repeat(64) } } : x)) },
      "not a judgment", null,
    ];
    for (const judgment of bad) expect(() => importSemanticReviewJudgment({ directory: dir, judgment, now: at(3 * HOUR) })).toThrow();
    expect(files(dir)).toEqual(base);
    importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) });
    importSemanticReviewJudgment({ directory: dir, judgment: c, now: at(3 * HOUR) });
    const third = review(dir, b, "eva", (i) => labelFor(b.items[i], "a"));
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: third, now: at(3 * HOUR) })).toThrow("too_many_case_judgments");
    expect(files(dir).filter((f) => f.startsWith("judgment-"))).toHaveLength(2);
  });

  it("refuses directories that are not private, symlinked, tampered, incomplete or locked", async () => {
    const { b, dir, a } = await ready();
    chmodSync(dir, 0o755);
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) })).toThrow("insecure_private_permissions");
    chmodSync(dir, 0o700);
    const link = join(tmp(), "link");
    symlinkSync(dir, link);
    expect(() => importSemanticReviewJudgment({ directory: link, judgment: a, now: at(3 * HOUR) })).toThrow();
    expect(() => importSemanticReviewJudgment({ directory: "relative", judgment: a })).toThrow();
    writeFileSync(join(dir, "lock"), "", { mode: 0o600 });
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) })).toThrow();
    expect(files(dir).some((f) => f.startsWith("judgment-"))).toBe(false);
    rmSync(join(dir, "lock"));
    chmodSync(join(dir, "private-map.json"), 0o644);
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) })).toThrow("insecure_private_file");
    chmodSync(join(dir, "private-map.json"), 0o600);
    const blind = readFileSync(join(dir, "blind.json"), "utf8");
    writeFileSync(join(dir, "blind.json"), blind.replace("Unique headline marker 0", "Edited"));
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) })).toThrow("private_run_integrity_mismatch");
    writeFileSync(join(dir, "blind.json"), blind);
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: review(dir, b, "ana", (i) => labelFor(b.items[i], "a")), now: at(3 * HOUR) })).not.toThrow();
  });

  it("detects a tampered history file and never overwrites an existing report", async () => {
    const { dir, a } = await ready();
    const { judgmentHash } = importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) });
    const first = writeSemanticEvaluationReport({ directory: dir, now: at(DAY) });
    const before = readFileSync(join(dir, first.filename), "utf8");
    expect(() => writeSemanticEvaluationReport({ directory: dir, now: at(DAY) })).toThrow();
    expect(readFileSync(join(dir, first.filename), "utf8")).toBe(before);
    const second = writeSemanticEvaluationReport({ directory: dir, now: at(DAY + HOUR) });
    expect(second.filename).not.toBe(first.filename);
    const history = join(dir, `judgment-${judgmentHash}.json`);
    chmodSync(history, 0o644);
    expect(() => writeSemanticEvaluationReport({ directory: dir, now: at(DAY + 2 * HOUR) })).toThrow("insecure_private_file");
    chmodSync(history, 0o600);
    writeFileSync(history, readFileSync(history, "utf8").replace("ana", "zed"));
    expect(() => writeSemanticEvaluationReport({ directory: dir, now: at(DAY + 3 * HOUR) })).toThrow("judgment_history_mismatch");
  });
});

describe("report anchors", () => {
  it("rejects further imports and reports once a judgment used by an earlier report was removed, leaving that report intact", async () => {
    const b = build(MATRIX);
    const dir = join(tmp(), "run");
    await run(b, dir);
    const a = review(dir, b, "ana", (i) => labelFor(b.items[i], "a"));
    const disagree = review(dir, b, "bia", (i) => labelFor(b.items[i], "b"));
    const hashOf = (judgment: unknown) => semanticDigest(judgmentSchema.parse(judgment));
    importSemanticReviewJudgment({ directory: dir, judgment: a, now: at(3 * HOUR) });
    importSemanticReviewJudgment({ directory: dir, judgment: disagree, now: at(3 * HOUR) });
    const first = writeSemanticEvaluationReport({ directory: dir, now: at(DAY) });
    expect(first.report.cohorts[0].counts.referenceStates.awaiting_adjudication).toBe(1);   // incomplete: the discordant case awaits adjudication
    const reportBefore = readFileSync(join(dir, first.filename), "utf8");
    expect(first.report.judgmentHashes).toEqual([hashOf(a), hashOf(disagree)].sort());

    // Replace the discordant judgment by a concordant one so the awaiting case would silently disappear.
    rmSync(join(dir, `judgment-${hashOf(disagree)}.json`));
    const concordant = review(dir, b, "bia", (i) => labelFor(b.items[i], "a"));
    expect(() => importSemanticReviewJudgment({ directory: dir, judgment: concordant, now: at(3 * HOUR) })).toThrow("judgment_history_mismatch");
    expect(() => writeSemanticEvaluationReport({ directory: dir, now: at(DAY + HOUR) })).toThrow("judgment_history_mismatch");
    expect(readFileSync(join(dir, first.filename), "utf8")).toBe(reportBefore);
    expect(readdirSync(dir).filter((name) => name.startsWith("judgment-"))).toEqual([`judgment-${hashOf(a)}.json`]);
    expect(readdirSync(dir).filter((name) => name.startsWith("report-"))).toEqual([first.filename]);
    expect(existsSync(join(dir, "lock"))).toBe(false);
  });
});

describe("CLI", () => {
  it("rejects missing, duplicate, extra and unknown arguments", async () => {
    for (const args of [[], ["unknown"], ["export"], ["report"], ["import", "--directory", "/x"], ["report", "--directory"],
      ["report", "--directory", "/x", "--directory", "/y"], ["report", "--directory", "/x", "--other", "y"], ["report", "positional"],
      ["export", "--authorization", "/a", "--plan", "/p", "--output-dir", "/o"]]) {
      await expect(main(args)).rejects.toThrow("invalid_arguments");
    }
  });

  it("refuses to export without an explicit safe test database and never falls back to DATABASE_URL", async () => {
    const root = tmp();
    const out = join(root, "run");
    const args = ["export", "--authorization", join(root, "a.json"), "--plan", join(root, "p.json"), "--output-dir", out, "--evaluation-root", root];
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5433/adscale_test");
    await expect(main(args)).rejects.toThrow("explicit_test_database_required");
    vi.stubEnv("TEST_DATABASE_URL", "postgres://u:p@db.example.com:5432/adscale_test");
    await expect(main(args)).rejects.toThrow("unsafe_test_database");
    expect(existsSync(out)).toBe(false);
  });

  it("imports and reports from private files, printing only counters and file names", async () => {
    const b = build(MATRIX);
    const root = tmp();
    const dir = join(root, "run");
    await run(b, dir);
    const { a } = reviewers(dir, b);
    const input = join(root, "a.json");
    writeFileSync(input, JSON.stringify(a), { mode: 0o600 });
    const imported = await main(["import", "--directory", dir, "--input", input]);
    expect(imported).toMatchObject({ imported: a.cases.length, kind: "review" });
    const report = await main(["report", "--directory", dir]);
    expect(Object.keys(report as object).sort()).toEqual(["filename", "selected", "unavailable"]);
    expect(report).toMatchObject({ selected: 6, unavailable: 1 });
    expect(JSON.stringify([imported, report])).not.toMatch(/headline|Marca|labels|decisions/i);
  });

  it("refuses group-readable or symlinked input files", async () => {
    const b = build(MATRIX);
    const root = tmp();
    const dir = join(root, "run");
    await run(b, dir);
    const { a } = reviewers(dir, b);
    const open = join(root, "open.json");
    writeFileSync(open, JSON.stringify(a));
    chmodSync(open, 0o644);
    await expect(main(["import", "--directory", dir, "--input", open])).rejects.toThrow("insecure_private_file");
    const target = join(root, "real.json");
    writeFileSync(target, JSON.stringify(a), { mode: 0o600 });
    symlinkSync(target, join(root, "link.json"));
    await expect(main(["import", "--directory", dir, "--input", join(root, "link.json")])).rejects.toThrow();
    expect(readdirSync(dir).some((f) => f.startsWith("judgment-"))).toBe(false);
  });
});
