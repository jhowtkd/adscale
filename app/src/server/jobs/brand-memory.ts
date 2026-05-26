import { inngest } from "./client";
import { ingestBrandMemoryEvent } from "@/server/memory/brand-memory-ingest";
import type { BrandMemoryEvent } from "@/server/memory/brand-memory-events";

export const brandMemoryIngestJob = inngest.createFunction(
  {
    id: "brand-memory-ingest",
    retries: 1,
    triggers: [{ event: "brand-memory.ingest" }],
  },
  async ({ event, step }) => {
    const memoryEvent = event.data as BrandMemoryEvent;
    return step.run("ingest-brand-memory-event", async () => ingestBrandMemoryEvent(memoryEvent));
  }
);

