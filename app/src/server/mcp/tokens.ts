import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { mcpWorkspaceTokens } from "@/server/db/schema";

/**
 * Bearer por workspace (primeira fatia MCP, #356 rev. 2).
 * Guarda só o hash sha256 — o segredo aparece uma vez, na criação.
 * O agente age em nome do operador que criou o token (createdByUserId).
 */

const TOKEN_PREFIX = "adscale-mcp-";

export function generateBearerToken(): { token: string; prefix: string } {
  const secret = randomBytes(32).toString("base64url");
  const token = `${TOKEN_PREFIX}${secret}`;
  return { token, prefix: token.slice(0, TOKEN_PREFIX.length + 4) };
}

export function hashBearerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ", 2);
  if (scheme !== "Bearer" || !value) return null;
  return value;
}

export interface McpTokenContext {
  workspaceId: string;
  /** Operador em nome de quem o agente age. */
  userId: string;
  tokenId: string;
  prefix: string;
}

export async function issueWorkspaceToken(input: {
  workspaceId: string;
  userId: string;
  name: string;
}): Promise<{ id: string; token: string; prefix: string }> {
  const { token, prefix } = generateBearerToken();
  const [row] = await db
    .insert(mcpWorkspaceTokens)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      tokenHash: hashBearerToken(token),
      prefix,
      createdByUserId: input.userId,
    })
    .returning({ id: mcpWorkspaceTokens.id });
  return { id: row.id, token, prefix };
}

export async function verifyBearerToken(token: string): Promise<McpTokenContext | null> {
  const [row] = await db
    .select()
    .from(mcpWorkspaceTokens)
    .where(
      and(
        eq(mcpWorkspaceTokens.tokenHash, hashBearerToken(token)),
        isNull(mcpWorkspaceTokens.revokedAt)
      )
    )
    .limit(1);
  if (!row) return null;
  await db
    .update(mcpWorkspaceTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpWorkspaceTokens.id, row.id));
  return {
    workspaceId: row.workspaceId,
    userId: row.createdByUserId,
    tokenId: row.id,
    prefix: row.prefix,
  };
}

export interface McpTokenSummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export async function listWorkspaceTokens(workspaceId: string): Promise<McpTokenSummary[]> {
  return db
    .select({
      id: mcpWorkspaceTokens.id,
      name: mcpWorkspaceTokens.name,
      prefix: mcpWorkspaceTokens.prefix,
      createdAt: mcpWorkspaceTokens.createdAt,
      lastUsedAt: mcpWorkspaceTokens.lastUsedAt,
      revokedAt: mcpWorkspaceTokens.revokedAt,
    })
    .from(mcpWorkspaceTokens)
    .where(eq(mcpWorkspaceTokens.workspaceId, workspaceId))
    .orderBy(desc(mcpWorkspaceTokens.createdAt));
}

export async function revokeWorkspaceToken(
  workspaceId: string,
  id: string
): Promise<boolean> {
  const [row] = await db
    .update(mcpWorkspaceTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpWorkspaceTokens.id, id),
        eq(mcpWorkspaceTokens.workspaceId, workspaceId),
        isNull(mcpWorkspaceTokens.revokedAt)
      )
    )
    .returning({ id: mcpWorkspaceTokens.id });
  return Boolean(row);
}
