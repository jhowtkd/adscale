import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeStaffContext } from "@/server/equipe/http/guards";
import { getEscalationDetail } from "@/server/equipe/module/escalation-queries";

const paramsSchema = z.object({
  escalationId: z.string().uuid(),
});

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
});

/**
 * GET /api/equipe/staff/escalations/[escalationId] — escalation detail:
 * parts, the item at risk, the event trail, covering pauses and the
 * linked support case. Scope rides the query (?workspaceId=&accountId=).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ escalationId: string }> },
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

    const view = await getEscalationDetail(
      guard.deps.uow.repos,
      parsedQuery.data.workspaceId,
      parsedQuery.data.accountId,
      parsedParams.data.escalationId,
    );
    if (!view) return apiError("notFound", 404);
    return NextResponse.json(view);
  } catch (error) {
    return handleApiError(error, "equipe.staff.escalations.[escalationId].GET");
  }
}
