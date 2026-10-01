import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { canDecideHandoff, equipeClientContext } from "@/server/equipe/http/guards";
import { getAccountState } from "@/server/equipe/module/queries";
import { getEquipeThreads } from "@/server/equipe/module/threads";

const paramsSchema = z.object({
  accountId: z.string().uuid(),
});

/**
 * GET /api/equipe/accounts/[accountId] — account state, fronts and
 * pending onboarding steps. Unknown accounts answer 404, like a
 * disabled workspace: nothing reveals other accounts' existence.
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

    const view = await getAccountState(
      guard.context.deps.uow.repos,
      guard.context.workspace.id,
      parsed.data.accountId,
    );
    if (!view) return apiError("notFound", 404);
    // The conversation panel lists the account's own conversations: the main one plus the parallel ones by topic.
    const mapped = await getEquipeThreads(guard.context.deps.uow.repos, guard.context.workspace.id, parsed.data.accountId);
    const thread = (row: { id: string; assistantThreadId: string | null; topic: string | null }) =>
      ({ id: row.id, assistantThreadId: row.assistantThreadId, topic: row.topic });
    const threads = { primary: mapped?.primary ? thread(mapped.primary) : null, parallel: (mapped?.parallel ?? []).map(thread) };
    // The state stays actor-blind; what the caller may do is added beside it so the cards can render read-only.
    return NextResponse.json({ ...view, threads, viewer: { canDecideHandoff: canDecideHandoff(guard.context.person) } });
  } catch (error) {
    return handleApiError(error, "equipe.accounts.[accountId].GET");
  }
}
