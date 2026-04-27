import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getDerivationById,
  createDerivation,
} from "@/server/repositories/derivation";
import { getUserLocale } from "@/server/repositories/user";
import { inngest } from "@/server/jobs/client";

const bodySchema = z.object({
  feedback: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const locale = await getUserLocale(user.id);
    const { id } = await params;

    const original = await getDerivationById(id, workspace.id);
    if (!original) {
      return apiError("derivationNotFound", 404);
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }
    const feedback = parsed.data.feedback;

    const newDerivation = await createDerivation({
      campaignId: original.campaignId,
      workspaceId: workspace.id,
      planId: original.planId ?? undefined,
      parentId: id,
      feedback: feedback ?? undefined,
      status: "queued",
    });

    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: newDerivation.id,
        campaignId: original.campaignId,
        workspaceId: workspace.id,
        locale: (user as { locale?: string }).locale,
      },
    });

    return NextResponse.json({ derivation: newDerivation }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiError("unauthorized", 401);
    }
    if (error instanceof Error && error.message === "No workspace") {
      return apiError("noWorkspace", 403);
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
