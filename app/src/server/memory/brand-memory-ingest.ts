import { logger } from "@/lib/logger";
import type { BrandMemoryEvent } from "./brand-memory-events";
import { prepareBrandMemoryEvent } from "./brand-memory-events";
import { getBrandMemoryUserId, getMem0Client } from "./mem0-client";

export async function ingestBrandMemoryEvent(event: BrandMemoryEvent) {
  const client = getMem0Client();
  if (!client) {
    return { status: "disabled" as const };
  }

  try {
    const userId = getBrandMemoryUserId(event.workspaceId, event.clientProfileId);
    const prepared = prepareBrandMemoryEvent(event, userId);

    await client.add([{ role: "user", content: prepared.content }], {
      user_id: prepared.userId,
      metadata: prepared.metadata,
      infer: false,
    });

    return { status: "ingested" as const, userId };
  } catch (error) {
    logger.warn(
      { error, eventType: event.type, workspaceId: event.workspaceId },
      "[brand-memory] ingestion failed"
    );
    return { status: "failed" as const, error };
  }
}
