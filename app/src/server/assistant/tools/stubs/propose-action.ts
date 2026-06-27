import { z } from "zod";
import type { WorkspaceMemberRole } from "@/server/auth/workspace";
import { validateProposeAction } from "@/server/assistant/action-contracts/validate";
import { emitGuidedFlowActionProposed } from "@/server/assistant/guided-flow-telemetry-lifecycle";
import { createAssistantAction } from "@/server/repositories/assistant-action";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import {
  assertGuidedActionReady,
  guidedActionSnapshotDigest,
} from "@/server/assistant/action-contracts/guided-binding";
import { stripDeniedFields } from "@/server/assistant/context/sanitize";
import { containsDeniedPersistenceKeys } from "@/server/repositories/assistant-types";
import type { RegisteredTool, ToolHandlerContext, ToolHandlerResult } from "../registry";

export const proposeActionSchema = z
  .object({
    actionType: z.string().min(1),
    label: z.string().min(1),
    inputSnapshot: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function handleProposeAction(
  ctx: ToolHandlerContext,
  args: unknown
): Promise<ToolHandlerResult> {
  const parsed = proposeActionSchema.parse(args);
  const inputSnapshot = stripDeniedFields(parsed.inputSnapshot ?? {}) as Record<
    string,
    unknown
  >;

  if (containsDeniedPersistenceKeys(inputSnapshot)) {
    throw new Error("inputSnapshot contains denied persistence keys");
  }

  const { display } = await validateProposeAction(ctx, {
    actionType: parsed.actionType,
    label: parsed.label,
    inputSnapshot,
  });

  const guidedFlow = await getGuidedFlowByThread(ctx.workspaceId, ctx.threadId);
  const reviewedFlow = guidedFlow?.path !== "unclassified" ? guidedFlow : null;
  if (reviewedFlow) {
    assertGuidedActionReady(reviewedFlow, parsed.actionType);
  }

  const { action } = await createAssistantAction(ctx.workspaceId, {
    threadId: ctx.threadId,
    content: parsed.label,
    inputSnapshot,
    display,
    sourceFlowRevision: reviewedFlow?.revision ?? null,
    sourceSnapshotDigest: reviewedFlow
      ? guidedActionSnapshotDigest(reviewedFlow, inputSnapshot)
      : null,
  });

  if (reviewedFlow) {
    emitGuidedFlowActionProposed({
      workspaceId: ctx.workspaceId,
      clientProfileId: ctx.clientProfileId,
      threadId: ctx.threadId,
      guidedFlowId: reviewedFlow.id,
      path: reviewedFlow.path,
      step: reviewedFlow.currentStep,
      actionRecordId: action.id,
      campaignId: reviewedFlow.campaignId,
      actionType: parsed.actionType,
    });
  }

  return {
    summary: `Proposed action: ${parsed.label} (${parsed.actionType})`,
    actionRecordId: action.id,
  };
}

export const proposeActionTool: RegisteredTool = {
  name: "propose_action",
  description:
    "Proposes a pending action card for user confirmation. Does not execute writes.",
  parametersSchema: proposeActionSchema,
  allowedRoles: ["owner", "admin", "member"] satisfies WorkspaceMemberRole[],
  requiresConfirmation: true,
  handler: handleProposeAction,
};
