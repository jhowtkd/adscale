import "server-only";
import { db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";
import { logger } from "@/lib/logger";

/**
 * Auditoria do MCP (#356): cada tool call registra o operador em nome de
 * quem o agente age + o prefixo do token (cliente). Leituras passivas via
 * resource não são auditadas (o poll do agente geraria spam); `listar_pecas`
 * é auditado por ser ação explícita. Falha de auditoria nunca derruba a call.
 */
export async function auditMcpCall(input: {
  workspaceId: string;
  userId: string;
  tokenPrefix: string;
  tool: string;
  ok: boolean;
  target?: Record<string, string>;
}): Promise<void> {
  try {
    await db.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      type: "mcp.tool_call",
      metadata: {
        tool: input.tool,
        tokenPrefix: input.tokenPrefix,
        ok: input.ok,
        ...(input.target ?? {}),
      },
    });
  } catch (error) {
    logger.warn("mcp.audit_failed", { tool: input.tool, error: String(error) });
  }
}
