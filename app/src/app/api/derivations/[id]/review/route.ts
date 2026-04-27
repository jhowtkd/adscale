import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { updateDerivationStatus } from "@/server/repositories/derivation";

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

    return NextResponse.json({ derivation: updated });
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
