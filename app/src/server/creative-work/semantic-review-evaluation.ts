import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJsonStringify } from "./canonical-json";
import {
  parseControlledDecisions, SEMANTIC_INPUT_VERSION, SEMANTIC_MODEL, SEMANTIC_PROFILE,
  SEMANTIC_QUESTIONS, SEMANTIC_RUBRIC_HASH, SEMANTIC_RUBRIC_VERSION, type SemanticDecisions,
} from "./semantic-review-offline";
import { addSemanticMatrix, emptySemanticMatrix, semanticRatio, summarizeSemanticReference, validateSemanticFamilies } from "./semantic-review-metrics";

export const semanticDigest = (value: unknown) => createHash("sha256").update(canonicalJsonStringify(value)).digest("hex");
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const token = z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f]+$/);
export const labelVersionsSchema = z.object({
  inputVersion: z.literal(SEMANTIC_INPUT_VERSION), rubricVersion: z.literal(SEMANTIC_RUBRIC_VERSION), rubricHash: z.literal(SEMANTIC_RUBRIC_HASH),
}).strict();
export const LABEL_VERSIONS = { inputVersion: SEMANTIC_INPUT_VERSION, rubricVersion: SEMANTIC_RUBRIC_VERSION, rubricHash: SEMANTIC_RUBRIC_HASH } as const;
export const evaluationVersionsSchema = labelVersionsSchema.extend({ profile: z.literal(SEMANTIC_PROFILE), model: z.literal(SEMANTIC_MODEL) }).strict();
const observedVersionsSchema = z.object({ inputVersion: token, rubricVersion: token, rubricHash: hash, profile: token, model: token }).strict();
export const EVALUATION_VERSIONS = { ...LABEL_VERSIONS, profile: SEMANTIC_PROFILE, model: SEMANTIC_MODEL } as const;
export const familyPlanSchema = z.object({
  version: z.literal(1), workspaceId: z.string().uuid(),
  selectedAt: z.string().datetime(), selectedBy: token, selectedBeforeResults: z.literal(true),
  entries: z.array(z.object({ reviewId: z.string().uuid(), familyId: token,
    split: z.enum(["calibration", "holdout"]), primary: z.boolean() }).strict()).min(1).max(100),
}).strict();
export type SemanticFamilyPlan = z.infer<typeof familyPlanSchema>;
export function parseSemanticFamilyPlan(raw: unknown, now: Date) {
  const plan = familyPlanSchema.parse(raw);
  if (!Number.isFinite(now.getTime()) || Date.parse(plan.selectedAt) > now.getTime()) throw new Error("invalid_family_plan");
  validateSemanticFamilies(plan.entries.map((e) => ({ id: e.reviewId, family: e.familyId, split: e.split, primary: e.primary })));
  return plan;
}
export const collectionRunSchema = z.object({
  id: z.string().uuid(), policyId: z.string().uuid(), workspaceId: z.string().uuid(),
  windowLower: z.string(), windowUpper: z.string(), recordedAt: z.string().datetime(),
  status: z.enum(["collected", "failed"]), consulted: z.number().int().nonnegative(), eligible: z.number().int().nonnegative(),
  errorCode: z.literal("collection_page_failed").nullable(),
  unique: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative(), outOfScope: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(), notSampled: z.number().int().nonnegative(),
  exclusions: z.record(z.number().int().nonnegative()), windowComplete: z.boolean(),
  initialPage: z.boolean(),
}).strict();
export const evaluationRowSchema = z.object({
  reviewId: z.string().uuid(), caseId: z.string().uuid(), familyId: z.string().uuid(),
  sourceFamilyId: token, split: z.enum(["calibration", "holdout"]), primary: z.boolean(),
  clientProfileId: z.string().uuid().nullable(), workItemId: z.string().uuid().nullable(), policyId: z.string().uuid().nullable(),
  semanticHash: hash.nullable(), versions: observedVersionsSchema,
  dataOrigin: z.enum(["synthetic", "authorized"]).nullable(),
  state: z.enum(["queued", "running", "completed", "failed", "skipped", "outcome_unknown"]).nullable(),
  available: z.boolean(), unavailableReason: z.enum(["observation_unavailable", "context_unavailable", "hash_mismatch", "version_mismatch"]).nullable(),
  decisions: z.unknown().nullable(), baselineAlert: z.boolean().nullable(),
  confidence: z.record(z.number().min(0).max(1)).nullable(), probabilities: z.record(z.record(z.number().min(0).max(1))).nullable(),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }).strict().nullable(),
  returnedModel: z.string().nullable(), currentAtCompletion: z.boolean().nullable(), errorCode: z.string().nullable(),
  createdAt: z.string().datetime().nullable(), sendStartedAt: z.string().datetime().nullable(), finishedAt: z.string().datetime().nullable(),
  httpElapsedMs: z.number().nonnegative().nullable(),
}).strict();
export type SemanticEvaluationRow = z.infer<typeof evaluationRowSchema>;
export const evaluationManifestSchema = z.object({
  version: z.literal(1), exportId: z.string().uuid(), createdAt: z.string().datetime(),
  authorizationHash: hash, planHash: hash, blindHash: hash, plan: familyPlanSchema,
  provenance: z.object({ environment: z.enum(["test", "staging", "production"]).nullable(),
    execution: z.enum(["controlled", "live_authorized"]).nullable(), assurance: z.literal("declared") }).strict(),
  collectionRuns: z.array(collectionRunSchema), collectionHistoryComplete: z.boolean(),
  rows: z.array(evaluationRowSchema).min(1).max(100),
}).strict();
export type SemanticEvaluationManifest = z.infer<typeof evaluationManifestSchema>;
const decisions = z.unknown().transform((value, ctx) => {
  const parsed = parseControlledDecisions({ model: SEMANTIC_MODEL, decisions: value });
  if (!parsed) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_semantic_labels" }); return z.NEVER; }
  return parsed;
});
const labelSchema = z.object({ caseId: z.string().uuid(), familyId: z.string().uuid(), semanticHash: hash,
  versions: labelVersionsSchema, labels: decisions, ambiguous: z.boolean() }).strict();
export const judgmentSchema = z.object({
  version: z.literal(1), kind: z.enum(["review", "adjudication"]), exportId: z.string().uuid(), planHash: hash, blindHash: hash,
  reviewerId: token.transform((value) => value.toLowerCase()), createdAt: z.string().datetime(),
  referenceKind: z.enum(["synthetic_fixture", "independent_human"]),
  resolves: z.array(hash).length(2).optional(), cases: z.array(labelSchema).min(1).max(100),
}).strict();
export type SemanticJudgment = z.infer<typeof judgmentSchema>;
export type SemanticReference = { status: "unavailable" | "missing_reviews" | "missing_second_review" | "awaiting_adjudication" | "ambiguous" | "clear"; labels: SemanticDecisions | null };

export function validateSemanticManifest(raw: unknown): SemanticEvaluationManifest {
  const manifest = evaluationManifestSchema.parse(raw);
  parseSemanticFamilyPlan(manifest.plan, new Date(manifest.createdAt));
  if (semanticDigest(manifest.plan) !== manifest.planHash || manifest.rows.length !== manifest.plan.entries.length) throw new Error("manifest_plan_mismatch");
  const ids = new Set<string>();
  const reviewIds = new Set<string>();
  const families = new Map<string, string>();
  for (const row of manifest.rows) {
    const entry = manifest.plan.entries.find((e) => e.reviewId === row.reviewId);
    if (!entry || entry.familyId !== row.sourceFamilyId || entry.primary !== row.primary || entry.split !== row.split || ids.has(row.caseId) || reviewIds.has(row.reviewId)) throw new Error("manifest_plan_mismatch");
    ids.add(row.caseId);
    reviewIds.add(row.reviewId);
    const family = families.get(row.sourceFamilyId);
    if (family && family !== row.familyId) throw new Error("manifest_plan_mismatch");
    families.set(row.sourceFamilyId, row.familyId);
    if (row.available && (!row.semanticHash || !row.dataOrigin || row.unavailableReason || row.baselineAlert === null || !evaluationVersionsSchema.safeParse(row.versions).success)) throw new Error("invalid_manifest_row");
    if (!row.available && !row.unavailableReason) throw new Error("invalid_manifest_row");
    if (row.available && row.state === "completed" && (!parseControlledDecisions({ model: SEMANTIC_MODEL, decisions: row.decisions }) || row.returnedModel !== SEMANTIC_MODEL)) throw new Error("invalid_manifest_decisions");
  }
  if (new Set(families.values()).size !== families.size) throw new Error("manifest_plan_mismatch");
  for (const run of manifest.collectionRuns) {
    if (run.workspaceId !== manifest.plan.workspaceId || !manifest.rows.some((row) => row.policyId === run.policyId)
      || run.consulted !== run.eligible + run.outOfScope + run.invalid || run.eligible !== run.unique + run.duplicates + run.notSampled
      || (run.status === "failed") !== (run.errorCode === "collection_page_failed")) throw new Error("invalid_collection_evidence");
  }
  const policyIds = [...new Set(manifest.rows.flatMap((row) => row.policyId ? [row.policyId] : []))];
  if (manifest.collectionHistoryComplete && (!manifest.collectionRuns.length || !policyIds.length || policyIds.some((id) => !manifest.collectionRuns.some((run) => run.policyId === id && run.initialPage)))) throw new Error("invalid_collection_evidence");
  const env = manifest.provenance.environment;
  if (manifest.provenance.execution !== (env === "test" ? "controlled" : env ? "live_authorized" : null)) throw new Error("invalid_provenance");
  return manifest;
}
export function validateSemanticJudgments(manifest: SemanticEvaluationManifest, raw: unknown[], now = new Date()): SemanticJudgment[] {
  const submissions = raw.map((item) => judgmentSchema.parse(item));
  const reviewerCases = new Set<string>();
  for (const submission of submissions) {
    if (submission.exportId !== manifest.exportId || submission.planHash !== manifest.planHash || submission.blindHash !== manifest.blindHash
      || Date.parse(submission.createdAt) < Date.parse(manifest.createdAt) || Date.parse(submission.createdAt) > now.getTime()) throw new Error("judgment_manifest_mismatch");
    if (submission.referenceKind === "independent_human" && manifest.rows.some((r) => r.dataOrigin === "synthetic")) throw new Error("synthetic_reference_is_not_human_evidence");
    if ((submission.kind === "adjudication") !== Boolean(submission.resolves)) throw new Error("invalid_adjudication");
    for (const label of submission.cases) {
      const row = manifest.rows.find((r) => r.caseId === label.caseId);
      if (!row?.available || row.familyId !== label.familyId || row.semanticHash !== label.semanticHash) throw new Error("judgment_case_mismatch");
      const key = `${submission.kind}:${submission.reviewerId}:${label.caseId}`;
      if (reviewerCases.has(key)) throw new Error("duplicate_reviewer_judgment");
      reviewerCases.add(key);
    }
  }
  for (const row of manifest.rows) resolveSemanticReference(row, submissions);
  return submissions;
}
function resolveSemanticReference(row: SemanticEvaluationRow, submissions: SemanticJudgment[]): SemanticReference {
  if (!row.available) return { status: "unavailable", labels: null };
  const reviews = submissions.filter((s) => s.kind === "review" && s.cases.some((c) => c.caseId === row.caseId));
  const adjudications = submissions.filter((s) => s.kind === "adjudication" && s.cases.some((c) => c.caseId === row.caseId));
  if (reviews.length > 2 || adjudications.length > 1) throw new Error("too_many_case_judgments");
  if (adjudications.length && reviews.length !== 2) throw new Error("adjudication_requires_two_reviews");
  if (reviews.length < 2) return { status: reviews.length ? "missing_second_review" : "missing_reviews", labels: null };
  if (reviews[0].reviewerId === reviews[1].reviewerId) throw new Error("distinct_reviewers_required");
  const labels = reviews.map((s) => s.cases.find((c) => c.caseId === row.caseId)!);
  let result = labels[0];
  if (adjudications.length) {
    const adjudication = adjudications[0];
    if (reviews.some((s) => s.reviewerId === adjudication.reviewerId)
      || semanticDigest([...adjudication.resolves!].sort()) !== semanticDigest(reviews.map(semanticDigest).sort())
      || reviews.some((s) => Date.parse(s.createdAt) > Date.parse(adjudication.createdAt))) throw new Error("invalid_adjudication");
    result = adjudication.cases.find((c) => c.caseId === row.caseId)!;
  } else if (semanticDigest(labels[0].labels) !== semanticDigest(labels[1].labels) || labels[0].ambiguous !== labels[1].ambiguous) {
    return { status: "awaiting_adjudication", labels: null };
  }
  return result.ambiguous || Object.values(result.labels).includes("insufficient_context")
    ? { status: "ambiguous", labels: result.labels } : { status: "clear", labels: result.labels };
}

export function semanticPercentiles(values: number[]) {
  if (!values.length) return { count: 0, p50: null, p95: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, p50: sorted[Math.max(0, Math.ceil(sorted.length * 0.5) - 1)], p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] };
}
export function buildSemanticEvaluationReport(rawManifest: unknown, rawSubmissions: unknown[], now = new Date()) {
  const manifest = validateSemanticManifest(rawManifest);
  const submissions = validateSemanticJudgments(manifest, rawSubmissions, now);
  const references = manifest.rows.map((row) => ({ row, reference: resolveSemanticReference(row, submissions) }));
  const summarize = (items: typeof references) => {
    const primary = items.filter((item) => item.row.primary);
    const metricRows = primary.map(({ row, reference }) => ({
      human: reference.status === "clear" ? reference.labels : null,
      candidate: row.state === "completed" ? parseControlledDecisions({ model: SEMANTIC_MODEL, decisions: row.decisions }) : null,
      baselineAlert: row.baselineAlert,
      sent: row.sendStartedAt !== null,
    }));
    const matrix = emptySemanticMatrix();
    metricRows.forEach((r) => { if (r.human && r.candidate) addSemanticMatrix(matrix, r.human, r.candidate); });
    const sent = items.filter(({ row }) => row.sendStartedAt !== null);
    const valid = sent.filter(({ row }) => row.state === "completed");
    const usageRows = sent.map(({ row }) => row.usage);
    const knownUsage = usageRows.filter((value) => value !== null);
    const usage = { reported: knownUsage.length, missing: usageRows.length - knownUsage.length,
      totals: knownUsage.length ? knownUsage.reduce((sum, value) => ({ input_tokens: sum.input_tokens + value.input_tokens, output_tokens: sum.output_tokens + value.output_tokens }), { input_tokens: 0, output_tokens: 0 }) : null };
    return {
      counts: { selected: items.length, primaryFamilies: primary.length, secondaryVariants: items.length - primary.length,
        primarySendsStarted: primary.filter(({ row }) => row.sendStartedAt !== null).length,
        sendsStarted: sent.length, validResponses: valid.length,
        failed: items.filter(({ row }) => row.state === "failed").length,
        outcomeUnknown: items.filter(({ row }) => row.state === "outcome_unknown").length,
        recoverable: primary.filter(({ row }) => row.available).length,
        clearLabels: primary.filter(({ reference }) => reference.status === "clear").length,
        referenceStates: Object.fromEntries(["unavailable", "missing_reviews", "missing_second_review", "awaiting_adjudication", "ambiguous", "clear"].map((s) => [s, primary.filter(({ reference }) => reference.status === s).length])),
        unavailabilityReasons: items.reduce<Record<string, number>>((out, { row }) => { if (row.unavailableReason) out[row.unavailableReason] = (out[row.unavailableReason] ?? 0) + 1; return out; }, {}),
        processingErrors: items.reduce<Record<string, number>>((out, { row }) => { if (row.errorCode) out[row.errorCode] = (out[row.errorCode] ?? 0) + 1; return out; }, {}),
      },
      validResponseRate: semanticRatio(valid.length, sent.length), reconstructionRate: semanticRatio(primary.filter(({ row }) => row.available).length, primary.length),
      metrics: summarizeSemanticReference(metricRows),
      byQuestion: Object.fromEntries(SEMANTIC_QUESTIONS.map((q) => [q, summarizeSemanticReference(metricRows, q)])), matrix,
      httpElapsedMs: semanticPercentiles(sent.flatMap(({ row }) => row.httpElapsedMs === null ? [] : [row.httpElapsedMs])),
      queueAgeMs: semanticPercentiles(sent.flatMap(({ row }) => row.createdAt && row.sendStartedAt ? [Math.max(0, Date.parse(row.sendStartedAt) - Date.parse(row.createdAt))] : [])),
      usage, cost: null,
    };
  };
  const cohortKey = (row: SemanticEvaluationRow) => semanticDigest({ dataOrigin: row.dataOrigin, versions: row.versions });
  const cohorts = [...new Set(manifest.rows.map(cohortKey))].map((key) => {
    const items = references.filter(({ row }) => cohortKey(row) === key);
    return { dataOrigin: items[0].row.dataOrigin, ...manifest.provenance, versions: items[0].row.versions,
      ...summarize(items),
      splits: Object.fromEntries(["calibration", "holdout"].map((split) => [split, summarize(items.filter(({ row }) => row.split === split))])),
      byBrand: Object.fromEntries([...new Set(items.map(({ row }) => row.clientProfileId))].map((id) => [id ?? "unknown", summarize(items.filter(({ row }) => row.clientProfileId === id))])),
      secondary: items.filter(({ row }) => !row.primary).map(({ row, reference }) => ({ caseId: row.caseId, referenceStatus: reference.status })),
    };
  });
  const runs = manifest.collectionRuns;
  const knownTotal = (key: "consulted" | "eligible" | "unique" | "duplicates" | "outOfScope" | "invalid" | "notSampled") => runs.length ? runs.reduce((n, r) => n + r[key], 0) : null;
  const runTotal = (key: Parameters<typeof knownTotal>[0]) => manifest.collectionHistoryComplete ? knownTotal(key) : null;
  return {
    version: 1, exportId: manifest.exportId, planHash: manifest.planHash, blindHash: manifest.blindHash, generatedAt: now.toISOString(),
    humanReference: submissions.length && submissions.every((s) => s.referenceKind === "independent_human") ? "independent_human" : "synthetic_or_not_collected",
    collection: { scope: "whole_policies_for_selected_observations", historyComplete: manifest.collectionHistoryComplete && runs.length > 0,
      consulted: runTotal("consulted"), eligible: runTotal("eligible"), sampled: manifest.collectionHistoryComplete && runs.length ? (runTotal("unique")! + runTotal("duplicates")!) : null,
      unique: runTotal("unique"), duplicates: runTotal("duplicates"), outOfScope: runTotal("outOfScope"), invalid: runTotal("invalid"), notSampled: runTotal("notSampled"),
      failedPages: runs.filter((r) => r.status === "failed").length,
      knownCounts: { consulted: knownTotal("consulted"), eligible: knownTotal("eligible"), unique: knownTotal("unique"), duplicates: knownTotal("duplicates"), outOfScope: knownTotal("outOfScope"), invalid: knownTotal("invalid"), notSampled: knownTotal("notSampled") },
      byPolicy: Object.fromEntries([...new Set(runs.map((run) => run.policyId))].map((policyId) => {
        const pages = runs.filter((run) => run.policyId === policyId);
        return [policyId, { coverage: "recorded_pages_only", dataOrigin: manifest.rows.find((row) => row.policyId === policyId)?.dataOrigin ?? null,
          consulted: pages.reduce((n, r) => n + r.consulted, 0), eligible: pages.reduce((n, r) => n + r.eligible, 0),
          sampled: pages.reduce((n, r) => n + r.unique + r.duplicates, 0), unique: pages.reduce((n, r) => n + r.unique, 0),
          failedPages: pages.filter((r) => r.status === "failed").length }];
      })),
      exclusions: runs.reduce<Record<string, number>>((out, r) => { for (const [key, n] of Object.entries(r.exclusions)) out[key] = (out[key] ?? 0) + n; return out; }, {}),
    },
    selected: manifest.rows.length, recoverable: manifest.rows.filter((r) => r.available).length,
    unavailable: manifest.rows.filter((r) => !r.available).length, cohorts,
    limitations: ["Provenance and selection order are declared, not independently verified.", "Collection counters cover whole policies; outcome metrics cover explicitly selected primary families.",
      "Question-level incremental detection is unavailable: baseline findings are work-level.", "Unknown usage, latency and price are never zero; cost requires a separately dated price.", "Secondary variants do not increase independent family denominators."],
  };
}
