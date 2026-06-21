import { getHumanFailureCorrectionDirectives } from "../../ai/regeneration-correction-brief";
import type { HumanQualityFailureReason } from "../corpus";

export function buildDirectiveForFailureReason(
  reason: HumanQualityFailureReason
): string {
  if (reason === "factual_issue") {
    return "";
  }

  const directives = getHumanFailureCorrectionDirectives(reason);
  if (directives.length === 0) {
    return "";
  }

  return directives.join("; ");
}
