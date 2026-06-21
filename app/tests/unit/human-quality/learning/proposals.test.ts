import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/repositories/client-learning-proposal", () => ({
  getClientLearningProposalById: vi.fn(),
  markProposalAccepted: vi.fn(),
  markProposalRejected: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-rule", () => ({
  insertCalibrationRule: vi.fn(),
}));

import { insertCalibrationRule } from "@/server/repositories/calibration-rule";
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
  cooldownUntil: null,
  createdAt: new Date("2026-06-17"),
};

describe("client learning proposal accept/reject", () => {
  const mockGetProposal = vi.mocked(getClientLearningProposalById);
  const mockInsertRule = vi.mocked(insertCalibrationRule);
  const mockMarkAccepted = vi.mocked(markProposalAccepted);
  const mockMarkRejected = vi.mocked(markProposalRejected);

  beforeEach(() => {
    vi.clearAllMocks();
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
    mockMarkAccepted.mockResolvedValue({
      ...proposedProposal,
      status: "accepted",
      acceptedAt: new Date("2026-06-17T12:00:00Z"),
      acceptedBy: "user-1",
    } as never);
  });

  it("acceptProposal creates approved calibration_rule and marks proposal accepted", async () => {
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
        rationale: "visual_overload: Máx. 3 zonas de informação; um hook dominante",
        supportingSignalIds: ["artifact-1", "artifact-2"],
        approvedBy: "user-1",
      })
    );
    expect(mockMarkAccepted).toHaveBeenCalledWith("p1", "user-1");
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
      cooldownUntil
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
