import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { generateCreativeWork } from "@/server/application/generate-creative-work";
import { generateCarouselWork } from "@/server/application/generate-carousel-work";
import { reviseCreativeWorkOutput } from "@/server/application/revise-creative-work-output";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCreativeWork } from "@/server/repositories/creative-work";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("initial"), preparedRevision: z.string().min(1).optional(), studioSessionId: z.string().uuid().optional(), rolloutVariant: z.enum(["control", "progressive"]).optional(), generationScope: z.enum(["cover", "interiors"]).optional() }).strict(),
  z.object({
    action: z.literal("revision"),
    revisionKey: z.string().uuid(),
    outputId: z.string().min(1),
    instruction: z.string().trim().min(1).max(2_000),
    revisionAssetId: z.string().min(1).nullable(),
  }).strict(),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([requireWorkspaceAccess(request), params]);
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return apiError("invalidInput", 400, body.error.flatten());

    if (body.data.action === "revision") {
      const result = await reviseCreativeWorkOutput({
        workspaceId: workspace.id,
        workItemId: id,
        userId: user.id,
        revisionKey: body.data.revisionKey,
        outputId: body.data.outputId,
        instruction: body.data.instruction,
        revisionAssetId: body.data.revisionAssetId,
      });
      if (!result.ok) {
        switch (result.error.code) {
          case "work_not_found": return apiError("creativeWorkNotFound", 404);
          case "credit_blocked": return apiError("insufficientCredits", 402, result.error.details);
          case "dispatch_failed": return apiError("creativeWorkDispatchUnavailable", 502);
          case "output_not_ready": return apiError("creativeWorkOutputNotReady", 409);
          default: return apiError("invalidInput", 400);
        }
      }
      return NextResponse.json({ output: result.value.output }, { status: 202 });
    }

    // The preparedRevision shape depends on the work's protocol: carousel
    // decks freeze a `prep-*` revision while every other protocol keeps the
    // datetime-based revision. The work is loaded once to route the command.
    const aggregate = await getCreativeWork(workspace.id, id);
    if (aggregate?.work.toolKind === "carousel") {
      if (!body.data.preparedRevision) {
        return apiError("invalidInput", 400, { preparedRevision: ["preparedRevision is required for carousel generation"] });
      }
      const result = await generateCarouselWork({ workspaceId: workspace.id, workItemId: id, userId: user.id, preparedRevision: body.data.preparedRevision, studioSessionId: body.data.studioSessionId, rolloutVariant: body.data.rolloutVariant });
      if (!result.ok) {
        switch (result.error.code) {
          case "work_not_found": return apiError("creativeWorkNotFound", 404);
          case "work_not_carousel": return apiError("invalidInput", 400, result.error.details);
          case "stale_input": return apiError("creativeWorkNotReady", 409, result.error.details);
          case "invalid_generation_gate": return apiError("creativeWorkNotReady", 409, result.error.details);
          case "credit_blocked": return apiError("insufficientCredits", 402, result.error.details);
          case "dispatch_failed": return apiError("creativeWorkDispatchUnavailable", 502);
          default: return apiError("creativeWorkNotReady", 409, result.error.details);
        }
      }
      return NextResponse.json(result.value, { status: 202 });
    }

    const datetimeRevision = z.string().datetime({ offset: true }).safeParse(body.data.preparedRevision);
    if (!datetimeRevision.success) return apiError("invalidInput", 400, datetimeRevision.error.flatten());

    const result = await generateCreativeWork({ workspaceId: workspace.id, workItemId: id, userId: user.id, preparedRevision: datetimeRevision.data, studioSessionId: body.data.studioSessionId, rolloutVariant: body.data.rolloutVariant });
    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found": return apiError("creativeWorkNotFound", 404);
        case "credit_blocked": return apiError("insufficientCredits", 402, result.error.details);
        case "dispatch_failed": return apiError("creativeWorkDispatchUnavailable", 502);
        case "offer_expired": return apiError("commercialOfferExpired", 409);
        case "calibration_managed": return apiError("creativeWorkCalibrationManaged", 403);
        default: return apiError("creativeWorkNotReady", 409, result.error.details);
      }
    }
    return NextResponse.json(result.value, { status: 202 });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].generate.POST");
  }
}
