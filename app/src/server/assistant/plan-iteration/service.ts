import { validateProposeAction } from "@/server/assistant/action-contracts/validate";
import { createAssistantAction } from "@/server/repositories/assistant-action";
import { type ArtifactScope } from "@/server/repositories/artifact-version";
import { classifyPlanRevisionIntent } from "./intent";
import { proposePlanRevision } from "./proposal";
import type { PlanRevisionProposalResult } from "./types";

export function buildReviseCreativePlanActionDisplay(input: {
  proposal: PlanRevisionProposalResult;
  baseDisplay: Awaited<ReturnType<typeof validateProposeAction>>["display"];
}) {
  return {
    ...input.baseDisplay,
    actionType: "revise_creative_plan",
    proposalId: input.proposal.proposalId,
    label: "Confirmar revisão do plano",
    summary: input.proposal.summary,
    sourceVersionLabel: input.proposal.sourceVersionLabel,
    approvedVersionLabel: input.proposal.approvedVersionLabel,
    workingDiffersFromApproved: input.proposal.workingDiffersFromApproved,
    writes: input.proposal.writes,
    proposalStatus: "pending" as const,
    mismatchWarning: input.proposal.workingDiffersFromApproved
      ? `Você está revisando ${input.proposal.sourceVersionLabel}; aprovada atual é ${input.proposal.approvedVersionLabel ?? "nenhuma"}.`
      : undefined,
  };
}

export async function handlePlanRevisionMessage(input: {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  userId: string;
  scope: ArtifactScope;
  userMessage: string;
  messageId?: string;
}): Promise<
  | { kind: "continue" }
  | { kind: "assistant"; content: string }
  | { kind: "action_card"; content: string; actionRecordId: string }
> {
  const intent = classifyPlanRevisionIntent(input.userMessage);
  if (intent.kind === "continue") {
    return { kind: "continue" };
  }

  const result = await proposePlanRevision({
    scope: input.scope,
    feedback: input.userMessage,
    messageId: input.messageId,
  });

  if (result.kind === "clarify" || result.kind === "ask_target") {
    return { kind: "assistant", content: result.question };
  }
  if (result.kind === "redirect") {
    return { kind: "assistant", content: result.message };
  }

  const { display: baseDisplay } = await validateProposeAction(
    {
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      threadId: input.threadId,
      userId: input.userId,
    },
    {
      actionType: "revise_creative_plan",
      label: "Confirmar revisão do plano",
      inputSnapshot: {
        proposalId: result.proposalId,
        lineageId: result.lineageId,
        sourceVersionId: result.sourceVersionId,
        payloadDigest: result.payloadDigest,
      },
    }
  );

  const display = buildReviseCreativePlanActionDisplay({ proposal: result, baseDisplay });
  const { action } = await createAssistantAction(input.workspaceId, {
    threadId: input.threadId,
    content: display.label,
    inputSnapshot: {
      proposalId: result.proposalId,
      lineageId: result.lineageId,
      sourceVersionId: result.sourceVersionId,
      payloadDigest: result.payloadDigest,
    },
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
