import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/human-quality/learning/proposals", () => ({
  rejectClientLearningProposal: vi.fn(),
  ClientLearningProposalError: class ClientLearningProposalError extends Error {
    constructor(
      public readonly code: "not_proposed" | "insufficient_evidence" | "missing_reason",
      message: string
    ) {
      super(message);
      this.name = "ClientLearningProposalError";
    }
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  rejectClientLearningProposal,
  ClientLearningProposalError,
} from "@/server/human-quality/learning/proposals";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const PROPOSAL_ID = "550e8400-e29b-41d4-a716-446655440001";
const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockReject = vi.mocked(rejectClientLearningProposal);

const rejectedProposal = {
  id: PROPOSAL_ID,
  workspaceId: WORKSPACE_ID,
  clientProfileId: CLIENT_PROFILE_ID,
  sliceKey: `${WORKSPACE_ID}:${CLIENT_PROFILE_ID}:visual_overload|art_variation|1:1`,
  primaryFailureReason: "visual_overload",
  status: "rejected" as const,
  rationale: "Máx. 3 zonas de informação; um hook dominante",
  evidenceRefs: {
    corpusItemIds: ["item-1", "item-2", "item-3"],
    stats: {
      count: 3,
      meanSignedDelta: 18,
      meanAbsError: 18,
      overScoreCount: 3,
      underScoreCount: 0,
    },
  },
  proposedAt: new Date("2026-06-17"),
  acceptedAt: null,
  acceptedBy: null,
  rejectedReason: "Not enough brand context",
  cooldownUntil: new Date("2026-07-17"),
  createdAt: new Date("2026-06-17"),
};

describe("POST /api/admin/quality/learning/proposals/[id]/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockReject.mockResolvedValue(rejectedProposal);
  });

  it("rejects a proposal for platform owner", async () => {
    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Not enough brand context" }),
        }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proposal.status).toBe("rejected");
    expect(mockReject).toHaveBeenCalledWith({
      proposalId: PROPOSAL_ID,
      reviewerUserId: "owner-1",
      reason: "Not enough brand context",
    });
  });

  it("returns 400 when reason is missing", async () => {
    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "" }),
        }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(400);
    expect(mockReject).not.toHaveBeenCalled();
  });

  it("returns 404 when proposal is not proposed", async () => {
    mockReject.mockRejectedValue(
      new ClientLearningProposalError("not_proposed", "Proposal not found or not proposed")
    );

    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Not enough brand context" }),
        }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Not enough brand context" }),
        }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(401);
    expect(mockReject).not.toHaveBeenCalled();
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Not enough brand context" }),
        }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(403);
    expect(mockReject).not.toHaveBeenCalled();
  });
});
