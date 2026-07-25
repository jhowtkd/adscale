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

vi.mock("@/server/ai/creative-quality-gate", async (importOriginal) => ({
  // Keep the real pure verdict/payload builders (R-005) and mock only the
  // derivation gate orchestration.
  ...(await importOriginal<typeof import("@/server/ai/creative-quality-gate")>()),
  runCompletedDerivationQualityGate: vi.fn(),
}));

const analyzeCreativeWorkQaMock = vi.hoisted(() => vi.fn());
const inspectCreativeWorkImageFileMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/ai/creative-qa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/creative-qa")>()),
  analyzeCreativeWorkQa: (...args: unknown[]) => analyzeCreativeWorkQaMock(...args),
  inspectCreativeWorkImageFile: (...args: unknown[]) => inspectCreativeWorkImageFileMock(...args),
}));

vi.mock("@/server/human-quality/candidate-capture", () => ({
  captureCorpusCandidateFromDerivation: vi.fn(),
}));

import { analyzeDerivationCreative } from "@/server/ai/creative-score";
import {
  runCreativeWorkPostGeneration,
  runCreativeWorkQualityAssessment,
  type CreativeWorkQualityAssessmentInput,
} from "./post-generation";
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


// ---------------------------------------------------------------------------
// R-005 — Creative Work v1 tri-state quality assessment
// ---------------------------------------------------------------------------

describe("runCreativeWorkQualityAssessment (R-005)", () => {
  beforeEach(() => {
    mockAnalyze.mockReset();
    analyzeCreativeWorkQaMock.mockReset();
    inspectCreativeWorkImageFileMock.mockReset();
    // Default: a well-formed 1:1 file and a clean objective evaluation.
    inspectCreativeWorkImageFileMock.mockResolvedValue({
      ok: true,
      width: 1080,
      height: 1080,
      format: "png",
      bytes: 4096,
      error: null,
    });
    analyzeCreativeWorkQaMock.mockResolvedValue({ findings: [], summary: "Objetivamente íntegro." });
  });

  function scoreResult(overrides: Record<string, unknown> = {}) {
    return {
      scoreStatus: "analyzed",
      qualityScore: 80,
      scoreBreakdown: {} as never,
      scoreIssues: [],
      regenerationSuggestion: "",
      ...overrides,
    };
  }

  function assessmentInput(
    overrides: Partial<CreativeWorkQualityAssessmentInput> = {},
  ): CreativeWorkQualityAssessmentInput {
    return {
      workItemId: "w1",
      outputId: "o1",
      attempt: 1,
      imageBuffer: Buffer.from("img"),
      expectedDimensions: { width: 1080, height: 1080 },
      requiredReferenceRoles: [],
      attachedReferenceRoles: [],
      qa: {
        mode: "social_post" as const,
        format: "1:1",
        request: "Promoção de agosto com vagas limitadas",
        copy: { headline: "H", body: "B", cta: "C" },
        factPack: null,
        brandName: "Cliente XPTO",
        references: [],
        locale: "pt-BR",
      },
      score: analyzeInput(),
      ...overrides,
    };
  }

  it("score 95 + fato inventado confirmado → fail (o score nunca aprova falha objetiva e o scorer é pulado)", async () => {
    mockAnalyze.mockResolvedValue(scoreResult({ qualityScore: 95 }));
    analyzeCreativeWorkQaMock.mockResolvedValue({
      findings: [
        { code: "unsupported_claim", status: "confirmed", note: "Renderiza R$ 99 sem origem." },
      ],
      summary: "Fato inventado.",
    });

    const result = await runCreativeWorkQualityAssessment(assessmentInput());

    expect(result.objectiveVerdict).toBe("fail");
    expect(result.quality.schemaVersion).toBe(1);
    expect(result.quality.objectiveCodes).toEqual(["unsupported_claim"]);
    // T8: the advisory scorer is skipped on a confirmed objective fail — the
    // output is headed for correction/terminal failure, so no score persists
    // and the scorer is never called.
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(result.quality.subjective).toEqual({
      scoreStatus: "unavailable",
      qualityScore: null,
      issues: [],
    });
    // T8: the one-sentence evaluator summary persists for the review surface.
    expect(result.quality.evaluatorSummary).toBe("Fato inventado.");
    expect(result.quality.findings[0]).toMatchObject({
      code: "unsupported_claim",
      origin: "vision",
    });
  });

  it("score baixo sem falha objetiva → pass e o score permanece advisory", async () => {
    mockAnalyze.mockResolvedValue(
      scoreResult({ qualityScore: 30, scoreIssues: ["Composição genérica"] }),
    );

    const result = await runCreativeWorkQualityAssessment(assessmentInput());

    expect(result.objectiveVerdict).toBe("pass");
    expect(result.quality.objectiveCodes).toEqual([]);
    expect(result.quality.subjective).toEqual({
      scoreStatus: "analyzed",
      qualityScore: 30,
      issues: ["Composição genérica"],
    });
  });

  it("dimensão errada é detectada deterministicamente (sem modelo de visão)", async () => {
    inspectCreativeWorkImageFileMock.mockResolvedValue({
      ok: true,
      width: 1024,
      height: 1024,
      format: "png",
      bytes: 4096,
      error: null,
    });
    mockAnalyze.mockResolvedValue(scoreResult({ qualityScore: 92 }));

    const result = await runCreativeWorkQualityAssessment(assessmentInput());

    expect(result.objectiveVerdict).toBe("fail");
    expect(result.quality.objectiveCodes).toContain("wrong_dimensions");
    expect(result.quality.checks.dimensions).toEqual({
      ok: false,
      expected: { width: 1080, height: 1080 },
      actual: { width: 1024, height: 1024 },
    });
    expect(result.quality.findings[0]).toMatchObject({
      code: "wrong_dimensions",
      status: "confirmed",
      origin: "deterministic",
    });
    // File is decodable, so the visual evaluation still runs for other defects.
    expect(analyzeCreativeWorkQaMock).toHaveBeenCalledTimes(1);
  });

  it("arquivo inválido falha como unusable_file sem visão nem scorer", async () => {
    inspectCreativeWorkImageFileMock.mockResolvedValue({
      ok: false,
      width: null,
      height: null,
      format: null,
      bytes: 7,
      error: "Input buffer contains unsupported image format",
    });

    const result = await runCreativeWorkQualityAssessment(assessmentInput());

    expect(result.objectiveVerdict).toBe("fail");
    expect(result.quality.objectiveCodes).toEqual(["unusable_file"]);
    expect(result.quality.evaluator.status).toBe("skipped");
    expect(result.quality.checks.file.ok).toBe(false);
    // No vision/scorer call is burned on a file that cannot be evaluated.
    expect(analyzeCreativeWorkQaMock).not.toHaveBeenCalled();
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it("ausência de referência obrigatória é detectada deterministicamente", async () => {
    mockAnalyze.mockResolvedValue(scoreResult());

    const result = await runCreativeWorkQualityAssessment(
      assessmentInput({
        requiredReferenceRoles: ["original"],
        attachedReferenceRoles: [],
      }),
    );

    expect(result.objectiveVerdict).toBe("fail");
    expect(result.quality.objectiveCodes).toContain("ignored_mandatory_reference");
    expect(result.quality.checks.references).toEqual({
      ok: false,
      missingRequired: ["original"],
    });
  });

  it("QA indisponível (timeout/erro do avaliador) → inconclusive, sem retry e sem consumir segunda chamada", async () => {
    analyzeCreativeWorkQaMock.mockRejectedValue(new Error("vision QA timed out after 180s"));
    mockAnalyze.mockResolvedValue(scoreResult({ qualityScore: 88 }));

    const result = await runCreativeWorkQualityAssessment(assessmentInput());

    expect(result.objectiveVerdict).toBe("inconclusive");
    expect(result.quality.objectiveCodes).toEqual([]);
    expect(result.quality.evaluator).toEqual({
      status: "failed",
      error: "vision QA timed out after 180s",
    });
    // The assessment resolves normally — the adapter completes the output.
    expect(result.quality.attempt).toBe(1);
  });

  it("finding exclusivamente subjetivo/suspeito permanece advisory → inconclusive quando ambíguo", async () => {
    analyzeCreativeWorkQaMock.mockResolvedValue({
      findings: [{ code: "wrong_brand", status: "suspected", note: "Logo parcialmente encoberto." }],
      summary: "Ambíguo.",
    });
    mockAnalyze.mockResolvedValue(scoreResult({ qualityScore: 90 }));

    const result = await runCreativeWorkQualityAssessment(assessmentInput());

    expect(result.objectiveVerdict).toBe("inconclusive");
    expect(result.quality.objectiveCodes).toEqual([]);
    expect(result.quality.subjective.qualityScore).toBe(90);
  });

  it("falha técnica do scorer subjetivo mantém o output disponível sem score", async () => {
    mockAnalyze.mockRejectedValue(new Error("scorer 500"));

    const result = await runCreativeWorkQualityAssessment(assessmentInput());

    expect(result.objectiveVerdict).toBe("pass");
    expect(result.quality.subjective).toEqual({
      scoreStatus: "unavailable",
      qualityScore: null,
      issues: [],
    });
  });
});
