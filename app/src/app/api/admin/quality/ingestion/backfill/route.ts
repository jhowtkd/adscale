import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { runCorpusBackfillBatch } from "@/server/human-quality/ingestion/backfill";

const bodySchema = z.object({
  batchSize: z.number().int().min(1).max(1000).optional(),
  cursor: z
    .object({ createdAt: z.string(), id: z.string().uuid() })
    .nullable()
    .optional(),
  workspaceId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    await requirePlatformOwner(request);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("validation_error", 400);
    }
    const result = await runCorpusBackfillBatch(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "admin.quality.ingestion.backfill.POST");
  }
}
