import { validateProposeAction } from "@/server/assistant/action-contracts/validate";
import { createAssistantAction } from "@/server/repositories/assistant-action";
import {
  listArtifactProposalsByPlanVersion,
  transitionArtifactProposal,
  type ArtifactScope,
} from "@/server/repositories/artifact-version";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { classifyCreativeRevisionIntent } from "./intent";
import { proposeCreativeRevision } from "./proposal";
import type { CreativeRevisionProposalResult } from "./types";

export interface ReferenceItem {
  id: string;
  name: string;
  thumbnailUrl: string | null;
}

export function buildReviseCreativeActionDisplay(input: {
  proposal: CreativeRevisionProposalResult;
  baseDisplay: Awaited<ReturnType<typeof validateProposeAction>>["display"];
  resolvedReferences: ReferenceItem[];
}) {
  const hasReferences = input.resolvedReferences.length > 0;

  return {
    ...input.baseDisplay,
    actionType: "revise_creative",
    proposalId: input.proposal.proposalId,
    label: "Confirmar revisão do criativo",
    summary: input.proposal.summary,
    sourceVersionLabel: input.proposal.sourceVersionLabel,
    approvedVersionLabel: input.proposal.approvedVersionLabel,
    workingDiffersFromApproved: input.proposal.workingDiffersFromApproved,
    intendedChanges: input.proposal.intendedChanges,
    format: input.proposal.format,
    ...(hasReferences
      ? { referenceItems: input.resolvedReferences }
      : { referenceCount: input.proposal.referenceIds.length }),
    planVersionLabel: input.proposal.planVersionLabel,
    writes: input.proposal.writes,
    proposalStatus: "pending" as const,
    creditImpact: {
      kind: "creditAction",
      action: "image_derivation",
      label: `${input.proposal.creditImpact} créditos`,
    },
    mismatchWarning: input.proposal.workingDiffersFromApproved
      ? `Você está revisando ${input.proposal.sourceVersionLabel}; aprovada atual é ${input.proposal.approvedVersionLabel ?? "nenhuma"}.`
      : undefined,
  };
}

export async function resolveCreativeReferences(input: {
  workspaceId: string;
  referenceIds: string[];
}): Promise<ReferenceItem[]> {
  if (input.referenceIds.length === 0) return [];
  const items = await Promise.all(
    input.referenceIds.map(async (id) => {
      const asset = await getWorkspaceAssetById(id, input.workspaceId);
      if (!asset) return null;
      const metadata = asset.metadata as { thumbnailUrl?: unknown } | null;
      const thumbnailUrl =
        metadata && typeof metadata === "object" && typeof metadata.thumbnailUrl === "string"
          ? metadata.thumbnailUrl
          : null;
      return {
        id: asset.id,
        name: asset.name,
        thumbnailUrl,
      } satisfies ReferenceItem;
    })
  );
  return items.filter((item): item is ReferenceItem => item !== null);
}

export async function handleCreativeRevisionMessage(input: {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  userId: string;
  scope: ArtifactScope;
  userMessage: string;
  messageId?: string;
  attachmentReferenceIds?: string[];
  resolveReferences?: (
    workspaceId: string,
    referenceIds: string[]
  ) => Promise<ReferenceItem[]>;
}): Promise<
  | { kind: "continue" }
  | { kind: "assistant"; content: string }
  | { kind: "action_card"; content: string; actionRecordId: string }
> {
  const intent = classifyCreativeRevisionIntent(input.userMessage);
  if (intent.kind === "continue") {
    return { kind: "continue" };
  }

  const result = await proposeCreativeRevision({
    scope: input.scope,
    feedback: input.userMessage,
    messageId: input.messageId,
    attachmentReferenceIds: input.attachmentReferenceIds ?? [],
  });

  if (result.kind === "clarify" || result.kind === "ask_target") {
    return { kind: "assistant", content: result.question };
  }
  if (result.kind === "redirect") {
    return { kind: "assistant", content: result.message };
  }

  const resolveReferences =
    input.resolveReferences ??
    ((workspaceId: string, referenceIds: string[]) =>
      resolveCreativeReferences({ workspaceId, referenceIds }));
  const resolvedReferences = await resolveReferences(
    input.workspaceId,
    result.referenceIds
  );

  const inputSnapshot = {
    proposalId: result.proposalId,
    lineageId: result.lineageId,
    sourceVersionId: result.sourceVersionId,
    payloadDigest: result.payloadDigest,
    planVersionId: result.planVersionId,
  };

  const { display: baseDisplay } = await validateProposeAction(
    {
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      threadId: input.threadId,
      userId: input.userId,
    },
    {
      actionType: "revise_creative",
      label: "Confirmar revisão do criativo",
      inputSnapshot,
    }
  );

  const display = buildReviseCreativeActionDisplay({
    proposal: result,
    baseDisplay,
    resolvedReferences,
  });

  const { action } = await createAssistantAction(input.workspaceId, {
    threadId: input.threadId,
    content: display.label,
    inputSnapshot,
    display,
    sourceFlowRevision: null,
    sourceSnapshotDigest: null,
  });

  return {
    kind: "action_card",
    content: result.summary,
    actionRecordId: action.id,
  };
}

export async function markCreativeProposalsStaleOnPlanChange(input: {
  scope: ArtifactScope;
  oldPlanVersionId: string;
}): Promise<{ staleProposalIds: string[] }> {
  const matches = await listArtifactProposalsByPlanVersion({
    scope: input.scope,
    planVersionId: input.oldPlanVersionId,
  });

  const staleProposalIds: string[] = [];
  for (const proposal of matches) {
    await transitionArtifactProposal({
      scope: input.scope,
      proposalId: proposal.id,
      nextStatus: "stale",
    });
    staleProposalIds.push(proposal.id);
  }

  return { staleProposalIds };
}
