import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { creativeDirectionPoolSchema } from "@/server/creative-work/contracts";
import { getCreativeWork, updateCreativeWorkDraft } from "@/server/repositories/creative-work";

const patchDirectionsSchema = creativeDirectionPoolSchema;

/**
 * Persist an ordered direction pool and active selection on a draft creative
 * work. Only draft works can be updated; workspace scoping is enforced.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const body = await request.json();
    const parsed = patchDirectionsSchema.safeParse(body.directionPool);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const aggregate = await getCreativeWork(workspace.id, id);
    if (!aggregate) {
      return apiError("creativeWorkNotFound", 404);
    }
    if (aggregate.work.status !== "draft") {
      return apiError("creativeWorkNotDraft", 409);
    }

    const updated = await updateCreativeWorkDraft(workspace.id, id, {
      settings: {
        ...aggregate.work.settings,
        directionPool: parsed.data,
      },
    });
    if (!updated) {
      return apiError("creativeWorkNotFound", 404);
    }

    return NextResponse.json({ work: updated, outputs: [], sources: [] });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].directions.PATCH");
  }
}
