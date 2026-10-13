vi.mock("@/server/human-quality/learning/proposal-approval", () => ({ approveLearningProposal: vi.fn() }));
import { approveLearningProposal } from "@/server/human-quality/learning/proposal-approval";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/repositories/client-learning-proposal", () => ({
  getClientLearningProposalById: vi.fn(),
  markProposalRejected: vi.fn(),
}));

import {
  getClientLearningProposalById,
  markProposalRejected,
} from "@/server/repositories/client-learning-proposal";
import {
  acceptClientLearningProposal,
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
  proposalDraft: null,
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
  const mockMarkRejected = vi.mocked(markProposalRejected);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProposal.mockResolvedValue(proposedProposal as never);

  });

  it("accept delegates expected revision and actor to the atomic review command", async () => {
    const input = { proposalId: "p1", reviewerUserId: "owner", expectedRevision: "a".repeat(64), acknowledgeFixtureOnly: true };
    vi.mocked(approveLearningProposal).mockResolvedValue({ proposal: { status: "accepted" }, rule: { rationale: "Texto exato" } } as never);
    expect(await acceptClientLearningProposal(input)).toMatchObject({ rule: { rationale: "Texto exato" } });
    expect(approveLearningProposal).toHaveBeenCalledWith({ ...input, kind: "corpus_quality" });
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
