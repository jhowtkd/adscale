// Rodada (calibration round) evaluation — the round gate.
// "Falha conhecida vale mais que falta de decisão": any known failure fails
// the round; without failure, too few client decisions make it inconclusive.

import { err, ok, type Result } from "./result";

export type RoundOutcome = "passed" | "failed" | "inconclusive";

export type FrontKind = "social" | "paid_media";

export type ClientVerdict =
  | "approved"
  | "taste_adjustment" // Ajuste de gosto: a decision, never fails
  | "fact_brand_rejection" // Rejeição por fato ou marca: fails
  | "none"; // No client decision

export type RoundItemScore = {
  /** Score of the evaluated attempt (first version reaching quality), 0–16. */
  attemptScore: number;
  /** Lowest rubric dimension (Fatos · Marca · Utilidade · Execução), 0–4. */
  minDimension: number;
  criticalFailure: boolean;
  /** Removed from the batch ("retirada do lote"). */
  withdrawn: boolean;
  clientVerdict: ClientVerdict;
};

export type RoundFailureCause =
  | "critical_failure"
  | "withdrawn"
  | "score_below_14"
  | "dimension_below_3"
  | "fact_brand_rejection";

export type RoundEvaluation = {
  outcome: RoundOutcome;
  /** Minimum client decisions required for this front kind. */
  requiredDecisions: number;
  /** Items with any client verdict (approved, taste, or fact/brand). */
  decisions: number;
  failures: { itemIndex: number; causes: RoundFailureCause[] }[];
};

export const MIN_ATTEMPT_SCORE = 14;
export const MIN_DIMENSION_SCORE = 3;

const REQUIRED_DECISIONS: Record<FrontKind, number> = {
  social: 3, // 3 of 4
  paid_media: 2, // 2 of 3
};

/** A Social round is 4 posts; a paid-media round is 1 batch of 3 angles. */
const ROUND_SIZE: Record<FrontKind, number> = {
  social: 4,
  paid_media: 3,
};

export function requiredDecisionsFor(frontKind: FrontKind): number {
  return REQUIRED_DECISIONS[frontKind];
}

function validateScore(item: RoundItemScore, index: number): Result<void> {
  if (!Number.isInteger(item.attemptScore) || item.attemptScore < 0 || item.attemptScore > 16) {
    return err("invalid_score", `item ${index}: attemptScore must be an integer 0–16`);
  }
  if (!Number.isInteger(item.minDimension) || item.minDimension < 0 || item.minDimension > 4) {
    return err("invalid_score", `item ${index}: minDimension must be an integer 0–4`);
  }
  return ok(undefined);
}

/** Evaluate a closed round: every item scored, client verdicts collected. */
export function decideRoundOutcome(args: {
  frontKind: FrontKind;
  items: RoundItemScore[];
}): Result<RoundEvaluation> {
  const expectedSize = ROUND_SIZE[args.frontKind];
  if (args.items.length !== expectedSize) {
    return err(
      "round_size_mismatch",
      `expected ${expectedSize} items for ${args.frontKind}, got ${args.items.length}`,
    );
  }
  const failures: RoundEvaluation["failures"] = [];
  for (const [index, item] of args.items.entries()) {
    const valid = validateScore(item, index);
    if (!valid.ok) return valid;
    const causes: RoundFailureCause[] = [];
    if (item.criticalFailure) causes.push("critical_failure");
    if (item.withdrawn) causes.push("withdrawn");
    if (item.attemptScore < MIN_ATTEMPT_SCORE) causes.push("score_below_14");
    if (item.minDimension < MIN_DIMENSION_SCORE) causes.push("dimension_below_3");
    if (item.clientVerdict === "fact_brand_rejection") causes.push("fact_brand_rejection");
    if (causes.length > 0) failures.push({ itemIndex: index, causes });
  }
  if (failures.length > 0) {
    return ok({
      outcome: "failed",
      requiredDecisions: REQUIRED_DECISIONS[args.frontKind],
      decisions: countDecisions(args.items),
      failures,
    });
  }
  const requiredDecisions = REQUIRED_DECISIONS[args.frontKind];
  const decisions = countDecisions(args.items);
  return ok({
    outcome: decisions >= requiredDecisions ? "passed" : "inconclusive",
    requiredDecisions,
    decisions,
    failures,
  });
}

function countDecisions(items: RoundItemScore[]): number {
  return items.filter((item) => item.clientVerdict !== "none").length;
}
