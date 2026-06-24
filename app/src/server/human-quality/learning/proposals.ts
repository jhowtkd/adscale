import { insertCalibrationRule, listApprovedCalibrationRulesByCategories } from "@/server/repositories/calibration-rule";
import {
  getClientLearningProposalById,
  markProposalAccepted,
  markProposalRejected,
} from "@/server/repositories/client-learning-proposal";
import type { CalibrationRule, ClientLearningProposal } from "@/server/db/schema";
import { MIN_SLICE_SAMPLE } from "../calibration/report";
import { enforceCorpusQualityRuleCap } from "./corpus-quality-cap";

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
  proposalId: string;
  reviewerUserId: string;
  acknowledgeFixtureOnly?: boolean;
}): Promise<{ proposal: ClientLearningProposal; rule: CalibrationRule }> {
  const proposal = await getClientLearningProposalById(input.proposalId);
  assertProposalIsProposed(proposal);

  if (proposal.evidenceRefs.corpusItemIds.length < MIN_SLICE_SAMPLE) {
    throw new ClientLearningProposalError(
      "insufficient_evidence",
      "Need 3+ corpus items"
    );
  }

  if (proposal.evidenceRefs.fixtureOnly === true && !input.acknowledgeFixtureOnly) {
    throw new ClientLearningProposalError(
      "fixture_ack_required",
      "Fixture-only corpus evidence requires explicit acknowledgment"
    );
  }

  const caveats =
    proposal.evidenceRefs.fixtureOnly === true ? ["fixture_only_corpus"] : [];

  const rule = await insertCalibrationRule({
    workspaceId: proposal.workspaceId,
    clientProfileId: proposal.clientProfileId,
    category: "corpus_quality",
    status: "approved",
    rationale: `${proposal.primaryFailureReason}: ${proposal.rationale}`,
    supportingSignalIds: proposal.evidenceRefs.artifactIds ?? [],
    confidence: "medium",
    caveats,
    mismatchBucket: null,
    version: 1,
    approvedAt: new Date(),
    approvedBy: input.reviewerUserId,
  });

  const approvedCorpusRules = await listApprovedCalibrationRulesByCategories({
    workspaceId: proposal.workspaceId,
    clientProfileId: proposal.clientProfileId,
    categories: ["corpus_quality"],
  });
  await enforceCorpusQualityRuleCap({
    workspaceId: proposal.workspaceId,
    clientProfileId: proposal.clientProfileId,
    rules: approvedCorpusRules,
  });

  const acceptedProposal = await markProposalAccepted(
    proposal.id,
    input.reviewerUserId
  );

  return {
    proposal: acceptedProposal ?? proposal,
    rule,
  };
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
