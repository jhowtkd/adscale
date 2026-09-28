import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";
import { equipeErrorResponse } from "@/server/equipe/http/errors";
import { equipeStaffContext, resolveStaffActor } from "@/server/equipe/http/guards";
import { executeCommand } from "@/server/equipe/module/commands";

/**
 * Adapter-level envelope. Only { type, payload } reach the module as the
 * raw command — role, workspaceId and accountId build the trusted
 * context, and any other top-level key (actor smuggling → 400) is
 * rejected here.
 */
const staffCommandBodySchema = z
  .object({
    type: z.string().min(1),
    payload: z.unknown(),
    role: z.enum(["support", "quality", "operations"]).optional(),
    workspaceId: z.string().uuid(),
    accountId: z.string().uuid().optional(),
  })
  .strict();

/**
 * POST /api/equipe/staff/commands — every internal command through one
 * envelope. The staff actor is built on the server from the caller's
 * staff row holding the role it acts as (explicit, or the single row);
 * the module re-binds and refuses roles the user does not hold.
 */
export async function POST(request: Request) {
  try {
    const guard = await equipeStaffContext(request);

    const parsedBody = staffCommandBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return apiError("invalidInput", 400, parsedBody.error.flatten());
    }
    const { type, payload, role, workspaceId, accountId } = parsedBody.data;

    const resolved = resolveStaffActor(guard.staffRows, role);
    if (!resolved.ok) {
      if (resolved.reason === "role_required") {
        return apiError("staff_role_required", 400);
      }
      return apiError("forbidden", 403);
    }

    // Workspace-scoped gateway for this command; the guard's deps are
    // unscoped (internal reads span workspaces by design).
    const deps = createEquipeRouteDeps(workspaceId);
    const outcome = await executeCommand(
      deps,
      {
        actor: resolved.actor,
        workspaceId,
        ...(accountId ? { accountId } : {}),
      },
      { type, payload },
    );
    if (!outcome.ok) {
      return equipeErrorResponse(outcome.error, "equipe.staff.commands.POST");
    }
    return NextResponse.json(outcome.value);
  } catch (error) {
    return handleApiError(error, "equipe.staff.commands.POST");
  }
}
