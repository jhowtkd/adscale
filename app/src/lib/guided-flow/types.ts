export type GuidedFlowPath = "existing_creative" | "from_zero" | "unclassified";
export type GuidedFlowStatus = "active" | "completed" | "abandoned" | "blocked";

export const FROM_ZERO_MIN_REFERENCES = 3;

const INITIAL_STEP: Record<Exclude<GuidedFlowPath, "unclassified">, string> = {
  existing_creative: "select_creative",
  from_zero: "collect_brief",
};

export function initialStepForPath(
  path: Exclude<GuidedFlowPath, "unclassified">
) {
  return INITIAL_STEP[path];
}
