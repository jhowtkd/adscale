import {
  GOAL_FORMATS,
  goalBriefSchema,
  goalPlanSchema,
  type GoalBrief,
} from "@/lib/assistant/goal";
import type { GoalContext } from "@/server/assistant/context/allowlist";
import { getClientProfile, getClientReferencesByIds } from "@/server/repositories/client-reference";
import { createCampaign } from "@/server/repositories/campaign";
import { createPlan } from "@/server/repositories/plan";
import { createAsset } from "@/server/repositories/asset";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { linkThreadToCampaign } from "@/server/repositories/assistant-thread";
import { adoptArtifactForThread } from "@/server/assistant/artifact-version/service";
import {
  getGoalRunScoped,
  updateGoalRun,
} from "@/server/repositories/assistant-goal";
import {
  listArtifactLineages,
  listArtifactVersions,
} from "@/server/repositories/artifact-version";
import type { ArtifactScope } from "@/server/repositories/artifact-version";

/**
 * The minimum facts the agent must collect before it can spend credits. The
 * contract is intentionally narrow: product/offer, primary audience, and
 * mandatory constraints. Everything else the model suggests is an editable
 * assumption, never a blocker.
 */
export const GOAL_BLOCKING_FIELDS = [
  "productOffer",
  "audience",
  "constraints",
] as const;

/**
 * An explicit "no constraints" answer satisfies the constraints blocker. The
 * agent must not invent restrictions the user did not state, but a user who has
 * considered constraints and has none should not be blocked forever.
 */
export const NO_CONSTRAINTS_PHRASE = "Nenhuma restrição adicional";

export function goalBlockers(brief: GoalBrief): string[] {
  return GOAL_BLOCKING_FIELDS.filter((key) => {
    const value = brief[key].trim();
    if (key === "constraints") {
      return value.length === 0;
    }
    return value.length === 0;
  });
}

export interface GoalRunRow {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  campaignId: string | null;
  objective: string;
  stage: string;
  brief: GoalBrief;
  plan: {
    strategy: string;
    angles: string[];
    hooks: string[];
    ctas: string[];
  };
  assumptions: string[];
  blockers: string[];
  revision: number;
}

/**
 * Idempotently materializes a draft campaign + creative plan from a ready goal
 * brief, adopts the plan into artifact versioning, and links the thread. Once a
 * campaign exists for the goal (`campaignId` is set), this is a no-op so replays
 * (e.g. repeated tool calls or retries) never create duplicate campaigns.
 *
 * Returns the goal patch that advances the run to `awaiting_generation`, or
 * `null` when the brief is not yet ready. The caller applies the patch with the
 * CAS update so the transition is atomic against the goal revision.
 */
export async function materializeGoalCampaign(
  goal: GoalRunRow
): Promise<{ campaignId: string; planVersionId: string } | null> {
  const brief = goalBriefSchema.parse(goal.brief);
  if (goalBlockers(brief).length > 0) {
    return null;
  }

  // Replay protection: if a previous call already created the campaign, keep it.
  if (goal.campaignId) {
    return { campaignId: goal.campaignId, planVersionId: goal.id };
  }

  const client = await getClientProfile(goal.workspaceId, goal.clientProfileId);
  if (!client) {
    throw new Error("Client profile not found for goal");
  }

  // Resolve any reference ids the user accepted. References are optional; an
  // empty set never blocks materialization.
  const references = brief.referenceIds.length
    ? await getClientReferencesByIds(goal.workspaceId, brief.referenceIds)
    : [];

  const campaign = await createCampaign(goal.workspaceId, {
    name: brief.objective || client.name,
    clientProfileId: goal.clientProfileId,
    objective: brief.objective || goal.objective,
    audience: brief.audience,
    product: brief.productOffer,
    constraints: brief.constraints,
    creativeLevel: "balanced",
    targetFormats: [...GOAL_FORMATS],
    status: "draft",
    selectedReferenceIds: references.map((r) => r.id),
  });

  // If the user uploaded a base piece, validate workspace ownership and attach
  // it to the campaign as the base asset used by the existing-piece path.
  if (brief.baseAssetId) {
    const asset = await getWorkspaceAssetById(
      goal.workspaceId,
      brief.baseAssetId
    );
    if (asset) {
      await createAsset(goal.workspaceId, campaign.id, {
        key: asset.key,
        type: asset.type,
        role: "base",
      });
    }
  }

  const plan = await createPlan(campaign.id, goal.workspaceId, {
    strategy: goal.plan.strategy,
    angles: goal.plan.angles,
    hooks: goal.plan.hooks,
    ctas: goal.plan.ctas,
  });

  await linkThreadToCampaign(goal.workspaceId, goal.threadId, campaign.id);

  const adopted = await adoptArtifactForThread({
    workspaceId: goal.workspaceId,
    threadId: goal.threadId,
    artifactType: "plan",
    artifactId: plan.id,
  });

  // The adopted presentation exposes the working (latest) version id; that is
  // the opaque identifier the model quotes on its next typed action proposal.
  const planVersionId =
    adopted.working?.id ?? adopted.approvedCurrent?.id ?? plan.id;

  return { campaignId: campaign.id, planVersionId };
}

/**
 * Convenience wrapper used by the plan-update tool: when the brief becomes
 * ready, materialize and advance the goal to `awaiting_generation` in one CAS
 * step. Returns the next goal revision so the model loop can propose the next
 * action with fresh scope identifiers.
 */
export async function applyGoalMaterialization(goal: GoalRunRow): Promise<{
  materialized: boolean;
  nextRevision?: number;
  planVersionId?: string;
}> {
  const result = await materializeGoalCampaign(goal);
  if (!result) {
    return { materialized: false };
  }

  const updated = await updateGoalRun({
    goalRunId: goal.id,
    workspaceId: goal.workspaceId,
    clientProfileId: goal.clientProfileId,
    threadId: goal.threadId,
    expectedRevision: goal.revision,
    patch: {
      campaignId: result.campaignId,
      stage: "awaiting_generation",
    },
  });

  return {
    materialized: true,
    nextRevision: updated.revision,
    planVersionId: result.planVersionId,
  };
}

/**
 * Builds the allowlisted, model-safe goal context for a thread. Returns `null`
 * when the thread has no goal run (classic experience). The `planVersionId` is
 * resolved from the thread's plan artifact lineage so the model receives the
 * exact opaque identifier it must quote on its next typed action proposal.
 */
export async function resolveGoalContext(input: {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
}): Promise<GoalContext | null> {
  const goal = await getGoalRunScoped(
    input.workspaceId,
    input.clientProfileId,
    input.threadId
  );
  if (!goal) return null;

  const brief = goalBriefSchema.parse(goal.brief);
  const plan = goalPlanSchema.parse(goal.plan);

  // Resolve the latest plan version id from the artifact lineage, if any.
  let planVersionId: string | null = null;
  try {
    const scope: ArtifactScope = {
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      campaignId: goal.campaignId ?? "",
      threadId: input.threadId,
    };
    const lineages = await listArtifactLineages(scope);
    const planLineage = lineages.find((l) => l.artifactType === "plan");
    if (planLineage) {
      const versions = await listArtifactVersions(scope, planLineage.id, 1);
      planVersionId = versions[0]?.id ?? null;
    }
  } catch {
    planVersionId = null;
  }

  return {
    id: goal.id,
    revision: goal.revision,
    stage: goal.stage,
    objective: goal.objective,
    planVersionId,
    brief,
    plan,
    assumptions: goal.assumptions,
    blockers: goal.blockers,
  };
}
