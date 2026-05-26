import { logger } from "@/lib/logger";
import type { BrandMemoryEvent } from "./brand-memory-events";
import { isBrandMemoryEnabled } from "./zep-client";

export async function recordBrandMemoryEvent(event: BrandMemoryEvent) {
  if (!isBrandMemoryEnabled()) {
    return { status: "disabled" as const };
  }

  try {
    const { inngest } = await import("@/server/jobs/client");
    await inngest.send({
      name: "brand-memory.ingest",
      data: event,
    });
    return { status: "queued" as const };
  } catch (error) {
    logger.warn(
      { error, eventType: event.type, workspaceId: event.workspaceId },
      "[brand-memory] event dispatch failed"
    );
    return { status: "failed" as const, error };
  }
}

