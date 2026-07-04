import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: vi.fn(),
  updateGoalRun: vi.fn(),
  AssistantGoalConflictError: class AssistantGoalConflictError extends Error {},
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
  getClientReferencesByIds: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  createCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/plan", () => ({
  createPlan: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  createAsset: vi.fn(),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  linkThreadToCampaign: vi.fn(),
}));

vi.mock("@/server/assistant/artifact-version/service", () => ({
  adoptArtifactForThread: vi.fn(),
}));

import { getClientProfile, getClientReferencesByIds } from "@/server/repositories/client-reference";
import { createCampaign } from "@/server/repositories/campaign";
import { createPlan } from "@/server/repositories/plan";
import { createAsset } from "@/server/repositories/asset";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { linkThreadToCampaign } from "@/server/repositories/assistant-thread";
import { adoptArtifactForThread } from "@/server/assistant/artifact-version/service";
import {
  GOAL_BLOCKING_FIELDS,
  goalBlockers,
  materializeGoalCampaign,
  NO_CONSTRAINTS_PHRASE,
} from "./service";

const mockGetClientProfile = vi.mocked(getClientProfile);
const mockGetReferences = vi.mocked(getClientReferencesByIds);
const mockCreateCampaign = vi.mocked(createCampaign);
const mockCreatePlan = vi.mocked(createPlan);
const mockCreateAsset = vi.mocked(createAsset);
const mockGetAsset = vi.mocked(getWorkspaceAssetById);
const mockLinkThread = vi.mocked(linkThreadToCampaign);
const mockAdopt = vi.mocked(adoptArtifactForThread);

const baseGoal = {
  id: "goal-1",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: "thread-1",
  campaignId: null,
  objective: "Vender mais",
  stage: "intake",
  brief: {
    productOffer: "",
    audience: "",
    constraints: "",
    objective: "Vender mais",
    cta: "",
    referenceIds: [],
    baseAssetId: null,
  },
  plan: { strategy: "", angles: [], hooks: [], ctas: [] },
  assumptions: [],
  blockers: ["productOffer", "audience", "constraints"],
  revision: 0,
};

describe("goalBlockers", () => {
  it("blocks only productOffer, audience, and constraints", () => {
    expect(GOAL_BLOCKING_FIELDS).toEqual(["productOffer", "audience", "constraints"]);
  });

  it("reports all three blockers when the brief is empty", () => {
    expect(goalBlockers(baseGoal.brief)).toEqual([
      "productOffer",
      "audience",
      "constraints",
    ]);
  });

  it("accepts an explicit no-constraints answer", () => {
    const blockers = goalBlockers({
      ...baseGoal.brief,
      productOffer: "Camiseta",
      audience: "Jovens 18-25",
      constraints: NO_CONSTRAINTS_PHRASE,
    });
    expect(blockers).toEqual([]);
  });

  it("treats an empty constraints string as a blocker", () => {
    const blockers = goalBlockers({
      ...baseGoal.brief,
      productOffer: "Camiseta",
      audience: "Jovens 18-25",
      constraints: "   ",
    });
    expect(blockers).toEqual(["constraints"]);
  });
});

describe("materializeGoalCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientProfile.mockResolvedValue({
      id: "client-1",
      workspaceId: "ws-1",
      name: "Acme",
    } as never);
    mockCreateCampaign.mockResolvedValue({ id: "campaign-1" } as never);
    mockCreatePlan.mockResolvedValue({ id: "plan-1" } as never);
    mockLinkThread.mockResolvedValue({ id: "thread-1" } as never);
    mockAdopt.mockResolvedValue({ id: "version-1" } as never);
    mockGetReferences.mockResolvedValue([] as never);
  });

  it("materializes one draft campaign and plan idempotently when blockers clear", async () => {
    const readyGoal = {
      ...baseGoal,
      brief: {
        ...baseGoal.brief,
        productOffer: "Camiseta premium",
        audience: "Jovens 18-25",
        constraints: NO_CONSTRAINTS_PHRASE,
      },
      plan: {
        strategy: "Estratégia",
        angles: ["Ângulo 1"],
        hooks: ["Hook 1"],
        ctas: ["Compre agora"],
      },
    };

    const result = await materializeGoalCampaign(readyGoal);

    expect(mockCreateCampaign).toHaveBeenCalledTimes(1);
    expect(mockCreateCampaign).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        clientProfileId: "client-1",
        creativeLevel: "balanced",
        targetFormats: ["1:1", "4:5", "9:16", "16:9"],
        status: "draft",
      })
    );
    expect(mockCreatePlan).toHaveBeenCalledWith(
      "campaign-1",
      "ws-1",
      expect.objectContaining({ strategy: "Estratégia" })
    );
    expect(mockLinkThread).toHaveBeenCalledWith("ws-1", "thread-1", "campaign-1");
    expect(result.campaignId).toBe("campaign-1");
  });

  it("does not materialize when blockers remain", async () => {
    const result = await materializeGoalCampaign(baseGoal);

    expect(mockCreateCampaign).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("copies an existing uploaded base into the campaign when present", async () => {
    const baseAssetId = "00000000-0000-4000-8000-0000000000b1";
    mockGetAsset.mockResolvedValue({
      id: baseAssetId,
      key: "uploads/base.png",
      type: "image/png",
    } as never);

    const readyGoal = {
      ...baseGoal,
      brief: {
        ...baseGoal.brief,
        productOffer: "Camiseta",
        audience: "Jovens",
        constraints: NO_CONSTRAINTS_PHRASE,
        baseAssetId,
      },
      plan: { strategy: "S", angles: [], hooks: [], ctas: [] },
    };

    await materializeGoalCampaign(readyGoal);

    expect(mockGetAsset).toHaveBeenCalledWith("ws-1", baseAssetId);
    expect(mockCreateAsset).toHaveBeenCalledWith(
      "ws-1",
      "campaign-1",
      expect.objectContaining({ key: "uploads/base.png", role: "base" })
    );
  });

  it("adopts the new plan into artifact versioning and links the thread", async () => {
    const readyGoal = {
      ...baseGoal,
      brief: {
        ...baseGoal.brief,
        productOffer: "Camiseta",
        audience: "Jovens",
        constraints: NO_CONSTRAINTS_PHRASE,
      },
      plan: { strategy: "S", angles: ["a"], hooks: ["h"], ctas: ["c"] },
    };

    await materializeGoalCampaign(readyGoal);

    expect(mockAdopt).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "thread-1",
      artifactType: "plan",
      artifactId: "plan-1",
    });
    expect(mockLinkThread).toHaveBeenCalledWith("ws-1", "thread-1", "campaign-1");
  });
});
