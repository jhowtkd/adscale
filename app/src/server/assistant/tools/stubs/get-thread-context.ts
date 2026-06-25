import { z } from "zod";
import type { WorkspaceMemberRole } from "@/server/auth/workspace";
import { buildAssistantContext } from "@/server/assistant/context/context-builder";
import { sanitizeContextValue } from "@/server/assistant/context/sanitize";
import type { RegisteredTool, ToolHandlerContext, ToolHandlerResult } from "../registry";

const MAX_SUMMARY_CHARS = 2000;

export const getThreadContextSchema = z.object({}).strict();

export async function handleGetThreadContext(
  ctx: ToolHandlerContext
): Promise<ToolHandlerResult> {
  const context = await buildAssistantContext({
    workspaceId: ctx.workspaceId,
    clientProfileId: ctx.clientProfileId,
    threadId: ctx.threadId,
  });

  const sanitized = sanitizeContextValue(context, ctx.clientProfileId);
  let summary = JSON.stringify(sanitized);
  if (summary.length > MAX_SUMMARY_CHARS) {
    summary = `${summary.slice(0, MAX_SUMMARY_CHARS)}...`;
  }

  return { summary };
}

export const getThreadContextTool: RegisteredTool = {
  name: "get_thread_context",
  description: "Returns a sanitized snapshot of the current thread context.",
  parametersSchema: getThreadContextSchema,
  allowedRoles: ["owner", "admin", "member"] satisfies WorkspaceMemberRole[],
  requiresConfirmation: false,
  handler: async (ctx) => handleGetThreadContext(ctx),
};
