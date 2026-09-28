import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeClientContext } from "@/server/equipe/http/guards";
import { getIdeasView } from "@/server/equipe/module/queries";

const paramsSchema = z.object({
  accountId: z.string().uuid(),
});

/** GET /api/equipe/accounts/[accountId]/ideas — the account's ideas. */
export async function GET(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const rawParams = await context.params;
    const parsed = paramsSchema.safeParse(rawParams);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const guard = await equipeClientContext(request, parsed.data.accountId);
    if (!guard.ok) return apiError("notFound", 404);

    const view = await getIdeasView(
      guard.context.deps.uow.repos,
      guard.context.workspace.id,
      parsed.data.accountId,
    );
    if (!view) return apiError("notFound", 404);
    return NextResponse.json(view);
  } catch (error) {
    return handleApiError(error, "equipe.accounts.[accountId].ideas.GET");
  }
}
