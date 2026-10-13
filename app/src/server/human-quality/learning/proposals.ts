import { approveLearningProposal } from "./proposal-approval";
import {
  getClientLearningProposalById,
  markProposalRejected,
} from "@/server/repositories/client-learning-proposal";
import type { CalibrationRule, ClientLearningProposal } from "@/server/db/schema";

const REJECT_COOLDOWN_DAYS = 30;

export class ClientLearningProposalError extends Error {
  constructor(
    public readonly code:
      | "not_proposed"
      | "insufficient_evidence"
      | "missing_reason"
      | "fixture_ack_required",
    message: string
  ) {
    super(message);
    this.name = "ClientLearningProposalError";
  }
}

function assertProposalIsProposed(
  proposal: ClientLearningProposal | null
): asserts proposal is ClientLearningProposal {
  if (!proposal || proposal.status !== "proposed") {
    throw new ClientLearningProposalError(
      "not_proposed",
      "Proposal not found or not proposed"
    );
  }
}

export async function acceptClientLearningProposal(input: {
  proposalId: string; reviewerUserId: string; expectedRevision: string; acknowledgeFixtureOnly?: boolean;
}): Promise<{ proposal: ClientLearningProposal & { expectedRevision: string }; rule: CalibrationRule }> {
  return approveLearningProposal({ ...input, kind: "corpus_quality" }) as Promise<{ proposal: ClientLearningProposal & { expectedRevision: string }; rule: CalibrationRule }>;
}

export async function rejectClientLearningProposal(input: {
  proposalId: string;
  reviewerUserId: string;
  reason: string;
}): Promise<ClientLearningProposal> {
  const proposal = await getClientLearningProposalById(input.proposalId);
  assertProposalIsProposed(proposal);

  const trimmedReason = input.reason.trim();
  if (!trimmedReason) {
    throw new ClientLearningProposalError("missing_reason", "Rejection reason is required");
  }

  const cooldownUntil = new Date();
  cooldownUntil.setDate(cooldownUntil.getDate() + REJECT_COOLDOWN_DAYS);

  const rejectedProposal = await markProposalRejected(
    proposal.id,
    trimmedReason,
    cooldownUntil
  );

  if (!rejectedProposal) {
    throw new ClientLearningProposalError(
      "not_proposed",
      "Proposal not found or not proposed"
    );
  }

  return rejectedProposal;
}
