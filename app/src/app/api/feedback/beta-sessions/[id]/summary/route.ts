import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { buildBetaSessionSummary } from "@/server/repositories/beta-sessions";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    await requirePlatformOwner(request);
    const { id } = await context.params;

    const summary = await buildBetaSessionSummary(id);
    if (!summary) {
      return apiError("not_found", 404);
    }

    return NextResponse.json({ summary });
  } catch (error) {
    return handleApiError(error, "feedback.beta-sessions.[id].summary.GET");
  }
}
