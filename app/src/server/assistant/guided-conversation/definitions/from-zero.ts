import { initialStepForPath } from "@/lib/guided-flow/types";

export const FROM_ZERO_STEPS = [
  "collect_brief",
  "review_brief",
  "select_references",
  "confirm_plan",
] as const;

export const EXISTING_CREATIVE_STEPS = [
  "select_creative",
  "review_diagnosis",
  "confirm_improvement",
] as const;

export type FromZeroStep = (typeof FROM_ZERO_STEPS)[number];
export type ExistingCreativeStep = (typeof EXISTING_CREATIVE_STEPS)[number];

export function fromZeroBackTarget(currentStep: string): string | null {
  const index = FROM_ZERO_STEPS.indexOf(currentStep as FromZeroStep);
  if (index <= 0) {
    return null;
  }
  return FROM_ZERO_STEPS[index - 1];
}

export function existingCreativeBackTarget(currentStep: string): string | null {
  const index = EXISTING_CREATIVE_STEPS.indexOf(
    currentStep as ExistingCreativeStep
  );
  if (index <= 0) {
    return null;
  }
  return EXISTING_CREATIVE_STEPS[index - 1];
}

const REVIEW_DEPENDENCIES = ["briefSnapshot", "briefReviewApproved", "recommendedAction"];

export const FROM_ZERO_FIELD_DEPENDENCIES: Record<string, string[]> = {
  product: ["promise", ...REVIEW_DEPENDENCIES],
  offer: ["promise", "cta", "diagnosis", ...REVIEW_DEPENDENCIES],
  audience: ["promise", "diagnosis", ...REVIEW_DEPENDENCIES],
  promise: REVIEW_DEPENDENCIES,
  objections: REVIEW_DEPENDENCIES,
  cta: ["diagnosis", ...REVIEW_DEPENDENCIES],
  platforms: REVIEW_DEPENDENCIES,
  constraints: REVIEW_DEPENDENCIES,
};

export function fromZeroInitialStep() {
  return initialStepForPath("from_zero");
}
