import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  listEvaluatedCorpusWithEvaluations: vi.fn(),
}));

vi.mock("@/server/human-quality/learning/aggregate", () => ({
  buildClientLearningProposals: vi.fn(),
}));

vi.mock("@/server/repositories/client-learning-proposal", () => ({
  findActiveProposalBySlice: vi.fn(),
  insertClientLearningProposal: vi.fn(),
}));

vi.mock("@/server/human-quality/learning/cross-client", () => ({
  detectAndPersistCrossClientGlobalProposals: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { buildClientLearningProposals } from "@/server/human-quality/learning/aggregate";
import {
  findActiveProposalBySlice,
  insertClientLearningProposal,
} from "@/server/repositories/client-learning-proposal";
import { detectAndPersistCrossClientGlobalProposals } from "@/server/human-quality/learning/cross-client";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";
const PROPOSAL_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockListEvaluated = vi.mocked(listEvaluatedCorpusWithEvaluations);
const mockBuildProposals = vi.mocked(buildClientLearningProposals);
const mockFindActive = vi.mocked(findActiveProposalBySlice);
const mockInsertProposal = vi.mocked(insertClientLearningProposal);
const mockDetectCrossClient = vi.mocked(detectAndPersistCrossClientGlobalProposals);

const builtProposal = {
  workspaceId: WORKSPACE_ID,
  clientProfileId: CLIENT_PROFILE_ID,
  sliceKey: `${WORKSPACE_ID}:${CLIENT_PROFILE_ID}:visual_overload|art_variation|1:1`,
  primaryFailureReason: "visual_overload",
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
};

const insertedProposal = {
  id: PROPOSAL_ID,
  ...builtProposal,
  status: "proposed" as const,
  proposedAt: new Date("2026-06-17"),
  acceptedAt: null,
  acceptedBy: null,
  rejectedReason: null,
  cooldownUntil: null,
  createdAt: new Date("2026-06-17"),
};

describe("POST /api/admin/quality/learning/proposals/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockListEvaluated.mockResolvedValue([]);
    mockBuildProposals.mockReturnValue([builtProposal]);
    mockFindActive.mockResolvedValue(null);
    mockInsertProposal.mockResolvedValue(insertedProposal);
    mockDetectCrossClient.mockResolvedValue([]);
  });

  it("generates proposals for platform owner", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/quality/learning/proposals/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: WORKSPACE_ID,
          cohort: "post_learning",
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generated).toBe(1);
    expect(body.proposals).toHaveLength(1);
    expect(body.globalProposals).toBe(0);
    expect(mockDetectCrossClient).toHaveBeenCalledOnce();
    expect(mockListEvaluated).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      cohort: "post_learning",
    });
    expect(mockBuildProposals).toHaveBeenCalledOnce();
    expect(mockFindActive).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CLIENT_PROFILE_ID,
      builtProposal.sliceKey
    );
    expect(mockInsertProposal).toHaveBeenCalledWith(builtProposal);
  });

  it("skips slices that already have an active proposal", async () => {
    mockFindActive.mockResolvedValue(insertedProposal);

    const res = await POST(
      new Request("http://localhost/api/admin/quality/learning/proposals/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generated).toBe(0);
    expect(body.proposals).toEqual([]);
    expect(mockInsertProposal).not.toHaveBeenCalled();
    expect(mockListEvaluated).toHaveBeenCalledWith({});
  });

  it("returns 400 for invalid payload", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/quality/learning/proposals/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cohort: "invalid_cohort" }),
      })
    );

    expect(res.status).toBe(400);
    expect(mockListEvaluated).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await POST(
      new Request("http://localhost/api/admin/quality/learning/proposals/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(401);
    expect(mockListEvaluated).not.toHaveBeenCalled();
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await POST(
      new Request("http://localhost/api/admin/quality/learning/proposals/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(403);
    expect(mockListEvaluated).not.toHaveBeenCalled();
  });
});
