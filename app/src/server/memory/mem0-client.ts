import { MemoryClient } from "mem0ai";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";

let mem0Client: MemoryClient | null = null;

export function isBrandMemoryEnabled() {
  return env.MEM0_ENABLED === "true" && Boolean(env.MEM0_API_KEY);
}

export function getBrandMemoryUserId(workspaceId: string) {
  const prefix = env.MEM0_USER_PREFIX?.trim() || "adscale_workspace";
  return `${prefix}_${workspaceId}`;
}

export function getMem0Client() {
  if (!isBrandMemoryEnabled()) return null;
  if (!mem0Client) {
    mem0Client = new MemoryClient({
      apiKey: env.MEM0_API_KEY!,
      ...(env.MEM0_ORGANIZATION_ID ? { organizationId: env.MEM0_ORGANIZATION_ID } : {}),
      ...(env.MEM0_PROJECT_ID ? { projectId: env.MEM0_PROJECT_ID } : {}),
    });
  }
  return mem0Client;
}

export async function ensureBrandMemoryScope(workspaceId: string) {
  const client = getMem0Client();
  if (!client) return null;

  const userId = getBrandMemoryUserId(workspaceId);
  try {
    return userId;
  } catch (error) {
    logger.warn({ error, userId }, "[brand-memory] scope ensure failed");
    throw error;
  }
}

export function resetBrandMemoryClientForTests() {
  mem0Client = null;
}
