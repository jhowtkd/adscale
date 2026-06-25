import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateLearningMem0Id, getMem0Client, getBrandMemoryUserId } = vi.hoisted(() => ({
  updateLearningMem0Id: vi.fn(),
  getMem0Client: vi.fn(),
  getBrandMemoryUserId: vi.fn(() => "user_ws"),
}));

vi.mock("../repositories/client-learning", () => ({
  updateLearningMem0Id,
}));

vi.mock("./mem0-client", () => ({
  getMem0Client,
  getBrandMemoryUserId,
}));

import { projectPerformanceLearning } from "./performance-learning-projection";

const baseLearning = {
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
  mem0MemoryId: null,
  lastEvidenceAt: new Date(),
  approvedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

describe("projectPerformanceLearning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns disabled when mem0 is off", async () => {
    getMem0Client.mockReturnValue(null);
    await expect(projectPerformanceLearning(baseLearning)).resolves.toEqual({
      status: "disabled",
    });
  });

  it("creates a new mem0 memory for approved learnings", async () => {
    const add = vi.fn().mockResolvedValue([{ id: "mem-1" }]);
    getMem0Client.mockReturnValue({ add, update: vi.fn(), delete: vi.fn() });

    await expect(projectPerformanceLearning(baseLearning)).resolves.toEqual({
      status: "projected",
    });
    expect(getBrandMemoryUserId).toHaveBeenCalledWith("ws-1", "client-1");
    expect(add).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ user_id: "user_ws" })
    );
    expect(updateLearningMem0Id).toHaveBeenCalledWith("learning-1", "ws-1", "mem-1");
  });

  it("deletes mem0 memory when learning is removed", async () => {
    const del = vi.fn().mockResolvedValue({ message: "ok" });
    getMem0Client.mockReturnValue({ add: vi.fn(), update: vi.fn(), delete: del });

    await expect(
      projectPerformanceLearning({ ...baseLearning, status: "removed", mem0MemoryId: "mem-1" })
    ).resolves.toEqual({ status: "removed" });
    expect(del).toHaveBeenCalledWith("mem-1");
  });

  it("updates an existing mem0 memory when learning already has mem0MemoryId", async () => {
    const update = vi.fn().mockResolvedValue({ message: "ok" });
    getMem0Client.mockReturnValue({ add: vi.fn(), update, delete: vi.fn() });

    await expect(
      projectPerformanceLearning({ ...baseLearning, mem0MemoryId: "mem-existing" })
    ).resolves.toEqual({ status: "updated" });
    expect(update).toHaveBeenCalledWith(
      "mem-existing",
      expect.objectContaining({ metadata: expect.objectContaining({ learningId: "learning-1" }) })
    );
    expect(updateLearningMem0Id).not.toHaveBeenCalled();
  });

  it("does not throw when mem0 projection fails", async () => {
    getMem0Client.mockReturnValue({
      add: vi.fn().mockRejectedValue(new Error("mem0 down")),
      update: vi.fn(),
      delete: vi.fn(),
    });

    await expect(projectPerformanceLearning(baseLearning)).resolves.toEqual({
      status: "failed",
    });
  });
});
