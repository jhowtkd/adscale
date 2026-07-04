import { z } from "zod";
import type { WorkspaceMemberRole } from "@/server/auth/workspace";
import {
  goalBriefSchema,
  goalPlanSchema,
} from "@/lib/assistant/goal";
import { getGoalRunScoped } from "@/server/repositories/assistant-goal";
import { applyGoalMaterialization, goalBlockers } from "@/server/assistant/goal/service";
import type { RegisteredTool, ToolHandlerContext, ToolHandlerResult } from "./registry";

/**
 * Free (non-credit) tool the agent uses to record its evolving understanding of
 * the objective. Server-side it recomputes blockers, persists the plan with the
 * CAS update, and materializes the draft campaign the moment the minimum brief
 * is satisfied. The model never decides scope — it only proposes content, and
 * the server hands back the opaque identifiers (goalRunId, goalRevision,
 * planVersionId) it must quote on the next paid proposal.
 */
export const updateGoalPlanSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    objective: z.string().trim().min(1).max(2_000),
    brief: goalBriefSchema,
    plan: goalPlanSchema,
    assumptions: z.array(z.string().trim().max(500)).max(20),
  })
  .strict();

export async function handleUpdateGoalPlan(
  ctx: ToolHandlerContext,
  args: unknown
): Promise<ToolHandlerResult> {
  const parsed = updateGoalPlanSchema.parse(args);

  const goal = await getGoalRunScoped(
    ctx.workspaceId,
    ctx.clientProfileId,
    ctx.threadId
  );
  if (!goal) {
    throw new Error("goal_not_found");
  }
  if (goal.revision !== parsed.expectedRevision) {
    throw new Error("goal_revision_conflict");
  }

  const blockers = goalBlockers(parsed.brief);
  const materialization = await applyGoalMaterialization({
    ...goal,
    objective: parsed.objective,
    brief: parsed.brief,
    plan: parsed.plan,
    assumptions: parsed.assumptions,
    blockers,
  });

  const planVersionId = materialization.planVersionId ?? "";
  const summary = [
    "Plano atualizado",
    blockers.length > 0
      ? `bloqueios: ${blockers.join(", ")}`
      : "brief pronto",
    `goalRunId=${goal.id}`,
    `goalRevision=${materialization.nextRevision ?? goal.revision}`,
    planVersionId ? `planVersionId=${planVersionId}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  return { summary };
}

export const updateGoalPlanTool: RegisteredTool = {
  name: "update_goal_plan",
  description:
    "Updates the compact goal plan and brief. Free. Returns scope identifiers for the next paid action.",
  parametersSchema: updateGoalPlanSchema,
  allowedRoles: ["owner", "admin", "member"] satisfies WorkspaceMemberRole[],
  requiresConfirmation: false,
  handler: handleUpdateGoalPlan,
};
