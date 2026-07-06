import type { CreativeHardFailure } from "@/server/ai/creative-quality-gate";
import type { CreativeScoreBreakdown } from "@/server/ai/creative-score";

export interface CaptureRankInput {
  hardFailures: CreativeHardFailure[];
  score: {
    scoreBreakdown?: Pick<CreativeScoreBreakdown, "variationLevelFit" | "visualQuality">;
  };
}

export function compareCreativeCaptures(left: CaptureRankInput, right: CaptureRankInput): number {
  if (left.hardFailures.length !== right.hardFailures.length) {
    return right.hardFailures.length - left.hardFailures.length;
  }

  const leftFidelity = left.score.scoreBreakdown?.variationLevelFit ?? 0;
  const rightFidelity = right.score.scoreBreakdown?.variationLevelFit ?? 0;
  if (leftFidelity !== rightFidelity) {
    return leftFidelity - rightFidelity;
  }

  return (
    (left.score.scoreBreakdown?.visualQuality ?? 0) -
    (right.score.scoreBreakdown?.visualQuality ?? 0)
  );
}
