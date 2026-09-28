import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeStaffContext } from "@/server/equipe/http/guards";
import { getExceptionsQueue } from "@/server/equipe/module/escalation-queries";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
});

/**
 * GET /api/equipe/staff/exceptions — the support exceptions queue of one
 * account (?workspaceId=&accountId=). Behind the internal-staff guard;
 * unknown accounts answer 404.
 */
export async function GET(request: Request) {
  try {
    const guard = await equipeStaffContext(request);

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
      accountId: searchParams.get("accountId"),
    });
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const view = await getExceptionsQueue(
      guard.deps.uow.repos,
      parsed.data.workspaceId,
      parsed.data.accountId,
      guard.deps.clock.now(),
    );
    if (!view) return apiError("notFound", 404);
    return NextResponse.json(view);
  } catch (error) {
    return handleApiError(error, "equipe.staff.exceptions.GET");
  }
}
