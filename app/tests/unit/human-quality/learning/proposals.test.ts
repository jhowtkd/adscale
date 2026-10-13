import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";

vi.mock("@/server/repositories/human-quality-corpus", () => ({ listEvaluatedCorpusWithEvaluations: vi.fn() }));
vi.mock("@/server/repositories/assistant-goal", () => ({ getCorpusConsent: vi.fn() }));
vi.mock("@/server/repositories/human-quality-feedback-artifact", () => ({ listFeedbackArtifactIdsByCorpusItemIds: vi.fn() }));
vi.mock("@/server/brand-taste/local-learning-authorization", () => ({ requireLocalLearningAuthorization: vi.fn() }));
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { getCorpusConsent } from "@/server/repositories/assistant-goal";
import { listFeedbackArtifactIdsByCorpusItemIds } from "@/server/repositories/human-quality-feedback-artifact";
import { requireLocalLearningAuthorization } from "@/server/brand-taste/local-learning-authorization";

vi.mock("@/server/repositories/client-learning-proposal", () => ({
  getClientLearningProposalById: vi.fn(),
  markProposalAccepted: vi.fn(),
  markProposalRejected: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-rule", () => ({
  insertCalibrationRule: vi.fn(),
  listApprovedCalibrationRulesByCategories: vi.fn(),
  updateCalibrationRuleStatus: vi.fn(),
}));

import { insertCalibrationRule, listApprovedCalibrationRulesByCategories, updateCalibrationRuleStatus } from "@/server/repositories/calibration-rule";
import {
  getClientLearningProposalById,
  markProposalAccepted,
  markProposalRejected,
} from "@/server/repositories/client-learning-proposal";
import {
  acceptClientLearningProposal,
  ClientLearningProposalError,
  rejectClientLearningProposal,
} from "@/server/human-quality/learning/proposals";

const baseEvidence = {
  corpusItemIds: ["item-1", "item-2", "item-3"],
  artifactIds: ["artifact-1", "artifact-2"],
  stats: {
    count: 3,
    meanSignedDelta: 18,
    meanAbsError: 18,
    overScoreCount: 3,
    underScoreCount: 0,
  },
};

const proposedProposal = {
  id: "p1",
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  sliceKey: "ws-1:profile-1:visual_overload|art_variation|1:1",
  primaryFailureReason: "visual_overload",
  status: "proposed" as const,
  evidenceRefs: baseEvidence,
  rationale: "Máx. 3 zonas de informação; um hook dominante",
  proposedAt: new Date("2026-06-17"),
  acceptedAt: null,
  acceptedBy: null,
  rejectedReason: null,
    rejectedBy: null,
    rejectedAt: null,
  cooldownUntil: null,
  createdAt: new Date("2026-06-17"),
};

function evidenceRows(reason = "visual_overload"): EvaluatedCorpusRow[] {
  return baseEvidence.corpusItemIds.map(id => ({
    item: { id, workspaceId: "ws-1", clientProfileId: "profile-1", generationMode: "art_variation", format: "1:1",
      qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" } },
    evaluation: { id: `eval-${id}`, workspaceId: "ws-1", corpusItemId: id, visualScore: 62,
      factualPass: true, intent: "reject", primaryFailureReason: reason, createdAt: new Date("2026-06-01") },
    sourceLabel: "synthetic_fixture",
  } as EvaluatedCorpusRow));
}

describe("client learning proposal accept/reject", () => {
  const mockGetProposal = vi.mocked(getClientLearningProposalById);
  const mockInsertRule = vi.mocked(insertCalibrationRule);
  const mockListApprovedRules = vi.mocked(listApprovedCalibrationRulesByCategories);
  const mockUpdateRule = vi.mocked(updateCalibrationRuleStatus);
  const mockMarkAccepted = vi.mocked(markProposalAccepted);
  const mockMarkRejected = vi.mocked(markProposalRejected);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listEvaluatedCorpusWithEvaluations).mockResolvedValue(evidenceRows());
    vi.mocked(getCorpusConsent).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(requireLocalLearningAuthorization).mockResolvedValue(undefined);
    vi.mocked(listFeedbackArtifactIdsByCorpusItemIds).mockResolvedValue(new Map([["item-1", "artifact-1"], ["item-2", "artifact-2"]]));
    mockGetProposal.mockResolvedValue(proposedProposal as never);
    mockInsertRule.mockResolvedValue({
      id: "rule-1",
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      category: "corpus_quality",
      status: "approved",
      rationale: "visual_overload: Máx. 3 zonas de informação; um hook dominante",
      supportingSignalIds: ["artifact-1", "artifact-2"],
      confidence: "medium",
      caveats: [],
      mismatchBucket: null,
      version: 1,
      approvedAt: new Date("2026-06-17T12:00:00Z"),
      approvedBy: "user-1",
      createdAt: new Date("2026-06-17"),
      updatedAt: new Date("2026-06-17"),
    } as never);
    mockMarkAccepted.mockImplementation(async (_id, reviewerUserId, ruleInput) => ({
      proposal: { ...proposedProposal, status: "accepted", acceptedAt: new Date("2026-06-17T12:00:00Z"), acceptedBy: reviewerUserId },
      rule: await mockInsertRule(ruleInput),
    } as never));
    mockListApprovedRules.mockResolvedValue([]);
    mockUpdateRule.mockResolvedValue(null);
  });

  it.each(["visual_overload", "illegible_cta"])("acceptProposal persists %s in an approved calibration_rule and marks proposal accepted", async (primaryFailureReason) => {
    vi.mocked(listEvaluatedCorpusWithEvaluations).mockResolvedValue(evidenceRows(primaryFailureReason).map(row => ({ ...row, sourceLabel: "real_customer" })));
    mockGetProposal.mockResolvedValue({
      ...proposedProposal,
      primaryFailureReason,
      sliceKey: `ws-1:profile-1:${primaryFailureReason}|art_variation|1:1`,
    } as never);
    const result = await acceptClientLearningProposal({
      proposalId: "p1",
      reviewerUserId: "user-1",
    });

    expect(result.rule.category).toBe("corpus_quality");
    expect(result.rule.status).toBe("approved");
    expect(mockInsertRule).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        category: "corpus_quality",
        status: "approved",
        primaryFailureReason,
        rationale: `${primaryFailureReason}: Máx. 3 zonas de informação; um hook dominante`,
        supportingSignalIds: [],
        supportingEvidenceRefs: [
          { kind: "corpus_item", id: "item-1" },
          { kind: "corpus_item", id: "item-2" },
          { kind: "corpus_item", id: "item-3" },
          { kind: "feedback_artifact", id: "artifact-1" },
          { kind: "feedback_artifact", id: "artifact-2" },
        ],
        approvedBy: "user-1",
      })
    );
    expect(mockMarkAccepted).toHaveBeenCalledWith("p1", "user-1", expect.objectContaining({ status: "approved", approvedBy: "user-1" }));
    expect(result.proposal.status).toBe("accepted");
  });

  it("acceptProposal enforces the cap by deprecating the oldest of 11 approved rules", async () => {
    vi.mocked(listEvaluatedCorpusWithEvaluations).mockResolvedValue(evidenceRows().map(row => ({ ...row, sourceLabel: "real_customer" })));
    const insertedRule = {
      id: "rule-1",
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      category: "corpus_quality",
      status: "approved",
      rationale: "visual_overload: Máx. 3 zonas de informação; um hook dominante",
      supportingSignalIds: ["artifact-1", "artifact-2"],
      confidence: "medium",
      caveats: [],
      mismatchBucket: null,
      version: 1,
      approvedAt: new Date("2026-06-17T12:00:00Z"),
      approvedBy: "user-1",
      createdAt: new Date("2026-06-17"),
      updatedAt: new Date("2026-06-17"),
    };
    const storedRules = Array.from({ length: 10 }, (_, index) => ({
      ...insertedRule,
      id: `existing-${index}`,
      approvedAt: new Date(`2026-06-${String(index + 1).padStart(2, "0")}T12:00:00Z`),
    })).reverse();
    mockInsertRule.mockImplementation(async () => {
      storedRules.push(insertedRule);
      return insertedRule;
    });
    mockListApprovedRules.mockImplementation(async () =>
      storedRules.filter((rule) => rule.status === "approved")
    );
    mockUpdateRule.mockImplementation(async (input) => {
      const rule = storedRules.find((rule) => rule.id === input.id)!;
      rule.status = input.status;
      return rule;
    });

    const result = await acceptClientLearningProposal({
      proposalId: "p1",
      reviewerUserId: "user-1",
    });

    expect(mockListApprovedRules).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      categories: ["corpus_quality"],
    });
    expect(mockUpdateRule).toHaveBeenCalledTimes(1);
    expect(mockUpdateRule).toHaveBeenCalledWith({
      id: "existing-0",
      workspaceId: "ws-1",
      status: "deprecated",
    });
    const approvedRules = storedRules.filter((rule) => rule.status === "approved");
    expect(approvedRules).toHaveLength(10);
    expect(approvedRules.map((rule) => rule.id)).toContain(insertedRule.id);
    expect(storedRules.find((rule) => rule.id === "existing-0")?.status).toBe("deprecated");
    expect(result.rule.status).toBe("approved");
    expect(result.proposal.status).toBe("accepted");
  });

  it("acceptProposal rejects when proposal is not proposed", async () => {
    mockGetProposal.mockResolvedValue({
      ...proposedProposal,
      status: "accepted",
    } as never);

    await expect(
      acceptClientLearningProposal({
        proposalId: "p1",
        reviewerUserId: "user-1",
      })
    ).rejects.toBeInstanceOf(ClientLearningProposalError);

    await expect(
      acceptClientLearningProposal({
        proposalId: "p1",
        reviewerUserId: "user-1",
      })
    ).rejects.toMatchObject({ code: "not_proposed" });
  });

  it("acceptProposal rejects when corpus evidence is below MIN_SLICE_SAMPLE", async () => {
    mockGetProposal.mockResolvedValue({
      ...proposedProposal,
      evidenceRefs: {
        ...baseEvidence,
        corpusItemIds: ["item-1", "item-2"],
      },
    } as never);

    await expect(
      acceptClientLearningProposal({
        proposalId: "p1",
        reviewerUserId: "user-1",
      })
    ).rejects.toMatchObject({ code: "insufficient_evidence" });
  });

  it("acceptProposal rejects fixture-only proposals without acknowledgment", async () => {
    mockGetProposal.mockResolvedValue({
      ...proposedProposal,
      evidenceRefs: {
        ...baseEvidence,
        fixtureOnly: true,
      },
    } as never);

    await expect(
      acceptClientLearningProposal({
        proposalId: "p1",
        reviewerUserId: "user-1",
      })
    ).rejects.toMatchObject({ code: "fixture_ack_required" });

    expect(mockInsertRule).not.toHaveBeenCalled();
  });

  it("acceptProposal proceeds for fixture-only when acknowledged", async () => {
    mockGetProposal.mockResolvedValue({
      ...proposedProposal,
      evidenceRefs: {
        ...baseEvidence,
        fixtureOnly: true,
      },
    } as never);
    mockInsertRule.mockResolvedValue({
      id: "rule-1",
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      category: "corpus_quality",
      status: "approved",
      rationale: "visual_overload: Máx. 3 zonas de informação; um hook dominante",
      supportingSignalIds: ["artifact-1", "artifact-2"],
      confidence: "medium",
      caveats: ["fixture_only_corpus"],
      mismatchBucket: null,
      version: 1,
      approvedAt: new Date("2026-06-17T12:00:00Z"),
      approvedBy: "user-1",
      createdAt: new Date("2026-06-17"),
      updatedAt: new Date("2026-06-17"),
    } as never);

    const result = await acceptClientLearningProposal({
      proposalId: "p1",
      reviewerUserId: "user-1",
      acknowledgeFixtureOnly: true,
    });

    expect(mockInsertRule).toHaveBeenCalledWith(
      expect.objectContaining({
        caveats: ["fixture_only_corpus"],
        supportingSignalIds: [],
        supportingEvidenceRefs: [
          { kind: "corpus_item", id: "item-1" },
          { kind: "corpus_item", id: "item-2" },
          { kind: "corpus_item", id: "item-3" },
          { kind: "feedback_artifact", id: "artifact-1" },
          { kind: "feedback_artifact", id: "artifact-2" },
        ],
      })
    );
    expect(result.rule.caveats).toEqual(["fixture_only_corpus"]);
  });

  it.each(["accepted", "rejected"])("synthetic confirmation cannot override %s state", async status => {
    mockGetProposal.mockResolvedValue({ ...proposedProposal, status } as never);
    await expect(acceptClientLearningProposal({ proposalId: "p1", reviewerUserId: "user-1", acknowledgeFixtureOnly: true }))
      .rejects.toMatchObject({ code: "not_proposed" });
    expect(mockInsertRule).not.toHaveBeenCalled();
  });

  it.each(["scope", "consent", "objective", "missing", "replay", "artifact"])("synthetic confirmation does not bypass %s validation", async invalid => {
    const rows = evidenceRows();
    if (invalid === "scope") rows[0].item.clientProfileId = "other-brand";
    if (invalid === "consent") vi.mocked(getCorpusConsent).mockResolvedValue(null);
    if (invalid === "objective") rows[0].item.qualitySnapshot.hardFailures = [{ code: "factual_issue", message: "Falha factual" }];
    if (invalid === "artifact") vi.mocked(listFeedbackArtifactIdsByCorpusItemIds).mockResolvedValue(new Map());
    vi.mocked(listEvaluatedCorpusWithEvaluations).mockResolvedValue(invalid === "missing" ? rows.slice(0, 2) : invalid === "replay" ? [rows[0], rows[0], rows[0]] : rows);
    await expect(acceptClientLearningProposal({ proposalId: "p1", reviewerUserId: "user-1", acknowledgeFixtureOnly: true }))
      .rejects.toMatchObject({ code: invalid === "consent" ? "client_consent_required" : "insufficient_evidence" });
    expect(mockInsertRule).not.toHaveBeenCalled();
    expect(mockMarkAccepted).not.toHaveBeenCalled();
  });

  it("derives synthetic acknowledgment from current evidence even if the saved flag is absent", async () => {
    await expect(acceptClientLearningProposal({ proposalId: "p1", reviewerUserId: "user-1" }))
      .rejects.toMatchObject({ code: "fixture_ack_required" });
    expect(mockInsertRule).not.toHaveBeenCalled();
  });

  it("rejectProposal marks proposal rejected with 30-day cooldown", async () => {
    const rejectedAt = new Date("2026-06-17T12:00:00Z");
    const cooldownUntil = new Date("2026-07-17T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(rejectedAt);

    mockMarkRejected.mockResolvedValue({
      ...proposedProposal,
      status: "rejected",
      rejectedReason: "Not actionable yet",
      cooldownUntil,
    } as never);

    const result = await rejectClientLearningProposal({
      proposalId: "p1",
      reviewerUserId: "user-1",
      reason: "Not actionable yet",
    });

    expect(result.status).toBe("rejected");
    expect(mockMarkRejected).toHaveBeenCalledWith(
      "p1",
      "Not actionable yet",
      cooldownUntil,
      "user-1",
      rejectedAt
    );

    vi.useRealTimers();
  });

  it("rejectProposal requires a non-empty reason", async () => {
    await expect(
      rejectClientLearningProposal({
        proposalId: "p1",
        reviewerUserId: "user-1",
        reason: "   ",
      })
    ).rejects.toMatchObject({ code: "missing_reason" });
  });

  it("rejectProposal rejects when proposal is not proposed", async () => {
    mockGetProposal.mockResolvedValue(null);

    await expect(
      rejectClientLearningProposal({
        proposalId: "p1",
        reviewerUserId: "user-1",
        reason: "Duplicate slice",
      })
    ).rejects.toMatchObject({ code: "not_proposed" });
  });
});
