import { logger } from "@/lib/logger";
import type { BrandMemoryEvent } from "./brand-memory-events";
import { prepareBrandMemoryEvent } from "./brand-memory-events";
import { ensureBrandMemoryGraph, getBrandMemoryGraphId, getZepClient } from "./zep-client";

export async function ingestBrandMemoryEvent(event: BrandMemoryEvent) {
  const client = getZepClient();
  if (!client) {
    return { status: "disabled" as const };
  }

  try {
    const graphId = (await ensureBrandMemoryGraph(event.workspaceId)) ?? getBrandMemoryGraphId(event.workspaceId);
    const prepared = prepareBrandMemoryEvent(event, graphId);

    await client.graph.add(
      {
        graphId: prepared.graphId,
        type: prepared.type,
        data: prepared.data,
        createdAt: prepared.createdAt,
        sourceDescription: prepared.sourceDescription,
        metadata: prepared.metadata,
      },
      { timeoutInSeconds: 15, maxRetries: 1 }
    );

    return { status: "ingested" as const, graphId };
  } catch (error) {
    logger.warn(
      { error, eventType: event.type, workspaceId: event.workspaceId },
      "[brand-memory] ingestion failed"
    );
    return { status: "failed" as const, error };
  }
}

