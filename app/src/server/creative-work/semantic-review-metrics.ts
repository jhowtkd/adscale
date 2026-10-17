/** Shared offline and human-reference arithmetic. One primary row = one family. */
import { SEMANTIC_QUESTIONS, type SemanticDecisions } from "./semantic-review-offline";

export type SemanticSplit = "calibration" | "holdout";
export type SemanticQuestion = typeof SEMANTIC_QUESTIONS[number];
export type SemanticMatrix = Record<SemanticQuestion, Record<string, Record<string, number>>>;
export function semanticRatio(numerator: number, denominator: number) {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}
export function semanticWilson(numerator: number, denominator: number) {
  if (!denominator) return null;
  const z = 1.959963984540054;
  const p = numerator / denominator;
  const scale = 1 + z * z / denominator;
  const center = (p + z * z / (2 * denominator)) / scale;
  const half = z * Math.sqrt(p * (1 - p) / denominator + z * z / (4 * denominator * denominator)) / scale;
  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half), confidence: 0.95 };
}
export const emptySemanticMatrix = (): SemanticMatrix => Object.fromEntries(SEMANTIC_QUESTIONS.map((q) => [q, {}])) as SemanticMatrix;
export function semanticDecisionsAgree(human: SemanticDecisions, candidate: SemanticDecisions) {
  return SEMANTIC_QUESTIONS.every((q) => human[q] === candidate[q]);
}
export function addSemanticMatrix(matrix: SemanticMatrix, human: SemanticDecisions, candidate: SemanticDecisions) {
  for (const q of SEMANTIC_QUESTIONS) {
    const row = matrix[q][human[q]] ??= {};
    row[candidate[q]] = (row[candidate[q]] ?? 0) + 1;
  }
}
export function validateSemanticFamilies(entries: Array<{ id: string; family: string; split: SemanticSplit; primary: boolean }>) {
  const ids = new Set<string>();
  const families = new Map<string, { split: SemanticSplit; primaries: number }>();
  for (const entry of entries) {
    if (!entry.id || !entry.family || ids.has(entry.id) || !["calibration", "holdout"].includes(entry.split)) throw new Error("invalid_family_plan");
    ids.add(entry.id);
    const family = families.get(entry.family) ?? { split: entry.split, primaries: 0 };
    if (family.split !== entry.split) throw new Error("family_split_leakage");
    family.primaries += Number(entry.primary);
    families.set(entry.family, family);
  }
  if ([...families.values()].some((f) => f.primaries !== 1)) throw new Error("invalid_family_representative");
  return families;
}

const alertClasses = new Set(["unsupported", "contradicted", "divergent", "violated"]);
export const semanticAlert = (value: string) => alertClasses.has(value);
type Classification = "alert" | "clear" | "abstain" | "missing";
function classify(decisions: SemanticDecisions | null, question?: SemanticQuestion): Classification {
  if (!decisions) return "missing";
  const values = question ? [decisions[question]] : SEMANTIC_QUESTIONS.map((q) => decisions[q]);
  if (values.some(semanticAlert)) return "alert";
  if (values.includes("insufficient_context")) return "abstain";
  return "clear";
}
export type SemanticMetricRow = { human: SemanticDecisions | null; candidate: SemanticDecisions | null; baselineAlert: boolean | null; sent?: boolean };

/** Question-level baseline attribution is unavailable: deterministic checkers return work-level findings. */
export function summarizeSemanticReference(rows: SemanticMetricRow[], question?: SemanticQuestion) {
  let tp = 0, fp = 0, tn = 0, fn = 0, clearHuman = 0, validClearHuman = 0;
  let abstentions = 0, allAbstentions = 0, humanNoProblem = 0, noProblemAbstentions = 0;
  let baselineMissed = 0, incremental = 0, missingCandidate = 0;
  for (const row of rows) {
    const c = classify(row.candidate, question);
    if (c === "abstain") allAbstentions += 1;
    // Any unresolved human field makes the whole work reference ambiguous.
    const h = row.human && (question || !Object.values(row.human).includes("insufficient_context")) ? classify(row.human, question) : "missing";
    if (h !== "alert" && h !== "clear") continue;
    clearHuman += 1;
    if (c !== "missing") validClearHuman += 1;
    else missingCandidate += 1;
    if (c === "abstain") abstentions += 1;
    if (h === "clear") {
      humanNoProblem += 1;
      if (c === "abstain") noProblemAbstentions += 1;
    }
    if (!question && h === "alert" && row.baselineAlert === false) {
      baselineMissed += 1;
      if (c === "alert") incremental += 1;
    }
    if (c !== "alert" && c !== "clear") continue;
    if (h === "alert") { if (c === "alert") tp += 1; else fn += 1; }
    else { if (c === "alert") fp += 1; else tn += 1; }
  }
  const metric = (n: number, d: number) => ({ ...semanticRatio(n, d), wilson95: semanticWilson(n, d) });
  return {
    unit: "independent_primary_families" as const,
    counts: { tp, fp, tn, fn, clearHuman, validClearHuman, humanNoProblem, abstentions, allAbstentions, missingCandidate },
    precision: metric(tp, tp + fp), falseAlert: metric(fp, fp + tn),
    incrementalDetection: question ? null : metric(incremental, baselineMissed),
    abstention: metric(abstentions, validClearHuman),
    falseAlertAllHumanNoProblem: metric(fp, humanNoProblem),
    abstentionAllHumanNoProblem: metric(noProblemAbstentions, humanNoProblem),
    abstentionAllSelected: metric(allAbstentions, rows.length),
    abstentionAllSends: metric(allAbstentions, rows.filter((r) => r.sent !== false).length),
  };
}
