import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { generateCreativeWork } from "@/server/application/generate-creative-work";
import { reviseCreativeWorkOutput } from "@/server/application/revise-creative-work-output";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("initial") }).strict(),
  z.object({
    action: z.literal("revision"),
    revisionKey: z.string().min(1).max(200),
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

    const result = await generateCreativeWork({ workspaceId: workspace.id, workItemId: id, userId: user.id });
    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found": return apiError("creativeWorkNotFound", 404);
        case "credit_blocked": return apiError("insufficientCredits", 402, result.error.details);
        case "dispatch_failed": return apiError("creativeWorkDispatchUnavailable", 502);
        default: return apiError("creativeWorkNotReady", 409, result.error.details);
      }
    }
    return NextResponse.json(result.value, { status: 202 });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].generate.POST");
  }
}
