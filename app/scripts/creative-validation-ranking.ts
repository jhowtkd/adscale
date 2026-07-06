import type { CreativeHardFailure } from "@/server/ai/creative-quality-gate";
import type { CreativeContract } from "@/server/ai/creative-contract";
import type { CreativeScoreBreakdown } from "@/server/ai/creative-score";
import {
  resolveContractPolicy,
  resolveFidelityVerdict,
} from "@/server/ai/canonical-creative-contract";

export interface CaptureRankInput {
  contract?: Pick<CreativeContract, "generationMode" | "creativeLevel" | "policy"> | null;
  hardFailures: CreativeHardFailure[];
  score: {
    scoreBreakdown?: Pick<CreativeScoreBreakdown, "variationLevelFit" | "visualQuality">;
  };
}

export function compareCreativeCaptures(left: CaptureRankInput, right: CaptureRankInput): number {
  if (left.hardFailures.length !== right.hardFailures.length) {
    return right.hardFailures.length - left.hardFailures.length;
  }

  const leftPolicy = left.contract
    ? resolveContractPolicy(left.contract as CreativeContract)
    : resolveContractPolicy({
        generationMode: "art_variation",
        targetFormat: "1:1",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: null,
        styleAssetId: null,
        client: null,
        product: null,
        offer: null,
        constraints: null,
        creativeLevel: "balanced",
      });
  const rightPolicy = right.contract
    ? resolveContractPolicy(right.contract as CreativeContract)
    : leftPolicy;

  const leftInside =
    resolveFidelityVerdict(leftPolicy, left.score.scoreBreakdown?.variationLevelFit) ===
    "inside_range"
      ? 1
      : 0;
  const rightInside =
    resolveFidelityVerdict(rightPolicy, right.score.scoreBreakdown?.variationLevelFit) ===
    "inside_range"
      ? 1
      : 0;
  if (leftInside !== rightInside) {
    return leftInside - rightInside;
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
