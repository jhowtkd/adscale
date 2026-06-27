import { createHash } from "node:crypto";
import type { AssistantGuidedFlow } from "@/server/db/schema";
import { GuidedFlowValidationError } from "@/server/repositories/guided-flow";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function guidedActionSnapshotDigest(
  flow: AssistantGuidedFlow,
  inputSnapshot: Record<string, unknown>
): string {
  return createHash("sha256")
    .update(
      stable({
        path: flow.path,
        currentStep: flow.currentStep,
        revision: flow.revision,
        slots: flow.slots,
        missingFields: flow.missingFields,
        assetIds: flow.assetIds,
        referenceIds: flow.referenceIds,
        campaignId: flow.campaignId,
        inputSnapshot,
      })
    )
    .digest("hex");
}

export function assertGuidedActionReady(
  flow: AssistantGuidedFlow,
  actionType: string
) {
  const slots = (flow.slots ?? {}) as Record<string, unknown>;
  if (flow.path === "existing_creative") {
    if (
      flow.currentStep !== "confirm_improvement" ||
      slots.reviewApproved !== true ||
      actionType !== "start_complete_campaign"
    ) {
      throw new GuidedFlowValidationError("Existing creative diagnosis must be reviewed first");
    }
    return;
  }
  if (flow.path === "from_zero") {
    if (
      flow.currentStep !== "confirm_plan" ||
      slots.briefReviewApproved !== true ||
      (flow.referenceIds ?? []).length < 3 ||
      actionType !== "create_creative_plan"
    ) {
      throw new GuidedFlowValidationError("From-zero plan is not ready for confirmation");
    }
  }
}
