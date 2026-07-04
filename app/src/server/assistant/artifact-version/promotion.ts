import type {
  ArtifactPromotionCommand,
  ArtifactPromotionEffect,
} from "@/lib/assistant/artifact-version";
import { artifactPromotionEffectSchema } from "@/lib/assistant/artifact-version";
import { GOAL_FORMATS, type GoalStage } from "@/lib/assistant/goal";
import { emitArtifactIterationTelemetry } from "@/server/assistant/artifact-iteration-telemetry";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  ArtifactVersionValidationError,
  createComparisonAcknowledgement,
  getArtifactHead,
  getArtifactLineage,
  getArtifactVersion,
  promoteArtifactVersion,
  type ArtifactScope,
} from "@/server/repositories/artifact-version";
import { getThreadArtifactVersionState } from "./service";
import { getGoalRunScoped, updateGoalRun } from "@/server/repositories/assistant-goal";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";

export function isArtifactPromotionEligible(
  status: string,
  hasApprovalHistory: boolean
) {
  return status === "ready" || status === "approved" || hasApprovalHistory;
}

export function buildPromotionEffect(
  input: Omit<ArtifactPromotionEffect, "creditImpact">
): ArtifactPromotionEffect {
  return artifactPromotionEffectSchema.parse({ ...input, creditImpact: 0 });
}

async function resolvePromotionScope(
  workspaceId: string,
  threadId: string
): Promise<ArtifactScope> {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread?.campaignId) {
    throw new ArtifactVersionValidationError("Thread is not linked to a campaign");
  }
  return {
    workspaceId,
    clientProfileId: thread.clientProfileId,
    campaignId: thread.campaignId,
    threadId,
  };
}

export async function promoteThreadArtifactVersion(input: {
  workspaceId: string;
  threadId: string;
  command: ArtifactPromotionCommand;
}) {
  const scope = await resolvePromotionScope(input.workspaceId, input.threadId);
  const result = await promoteArtifactVersion({ scope, command: input.command });
  const refreshed = await getThreadArtifactVersionState(input.workspaceId, input.threadId);
  return {
    effect: buildPromotionEffect({
      transitions: result.promotions.map((promotion) => ({
        artifactType: promotion.artifactType,
        fromVersion: promotion.previousVersionNumber
          ? `v${promotion.previousVersionNumber}`
          : "nenhuma",
        toVersion: `v${promotion.targetVersionNumber}`,
      })),
      canonicalWrites: result.promotions.map((promotion) =>
        promotion.artifactType === "plan" ? "Plano e restrições" : "Criativo"
      ),
      staleProposalCount: result.staleProposalCount,
    }),
    state: refreshed.lineages.filter((lineage) =>
      result.promotions.some((promotion) => promotion.lineageId === lineage.lineageId)
    ),
  };
}

export async function acknowledgeLinkedPlanComparison(input: {
  workspaceId: string;
  threadId: string;
  command: import("@/lib/assistant/artifact-version").ComparisonAcknowledgementCommand;
}) {
  const scope = await resolvePromotionScope(input.workspaceId, input.threadId);
  const [creative, planLineage, linkedPlan, comparedOfficial, planHead] =
    await Promise.all([
      getArtifactVersion(scope, input.command.creativeTargetVersionId),
      getArtifactLineage(scope, input.command.planLineageId),
      getArtifactVersion(scope, input.command.linkedPlanVersionId),
      getArtifactVersion(scope, input.command.comparedOfficialPlanVersionId),
      getArtifactHead(scope, input.command.planLineageId),
    ]);
  if (
    !creative ||
    creative.snapshot.type !== "creative" ||
    creative.snapshot.planVersionId !== input.command.linkedPlanVersionId ||
    !planLineage ||
    planLineage.artifactType !== "plan" ||
    !linkedPlan ||
    linkedPlan.lineageId !== planLineage.id ||
    linkedPlan.snapshot.type !== "plan" ||
    !comparedOfficial ||
    comparedOfficial.lineageId !== planLineage.id ||
    comparedOfficial.snapshot.type !== "plan" ||
    !planHead ||
    planHead.approvedCurrentVersionId !== comparedOfficial.id ||
    planHead.revision !== input.command.expectedPlanRevision
  ) {
    throw new ArtifactVersionValidationError(
      "Plan comparison is not current or does not match the creative binding"
    );
  }
  const created = await createComparisonAcknowledgement({
    scope,
    ...input.command,
  });
  emitArtifactIterationTelemetry({
    scope,
    eventKey: "comparison_acknowledged",
    metadata: {
      artifactType: "creative",
      lineageId: creative.lineageId,
      sourceVersionNumber: creative.versionNumber,
      targetVersionNumber: linkedPlan.versionNumber,
      headRevision: input.command.expectedPlanRevision,
    },
  });
  return {
    id: created.id,
    ...input.command,
    createdAt: created.createdAt,
  };
}

/**
 * After an artifact promotion succeeds, advances the goal stage based on how
 * many of the four required formats are approved. Runs only when the thread owns
 * a goal run; classic threads are unaffected.
 *
 * - 0–1 approved: awaiting_package
 * - 1 approved + child jobs running: generating_package
 * - child jobs settled, <4 approved: reviewing_package
 * - 4 approved: completed
 */
export async function syncGoalRunFromArtifacts(input: {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
}): Promise<void> {
  const goal = await getGoalRunScoped(
    input.workspaceId,
    input.clientProfileId,
    input.threadId
  );
  if (!goal || !goal.campaignId) {
    return;
  }

  const allDerivations = await getDerivationsByCampaign(
    goal.campaignId,
    input.workspaceId
  );
  const approvedFormats = new Set(
    allDerivations
      .filter((d) => d.status === "approved")
      .map((d) => d.format ?? "")
      .filter((f): f is string => f.length > 0 && (GOAL_FORMATS as readonly string[]).includes(f))
  );

  // Is any non-1:1 child still active (queued/processing)?
  const packageChildren = allDerivations.filter(
    (d) =>
      d.format !== "1:1" &&
      (GOAL_FORMATS as readonly string[]).includes(d.format ?? "")
  );
  const anyChildActive = packageChildren.some((d) =>
    ["queued", "processing"].includes(d.status)
  );

  let nextStage: GoalStage;
  let completedAt: Date | null = null;
  if (approvedFormats.size >= GOAL_FORMATS.length) {
    nextStage = "completed";
    completedAt = new Date();
  } else if (anyChildActive) {
    nextStage = "generating_package";
  } else if (approvedFormats.size >= 1 || packageChildren.length > 0) {
    nextStage = "reviewing_package";
  } else {
    nextStage = "awaiting_package";
  }

  await updateGoalRun({
    goalRunId: goal.id,
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: input.threadId,
    expectedRevision: goal.revision,
    patch: { stage: nextStage, completedAt },
  }).catch(() => {
    // A revision conflict means a newer transition already landed; that is fine.
  });
}
