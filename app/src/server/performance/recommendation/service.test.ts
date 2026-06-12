import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNextExperimentRecommendation } from "./service";

vi.mock("../../repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("../learning/service", () => ({
  LearningDomainError: class LearningDomainError extends Error {
    constructor(
      public readonly code: string,
      public readonly status: number
    ) {
      super(code);
    }
  },
  listCampaignLearnings: vi.fn(),
}));

import { getCampaignById } from "../../repositories/campaign";
import { listCampaignLearnings } from "../learning/service";

const baseLearning = {
  id: "learning-1",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  variableKey: "cta",
  variableValue: "Comprar agora",
  primaryMetric: "ctr",
  expectedDirection: "increase" as const,
  statement: "CTA tende a aumentar CTR",
  confidence: "high" as const,
  confidenceScore: "0.8000",
  sampleImpressions: 5000,
  sampleCampaignCount: 2,
  contextPlatforms: ["meta"],
  contextObjectives: ["conversions"],
  supportingEvidence: [{ comparisonId: "c1" }],
  contradictingEvidence: [],
  algorithmVersion: "1.0.0",
  status: "approved",
  mem0MemoryId: null,
  approvedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  lastEvidenceAt: new Date(),
  relevance: 0.9,
};

describe("getNextExperimentRecommendation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no_client_profile when campaign lacks client profile", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: null,
      ctaVariants: [],
    } as never);

    const result = await getNextExperimentRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("no_client_profile");
    expect(result.recommendation).toBeNull();
  });

  it("returns insufficient_evidence when no approved learnings", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: "client-1",
      ctaVariants: [],
    } as never);
    vi.mocked(listCampaignLearnings).mockResolvedValue({
      source: "postgres",
      learnings: [],
      clientProfileId: "client-1",
    });

    const result = await getNextExperimentRecommendation({
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
    vi.mocked(listCampaignLearnings).mockResolvedValue({
      source: "mem0",
      clientProfileId: "client-1",
      learnings: [
        baseLearning,
        {
          ...baseLearning,
          id: "learning-2",
          variableKey: "format",
          variableValue: "1:1",
          confidence: "low",
          sampleImpressions: 500,
          relevance: 0.2,
        },
      ],
    });

    const result = await getNextExperimentRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("ready");
    expect(result.recommendation?.primaryVariableKey).toBe("cta");
    expect(result.recommendation?.prefill.ctaVariants[0]).toBe("Comprar agora");
    expect(result.recommendation?.evidence).toHaveLength(2);
    expect(result.recommendation?.justification).toContain("Comprar agora");
    expect(result.recommendation?.learningsSource).toBe("mem0");
  });

  it("surfaces contradicting evidence in the recommendation packet", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: "client-1",
      ctaVariants: [],
    } as never);
    vi.mocked(listCampaignLearnings).mockResolvedValue({
      source: "postgres",
      clientProfileId: "client-1",
      learnings: [
        {
          ...baseLearning,
          contradictingEvidence: [{ comparisonId: "c-contra" }],
        },
      ],
    });

    const result = await getNextExperimentRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("ready");
    expect(result.recommendation?.contradictions).toHaveLength(1);
    expect(result.recommendation?.evidence[0]?.contradictingCount).toBe(1);
  });
});
