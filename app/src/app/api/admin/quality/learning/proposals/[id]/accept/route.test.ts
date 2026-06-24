import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/human-quality/learning/proposals", () => ({
  acceptClientLearningProposal: vi.fn(),
  ClientLearningProposalError: class ClientLearningProposalError extends Error {
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
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  acceptClientLearningProposal,
  ClientLearningProposalError,
} from "@/server/human-quality/learning/proposals";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const PROPOSAL_ID = "550e8400-e29b-41d4-a716-446655440001";
const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";
const RULE_ID = "550e8400-e29b-41d4-a716-446655440004";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockAccept = vi.mocked(acceptClientLearningProposal);

const acceptResult = {
  proposal: {
    id: PROPOSAL_ID,
    workspaceId: WORKSPACE_ID,
    clientProfileId: CLIENT_PROFILE_ID,
    sliceKey: `${WORKSPACE_ID}:${CLIENT_PROFILE_ID}:visual_overload|art_variation|1:1`,
    primaryFailureReason: "visual_overload",
    status: "accepted" as const,
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
    acceptedAt: new Date("2026-06-17"),
    acceptedBy: "owner-1",
    rejectedReason: null,
    cooldownUntil: null,
    createdAt: new Date("2026-06-17"),
  },
  rule: {
    id: RULE_ID,
    workspaceId: WORKSPACE_ID,
    clientProfileId: CLIENT_PROFILE_ID,
    category: "corpus_quality",
    status: "approved",
    rationale: "visual_overload: Máx. 3 zonas de informação; um hook dominante",
    supportingSignalIds: [],
    confidence: "medium",
    caveats: [],
    mismatchBucket: null,
    version: 1,
    approvedAt: new Date("2026-06-17"),
    approvedBy: "owner-1",
    createdAt: new Date("2026-06-17"),
    updatedAt: new Date("2026-06-17"),
  },
};

describe("POST /api/admin/quality/learning/proposals/[id]/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockAccept.mockResolvedValue(acceptResult);
  });

  it("accepts a proposal for platform owner", async () => {
    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/accept`,
        { method: "POST" }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proposal.status).toBe("accepted");
    expect(body.rule.id).toBe(RULE_ID);
    expect(mockAccept).toHaveBeenCalledWith({
      proposalId: PROPOSAL_ID,
      reviewerUserId: "owner-1",
      acknowledgeFixtureOnly: false,
    });
  });

  it("passes acknowledgeFixtureOnly from request body", async () => {
    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acknowledgeFixtureOnly: true }),
        }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mockAccept).toHaveBeenCalledWith({
      proposalId: PROPOSAL_ID,
      reviewerUserId: "owner-1",
      acknowledgeFixtureOnly: true,
    });
  });

  it("returns 404 when proposal is not proposed", async () => {
    mockAccept.mockRejectedValue(
      new ClientLearningProposalError("not_proposed", "Proposal not found or not proposed")
    );

    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/accept`,
        { method: "POST" }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 422 when evidence is insufficient", async () => {
    mockAccept.mockRejectedValue(
      new ClientLearningProposalError("insufficient_evidence", "Need 3+ corpus items")
    );

    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/accept`,
        { method: "POST" }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(422);
  });

  it("returns 422 when fixture acknowledgment is required", async () => {
    mockAccept.mockRejectedValue(
      new ClientLearningProposalError(
        "fixture_ack_required",
        "Fixture-only corpus evidence requires explicit acknowledgment"
      )
    );

    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/accept`,
        { method: "POST" }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(422);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/accept`,
        { method: "POST" }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(401);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await POST(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals/${PROPOSAL_ID}/accept`,
        { method: "POST" }
      ),
      { params: Promise.resolve({ id: PROPOSAL_ID }) }
    );

    expect(res.status).toBe(403);
    expect(mockAccept).not.toHaveBeenCalled();
  });
});
