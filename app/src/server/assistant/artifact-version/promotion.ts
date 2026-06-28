import type {
  ArtifactPromotionCommand,
  ArtifactPromotionEffect,
} from "@/lib/assistant/artifact-version";
import { artifactPromotionEffectSchema } from "@/lib/assistant/artifact-version";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  ArtifactVersionValidationError,
  promoteArtifactVersion,
  type ArtifactScope,
} from "@/server/repositories/artifact-version";
import { getThreadArtifactVersionState } from "./service";

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
