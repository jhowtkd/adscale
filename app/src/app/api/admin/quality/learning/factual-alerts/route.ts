import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { listFactualIssueAlerts } from "@/server/human-quality/learning/factual-alerts";

const querySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  clientProfileId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: url.searchParams.get("workspaceId") ?? undefined,
      clientProfileId: url.searchParams.get("clientProfileId") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("validation_error", 400);
    }

    const alerts = await listFactualIssueAlerts(parsed.data);
    return NextResponse.json({ alerts });
  } catch (error) {
    return handleApiError(error, "admin.quality.learning.factual-alerts.GET");
  }
}
