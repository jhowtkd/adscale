import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { getActiveTesterEntitlementByWorkspace } from "@/server/repositories/entitlements";

export type AssistantExperience = "agent" | "classic";

export class AssistantGoalPilotError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "AssistantGoalPilotError";
  }
}

/**
 * Resolves which assistant experience a caller gets. The goal-agent pilot is
 * gated by existing access: platform owners and workspaces with an active
 * tester entitlement qualify. Everyone else stays on the classic guided
 * experience, so the pilot cannot leak to regular workspaces and there is no
 * new feature-flag system to maintain.
 *
 * An explicit `requested` value always wins when the caller is eligible; an
 * ineligible caller asking for "agent" is rejected so the API surface fails
 * closed instead of silently downgrading.
 */
export async function resolveAssistantExperience(input: {
  workspaceId: string;
  userEmail: string;
  requested?: AssistantExperience;
}): Promise<AssistantExperience> {
  const eligible =
    isPlatformOwnerEmail(input.userEmail) ||
    Boolean(await getActiveTesterEntitlementByWorkspace(input.workspaceId));

  if (input.requested === "agent" && !eligible) {
    throw new AssistantGoalPilotError(
      "Goal-agent pilot is not enabled for this workspace",
      "goal_agent_not_enabled"
    );
  }

  if (input.requested) {
    return input.requested;
  }

  return eligible ? "agent" : "classic";
}

/**
 * Pure helper used by the client to decide which composer to render without a
 * round-trip. The server re-checks eligibility on thread creation, so this is
 * only a UX hint.
 */
export function isGoalAgentEligible(
  userEmail: string,
  hasTesterEntitlement: boolean
): boolean {
  return isPlatformOwnerEmail(userEmail) || hasTesterEntitlement;
}
