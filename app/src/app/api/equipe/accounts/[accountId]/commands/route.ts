import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeErrorResponse } from "@/server/equipe/http/errors";
import { equipeClientContext } from "@/server/equipe/http/guards";
import { executeCommand } from "@/server/equipe/module/commands";

const paramsSchema = z.object({
  accountId: z.string().uuid(),
});

/**
 * The body carries ONLY { type, payload }: the actor, workspace and
 * account never come from the client. The adapter rejects any extra
 * top-level key (actor/workspaceId/accountId smuggling → 400) before
 * the module validates the command itself.
 */
const commandBodySchema = z
  .object({
    type: z.string().min(1),
    payload: z.unknown(),
  })
  .strict();

/**
 * POST /api/equipe/accounts/[accountId]/commands — every client command
 * through one typed envelope. The actor is built on the server from the
 * caller's account row; workspace members with no row get 403 (they
 * keep read access, commands re-bind the actor in the transaction).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const rawParams = await context.params;
    const parsedParams = paramsSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return apiError("invalidInput", 400, parsedParams.error.flatten());
    }
    const { accountId } = parsedParams.data;

    const guard = await equipeClientContext(request, accountId);
    if (!guard.ok) return apiError("notFound", 404);
    const { deps, workspace, person } = guard.context;
    if (!person) return apiError("forbidden", 403);

    const parsedBody = commandBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return apiError("invalidInput", 400, parsedBody.error.flatten());
    }

    const outcome = await executeCommand(
      deps,
      {
        actor: { kind: "client_person", role: person.role, personId: person.id },
        workspaceId: workspace.id,
        accountId,
      },
      { type: parsedBody.data.type, payload: parsedBody.data.payload },
    );
    if (!outcome.ok) {
      return equipeErrorResponse(outcome.error, "equipe.accounts.[accountId].commands.POST");
    }
    return NextResponse.json(outcome.value);
  } catch (error) {
    return handleApiError(error, "equipe.accounts.[accountId].commands.POST");
  }
}
