import { z } from "zod";
import { logger } from "@/lib/logger";
import type { WorkspaceMemberRole } from "@/server/auth/workspace";
import { buildAssistantContext } from "@/server/assistant/context/context-builder";
import { sanitizeContextValue } from "@/server/assistant/context/sanitize";
import type { RegisteredTool, ToolHandlerContext, ToolHandlerResult } from "../registry";

export const GET_THREAD_CONTEXT_USER_SUMMARY =
  "Contexto da conversa atualizado";

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
  logger.debug("[get_thread_context] context refreshed", {
    workspaceId: ctx.workspaceId,
    threadId: ctx.threadId,
    clientProfileId: ctx.clientProfileId,
    contextBytes: JSON.stringify(sanitized).length,
  });

  return { summary: GET_THREAD_CONTEXT_USER_SUMMARY };
}

export const getThreadContextTool: RegisteredTool = {
  name: "get_thread_context",
  description: "Returns a sanitized snapshot of the current thread context.",
  parametersSchema: getThreadContextSchema,
  allowedRoles: ["owner", "admin", "member"] satisfies WorkspaceMemberRole[],
  requiresConfirmation: false,
  handler: async (ctx) => handleGetThreadContext(ctx),
};
