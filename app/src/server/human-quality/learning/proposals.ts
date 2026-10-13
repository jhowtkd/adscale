import { listApprovedCalibrationRulesByCategories } from "@/server/repositories/calibration-rule";
import {
  getClientLearningProposalById,
  markProposalAccepted,
  markProposalRejected,
} from "@/server/repositories/client-learning-proposal";
import type { CalibrationRule, ClientLearningProposal } from "@/server/db/schema";
import { MIN_SLICE_SAMPLE } from "../calibration/report";
import { enforceCorpusQualityRuleCap } from "./corpus-quality-cap";
import { requireLocalLearningAuthorization } from "@/server/brand-taste/local-learning-authorization";
import { getCorpusConsent } from "@/server/repositories/assistant-goal";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { buildClientLearningProposals } from "./aggregate";
import { listFeedbackArtifactIdsByCorpusItemIds } from "@/server/repositories/human-quality-feedback-artifact";

const REJECT_COOLDOWN_DAYS = 30;

export class ClientLearningProposalError extends Error {
  constructor(
    public readonly code:
      | "not_proposed"
      | "insufficient_evidence"
      | "missing_reason"
      | "client_consent_required"
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

  await requireLocalLearningAuthorization(proposal);
  const consent = await getCorpusConsent(proposal.workspaceId, proposal.clientProfileId);
  if (consent?.status !== "granted") {
    throw new ClientLearningProposalError("client_consent_required", "Consentimento vigente da marca necessário para usar o corpus.");
  }
  const ids = new Set(proposal.evidenceRefs.corpusItemIds);
  const rows = (await listEvaluatedCorpusWithEvaluations({
    workspaceId: proposal.workspaceId, clientProfileId: proposal.clientProfileId,
  })).filter(row => ids.has(row.item.id));
  if (new Set(rows.map(row => row.item.id)).size !== ids.size || rows.some(row =>
    row.item.workspaceId !== proposal.workspaceId || row.item.clientProfileId !== proposal.clientProfileId ||
    row.evaluation.workspaceId !== proposal.workspaceId || row.evaluation.corpusItemId !== row.item.id ||
    !row.evaluation.factualPass || (row.item.qualitySnapshot.hardFailures?.length ?? 0) > 0 ||
    row.item.qualitySnapshot.qualityVerdict === "fail" || row.item.qualitySnapshot.exportStatus?.value === "bloqueado"
  ) || !buildClientLearningProposals(rows).some(candidate => candidate.sliceKey === proposal.sliceKey &&
    candidate.primaryFailureReason === proposal.primaryFailureReason && candidate.evidenceRefs.corpusItemIds.length === ids.size)) {
    throw new ClientLearningProposalError("insufficient_evidence", "Evidência indisponível, fora do escopo ou inelegível.");
  }
  const fixtureOnly = proposal.evidenceRefs.fixtureOnly === true || rows.every(row => row.sourceLabel === "synthetic_fixture");
  if (proposal.evidenceRefs.artifactIds?.length) {
    const artifacts = new Set((await listFeedbackArtifactIdsByCorpusItemIds([...ids])).values());
    if (proposal.evidenceRefs.artifactIds.some(id => !artifacts.has(id))) {
      throw new ClientLearningProposalError("insufficient_evidence", "Feedback indisponível ou fora do escopo da evidência.");
    }
  }
  if (fixtureOnly && input.acknowledgeFixtureOnly !== true) {
    throw new ClientLearningProposalError(
      "fixture_ack_required",
      "Fixture-only corpus evidence requires explicit acknowledgment"
    );
  }

  const caveats =
    fixtureOnly ? ["fixture_only_corpus"] : [];

  const accepted = await markProposalAccepted(proposal.id, input.reviewerUserId, {
    workspaceId: proposal.workspaceId,
    clientProfileId: proposal.clientProfileId,
    category: "corpus_quality",
    status: "approved",
    rationale: `${proposal.primaryFailureReason}: ${proposal.rationale}`,
    primaryFailureReason: proposal.primaryFailureReason,
    supportingSignalIds: [],
    supportingEvidenceRefs: [
      ...proposal.evidenceRefs.corpusItemIds.map(id => ({ kind: "corpus_item" as const, id })),
      ...(proposal.evidenceRefs.artifactIds ?? []).map(id => ({ kind: "feedback_artifact" as const, id })),
    ],
    confidence: "medium",
    caveats,
    mismatchBucket: null,
    version: 1,
    approvedAt: new Date(),
    approvedBy: input.reviewerUserId,
  });
  if (!accepted) throw new ClientLearningProposalError("not_proposed", "Proposta já decidida.");

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

  return accepted;
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

  const rejectedAt = new Date();
  const cooldownUntil = new Date(rejectedAt.getTime() + REJECT_COOLDOWN_DAYS * 86_400_000);

  const rejectedProposal = await markProposalRejected(
    proposal.id,
    trimmedReason,
    cooldownUntil,
    input.reviewerUserId,
    rejectedAt
  );

  if (!rejectedProposal) {
    throw new ClientLearningProposalError(
      "not_proposed",
      "Proposal not found or not proposed"
    );
  }

  return rejectedProposal;
}
