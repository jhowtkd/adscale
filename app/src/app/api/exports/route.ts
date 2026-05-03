import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { exportIndividual, exportAllApproved } from "@/server/services/export";

const bodySchema = z.object({
  type: z.enum(["individual", "batch"]),
  derivationId: z.string().optional(),
  campaignId: z.string().optional(),
  format: z.enum(["png", "jpeg", "webp"]),
});

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    const { type, derivationId, campaignId, format } = parsed.data;

    if (type === "individual") {
      if (!derivationId) {
        return apiError("derivationIdRequired", 400);
      }
      const { url } = await exportIndividual(derivationId, workspace.id, format);
      const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();
      return NextResponse.json({ downloadUrl: url, expiresAt });
    }

    if (type === "batch") {
      if (!campaignId) {
        return apiError("campaignIdRequired", 400);
      }
      const { url } = await exportAllApproved(campaignId, workspace.id, format);
      const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();
      return NextResponse.json({ downloadUrl: url, expiresAt });
    }

    return apiError("invalidType", 400);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "No approved derivations" ||
        error.message === "No exportable approved derivations" ||
        error.message === "Derivation has no output file")
    ) {
      return apiError("nothingToExport", 400);
    }

    return handleApiError(error, "exports.POST");
  }
}
