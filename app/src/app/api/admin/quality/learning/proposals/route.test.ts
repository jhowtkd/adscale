import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/client-learning-proposal", () => ({
  listClientLearningProposals: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { listClientLearningProposals } from "@/server/repositories/client-learning-proposal";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";
const PROPOSAL_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockListProposals = vi.mocked(listClientLearningProposals);

const proposalsFixture = [
  {
    id: PROPOSAL_ID,
    workspaceId: WORKSPACE_ID,
    clientProfileId: CLIENT_PROFILE_ID,
    sliceKey: `${WORKSPACE_ID}:${CLIENT_PROFILE_ID}:visual_overload|art_variation|1:1`,
    primaryFailureReason: "visual_overload",
    status: "proposed" as const,
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
    rejectedReason: null,
    cooldownUntil: null,
    createdAt: new Date("2026-06-17"),
  },
];

describe("GET /api/admin/quality/learning/proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockListProposals.mockResolvedValue(proposalsFixture);
  });

  it("returns proposals for platform owner", async () => {
    const res = await GET(
      new Request(
        `http://localhost/api/admin/quality/learning/proposals?status=proposed&workspaceId=${WORKSPACE_ID}&clientProfileId=${CLIENT_PROFILE_ID}`
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0].id).toBe(PROPOSAL_ID);
    expect(mockListProposals).toHaveBeenCalledWith({
      status: "proposed",
      workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID,
    });
  });

  it("lists all proposals when no filters are provided", async () => {
    const res = await GET(new Request("http://localhost/api/admin/quality/learning/proposals"));

    expect(res.status).toBe(200);
    expect(mockListProposals).toHaveBeenCalledWith({});
  });

  it("returns 400 for invalid query params", async () => {
    const res = await GET(
      new Request("http://localhost/api/admin/quality/learning/proposals?workspaceId=not-a-uuid")
    );

    expect(res.status).toBe(400);
    expect(mockListProposals).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await GET(new Request("http://localhost/api/admin/quality/learning/proposals"));

    expect(res.status).toBe(401);
    expect(mockListProposals).not.toHaveBeenCalled();
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/admin/quality/learning/proposals"));

    expect(res.status).toBe(403);
    expect(mockListProposals).not.toHaveBeenCalled();
  });
});
