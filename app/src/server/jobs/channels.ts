import { realtime } from "inngest";
import { z } from "zod";

export const derivationChannel = realtime.channel({
  name: ({ derivationId }: { derivationId: string }) => `derivation:${derivationId}`,
  topics: {
    status: {
      schema: z.object({
        derivationId: z.string(),
        status: z.enum(["queued", "processing", "generating", "completed", "failed"]),
        outputKey: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        updatedAt: z.string(),
      }),
    },
  },
});
