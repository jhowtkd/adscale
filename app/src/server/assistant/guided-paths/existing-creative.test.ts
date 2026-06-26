import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  acknowledgeExistingCreativeDiagnosis,
  buildExistingCreativePromptAugment,
  selectExistingCreative,
} from "./existing-creative";

vi.mock("@/server/repositories/guided-flow", () => ({
  GuidedFlowValidationError: class GuidedFlowValidationError extends Error {
    name = "GuidedFlowValidationError";
  },
  getGuidedFlowByThread: vi.fn(),
  patchGuidedFlow: vi.fn(),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  createAsset: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  linkThreadToCampaign: vi.fn(),
}));

vi.mock("@/server/storage/r2", () => ({
  downloadBuffer: vi.fn(),
}));

vi.mock("@/server/ai/image-analysis", () => ({
  analyzeImageContent: vi.fn(),
}));

vi.mock("@/server/ai/creative-diagnosis", () => ({
  analyzeCreativeDiagnosis: vi.fn(),
}));

import { getGuidedFlowByThread, patchGuidedFlow } from "@/server/repositories/guided-flow";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { getClientProfile } from "@/server/repositories/client-reference";
import { createCampaign, updateCampaign } from "@/server/repositories/campaign";
import { createAsset } from "@/server/repositories/asset";
import { linkThreadToCampaign } from "@/server/repositories/assistant-thread";
import { downloadBuffer } from "@/server/storage/r2";
import { analyzeImageContent } from "@/server/ai/image-analysis";
import { analyzeCreativeDiagnosis } from "@/server/ai/creative-diagnosis";

const mockGetFlow = vi.mocked(getGuidedFlowByThread);
const mockPatch = vi.mocked(patchGuidedFlow);
const mockGetAsset = vi.mocked(getWorkspaceAssetById);
const mockGetProfile = vi.mocked(getClientProfile);
const mockCreateCampaign = vi.mocked(createCampaign);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockCreateAsset = vi.mocked(createAsset);
const mockLinkThread = vi.mocked(linkThreadToCampaign);
const mockDownload = vi.mocked(downloadBuffer);
const mockAnalyzeImage = vi.mocked(analyzeImageContent);
const mockAnalyzeDiagnosis = vi.mocked(analyzeCreativeDiagnosis);

const baseFlow = {
  id: "flow-1",
  workspaceId: "ws-1",
  clientProfileId: "cp-1",
  threadId: "t-1",
  path: "existing_creative",
  status: "active",
  currentStep: "select_creative",
  slots: {},
  missingFields: [],
  assetIds: [],
  referenceIds: [],
  campaignId: null,
};

describe("buildExistingCreativePromptAugment", () => {
  it("returns augment at confirm_improvement with base creative id", () => {
    const augment = buildExistingCreativePromptAugment({
      currentStep: "confirm_improvement",
      slots: {
        baseCreativeId: "asset-1",
        briefingSnapshot: {
          offer: "20% off",
          audience: "Women",
          ctaText: "Buy now",
        },
      },
      assetIds: ["asset-1"],
    });

    expect(augment).toContain("quick_restyle");
    expect(augment).toContain("asset-1");
    expect(augment).toContain("20% off");
  });

  it("returns null for other steps", () => {
    expect(
      buildExistingCreativePromptAugment({
        currentStep: "review_diagnosis",
        slots: {},
        assetIds: [],
      })
    ).toBeNull();
  });
});

describe("selectExistingCreative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFlow.mockResolvedValue(baseFlow as Awaited<ReturnType<typeof getGuidedFlowByThread>>);
    mockGetAsset.mockResolvedValue({
      id: "wa-1",
      key: "workspaces/ws-1/assets/test.jpg",
      type: "image/jpeg",
      size: 1000,
      width: 100,
      height: 100,
    } as Awaited<ReturnType<typeof getWorkspaceAssetById>>);
    mockGetProfile.mockResolvedValue({
      id: "cp-1",
      name: "Acme",
    } as Awaited<ReturnType<typeof getClientProfile>>);
    mockCreateCampaign.mockResolvedValue({
      id: "camp-1",
      name: "Acme — peça existente",
    } as Awaited<ReturnType<typeof createCampaign>>);
    mockCreateAsset.mockResolvedValue({
      id: "asset-1",
    } as Awaited<ReturnType<typeof createAsset>>);
    mockDownload.mockResolvedValue(Buffer.from("img"));
    mockAnalyzeImage.mockResolvedValue({
      product: "Shoes",
      offer: "Sale",
      cta: { text: "Shop", style: "button" },
      brandElements: ["logo"],
      keyVisual: "runner",
      textContent: { headline: "Hi", bullets: [] },
      format: "square",
    });
    mockAnalyzeDiagnosis.mockResolvedValue({
      diagnosis: {
        detectedConcept: "Sale ad",
        elementsToPreserve: ["headline"],
        variationOpportunities: ["more contrast"],
      },
      status: "ready",
      source: "ai",
    });
    mockPatch.mockResolvedValue({
      ...baseFlow,
      currentStep: "review_diagnosis",
      campaignId: "camp-1",
      assetIds: ["asset-1"],
    } as Awaited<ReturnType<typeof patchGuidedFlow>>);
  });

  it("creates campaign after asset selection and advances flow", async () => {
    const result = await selectExistingCreative({
      workspaceId: "ws-1",
      threadId: "t-1",
      clientProfileId: "cp-1",
      workspaceAssetId: "wa-1",
    });

    expect(mockCreateCampaign).toHaveBeenCalled();
    expect(mockCreateAsset).toHaveBeenCalled();
    expect(mockLinkThread).toHaveBeenCalledWith("ws-1", "t-1", "camp-1");
    expect(mockUpdateCampaign).toHaveBeenCalled();
    expect(mockPatch).toHaveBeenCalledWith(
      "ws-1",
      "t-1",
      "cp-1",
      expect.objectContaining({ currentStep: "review_diagnosis", campaignId: "camp-1" })
    );
    expect(result.campaignId).toBe("camp-1");
    expect(result.campaignAssetId).toBe("asset-1");
  });
});

describe("acknowledgeExistingCreativeDiagnosis", () => {
  it("advances to confirm_improvement", async () => {
    mockGetFlow.mockResolvedValue({
      ...baseFlow,
      currentStep: "review_diagnosis",
    } as Awaited<ReturnType<typeof getGuidedFlowByThread>>);
    mockPatch.mockResolvedValue({
      ...baseFlow,
      currentStep: "confirm_improvement",
    } as Awaited<ReturnType<typeof patchGuidedFlow>>);

    const result = await acknowledgeExistingCreativeDiagnosis({
      workspaceId: "ws-1",
      threadId: "t-1",
      clientProfileId: "cp-1",
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "ws-1",
      "t-1",
      "cp-1",
      expect.objectContaining({ currentStep: "confirm_improvement" })
    );
    expect(result.guidedFlow.currentStep).toBe("confirm_improvement");
  });
});
