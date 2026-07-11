import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildApprovedCtaClientOutputLearning,
  buildOutputLearningEvidenceRef,
} from "../../repositories/client-output-learning.fixture";
import { getOutputLearningRecommendation } from "./service";

vi.mock("../../repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("../../repositories/client-output-learning", () => ({
  listOutputLearningsByClientProfile: vi.fn(),
}));

import { getCampaignById } from "../../repositories/campaign";
import { listOutputLearningsByClientProfile } from "../../repositories/client-output-learning";

const baseLearning = buildApprovedCtaClientOutputLearning({
  clientProfileId: "client-1",
  scopeGenerationMode: "",
  scopeFormat: "",
  confidenceScore: "0.8000",
  sampleEventCount: 5,
  supportingEvidence: [
    buildOutputLearningEvidenceRef({
      eventId: "e1",
      strength: "strong",
      variableKey: "cta",
      variableValue: "Comprar agora",
    }),
  ],
});

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
    expect(result.recommendation?.appliedLearningTrace.learningsSource).toBe("postgres");
    expect(result.recommendation?.appliedLearningTrace.entries[0]?.evidenceEventIds).toEqual([
      "e1",
    ]);
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
    expect(
      result.recommendation?.appliedLearningTrace.entries.find(
        (entry) => entry.variableKey === "avoid_pattern"
      )?.applied
    ).toBe(false);
  });

  it("sanitizes prefill when restyling campaign conflicts with format_adaptation (SAFE-01)", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: "client-1",
      ctaVariants: [],
      generationMode: "restyling",
    } as never);
    vi.mocked(listOutputLearningsByClientProfile).mockResolvedValue([
      {
        ...baseLearning,
        variableKey: "format",
        variableValue: "9:16",
      },
    ] as never);

    const result = await getOutputLearningRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("ready");
    expect(result.recommendation?.prefill.generationMode).toBe("art_variation");
    expect(result.recommendation?.appliedLearningTrace.blockedFields.length).toBeGreaterThan(0);
  });

  it("excludes non-approved learnings even if returned by repository (SAFE-02)", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      clientProfileId: "client-1",
      ctaVariants: [],
    } as never);
    vi.mocked(listOutputLearningsByClientProfile).mockResolvedValue([
      { ...baseLearning, status: "draft" },
    ] as never);

    const result = await getOutputLearningRecommendation({
      workspaceId: "ws-1",
      campaignId: "campaign-1",
    });

    expect(result.status).toBe("insufficient_evidence");
  });
});
