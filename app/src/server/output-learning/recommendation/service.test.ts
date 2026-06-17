import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOutputLearningRecommendation } from "./service";

vi.mock("../../repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("../../repositories/client-output-learning", () => ({
  listOutputLearningsByClientProfile: vi.fn(),
}));

import { getCampaignById } from "../../repositories/campaign";
import { listOutputLearningsByClientProfile } from "../../repositories/client-output-learning";

const baseLearning = {
  id: "learning-1",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  variableKey: "cta",
  variableValue: "Comprar agora",
  scopeGenerationMode: "",
  scopeFormat: "",
  preferenceDirection: "prefer",
  statement: "preferir CTA Comprar agora",
  confidence: "high",
  confidenceScore: "0.8000",
  sampleEventCount: 5,
  sampleCampaignCount: 2,
  supportingEvidence: [{ eventId: "e1", polarity: "supporting", strength: "strong" }],
  contradictingEvidence: [],
  algorithmVersion: "1.0.0",
  status: "approved",
  mem0MemoryId: null,
  approvedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  lastEvidenceAt: new Date(),
};

describe("getOutputLearningRecommendation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no_client_profile when campaign lacks client profile", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: null,
      ctaVariants: [],
    } as never);

    const result = await getOutputLearningRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("no_client_profile");
    expect(result.recommendation).toBeNull();
  });

  it("returns insufficient_evidence when no approved prefill learnings", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: "client-1",
      ctaVariants: [],
    } as never);
    vi.mocked(listOutputLearningsByClientProfile).mockResolvedValue([]);

    const result = await getOutputLearningRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("insufficient_evidence");
  });

  it("builds recommendation from top learning with evidence packet", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: "client-1",
      ctaVariants: ["Saiba mais"],
    } as never);
    vi.mocked(listOutputLearningsByClientProfile).mockResolvedValue([
      baseLearning,
      {
        ...baseLearning,
        id: "learning-2",
        variableKey: "format",
        variableValue: "1:1",
        confidence: "low",
        sampleEventCount: 1,
      },
    ] as never);

    const result = await getOutputLearningRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("ready");
    expect(result.recommendation?.primaryVariableKey).toBe("cta");
    expect(result.recommendation?.prefill.ctaVariants[0]).toBe("Comprar agora");
    expect(result.recommendation?.evidence).toHaveLength(2);
    expect(result.recommendation?.justification).toContain("Comprar agora");
    expect(result.recommendation?.learningsSource).toBe("postgres");
  });

  it("surfaces contradicting evidence in the recommendation packet", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: "client-1",
      ctaVariants: [],
    } as never);
    vi.mocked(listOutputLearningsByClientProfile).mockResolvedValue([
      {
        ...baseLearning,
        contradictingEvidence: [{ eventId: "e2", polarity: "contradicting", strength: "medium" }],
      },
    ] as never);

    const result = await getOutputLearningRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("ready");
    expect(result.recommendation?.contradictions).toHaveLength(1);
    expect(result.recommendation?.evidence[0]?.contradictingCount).toBe(1);
  });

  it("excludes scoped learnings that mismatch campaign context", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: "client-1",
      ctaVariants: [],
      generationMode: "art_variation",
    } as never);
    vi.mocked(listOutputLearningsByClientProfile).mockResolvedValue([
      {
        ...baseLearning,
        scopeGenerationMode: "format_adaptation",
      },
    ] as never);

    const result = await getOutputLearningRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("insufficient_evidence");
  });

  it("includes avoid_pattern hints without using them as primary prefill", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: "client-1",
      ctaVariants: [],
    } as never);
    vi.mocked(listOutputLearningsByClientProfile).mockResolvedValue([
      baseLearning,
      {
        ...baseLearning,
        id: "learning-avoid",
        variableKey: "avoid_pattern",
        variableValue: "logo_distorted",
        preferenceDirection: "avoid",
        statement: "evitar padrão logo_distorted",
      },
    ] as never);

    const result = await getOutputLearningRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("ready");
    expect(result.recommendation?.primaryVariableKey).toBe("cta");
    expect(result.recommendation?.avoidPatterns).toHaveLength(1);
    expect(result.recommendation?.avoidPatterns[0]?.pattern).toBe("logo_distorted");
  });
});
