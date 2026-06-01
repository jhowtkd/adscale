import type { CreativeQualityVerdict } from "@/server/ai/creative-quality-gate";

export function scoreCappedForDisplay(
  qualityScore: number | null | undefined,
  qualityVerdict: CreativeQualityVerdict | null | undefined
): number | null {
  if (qualityScore == null) {
    return null;
  }
  if (qualityVerdict === "invalid") {
    return Math.min(qualityScore, 59);
  }
  return qualityScore;
}
