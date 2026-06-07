import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { mergeStageNotesSchema } from "@/server/beta-sessions/types";
import { mergeBetaSessionNotes } from "@/server/repositories/beta-sessions";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requirePlatformOwner(request);
    const { id } = await context.params;
    const parsed = mergeStageNotesSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const session = await mergeBetaSessionNotes(id, parsed.data.stages);

    if (!session) {
      return apiError("not_found", 404);
    }

    return NextResponse.json({ session });
  } catch (error) {
    return handleApiError(error, "feedback.beta-sessions.[id].notes.PATCH");
  }
}
