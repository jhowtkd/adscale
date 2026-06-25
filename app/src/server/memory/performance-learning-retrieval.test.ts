import { beforeEach, describe, expect, it, vi } from "vitest";

const { listLearningsByClientProfile, getLearningsByIds, getMem0Client, getBrandMemoryUserId } =
  vi.hoisted(() => ({
    listLearningsByClientProfile: vi.fn(),
    getLearningsByIds: vi.fn(),
    getMem0Client: vi.fn(),
    getBrandMemoryUserId: vi.fn(() => "user_ws"),
  }));

vi.mock("../repositories/client-learning", () => ({
  listLearningsByClientProfile,
  getLearningsByIds,
}));

vi.mock("./mem0-client", () => ({
  getMem0Client,
  getBrandMemoryUserId,
}));

import { searchPerformanceLearnings } from "./performance-learning-retrieval";

const canonicalRow = {
  id: "learning-1",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  variableKey: "cta",
  variableValue: "Comprar",
  primaryMetric: "ctr",
  expectedDirection: "increase",
  statement: "test",
  confidence: "medium",
  confidenceScore: "0.5000",
  sampleImpressions: 1000,
  sampleCampaignCount: 1,
  contextPlatforms: ["meta"],
  contextObjectives: ["conversions"],
  supportingEvidence: [],
  contradictingEvidence: [],
  algorithmVersion: "1.0.0",
  status: "approved",
  mem0MemoryId: "mem-1",
  lastEvidenceAt: new Date(),
  approvedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("searchPerformanceLearnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listLearningsByClientProfile.mockResolvedValue([canonicalRow]);
  });

  it("falls back to postgres when mem0 is disabled", async () => {
    getMem0Client.mockReturnValue(null);
    const result = await searchPerformanceLearnings({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    });
    expect(result.source).toBe("postgres");
    expect(result.learnings[0]?.id).toBe("learning-1");
  });

  it("resolves mem0 hits to canonical postgres rows", async () => {
    const search = vi.fn().mockResolvedValue([
      { metadata: { learningId: "learning-1" }, score: 0.9, memory: "summary" },
    ]);
    getMem0Client.mockReturnValue({ search });
    getLearningsByIds.mockResolvedValue([canonicalRow]);

    const result = await searchPerformanceLearnings({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    });

    expect(getBrandMemoryUserId).toHaveBeenCalledWith("ws-1", "client-1");
    expect(search).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        user_id: "user_ws",
        filters: {
          AND: [
            { metadata: { memoryType: "performance_learning" } },
            { metadata: { clientProfileId: "client-1" } },
          ],
        },
      })
    );
    expect(result.source).toBe("mem0");
    expect(result.learnings[0]?.statement).toBe("test");
    expect(result.learnings[0]?.relevance).toBe(0.9);
  });

  it("falls back to postgres when mem0 search fails", async () => {
    getMem0Client.mockReturnValue({
      search: vi.fn().mockRejectedValue(new Error("mem0 unavailable")),
    });

    const result = await searchPerformanceLearnings({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    });

    expect(result.source).toBe("postgres");
    expect(result.learnings[0]?.id).toBe("learning-1");
  });
});
