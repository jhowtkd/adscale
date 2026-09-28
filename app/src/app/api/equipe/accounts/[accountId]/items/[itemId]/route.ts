import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeClientContext } from "@/server/equipe/http/guards";
import { getItemDetail } from "@/server/equipe/module/queries";

const paramsSchema = z.object({
  accountId: z.string().uuid(),
  itemId: z.string().uuid(),
});

/**
 * GET /api/equipe/accounts/[accountId]/items/[itemId] — item detail with
 * versions, receipts and findings. Items still in calibration conference
 * answer 404, like unknown items: the client only sees conferred items.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ accountId: string; itemId: string }> },
) {
  try {
    const rawParams = await context.params;
    const parsed = paramsSchema.safeParse(rawParams);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const guard = await equipeClientContext(request, parsed.data.accountId);
    if (!guard.ok) return apiError("notFound", 404);

    const view = await getItemDetail(
      guard.context.deps.uow.repos,
      guard.context.workspace.id,
      parsed.data.accountId,
      parsed.data.itemId,
    );
    if (!view) return apiError("notFound", 404);
    return NextResponse.json(view);
  } catch (error) {
    return handleApiError(error, "equipe.accounts.[accountId].items.[itemId].GET");
  }
}
