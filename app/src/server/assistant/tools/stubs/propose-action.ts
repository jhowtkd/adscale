import { z } from "zod";
import type { WorkspaceMemberRole } from "@/server/auth/workspace";
import { createAssistantAction } from "@/server/repositories/assistant-action";
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

  const display = { label: parsed.label, actionType: parsed.actionType };

  const { action } = await createAssistantAction(ctx.workspaceId, {
    threadId: ctx.threadId,
    content: parsed.label,
    inputSnapshot,
    display,
  });

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
