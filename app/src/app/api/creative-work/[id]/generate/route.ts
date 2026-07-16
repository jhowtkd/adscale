import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { generateCreativeWork } from "@/server/application/generate-creative-work";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

const bodySchema = z.object({ action: z.literal("initial") }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([requireWorkspaceAccess(request), params]);
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return apiError("invalidInput", 400, body.error.flatten());

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
