import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeStaffContext } from "@/server/equipe/http/guards";
import { getRoundDetail } from "@/server/equipe/module/calibration-queries";

const paramsSchema = z.object({
  roundId: z.string().uuid(),
});

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
});

/**
 * GET /api/equipe/staff/rounds/[roundId] — round detail: items with
 * attempts, scores, quality state and verdicts. The account scope rides
 * the query (?workspaceId=&accountId=); unknown rounds answer 404.
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
      workspaceId: searchParams.get("workspaceId"),
      accountId: searchParams.get("accountId"),
    });
    if (!parsedQuery.success) {
      return apiError("invalidInput", 400, parsedQuery.error.flatten());
    }

    const view = await getRoundDetail(
      guard.deps.uow.repos,
      parsedQuery.data.workspaceId,
      parsedQuery.data.accountId,
      parsedParams.data.roundId,
    );
    if (!view) return apiError("notFound", 404);
    return NextResponse.json(view);
  } catch (error) {
    return handleApiError(error, "equipe.staff.rounds.[roundId].GET");
  }
}
