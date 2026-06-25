import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateOutputLearningMem0Id, getMem0Client, getBrandMemoryUserId } = vi.hoisted(() => ({
  updateOutputLearningMem0Id: vi.fn(),
  getMem0Client: vi.fn(),
  getBrandMemoryUserId: vi.fn(() => "user_ws_profile-a"),
}));

vi.mock("../repositories/client-output-learning", () => ({
  updateOutputLearningMem0Id,
}));

vi.mock("./mem0-client", () => ({
  getMem0Client,
  getBrandMemoryUserId,
}));

import { projectOutputLearning } from "./output-learning-projection";

const baseLearning = {
  id: "learning-1",
  workspaceId: "ws-1",
  clientProfileId: "profile-a",
  variableKey: "cta",
  variableValue: "Comprar",
  scopeGenerationMode: "restyle",
  scopeFormat: "1:1",
  preferenceDirection: "prefer",
  statement: "test",
  confidence: "medium",
  confidenceScore: "0.5000",
  sampleEventCount: 10,
  sampleCampaignCount: 1,
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

describe("projectOutputLearning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("projects approved learnings into a profile-scoped mem0 user", async () => {
    const add = vi.fn().mockResolvedValue([{ id: "mem-1" }]);
    getMem0Client.mockReturnValue({ add, update: vi.fn(), delete: vi.fn() });

    await expect(projectOutputLearning(baseLearning)).resolves.toEqual({
      status: "projected",
    });

    expect(getBrandMemoryUserId).toHaveBeenCalledWith("ws-1", "profile-a");
    expect(add).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        user_id: "user_ws_profile-a",
        metadata: expect.objectContaining({ clientProfileId: "profile-a" }),
      })
    );
  });
});
