import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeStaffContext } from "@/server/equipe/http/guards";
import { getRoundDetail } from "@/server/equipe/module/calibration-queries";

const paramsSchema = z.object({
  roundId: z.string().uuid(),
});

const querySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
});

/**
 * GET /api/equipe/staff/rounds/[roundId] — round detail: items with
 * attempts, scores, quality state and verdicts. The scope resolves on the
 * server from the id through the internal repositories, so notification
 * links open with the id alone; ?workspaceId=&accountId= are optional
 * hints — given and mismatching, the round answers 404. Unknown rounds
 * answer 404.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ roundId: string }> },
) {
  try {
    const guard = await equipeStaffContext(request);

    const rawParams = await context.params;
    const parsedParams = paramsSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return apiError("invalidInput", 400, parsedParams.error.flatten());
    }
    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      accountId: searchParams.get("accountId") ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiError("invalidInput", 400, parsedQuery.error.flatten());
    }

    const located = await guard.deps.uow.internal.getCalibrationRound(
      parsedParams.data.roundId,
    );
    if (!located) return apiError("notFound", 404);
    if (
      (parsedQuery.data.workspaceId !== undefined &&
        parsedQuery.data.workspaceId !== located.workspaceId) ||
      (parsedQuery.data.accountId !== undefined && parsedQuery.data.accountId !== located.accountId)
    ) {
      return apiError("notFound", 404);
    }

    const view = await getRoundDetail(
      guard.deps.uow.repos,
      guard.deps.uow.internal,
      located.workspaceId,
      located.accountId,
      parsedParams.data.roundId,
    );
    if (!view) return apiError("notFound", 404);
    return NextResponse.json(view);
  } catch (error) {
    return handleApiError(error, "equipe.staff.rounds.[roundId].GET");
  }
}
