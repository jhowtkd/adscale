import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { endBetaSessionSchema } from "@/server/beta-sessions/types";
import {
  endBetaSession,
  getBetaSessionByIdOnly,
} from "@/server/repositories/beta-sessions";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    await requirePlatformOwner(request);
    const { id } = await context.params;

    const session = await getBetaSessionByIdOnly(id);
    if (!session) {
      return apiError("not_found", 404);
    }

    return NextResponse.json({ session });
  } catch (error) {
    return handleApiError(error, "feedback.beta-sessions.[id].GET");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requirePlatformOwner(request);
    const { id } = await context.params;
    const parsed = endBetaSessionSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const endedAt = parsed.data.endedAt ? new Date(parsed.data.endedAt) : new Date();
    const session = await endBetaSession(id, endedAt);

    if (!session) {
      return apiError("not_found", 404);
    }

    return NextResponse.json({ session });
  } catch (error) {
    return handleApiError(error, "feedback.beta-sessions.[id].PATCH");
  }
}
