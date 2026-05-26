import { ZepClient } from "@getzep/zep-cloud";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";

let zepClient: ZepClient | null = null;
const ensuredGraphs = new Set<string>();

export function isBrandMemoryEnabled() {
  return env.ZEP_ENABLED === "true" && Boolean(env.ZEP_API_KEY);
}

export function getBrandMemoryGraphId(workspaceId: string) {
  const prefix = env.ZEP_GRAPH_PREFIX?.trim() || "adscale_workspace";
  return `${prefix}_${workspaceId}`;
}

export function getZepClient() {
  if (!isBrandMemoryEnabled()) return null;
  if (!zepClient) {
    zepClient = new ZepClient({ apiKey: env.ZEP_API_KEY });
  }
  return zepClient;
}

function isAlreadyExistsError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { statusCode?: number; status?: number; message?: string; body?: unknown };
  const message = `${maybe.message ?? ""} ${JSON.stringify(maybe.body ?? "")}`.toLowerCase();
  return maybe.statusCode === 409 || maybe.status === 409 || message.includes("already");
}

export async function ensureBrandMemoryGraph(workspaceId: string) {
  const client = getZepClient();
  if (!client) return null;

  const graphId = getBrandMemoryGraphId(workspaceId);
  if (ensuredGraphs.has(graphId)) return graphId;

  try {
    await client.graph.create({ graphId }, { timeoutInSeconds: 10, maxRetries: 1 });
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      logger.warn({ error, graphId }, "[brand-memory] graph ensure failed");
      throw error;
    }
  }

  ensuredGraphs.add(graphId);
  return graphId;
}

export function resetBrandMemoryClientForTests() {
  zepClient = null;
  ensuredGraphs.clear();
}

