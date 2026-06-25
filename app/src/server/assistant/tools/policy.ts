import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { containsDeniedPersistenceKeys } from "@/server/repositories/assistant-types";
import {
  requireRole,
  WorkspaceAuthError,
  type WorkspaceMemberRole,
} from "@/server/auth/workspace";
import { getToolDefinition } from "./registry";

export interface ToolPolicyContext {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  userId: string;
}

export interface ToolPolicyCall {
  name: string;
  argumentsJson: string;
}

export interface ToolPolicyResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  sanitizedSummary: string;
  denialReason?: string;
  actionRecordId?: string;
}

function deny(reason: string): ToolPolicyResult {
  return {
    allowed: false,
    requiresConfirmation: false,
    sanitizedSummary: "",
    denialReason: reason,
  };
}

function sanitizeSummary(summary: string): string | null {
  if (containsDeniedPersistenceKeys({ summary })) {
    return null;
  }
  const lower = summary.toLowerCase();
  if (
    lower.includes("rawargs") ||
    lower.includes('"reasoning"') ||
    lower.includes('"thinking"')
  ) {
    return null;
  }
  return summary;
}

export async function evaluateToolCall(
  ctx: ToolPolicyContext,
  call: ToolPolicyCall
): Promise<ToolPolicyResult> {
  const tool = getToolDefinition(call.name);
  if (!tool) {
    return deny("unknown_tool");
  }

  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(call.argumentsJson);
  } catch {
    return deny("invalid_arguments");
  }

  const schemaResult = tool.parametersSchema.safeParse(parsedArgs);
  if (!schemaResult.success) {
    return deny("invalid_arguments");
  }

  try {
    await requireRole(
      ctx.workspaceId,
      ctx.userId,
      tool.allowedRoles as WorkspaceMemberRole[]
    );
  } catch (error) {
    if (error instanceof WorkspaceAuthError) {
      return deny("forbidden");
    }
    throw error;
  }

  const thread = await getAssistantThreadById(ctx.workspaceId, ctx.threadId);
  if (!thread || thread.clientProfileId !== ctx.clientProfileId) {
    return deny("scope_mismatch");
  }

  const handlerResult = await tool.handler(ctx, schemaResult.data);
  const summary = sanitizeSummary(handlerResult.summary);
  if (!summary) {
    return deny("sanitization_failed");
  }

  return {
    allowed: true,
    requiresConfirmation: tool.requiresConfirmation,
    sanitizedSummary: summary,
    actionRecordId: handlerResult.actionRecordId,
  };
}

export const executeApprovedToolCall = evaluateToolCall;
