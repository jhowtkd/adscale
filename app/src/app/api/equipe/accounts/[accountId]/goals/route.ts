import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeClientContext } from "@/server/equipe/http/guards";
import { getGoalsView } from "@/server/equipe/module/queries";
import { authorize, type ClientPersonRole } from "@/server/equipe/domain";

const paramsSchema = z.object({
  accountId: z.string().uuid(),
});

/**
 * GET /api/equipe/accounts/[accountId]/goals — plan, mandates and the
 * implantation follow-up.
 */
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

    const view = await getGoalsView(
      guard.context.deps.uow.repos,
      guard.context.workspace.id,
      parsed.data.accountId,
      guard.context.deps.clock.now(),
    );
    if (!view) return apiError("notFound", 404);
    const person = guard.context.person;
    view.decisions.publication.canApprove = !!person?.active && authorize(
      { kind: "client_person", personId: person.id, role: person.role as ClientPersonRole },
      "approve_automatic_publication",
    ).ok;
    return NextResponse.json(view);
  } catch (error) {
    return handleApiError(error, "equipe.accounts.[accountId].goals.GET");
  }
}
