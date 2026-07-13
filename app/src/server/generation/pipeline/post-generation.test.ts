import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/creative-score", () => ({
  analyzeDerivationCreative: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/server/storage", () => ({
  objectStorage: { get: vi.fn(), put: vi.fn() },
}));

vi.mock("@/server/generation/pipeline/score-derivation", () => ({
  scoreCompletedDerivation: vi.fn(),
}));

vi.mock("@/server/ai/creative-quality-gate", () => ({
  runCompletedDerivationQualityGate: vi.fn(),
}));

vi.mock("@/server/human-quality/candidate-capture", () => ({
  captureCorpusCandidateFromDerivation: vi.fn(),
}));

import { analyzeDerivationCreative } from "@/server/ai/creative-score";
import { runCreativeWorkPostGeneration } from "./post-generation";
import {
  decideCreativeWorkRefund,
  decideDerivationRefund,
  decideJobIdempotency,
  decidePostGenerationQuality,
} from "@/server/generation/canonical/policies";
import { executeCanonicalGeneration } from "./execute";
import { generateAndStoreImage } from "@/server/ai/image-generation";
import {
  GENERATION_CREDIT_COSTS,
  type GenerationRequest,
} from "@/server/generation/canonical/types";

vi.mock("@/server/ai/image-generation", () => ({
  generateAndStoreImage: vi.fn(),
}));

const mockAnalyze = vi.mocked(analyzeDerivationCreative);
const mockGenerate = vi.mocked(generateAndStoreImage);

function analyzeInput(buffer = Buffer.from("img")) {
  return {
    imageBuffer: buffer,
    mimeType: "image/png",
    campaign: {
      name: "Tema",
      client: "Cliente",
      product: "Tema",
      offer: "Oferta",
      objective: "Obj",
      audience: "Aud",
    },
    derivation: {
      ctaText: "CTA",
      format: "4:5",
      generationMode: "art_variation",
      feedback: null,
      creativeLevel: "balanced",
      creativeDiagnosis: null,
    },
    locale: "pt-BR",
    contract: null,
  };
}

describe("runCreativeWorkPostGeneration", () => {
  beforeEach(() => {
    mockAnalyze.mockReset();
  });

  it("accepts scores above the shared threshold", async () => {
    mockAnalyze.mockResolvedValue({
      scoreStatus: "analyzed",
      qualityScore: 80,
      scoreBreakdown: {} as never,
      scoreIssues: [],
      regenerationSuggestion: "",
    });
    const result = await runCreativeWorkPostGeneration({
      workItemId: "w1",
      outputId: "o1",
      analyze: analyzeInput(),
    });
    expect(result.decision).toBe("accept");
  });

  it("rejects low quality and returns the shared refund decision", async () => {
    mockAnalyze.mockResolvedValue({
      scoreStatus: "analyzed",
      qualityScore: 30,
      scoreBreakdown: {} as never,
      scoreIssues: [],
      regenerationSuggestion: "",
    });
    const result = await runCreativeWorkPostGeneration({
      workItemId: "w1",
      outputId: "o1",
      analyze: analyzeInput(),
    });
    expect(result.decision).toBe("reject_low_quality");
    if (result.decision === "reject_low_quality") {
      expect(result.refund).toEqual(
        decideCreativeWorkRefund({
          surface: "quick_tool",
          failurePhase: "low_quality",
          workItemId: "w1",
          outputId: "o1",
        })
      );
    }
  });

  it("accepts when the scorer crashes (score unavailable)", async () => {
    mockAnalyze.mockRejectedValue(new Error("scorer 500"));
    const result = await runCreativeWorkPostGeneration({
      workItemId: "w1",
      outputId: "o1",
      analyze: analyzeInput(),
    });
    expect(result.decision).toBe("accept");
    expect(result.quality).toBeNull();
  });
});

describe("shared pipeline parity across failure phases", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue({
      outputKey: "out/1.png",
      revisedPrompt: "revised",
      imageOperation: "generate",
      buffer: Buffer.from("img"),
      candidates: [],
    });
    mockAnalyze.mockReset();
  });

  function unitRequest(surface: "campaign" | "quick_tool"): GenerationRequest {
    return {
      authorship: { workspaceId: "ws-1", userId: "u-1" },
      origin: surface === "quick_tool" ? "quick_tool" : "campaign",
      surface,
      intent: {
        mode: surface === "quick_tool" ? "social_post" : "art_variation",
        objective: null,
      },
      identity: {
        clientProfileId: null,
        referenceImages: [],
        brandConstraints: null,
      },
      format: {
        targetFormat: "1:1",
        dimensions: { width: 1024, height: 1024 },
        constraints: null,
      },
      source: {
        parentId: null,
        sourceVersionId: null,
        lineageId: null,
        packageSource: null,
      },
      prompt: { text: "Generate" },
      cost: {
        chargeAmount:
          surface === "quick_tool"
            ? GENERATION_CREDIT_COSTS.creativeWorkOutput
            : GENERATION_CREDIT_COSTS.singleDerivation,
        refundPolicy: "default",
      },
      idempotency: {
        billingKey:
          surface === "quick_tool"
            ? "creative-work:w:output:o:generate"
            : "derivation:d:generate",
        skipWhenOutputExists: true,
      },
      destination:
        surface === "quick_tool"
          ? {
              kind: "creative_work_output",
              id: "o",
              storagePrefix: "creative-work/o",
              workItemId: "w",
            }
          : {
              kind: "derivation",
              id: "d",
              storagePrefix: "derivations/d",
            },
    };
  }

  it("pre_provider: skips provider and applies surface refund policy", async () => {
    // Simulate adapter catching prompt/ref failure before executeCanonicalGeneration.
    const campaignRefund = decideDerivationRefund({
      surface: "campaign",
      generationMode: "art_variation",
      failurePhase: "pre_provider",
    });
    const postRefund = decideCreativeWorkRefund({
      surface: "quick_tool",
      failurePhase: "pre_provider",
      workItemId: "w",
      outputId: "o",
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(campaignRefund.refund).toBe(false);
    expect(postRefund.refund).toBe(true);
  });

  it("post_provider: shared executor throws; neither surface refunds in-job", async () => {
    mockGenerate.mockRejectedValue(new Error("provider timeout"));
    await expect(
      executeCanonicalGeneration(unitRequest("campaign"))
    ).rejects.toThrow(/provider timeout/);
    await expect(
      executeCanonicalGeneration(unitRequest("quick_tool"))
    ).rejects.toThrow(/provider timeout/);
    expect(
      decideDerivationRefund({
        surface: "campaign",
        generationMode: "art_variation",
        failurePhase: "post_provider",
      }).refund
    ).toBe(false);
    expect(
      decideCreativeWorkRefund({
        surface: "quick_tool",
        failurePhase: "post_provider",
        workItemId: "w",
        outputId: "o",
      }).refund
    ).toBe(false);
  });

  it("low_quality: shared post-gen rejects Criar Post; campaign policy accepts", async () => {
    mockAnalyze.mockResolvedValue({
      scoreStatus: "analyzed",
      qualityScore: 40,
      scoreBreakdown: {} as never,
      scoreIssues: [],
      regenerationSuggestion: "",
    });
    const post = await runCreativeWorkPostGeneration({
      workItemId: "w",
      outputId: "o",
      analyze: analyzeInput(),
    });
    expect(post.decision).toBe("reject_low_quality");
    expect(
      decidePostGenerationQuality({
        surface: "campaign",
        quality: { scoreStatus: "analyzed", qualityScore: 40 },
      }).accept
    ).toBe(true);
  });

  it("duplicate: both surfaces skip via shared idempotency policy", () => {
    expect(
      decideJobIdempotency({ surface: "campaign", hasOutputKey: true }).skip
    ).toBe(true);
    expect(
      decideJobIdempotency({
        surface: "quick_tool",
        outputStatus: "completed",
      }).skip
    ).toBe(true);
  });

  it("success path: both surfaces share executeCanonicalGeneration provider call", async () => {
    await executeCanonicalGeneration(unitRequest("campaign"));
    await executeCanonicalGeneration(unitRequest("quick_tool"));
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });
});
