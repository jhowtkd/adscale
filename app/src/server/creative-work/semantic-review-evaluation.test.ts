import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildSemanticEvaluationReport, EVALUATION_VERSIONS, semanticBlindDigest, judgmentSchema, LABEL_VERSIONS, parseSemanticFamilyPlan,
  semanticDigest, semanticPercentiles, validateSemanticJudgments, validateSemanticManifest,
} from "./semantic-review-evaluation";
import { semanticWilson, summarizeSemanticReference, type SemanticMetricRow } from "./semantic-review-metrics";
import type { SemanticDecisions } from "./semantic-review-offline";
import { SEMANTIC_MODEL, SEMANTIC_QUESTIONS } from "./semantic-review-offline";

// All data below is synthetic test fixture; nothing here is human evidence.
const CREATED = "2026-10-01T00:00:00.000Z";
const JUDGED = "2026-10-01T10:00:00.000Z";
const LATER = "2026-10-01T12:00:00.000Z";
const NOW = new Date("2026-10-02T00:00:00.000Z");
const HASH_A = "a".repeat(64);

const CLEAR: SemanticDecisions = {
  briefing_claims: "supported", headline_claims: "supported", body_claims: "supported", cta_claims: "supported",
  intent_alignment: "aligned", prohibited_claims: "compliant",
};
const ALERT: SemanticDecisions = { ...CLEAR, body_claims: "unsupported" };
const ABSTAIN: SemanticDecisions = { ...CLEAR, cta_claims: "insufficient_context" };

type Cand = SemanticDecisions | "failed" | "unknown";
type Spec = {
  family?: string; split?: "calibration" | "holdout"; primary?: boolean; origin?: "synthetic" | "authorized" | null;
  human?: SemanticDecisions | "ambiguous" | "one_review" | "none"; cand?: Cand; baseline?: boolean; brand?: string | null;
  available?: boolean; usage?: { input_tokens: number; output_tokens: number } | null;
  created?: string; sent?: string | null; http?: number | null; reason?: "observation_unavailable" | "context_unavailable" | "hash_mismatch" | "version_mismatch";
};
type Row = ReturnType<typeof buildRow>;

let seq = 0;
const uuid = () => randomUUID();
const SEED = "c".repeat(64);
function buildRow(spec: Spec, familyUuid: string, workspaceId: string) {
  seq += 1;
  const available = spec.available ?? true;
  const cand = spec.cand ?? CLEAR;
  const completed = typeof cand === "object";
  const state = !available ? null : completed ? "completed" : cand === "failed" ? "failed" : "outcome_unknown";
  return {
    reviewId: uuid(), caseId: uuid(), familyId: familyUuid, sourceFamilyId: spec.family ?? `fam-${seq}`,
    split: spec.split ?? "holdout", primary: spec.primary ?? true,
    clientProfileId: spec.brand === undefined ? "11111111-1111-4111-8111-111111111111" : spec.brand,
    workItemId: available ? uuid() : null, policyId: available ? uuid() : null,
    semanticHash: available ? semanticDigest({ n: seq, workspaceId }) : null, versions: EVALUATION_VERSIONS, caseHash: "",
    dataOrigin: available ? (spec.origin === undefined ? "authorized" : spec.origin) : null, state, available,
    unavailableReason: available ? null : (spec.reason ?? "observation_unavailable"),
    decisions: completed ? cand : null, confidence: completed ? { briefing_claims: 0.9 } : null, probabilities: completed ? { briefing_claims: { supported: 1 } } : null, baselineAlert: available ? (spec.baseline ?? false) : null,
    usage: spec.usage === undefined ? (completed ? { input_tokens: 10, output_tokens: 2 } : null) : spec.usage,
    returnedModel: completed ? SEMANTIC_MODEL : null, currentAtCompletion: completed ? true : null,
    errorCode: cand === "failed" ? "provider_error" : null,
    createdAt: available ? (spec.created ?? CREATED) : null,
    sendStartedAt: available && spec.sent !== null ? (spec.sent ?? "2026-10-01T00:00:05.000Z") : null,
    finishedAt: completed || cand === "failed" ? LATER : null,
    httpElapsedMs: spec.http === undefined ? (completed ? 120 : null) : spec.http,
  };
}

function makeManifest(specs: Spec[], extra: Record<string, unknown> = {}) {
  const workspaceId = uuid();
  const families = new Map<string, string>();
  const rows = specs.map((spec, i) => {
    const key = spec.family ?? `fam-x${i}`;
    if (!families.has(key)) families.set(key, uuid());
    const row = buildRow({ ...spec, family: key }, families.get(key)!, workspaceId);
    row.caseHash = semanticBlindDigest(SEED, { caseId: row.caseId, semanticHash: row.semanticHash });
    return row;
  });
  const plan = {
    version: 1 as const, workspaceId, selectedAt: "2026-09-30T00:00:00.000Z", selectedBy: "synthetic-selector", selectedBeforeResults: true as const,
    entries: rows.map((r) => ({ reviewId: r.reviewId, familyId: r.sourceFamilyId, split: r.split, primary: r.primary })),
  };
  const manifest = {
    version: 1 as const, exportId: uuid(), createdAt: CREATED, authorizationHash: HASH_A, planHash: semanticDigest(plan), blindHash: "b".repeat(64), plan, blindingSeed: SEED, processingObservations: [] as unknown[],
    provenance: { environment: "test" as const, execution: "controlled" as const, assurance: "declared" as const },
    collectionRuns: [] as unknown[], collectionHistoryComplete: false, rows, ...extra,
  };
  return { manifest, specs, rows };
}
type Manifest = ReturnType<typeof makeManifest>["manifest"];

function label(row: Row, labels: SemanticDecisions, ambiguous = false) {
  return { caseId: row.caseId, familyId: row.familyId, caseHash: row.caseHash, versions: LABEL_VERSIONS, labels, ambiguous };
}
function judgment(manifest: Manifest, reviewerId: string, cases: ReturnType<typeof label>[], over: Record<string, unknown> = {}) {
  return {
    version: 1, kind: "review", exportId: manifest.exportId, planHash: manifest.planHash, blindHash: manifest.blindHash, reviewerId,
    createdAt: JUDGED, referenceKind: "independent_human", cases, ...over,
  };
}
function adjudication(manifest: Manifest, reviews: unknown[], reviewerId: string, cases: ReturnType<typeof label>[], over: Record<string, unknown> = {}) {
  return judgment(manifest, reviewerId, cases, {
    kind: "adjudication", createdAt: LATER, resolves: reviews.map((r) => semanticDigest(judgmentSchema.parse(r))), ...over,
  });
}
/** Two agreeing independent reviewers for every spec with a determinate human reference. */
function reviewsFor(m: ReturnType<typeof makeManifest>) {
  const a: ReturnType<typeof label>[] = [];
  const b: ReturnType<typeof label>[] = [];
  m.rows.forEach((row, i) => {
    const human = m.specs[i].human ?? "none";
    if (!row.available || human === "none") return;
    if (human === "ambiguous") {
      a.push(label(row, ABSTAIN, true)); b.push(label(row, ABSTAIN, true));
    } else if (human === "one_review") a.push(label(row, CLEAR));
    else { a.push(label(row, human)); b.push(label(row, human)); }
  });
  return [judgment(m.manifest, "ana", a), judgment(m.manifest, "bia", b)];
}
const report = (m: ReturnType<typeof makeManifest>, subs: unknown[] = reviewsFor(m)) => buildSemanticEvaluationReport(m.manifest, subs, NOW);
type Cohort = ReturnType<typeof buildSemanticEvaluationReport>["cohorts"][number];
const cohort = (r: ReturnType<typeof buildSemanticEvaluationReport>, origin: string | null = "authorized"): Cohort => r.cohorts.find((c) => c.dataOrigin === origin)!;

describe("known confusion matrix recomputed from rows", () => {
  const specs: Spec[] = [
    { human: ALERT, cand: ALERT, baseline: false },                      // 1 TP, incremental
    { human: ALERT, cand: ALERT, baseline: true },                       // 2 TP, baseline already found
    { human: ALERT, cand: CLEAR, baseline: false },                      // 3 FN, baseline missed
    { human: ALERT, cand: "failed", baseline: false },                   // 4 failure in incremental denominator
    { human: ALERT, cand: ABSTAIN, baseline: false },                    // 5 abstention in incremental denominator
    { human: CLEAR, cand: CLEAR },                                       // 6 TN
    { human: CLEAR, cand: CLEAR },                                       // 7 TN
    { human: CLEAR, cand: ALERT },                                       // 8 FP
    { human: CLEAR, cand: ABSTAIN },                                     // 9 abstains on no-problem family
    { human: CLEAR, cand: "failed" },                                    // 10 failure
    { human: "ambiguous", cand: ALERT },                                 // 11 ambiguous human, outside every denominator
    { human: "one_review", cand: ALERT },                                // 12 unresolved: second review missing
  ].map((s, i) => ({ ...s, family: `known-${i}`, split: i % 2 ? "calibration" : "holdout" }) as Spec);

  it("matches hand-computed counts and ratios", () => {
    const c = cohort(report(makeManifest(specs)));
    expect(c.metrics.counts).toEqual({ tp: 2, fp: 1, tn: 2, fn: 1, clearHuman: 10, validClearHuman: 8, humanNoProblem: 5, abstentions: 2, allAbstentions: 2, missingCandidate: 2 });
    expect(c.metrics.precision).toMatchObject({ numerator: 2, denominator: 3 });
    expect(c.metrics.falseAlert).toMatchObject({ numerator: 1, denominator: 3 });
    expect(c.metrics.falseAlertAllHumanNoProblem).toMatchObject({ numerator: 1, denominator: 5 });
    expect(c.metrics.abstention).toMatchObject({ numerator: 2, denominator: 8 });
    expect(c.metrics.abstentionAllHumanNoProblem).toMatchObject({ numerator: 1, denominator: 5 });
    expect(c.metrics.abstentionAllSelected).toMatchObject({ numerator: 2, denominator: 12 });
    expect(c.metrics.incrementalDetection).toMatchObject({ numerator: 1, denominator: 4 });
    expect(c.metrics.unit).toBe("independent_primary_families");
  });

  it("reports funnel counts, reference states and per-question metrics without question-level incremental detection", () => {
    const r = cohort(report(makeManifest(specs)));
    expect(r.counts).toMatchObject({ selected: 12, primaryFamilies: 12, secondaryVariants: 0, sendsStarted: 12, validResponses: 10, failed: 2, outcomeUnknown: 0, recoverable: 12, clearLabels: 10 });
    expect(r.counts.referenceStates).toMatchObject({ clear: 10, ambiguous: 1, missing_second_review: 1, awaiting_adjudication: 0, unavailable: 0 });
    expect(r.validResponseRate).toMatchObject({ numerator: 10, denominator: 12 });
    expect(r.byQuestion.body_claims.incrementalDetection).toBeNull();
    expect(Object.keys(r.byQuestion)).toEqual([...SEMANTIC_QUESTIONS]);
    expect(r.byQuestion.body_claims.counts.tp).toBe(2);
    expect(r.byQuestion.cta_claims.counts.allAbstentions).toBe(2);
    expect(r.matrix.body_claims.unsupported.unsupported).toBe(2);
  });

  it("splits calibration and holdout and separates brands", () => {
    const withBrands = specs.map((s, i) => ({ ...s, brand: i < 6 ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222" }));
    const c = cohort(report(makeManifest(withBrands)));
    expect(c.splits.calibration.counts.selected + c.splits.holdout.counts.selected).toBe(12);
    expect(c.splits.calibration.counts.selected).toBe(6);
    expect(Object.keys(c.byBrand).sort()).toEqual(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
    expect(c.byBrand["11111111-1111-4111-8111-111111111111"].counts.selected).toBe(6);
  });

  it("ignores self-declared metrics and rejects extra manifest or judgment keys", () => {
    const m = makeManifest(specs);
    expect(() => buildSemanticEvaluationReport({ ...m.manifest, metrics: { precision: 1 } }, reviewsFor(m), NOW)).toThrow();
    expect(() => buildSemanticEvaluationReport(m.manifest, reviewsFor(m).map((j) => ({ ...j, precision: 1 })), NOW)).toThrow();
    expect(() => buildSemanticEvaluationReport({ ...m.manifest, rows: m.rows.map((r) => ({ ...r, precision: 1 })) }, reviewsFor(m), NOW)).toThrow();
  });
});

describe("metrics edge cases", () => {
  it("returns absent metrics (null value) for zero denominators, never 0", () => {
    const summary = summarizeSemanticReference([]);
    for (const metric of [summary.precision, summary.falseAlert, summary.abstention, summary.incrementalDetection!, summary.falseAlertAllHumanNoProblem]) {
      expect(metric.denominator).toBe(0);
      expect(metric.value).toBeNull();
      expect(metric.wilson95).toBeNull();
    }
  });

  it("computes Wilson 95% bounds", () => {
    const w = semanticWilson(5, 10)!;
    expect(w.lower).toBeCloseTo(0.2366, 3);
    expect(w.upper).toBeCloseTo(0.7634, 3);
    expect(semanticWilson(0, 10)!.lower).toBe(0);
    expect(semanticWilson(10, 10)!.upper).toBeCloseTo(1, 10);
    expect(semanticWilson(1, 0)).toBeNull();
  });

  it("counts six questions of one work as one family, not six independent units", () => {
    const rows: SemanticMetricRow[] = [{ human: ALERT, candidate: { ...ALERT, headline_claims: "unsupported", cta_claims: "contradicted" }, baselineAlert: false }];
    const s = summarizeSemanticReference(rows);
    expect(s.precision).toMatchObject({ numerator: 1, denominator: 1 });
    expect(s.counts.clearHuman).toBe(1);
  });

  it("lets alert prevail over abstain, and treats any human insufficient_context as ambiguous", () => {
    const mixed = { ...ALERT, cta_claims: "insufficient_context" as const };
    expect(summarizeSemanticReference([{ human: ALERT, candidate: mixed, baselineAlert: false }]).counts).toMatchObject({ tp: 1, abstentions: 0 });
    expect(summarizeSemanticReference([{ human: ABSTAIN, candidate: ALERT, baselineAlert: false }]).counts.clearHuman).toBe(0);
    expect(summarizeSemanticReference([{ human: ALERT, candidate: ABSTAIN, baselineAlert: false }]).counts).toMatchObject({ tp: 0, fn: 0, abstentions: 1 });
  });

  it("does not infer baseline detection when the baseline is unknown", () => {
    const s = summarizeSemanticReference([{ human: ALERT, candidate: ALERT, baselineAlert: null }]);
    expect(s.incrementalDetection).toMatchObject({ denominator: 0, value: null });
  });

  it("computes nearest-rank p50/p95 and absent percentiles for no data", () => {
    expect(semanticPercentiles([400, 100, 300, 200])).toEqual({ count: 4, p50: 200, p95: 400 });
    expect(semanticPercentiles([])).toEqual({ count: 0, p50: null, p95: null });
  });
});

describe("latency, queue age, usage and cost", () => {
  it("measures only sent rows; unknown stays null and cost is never estimated", () => {
    const m = makeManifest([
      { human: CLEAR, cand: CLEAR, http: 100, created: CREATED, sent: "2026-10-01T00:00:10.000Z" },
      { human: CLEAR, cand: CLEAR, http: 300, created: CREATED, sent: "2026-10-01T00:00:30.000Z", usage: null },
      { human: CLEAR, cand: "failed", http: null },
      { human: CLEAR, cand: CLEAR, sent: null, http: null },
    ]);
    const c = cohort(report(m));
    expect(c.counts.sendsStarted).toBe(3);
    expect(c.httpElapsedMs).toEqual({ count: 2, p50: 100, p95: 300 });
    expect(c.queueAgeMs.count).toBe(3);
    expect(c.queueAgeMs.p95).toBe(30_000);
    expect(c.usage).toEqual({ reported: 1, missing: 2, totals: { input_tokens: 10, output_tokens: 2 } });
    expect(c.cost).toBeNull();
  });

  it("returns null usage totals when nothing reported usage", () => {
    const m = makeManifest([{ human: CLEAR, cand: CLEAR, usage: null }]);
    expect(cohort(report(m)).usage).toEqual({ reported: 0, missing: 1, totals: null });
  });
});

describe("cohorts, provenance and secondary variants", () => {
  it("keeps synthetic and authorized origins in separate cohorts and labels provenance", () => {
    const m = makeManifest([{ origin: "synthetic" }, { origin: "authorized" }]);
    const r = buildSemanticEvaluationReport(m.manifest, [], NOW);
    expect(r.cohorts.map((c) => c.dataOrigin).sort()).toEqual(["authorized", "synthetic"]);
    expect(r.cohorts[0]).toMatchObject({ environment: "test", execution: "controlled", assurance: "declared" });
    expect(r.humanReference).toBe("synthetic_or_not_collected");
    expect(r.limitations.length).toBeGreaterThan(0);
  });

  it("separates cohorts by version and refuses available rows observed under other versions", () => {
    const m = makeManifest([{ human: CLEAR }, { human: CLEAR }]);
    m.manifest.rows[1].versions = { ...EVALUATION_VERSIONS, rubricVersion: "brief_copy_v0" } as never;
    expect(() => buildSemanticEvaluationReport(m.manifest, [], NOW)).toThrow("invalid_manifest_row");
    const unavailable = makeManifest([{ human: CLEAR }, { available: false, reason: "version_mismatch" }]);
    unavailable.manifest.rows[1].versions = { ...EVALUATION_VERSIONS, rubricVersion: "brief_copy_v0" } as never;
    const r = buildSemanticEvaluationReport(unavailable.manifest, [], NOW);
    expect(r.unavailable).toBe(1);
  });

  it("rejects inconsistent provenance (live environment declared controlled)", () => {
    const m = makeManifest([{}], { provenance: { environment: "production", execution: "controlled", assurance: "declared" } });
    expect(() => validateSemanticManifest(m.manifest)).toThrow("invalid_provenance");
    const ok = makeManifest([{}], { provenance: { environment: "staging", execution: "live_authorized", assurance: "declared" } });
    expect(() => validateSemanticManifest(ok.manifest)).not.toThrow();
  });

  it("rejects synthetic evidence presented as independent human reference", () => {
    const m = makeManifest([{ origin: "synthetic", human: CLEAR }]);
    expect(() => buildSemanticEvaluationReport(m.manifest, reviewsFor(m), NOW)).toThrow("synthetic_reference_is_not_human_evidence");
    const fixture = reviewsFor(m).map((j) => ({ ...j, referenceKind: "synthetic_fixture" }));
    const r = buildSemanticEvaluationReport(m.manifest, fixture, NOW);
    expect(r.humanReference).toBe("synthetic_or_not_collected");
  });

  it("keeps variants as secondary analysis outside family denominators", () => {
    const m = makeManifest([
      { family: "f1", human: CLEAR, cand: CLEAR },
      { family: "f1", primary: false, human: CLEAR, cand: ALERT },
      { family: "f2", human: ALERT, cand: ALERT },
    ]);
    const c = cohort(report(m));
    expect(c.counts).toMatchObject({ selected: 3, primaryFamilies: 2, secondaryVariants: 1 });
    expect(c.metrics.counts).toMatchObject({ fp: 0, tn: 1, tp: 1 });
    expect(c.secondary).toEqual([{ caseId: m.rows[1].caseId, referenceStatus: "clear" }]);
  });

  it("aggregates collection funnel including failed pages, exclusions, and null when absent", () => {
    const m = makeManifest([{}]);
    const run = (over: Record<string, unknown>) => ({
      id: uuid(), policyId: m.rows[0].policyId, workspaceId: m.manifest.plan.workspaceId, windowLower: "a", windowUpper: "b", recordedAt: CREATED, status: "collected", errorCode: null, initialPage: true,
      consulted: 10, eligible: 8, unique: 5, duplicates: 1, outOfScope: 1, invalid: 1, notSampled: 2, exclusions: { training: 1 }, windowComplete: true, ...over,
    });
    const none = buildSemanticEvaluationReport(m.manifest, [], NOW);
    expect(none.collection).toMatchObject({ consulted: null, sampled: null, failedPages: 0 });
    const failed = { status: "failed", errorCode: "collection_page_failed", consulted: 0, eligible: 0, unique: 0, duplicates: 0, outOfScope: 0, invalid: 0, notSampled: 0, exclusions: { training: 2, edited: 1 } };
    const r = buildSemanticEvaluationReport({ ...m.manifest, collectionHistoryComplete: true, collectionRuns: [run({}), run(failed)] }, [], NOW);
    // History is only complete when the first recorded run was the initial page (flag comes from the repository, not inferred).
    const lateFirst = buildSemanticEvaluationReport({ ...m.manifest, collectionHistoryComplete: false, collectionRuns: [run({ initialPage: false })] }, [], NOW);
    expect(lateFirst.collection.historyComplete).toBe(false);
    // A "complete" declaration without an initial-page run for the policy is a false-complete and is refused.
    expect(() => buildSemanticEvaluationReport({ ...m.manifest, collectionHistoryComplete: true, collectionRuns: [run({ initialPage: false })] }, [], NOW)).toThrow();
    // Any initial-page run of the policy suffices, whatever its position (equal recordedAt may order ids arbitrarily).
    expect(buildSemanticEvaluationReport({ ...m.manifest, collectionHistoryComplete: true, collectionRuns: [run({ initialPage: false }), run({ initialPage: true })] }, [], NOW).collection.historyComplete).toBe(true);
    // Without runs there is no complete history.
    expect(() => buildSemanticEvaluationReport({ ...m.manifest, collectionHistoryComplete: true, collectionRuns: [] }, [], NOW)).toThrow();
    expect(none.collection.historyComplete).toBe(false);
    expect(r.collection.historyComplete).toBe(true);
    expect(r.collection).toMatchObject({ consulted: 10, eligible: 8, unique: 5, duplicates: 1, sampled: 6, failedPages: 1, exclusions: { training: 3, edited: 1 } });
    for (const bad of [
      run({ consulted: 11 }), run({ eligible: 9 }), run({ workspaceId: uuid() }), run({ policyId: uuid() }), run({ errorCode: "collection_page_failed" }),
      run({ ...failed, errorCode: null }), run({ errorCode: "other" }), run({ extra: 1 }), run({ initialPage: "yes" }), run({ initialPage: undefined }),
    ]) expect(() => buildSemanticEvaluationReport({ ...m.manifest, collectionRuns: [bad] }, [], NOW)).toThrow();
  });
});

describe("unavailable inputs are counted, never fabricated", () => {
  it("counts edited, deleted and unavailable observations and excludes them from metrics", () => {
    const m = makeManifest([
      { human: CLEAR, cand: CLEAR },
      { available: false, reason: "hash_mismatch", origin: null },
      { available: false, reason: "context_unavailable", origin: null },
      { available: false, reason: "observation_unavailable", origin: null },
    ]);
    const r = report(m);
    expect(r.selected).toBe(4);
    expect(r.unavailable).toBe(3);
    expect(r.recoverable).toBe(1);
    const c = cohort(r, null);
    expect(c.counts.referenceStates.unavailable).toBe(3);
    expect(c.metrics.counts.clearHuman).toBe(0);
    expect(cohort(r).metrics.counts.tn).toBe(1);
  });

  it("rejects judgments on unavailable cases and available rows without a hash", () => {
    const m = makeManifest([{ available: false, origin: null }, { human: CLEAR }]);
    const bad = judgment(m.manifest, "ana", [{ ...label(m.rows[1], CLEAR), caseId: m.rows[0].caseId, familyId: m.rows[0].familyId, caseHash: HASH_A }]);
    expect(() => validateSemanticJudgments(validateSemanticManifest(m.manifest), [bad], NOW)).toThrow("judgment_case_mismatch");
    const broken = makeManifest([{}]);
    broken.manifest.rows[0].semanticHash = null;
    broken.manifest.rows[0].caseHash = semanticBlindDigest(SEED, { caseId: broken.manifest.rows[0].caseId, semanticHash: null });
    expect(() => validateSemanticManifest(broken.manifest)).toThrow("invalid_manifest_row");
    const nobase = makeManifest([{}]);
    nobase.manifest.rows[0].baselineAlert = null;
    expect(() => validateSemanticManifest(nobase.manifest)).toThrow("invalid_manifest_row");
    const noReason = makeManifest([{ available: false, origin: null }]);
    noReason.manifest.rows[0].unavailableReason = null;
    expect(() => validateSemanticManifest(noReason.manifest)).toThrow("invalid_manifest_row");
  });
});

describe("two reviewers, disagreement, adjudication and ambiguity", () => {
  const single = () => makeManifest([{ human: ALERT, cand: ALERT, baseline: false }]);

  it("reports missing_reviews / missing_second_review without clear labels or invented rates", () => {
    const m = single();
    const none = cohort(buildSemanticEvaluationReport(m.manifest, [], NOW));
    expect(none.counts.referenceStates.missing_reviews).toBe(1);
    expect(none.metrics.counts.clearHuman).toBe(0);
    const one = cohort(buildSemanticEvaluationReport(m.manifest, [judgment(m.manifest, "ana", [label(m.rows[0], ALERT)])], NOW));
    expect(one.counts.referenceStates.missing_second_review).toBe(1);
    expect(one.metrics.precision.value).toBeNull();
    expect(one.counts.clearLabels).toBe(0);
  });

  it("flags disagreement as awaiting_adjudication until adjudicated", () => {
    const m = single();
    const a = judgment(m.manifest, "ana", [label(m.rows[0], ALERT)]);
    const b = judgment(m.manifest, "bia", [label(m.rows[0], CLEAR)]);
    const pending = cohort(buildSemanticEvaluationReport(m.manifest, [a, b], NOW));
    expect(pending.counts.referenceStates.awaiting_adjudication).toBe(1);
    expect(pending.metrics.counts.clearHuman).toBe(0);
    const adj = adjudication(m.manifest, [a, b], "carla", [label(m.rows[0], ALERT)]);
    const done = cohort(buildSemanticEvaluationReport(m.manifest, [a, b, adj], NOW));
    expect(done.counts.referenceStates.clear).toBe(1);
    expect(done.metrics.counts.tp).toBe(1);
  });

  it("treats disagreement on only the ambiguous flag as unresolved", () => {
    const m = single();
    const a = judgment(m.manifest, "ana", [label(m.rows[0], ALERT, true)]);
    const b = judgment(m.manifest, "bia", [label(m.rows[0], ALERT, false)]);
    expect(cohort(buildSemanticEvaluationReport(m.manifest, [a, b], NOW)).counts.referenceStates.awaiting_adjudication).toBe(1);
  });

  it("keeps ambiguity explicit: flagged or insufficient_context labels stay out of clear labels", () => {
    const flagged = makeManifest([{ human: ALERT, cand: ALERT }]);
    const a = judgment(flagged.manifest, "ana", [label(flagged.rows[0], ALERT, true)]);
    const b = judgment(flagged.manifest, "bia", [label(flagged.rows[0], ALERT, true)]);
    const c = cohort(buildSemanticEvaluationReport(flagged.manifest, [a, b], NOW));
    expect(c.counts.referenceStates.ambiguous).toBe(1);
    expect(c.metrics.counts.clearHuman).toBe(0);
    const insufficient = makeManifest([{ human: ALERT }]);
    const x = judgment(insufficient.manifest, "ana", [label(insufficient.rows[0], ABSTAIN)]);
    const y = judgment(insufficient.manifest, "bia", [label(insufficient.rows[0], ABSTAIN)]);
    expect(cohort(buildSemanticEvaluationReport(insufficient.manifest, [x, y], NOW)).counts.referenceStates.ambiguous).toBe(1);
  });

  it("canonicalizes reviewerId by trim and lowercase and requires two distinct reviewers", () => {
    const m = single();
    const parsed = judgmentSchema.parse(judgment(m.manifest, "  ANA ", [label(m.rows[0], ALERT)]));
    expect(parsed.reviewerId).toBe("ana");
    const a = judgment(m.manifest, "Ana ", [label(m.rows[0], ALERT)]);
    const b = judgment(m.manifest, " ana", [label(m.rows[0], ALERT)]);
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, b], NOW)).toThrow(/duplicate_reviewer_judgment|distinct_reviewers_required/);
  });

  it("rejects invalid adjudications", () => {
    const m = single();
    const a = judgment(m.manifest, "ana", [label(m.rows[0], ALERT)]);
    const b = judgment(m.manifest, "bia", [label(m.rows[0], CLEAR)]);
    const ok = (over: Record<string, unknown> = {}, reviewer = "carla") => adjudication(m.manifest, [a, b], reviewer, [label(m.rows[0], ALERT)], over);
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, b, ok({}, "ana")], NOW)).toThrow("invalid_adjudication");        // a reviewer cannot adjudicate
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, b, ok({ resolves: [HASH_A, "c".repeat(64)] })], NOW)).toThrow("invalid_adjudication");
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, b, ok({ createdAt: "2026-10-01T05:00:00.000Z" })], NOW)).toThrow("invalid_adjudication"); // before reviews
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, ok()], NOW)).toThrow("adjudication_requires_two_reviews");
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, b, ok(), ok({}, "dora")], NOW)).toThrow("too_many_case_judgments");
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, b, judgment(m.manifest, "eva", [label(m.rows[0], ALERT)])], NOW)).toThrow("too_many_case_judgments");
    expect(() => buildSemanticEvaluationReport(m.manifest, [{ ...a, resolves: [HASH_A, HASH_A] }, b], NOW)).toThrow("invalid_adjudication");   // review with resolves
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, b, { ...ok(), resolves: undefined }], NOW)).toThrow("invalid_adjudication");    // adjudication without resolves
  });

  it("rejects resubmission of the same reviewer's judgment for a case (no history overwrite)", () => {
    const m = single();
    const a = judgment(m.manifest, "ana", [label(m.rows[0], ALERT)]);
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, { ...a, createdAt: LATER, cases: [label(m.rows[0], CLEAR)] }], NOW)).toThrow("duplicate_reviewer_judgment");
  });
});

describe("judgment validation against manifest", () => {
  const m = makeManifest([{ human: CLEAR, cand: CLEAR }]);
  const base = () => judgment(m.manifest, "ana", [label(m.rows[0], CLEAR)]);
  const run = (j: unknown, now = NOW) => buildSemanticEvaluationReport(m.manifest, [j], now);

  it("accepts the valid baseline judgment", () => expect(() => run(base())).not.toThrow());
  it("rejects another export, plan or blind hash", () => {
    for (const over of [{ exportId: uuid() }, { planHash: HASH_A }, { blindHash: HASH_A }]) expect(() => run({ ...base(), ...over })).toThrow("judgment_manifest_mismatch");
  });
  it("rejects judgments dated before the export or in the future", () => {
    expect(() => run({ ...base(), createdAt: "2026-09-30T00:00:00.000Z" })).toThrow("judgment_manifest_mismatch");
    expect(() => run({ ...base(), createdAt: "2026-10-03T00:00:00.000Z" })).toThrow("judgment_manifest_mismatch");
  });
  it("rejects divergent hash, familyId, unknown case", () => {
    const c = base().cases[0];
    for (const bad of [{ caseHash: HASH_A }, { familyId: uuid() }, { caseId: uuid() }]) {
      expect(() => run({ ...base(), cases: [{ ...c, ...bad }] })).toThrow("judgment_case_mismatch");
    }
  });
  it("rejects wrong versions, model, rubric hash", () => {
    const c = base().cases[0];
    for (const versions of [{ ...LABEL_VERSIONS, inputVersion: "semantic_input_v0" }, { ...LABEL_VERSIONS, rubricVersion: "other" }, { ...LABEL_VERSIONS, rubricHash: HASH_A }, { ...LABEL_VERSIONS, model: SEMANTIC_MODEL }]) {
      expect(() => run({ ...base(), cases: [{ ...c, versions }] })).toThrow();
    }
  });
  it("rejects classes outside each question's option set and missing questions", () => {
    const c = base().cases[0];
    const cases = (labels: unknown) => [{ ...c, labels }];
    expect(() => run({ ...base(), cases: cases({ ...CLEAR, intent_alignment: "supported" }) })).toThrow();
    expect(() => run({ ...base(), cases: cases({ ...CLEAR, prohibited_claims: "aligned" }) })).toThrow();
    expect(() => run({ ...base(), cases: cases({ ...CLEAR, body_claims: "approved" }) })).toThrow();
    expect(() => run({ ...base(), cases: cases({ ...CLEAR, body_claims: "human_approved" }) })).toThrow();
    const partial = Object.fromEntries(Object.entries(CLEAR).filter(([key]) => key !== "cta_claims"));
    expect(() => run({ ...base(), cases: cases(partial) })).toThrow();
    expect(() => run({ ...base(), cases: cases({ ...CLEAR, extra: "x" }) })).toThrow();
    expect(() => run({ ...base(), cases: [] })).toThrow();
  });
  it("rejects unknown reference kinds (aesthetic approval, agent selection are not factual labels)", () => {
    for (const referenceKind of ["human_approval", "agent_selection", "aesthetic_approval"]) expect(() => run({ ...base(), referenceKind })).toThrow();
  });
});

describe("family plan", () => {
  const plan = (entries: Array<Record<string, unknown>>, over: Record<string, unknown> = {}) => ({
    version: 1, workspaceId: uuid(), selectedAt: "2026-09-30T00:00:00.000Z", selectedBy: "selector", selectedBeforeResults: true,
    entries: entries.map((e) => ({ reviewId: uuid(), split: "holdout", primary: true, ...e })), ...over,
  });
  it("accepts one primary per family with variants", () => {
    expect(() => parseSemanticFamilyPlan(plan([{ familyId: "f1" }, { familyId: "f1", primary: false }, { familyId: "f2", split: "calibration" }]), NOW)).not.toThrow();
  });
  it("rejects a family in both calibration and holdout", () => {
    expect(() => parseSemanticFamilyPlan(plan([{ familyId: "f1", split: "calibration" }, { familyId: "f1", split: "holdout", primary: false }]), NOW)).toThrow("family_split_leakage");
  });
  it("requires exactly one primary representative per family", () => {
    expect(() => parseSemanticFamilyPlan(plan([{ familyId: "f1", primary: false }]), NOW)).toThrow("invalid_family_representative");
    expect(() => parseSemanticFamilyPlan(plan([{ familyId: "f1" }, { familyId: "f1" }]), NOW)).toThrow("invalid_family_representative");
  });
  it("rejects duplicate review ids, unknown splits and unordered or non-declared selection", () => {
    const id = uuid();
    expect(() => parseSemanticFamilyPlan(plan([{ familyId: "f1", reviewId: id }, { familyId: "f2", reviewId: id }]), NOW)).toThrow("invalid_family_plan");
    expect(() => parseSemanticFamilyPlan(plan([{ familyId: "f1", split: "validation" }]), NOW)).toThrow();
    expect(() => parseSemanticFamilyPlan(plan([{ familyId: "f1" }], { selectedAt: "2026-10-03T00:00:00.000Z" }), NOW)).toThrow("invalid_family_plan");
    expect(() => parseSemanticFamilyPlan(plan([{ familyId: "f1" }], { selectedBeforeResults: false }), NOW)).toThrow();
    expect(() => parseSemanticFamilyPlan(plan([]), NOW)).toThrow();
    expect(() => parseSemanticFamilyPlan(plan([{ familyId: "f1" }], { extra: 1 }), NOW)).toThrow();
  });
});

describe("manifest integrity", () => {
  it("rejects a tampered plan hash, plan/row mismatches and bad completed rows", () => {
    const m = makeManifest([{ family: "f1" }, { family: "f2" }]);
    expect(() => validateSemanticManifest({ ...m.manifest, planHash: HASH_A })).toThrow("manifest_plan_mismatch");
    expect(() => validateSemanticManifest({ ...m.manifest, rows: m.manifest.rows.slice(0, 1) })).toThrow("manifest_plan_mismatch");
    const swapped = structuredClone(m.manifest);
    swapped.rows[0].sourceFamilyId = "other";
    expect(() => validateSemanticManifest(swapped)).toThrow("manifest_plan_mismatch");
    const split = structuredClone(m.manifest);
    split.rows[0].split = "calibration";
    expect(() => validateSemanticManifest(split)).toThrow("manifest_plan_mismatch");
    const dupCase = structuredClone(m.manifest);
    dupCase.rows[1].caseId = dupCase.rows[0].caseId;
    expect(() => validateSemanticManifest(dupCase)).toThrow("manifest_plan_mismatch");
    const wrongModel = structuredClone(m.manifest);
    wrongModel.rows[0].returnedModel = "jev-9";
    expect(() => validateSemanticManifest(wrongModel)).toThrow("invalid_manifest_decisions");
    const badDecisions = structuredClone(m.manifest);
    (badDecisions.rows[0] as { decisions: unknown }).decisions = { ...CLEAR, intent_alignment: "supported" };
    expect(() => validateSemanticManifest(badDecisions)).toThrow("invalid_manifest_decisions");
  });
  it("rejects rows whose family uuid differs within one source family", () => {
    const m = makeManifest([{ family: "f1" }, { family: "f1", primary: false }]);
    const changed = structuredClone(m.manifest);
    changed.rows[1].familyId = uuid();
    expect(() => validateSemanticManifest(changed)).toThrow("manifest_plan_mismatch");
  });
  it("rejects manifest created before plan selection and a different version stamp", () => {
    const m = makeManifest([{}]);
    expect(() => validateSemanticManifest({ ...m.manifest, createdAt: "2026-09-29T00:00:00.000Z" })).toThrow("invalid_family_plan");
    const wrong = structuredClone(m.manifest);
    (wrong.rows[0].versions as { model: string }).model = "jev-2";
    expect(() => validateSemanticManifest(wrong)).toThrow();
  });
});

describe("review hardening contract", () => {
  const authorizedPair = () => {
    const m = makeManifest([{ human: ALERT, cand: ALERT, baseline: false }]);
    const a = judgment(m.manifest, "ana", [label(m.rows[0], ALERT)]);
    const b = judgment(m.manifest, "bia", [label(m.rows[0], CLEAR)]);
    return { m, a, b };
  };

  it("reports the reconstruction rate over every selected representative, including unavailable rows without origin, overall and by split", () => {
    const m = makeManifest([
      { split: "calibration", cand: CLEAR }, { split: "calibration", available: false, origin: null },
      { split: "holdout", cand: CLEAR }, { split: "holdout", cand: CLEAR }, { split: "holdout", available: false, origin: null, reason: "hash_mismatch" },
      { split: "holdout", family: "variant-only", primary: true, available: false, origin: null, reason: "context_unavailable" },
    ]);
    const r = buildSemanticEvaluationReport(m.manifest, [], NOW) as unknown as {
      reconstructionRate: { numerator: number; denominator: number; value: number | null };
      reconstructionBySplit: Record<"calibration" | "holdout", { numerator: number; denominator: number; value: number | null }>;
    };
    expect(r.reconstructionRate).toMatchObject({ numerator: 3, denominator: 6 });
    expect(r.reconstructionBySplit.calibration).toMatchObject({ numerator: 1, denominator: 2, value: 0.5 });
    expect(r.reconstructionBySplit.holdout).toMatchObject({ numerator: 2, denominator: 4, value: 0.5 });
  });

  it("does not count secondary variants in the reconstruction rate", () => {
    const m = makeManifest([{ family: "f", cand: CLEAR }, { family: "f", primary: false, available: false, origin: null }]);
    const r = buildSemanticEvaluationReport(m.manifest, [], NOW) as unknown as { reconstructionRate: { numerator: number; denominator: number } };
    expect(r.reconstructionRate).toMatchObject({ numerator: 1, denominator: 1 });
  });

  it("rejects an adjudication of two concordant reviewers and counts valid adjudications", () => {
    const m = makeManifest([{ human: ALERT, cand: ALERT, baseline: false }]);
    const a = judgment(m.manifest, "ana", [label(m.rows[0], ALERT)]);
    const b = judgment(m.manifest, "bia", [label(m.rows[0], ALERT)]);
    const concordant = adjudication(m.manifest, [a, b], "carla", [label(m.rows[0], ALERT)]);
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, b, concordant], NOW)).toThrow("invalid_adjudication");
    expect(cohort(buildSemanticEvaluationReport(m.manifest, [a, b], NOW)).counts.referenceStates).toMatchObject({ clear: 1, adjudicated: 0 });

    const { m: d, a: da, b: db } = authorizedPair();
    const valid = adjudication(d.manifest, [da, db], "carla", [label(d.rows[0], ALERT)]);
    const counts = cohort(buildSemanticEvaluationReport(d.manifest, [da, db, valid], NOW)).counts.referenceStates;
    expect(counts).toMatchObject({ clear: 1, adjudicated: 1, awaiting_adjudication: 0 });
    // A valid adjudication that resolves to an ambiguous final label keeps the ambiguous status and is still counted.
    const ambiguous = adjudication(d.manifest, [da, db], "carla", [label(d.rows[0], ABSTAIN, true)]);
    expect(cohort(buildSemanticEvaluationReport(d.manifest, [da, db, ambiguous], NOW)).counts.referenceStates).toMatchObject({ ambiguous: 1, adjudicated: 1, clear: 0 });
  });

  it("exposes canonical, ordered manifest and judgment hashes in the report", () => {
    const { m, a, b } = authorizedPair();
    const adj = adjudication(m.manifest, [a, b], "carla", [label(m.rows[0], ALERT)]);
    const forward = buildSemanticEvaluationReport(m.manifest, [a, b, adj], NOW) as unknown as { manifestHash: string; judgmentHashes: string[] };
    const shuffled = buildSemanticEvaluationReport(m.manifest, [adj, b, a], NOW) as unknown as { manifestHash: string; judgmentHashes: string[] };
    const expected = [a, b, adj].map((j) => semanticDigest(judgmentSchema.parse(j))).sort();
    expect(forward.manifestHash).toBe(semanticDigest(m.manifest));
    expect(forward.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(forward.judgmentHashes).toEqual(expected);
    expect(shuffled.judgmentHashes).toEqual(expected);
    expect(shuffled.manifestHash).toBe(forward.manifestHash);
    expect((buildSemanticEvaluationReport(m.manifest, [], NOW) as unknown as { judgmentHashes: string[] }).judgmentHashes).toEqual([]);
  });

  it("rejects a case whose reviewers or adjudicator used different reference kinds", () => {
    const m = makeManifest([{ human: ALERT, cand: ALERT }]);
    const a = judgment(m.manifest, "ana", [label(m.rows[0], ALERT)], { referenceKind: "independent_human" });
    const b = judgment(m.manifest, "bia", [label(m.rows[0], ALERT)], { referenceKind: "synthetic_fixture" });
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, b], NOW)).toThrow();
    const same = judgment(m.manifest, "bia", [label(m.rows[0], CLEAR)], { referenceKind: "independent_human" });
    const mixedAdjudication = adjudication(m.manifest, [a, same], "carla", [label(m.rows[0], ALERT)], { referenceKind: "synthetic_fixture" });
    expect(() => buildSemanticEvaluationReport(m.manifest, [a, same, mixedAdjudication], NOW)).toThrow();
    const consistent = adjudication(m.manifest, [a, same], "carla", [label(m.rows[0], ALERT)], { referenceKind: "independent_human" });
    expect(buildSemanticEvaluationReport(m.manifest, [a, same, consistent], NOW).humanReference).toBe("independent_human");
  });

  it("canonicalizes reviewer ids with NFKC and rejects format/control characters", () => {
    const m = makeManifest([{ human: CLEAR }]);
    const make = (reviewerId: string) => judgment(m.manifest, reviewerId, [label(m.rows[0], CLEAR)]);
    expect(judgmentSchema.parse(make("ＡＮＡ ")).reviewerId).toBe("ana");
    expect(judgmentSchema.parse(make("ﬁna")).reviewerId).toBe("fina");
    for (const bad of ["​ana", "an‍a", "‮ana", "﻿ana", "an\u0000a", "an\ta", "⁦ana"]) expect(() => judgmentSchema.parse(make(bad))).toThrow();
    // The same person under compatible spellings cannot review one case twice.
    expect(() => buildSemanticEvaluationReport(m.manifest, [make("ana"), make("ＡＮＡ")], NOW)).toThrow();
  });
});

describe("blinding seed, processing scope and per-question reference", () => {
  it("binds each case to a keyed hash: tampering, wrong seed shape and legacy semanticHash labels are refused", () => {
    expect(semanticBlindDigest("a".repeat(64), { x: 1 })).toBe(semanticBlindDigest("a".repeat(64), { x: 1 }));
    expect(semanticBlindDigest("a".repeat(64), { x: 1 })).not.toBe(semanticBlindDigest("b".repeat(64), { x: 1 }));
    const m = makeManifest([{ human: CLEAR }]);
    expect(m.rows[0].caseHash).toBe(semanticBlindDigest(SEED, { caseId: m.rows[0].caseId, semanticHash: m.rows[0].semanticHash }));
    expect(m.rows[0].caseHash).not.toBe(m.rows[0].semanticHash);
    const tampered = structuredClone(m.manifest);
    tampered.rows[0].caseHash = HASH_A;
    expect(() => validateSemanticManifest(tampered)).toThrow("manifest_case_hash_mismatch");
    expect(() => validateSemanticManifest({ ...m.manifest, blindingSeed: "short" })).toThrow();
    const withoutSeed = Object.fromEntries(Object.entries(m.manifest).filter(([key]) => key !== "blindingSeed"));
    expect(() => validateSemanticManifest(withoutSeed)).toThrow();
    const legacy = judgment(m.manifest, "ana", [{ ...label(m.rows[0], CLEAR), semanticHash: m.rows[0].semanticHash! } as never]);
    expect(() => buildSemanticEvaluationReport(m.manifest, [legacy], NOW)).toThrow();
  });

  const obs = (policyId: string, over: Record<string, unknown> = {}) => ({
    policyId, dataOrigin: "authorized", versions: EVALUATION_VERSIONS, state: "completed", createdAt: CREATED,
    sendStartedAt: "2026-10-01T00:00:10.000Z", httpElapsedMs: 100, usage: { input_tokens: 10, output_tokens: 2 }, errorCode: null, ...over,
  });
  const runFor = (policyId: string, workspaceId: string, unique: number) => ({
    id: uuid(), policyId, workspaceId, windowLower: "a", windowUpper: "b", recordedAt: CREATED, status: "collected", errorCode: null, initialPage: true,
    consulted: unique, eligible: unique, unique, duplicates: 0, outOfScope: 0, invalid: 0, notSampled: 0, exclusions: {}, windowComplete: true,
  });
  type Processing = {
    scope: string; coverageComplete: boolean; retainedObservations: number;
    counts: Record<string, number>; validResponseRate: { numerator: number; denominator: number } | null; knownValidResponseRate: { numerator: number; denominator: number };
    censoredAtTimeout: number; httpElapsedMs: { count: number; p95: number | null }; byPolicy: Record<string, { coverageComplete: boolean }>;
    cohorts: Array<{ dataOrigin: string; coverageComplete: boolean }>;
  };
  const processing = (over: Record<string, unknown>, observationCount = 3, unique = observationCount) => {
    const m = makeManifest([{ human: CLEAR }]);
    const policyId = m.rows[0].policyId!;
    const manifest = {
      ...m.manifest, collectionHistoryComplete: true, collectionRuns: [runFor(policyId, m.manifest.plan.workspaceId, unique)],
      processingObservations: Array.from({ length: observationCount }, (_, i) => obs(policyId, i === 2 ? { state: "failed", errorCode: "http_error", usage: null } : {})), ...over,
    };
    return { m, policyId, report: buildSemanticEvaluationReport(manifest, [], NOW) as unknown as { processing: Processing } };
  };

  it("summarizes every surviving observation of the selected policies, with coverage only when the funnel reconciles", () => {
    const { report, policyId } = processing({});
    expect(report.processing).toMatchObject({ scope: "all_surviving_observations_of_selected_policies", coverageComplete: true, retainedObservations: 3 });
    expect(report.processing.counts).toMatchObject({ sendsStarted: 3, validResponses: 2, failed: 1 });
    expect(report.processing.validResponseRate).toMatchObject({ numerator: 2, denominator: 3 });
    expect(report.processing.byPolicy[policyId].coverageComplete).toBe(true);
    expect(report.processing.cohorts).toHaveLength(1);
  });

  it("withholds the valid-response rate but keeps the known rate when observations were lost or history is incomplete", () => {
    const lost = processing({}, 3, 4).report.processing;
    expect(lost.coverageComplete).toBe(false);
    expect(lost.validResponseRate).toBeNull();
    expect(lost.knownValidResponseRate).toMatchObject({ numerator: 2, denominator: 3 });
    const incomplete = processing({ collectionHistoryComplete: false, collectionRuns: [] }).report.processing;
    expect(incomplete.coverageComplete).toBe(false);
    expect(incomplete.validResponseRate).toBeNull();
    expect(incomplete.knownValidResponseRate).toMatchObject({ denominator: 3 });
  });

  it("rejects processing metadata of a policy that is not selected", () => {
    const m = makeManifest([{ human: CLEAR }]);
    expect(() => buildSemanticEvaluationReport({ ...m.manifest, processingObservations: [obs(uuid())] }, [], NOW)).toThrow("invalid_processing_evidence");
    expect(() => buildSemanticEvaluationReport({ ...m.manifest, processingObservations: [{ ...obs(m.rows[0].policyId!), id: uuid() }] }, [], NOW)).toThrow();
    expect(() => buildSemanticEvaluationReport({ ...m.manifest, processingObservations: [{ ...obs(m.rows[0].policyId!), text: "x" }] }, [], NOW)).toThrow();
  });

  it("treats timeouts as censored measurements, not as latency percentiles", () => {
    const { report } = processing({}, 3);
    expect(report.processing.censoredAtTimeout).toBe(0);
    const m = makeManifest([{ human: CLEAR }]);
    const policyId = m.rows[0].policyId!;
    const withTimeout = buildSemanticEvaluationReport({
      ...m.manifest, processingObservations: [obs(policyId, { httpElapsedMs: 100 }), obs(policyId, { state: "failed", errorCode: "timeout", httpElapsedMs: 5000, usage: null })],
    }, [], NOW) as unknown as { processing: Processing };
    expect(withTimeout.processing.censoredAtTimeout).toBe(1);
    expect(withTimeout.processing.httpElapsedMs).toMatchObject({ count: 1, p95: 100 });
  });

  it("keeps a family with one insufficient field ambiguous overall but usable per clear question when not flagged ambiguous", () => {
    const partial: SemanticDecisions = { ...ALERT, cta_claims: "insufficient_context" };
    const m = makeManifest([{ human: ALERT, cand: ALERT, baseline: false }]);
    const labels = (ambiguous: boolean) => [judgment(m.manifest, "ana", [label(m.rows[0], partial, ambiguous)]), judgment(m.manifest, "bia", [label(m.rows[0], partial, ambiguous)])];
    const open = cohort(buildSemanticEvaluationReport(m.manifest, labels(false), NOW));
    expect(open.counts.referenceStates.ambiguous).toBe(1);
    expect(open.metrics.counts.clearHuman).toBe(0);
    expect(open.byQuestion.body_claims.counts).toMatchObject({ tp: 1, clearHuman: 1 });
    expect(open.byQuestion.cta_claims.counts.clearHuman).toBe(0);
    const flagged = cohort(buildSemanticEvaluationReport(m.manifest, labels(true), NOW));
    expect(flagged.metrics.counts.clearHuman).toBe(0);
    expect(flagged.byQuestion.body_claims.counts.clearHuman).toBe(0);
  });
});
