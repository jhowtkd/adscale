import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { startBetaSessionSchema } from "@/server/beta-sessions/types";
import {
  BetaSessionError,
  createBetaSession,
  listBetaSessions,
} from "@/server/repositories/beta-sessions";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);

    const sessions = await listBetaSessions({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      activeOnly: searchParams.get("activeOnly") === "true",
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    return handleApiError(error, "feedback.beta-sessions.GET");
  }
}

export async function POST(request: Request) {
  try {
    await requirePlatformOwner(request);
    const parsed = startBetaSessionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const session = await createBetaSession(parsed.data);

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof BetaSessionError && error.code === "workspace_not_found") {
      return apiError("workspace_not_found", 404);
    }

    return handleApiError(error, "feedback.beta-sessions.POST");
  }
}
