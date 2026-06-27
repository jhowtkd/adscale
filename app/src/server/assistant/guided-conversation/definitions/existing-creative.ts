import { initialStepForPath } from "@/lib/guided-flow/types";

export const EXISTING_CREATIVE_STEPS = [
  "select_creative",
  "review_diagnosis",
  "confirm_improvement",
] as const;

export type ExistingCreativeStep = (typeof EXISTING_CREATIVE_STEPS)[number];

export function existingCreativeBackTarget(currentStep: string): string | null {
  const index = EXISTING_CREATIVE_STEPS.indexOf(
    currentStep as ExistingCreativeStep
  );
  if (index <= 0) {
    return null;
  }
  return EXISTING_CREATIVE_STEPS[index - 1];
}

export const EXISTING_CREATIVE_FIELD_DEPENDENCIES: Record<string, string[]> = {
  offer: ["diagnosis", "recommendedAction", "reviewApproved"],
  audience: ["diagnosis", "recommendedAction", "reviewApproved"],
  cta: ["diagnosis", "recommendedAction", "reviewApproved"],
  objective: ["diagnosis", "recommendedAction", "reviewApproved"],
  assumptions: ["recommendedAction", "reviewApproved"],
};

export function existingCreativeInitialStep() {
  return initialStepForPath("existing_creative");
}
