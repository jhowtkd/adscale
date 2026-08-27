import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { deleteEmptyClientProfile } from "@/server/repositories/client-reference";

const profileIdSchema = z.string().uuid();

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    if (!profileIdSchema.safeParse(id).success) {
      return apiError("clientProfileNotFound", 404);
    }

    const result = await deleteEmptyClientProfile(workspace.id, id);
    if (result.status === "not_found") return apiError("clientProfileNotFound", 404);
    if (result.status === "in_use") return apiError("clientProfileInUse", 409);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].DELETE");
  }
}
