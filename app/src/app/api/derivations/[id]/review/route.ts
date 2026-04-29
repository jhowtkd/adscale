import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { updateDerivationStatus } from "@/server/repositories/derivation";
import { refreshCampaignStatus } from "@/server/repositories/campaign";

const bodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    const updated = await updateDerivationStatus(
      id,
      workspace.id,
      parsed.data.status
    );
    if (!updated) {
      return apiError("derivationNotFound", 404);
    }

    await refreshCampaignStatus(updated.campaignId, workspace.id);

    return NextResponse.json({ derivation: updated });
  } catch (error) {
    return handleApiError(error, "derivations.[id].review.PATCH");
  }
}
