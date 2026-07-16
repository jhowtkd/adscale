import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/image-generation", () => ({
  generateAndStoreImage: vi.fn(),
}));

vi.mock("@/server/ai/creative-route-planner", () => ({
  planCreativeRoutes: vi.fn(),
}));

vi.mock("@/server/ai/creative-candidate-selector", () => ({
  selectCreativeCandidate: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { generateAndStoreImage } from "@/server/ai/image-generation";
import { planCreativeRoutes } from "@/server/ai/creative-route-planner";
import { selectCreativeCandidate } from "@/server/ai/creative-candidate-selector";
import {
  executeCanonicalGeneration,
} from "@/server/generation/pipeline/execute";
import {
  GENERATION_CREDIT_COSTS,
  type GenerationRequest,
} from "@/server/generation/canonical/types";
import {
  decideCreativeWorkRefund,
  decideDerivationRefund,
  decideJobIdempotency,
} from "@/server/generation/canonical/policies";

const mockGenerate = vi.mocked(generateAndStoreImage);
const mockPlanRoutes = vi.mocked(planCreativeRoutes);
const mockSelectCandidate = vi.mocked(selectCreativeCandidate);

const ROUTES = ["one", "two", "three"].map((name, index) => ({
  id: `route-${index + 1}`,
  thesis: `Thesis ${name}`,
  visualMechanism: `mechanism-${name}`,
  scene: `Scene ${name}`,
  composition: `Composition ${name}`,
  preserve: ["brand"],
  avoid: ["AI slop"],
  renderPrompt: `Render ${name}`,
}));

function baseRequest(
  overrides: Partial<GenerationRequest> & {
    surface: GenerationRequest["surface"];
    destination: GenerationRequest["destination"];
  }
): GenerationRequest {
  return {
    authorship: { workspaceId: "ws-1", userId: "user-1" },
    origin:
      overrides.surface === "quick_tool"
        ? "quick_tool"
        : overrides.surface === "assistant"
          ? "assistant"
          : "campaign",
    surface: overrides.surface,
    intent: { mode: "art_variation", objective: "Leads" },
    identity: {
      clientProfileId: "client-1",
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
    prompt: { text: "Generate a creative" },
    cost: {
      chargeAmount: GENERATION_CREDIT_COSTS.singleDerivation,
      refundPolicy: "default",
    },
    idempotency: {
      billingKey: "test:billing",
      skipWhenOutputExists: true,
    },
    destination: overrides.destination,
    ...overrides,
  };
}

describe("executeCanonicalGeneration parity", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockPlanRoutes.mockReset();
    mockSelectCandidate.mockReset();
    mockPlanRoutes.mockResolvedValue(ROUTES);
    mockSelectCandidate.mockResolvedValue({
      winnerIndex: 1,
      invalidRouteIds: [],
      reason: "route-2 wins",
      refinementPrompt: "Remove the synthetic glow.",
    });
    mockGenerate.mockResolvedValue({
      outputKey: "out/1.png",
      revisedPrompt: "revised",
      imageOperation: "generate",
      buffer: Buffer.from("img"),
      candidates: [
        {
          provider: "openai",
          model: "m",
          outputKey: "out/1.png",
          durationMs: 1,
          winner: true,
        },
      ],
    });
  });

  it("campaign and Criar Post share the same provider path", async () => {
    const campaignReq = baseRequest({
      surface: "campaign",
      destination: {
        kind: "derivation",
        id: "der-1",
        storagePrefix: "derivations/der-1",
        campaignId: "camp-1",
      },
      idempotency: {
        billingKey: "derivation:der-1:generate",
        skipWhenOutputExists: true,
      },
    });
    const postReq = baseRequest({
      surface: "quick_tool",
      intent: { mode: "social_post", objective: "Engajamento" },
      destination: {
        kind: "creative_work_output",
        id: "out-1",
        storagePrefix: "creative-work/out-1",
        workItemId: "work-1",
      },
      cost: {
        chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
        refundPolicy: "default",
      },
      idempotency: {
        billingKey: "creative-work:work-1:output:out-1:generate",
        skipWhenOutputExists: true,
      },
    });

    const campaignResult = await executeCanonicalGeneration(campaignReq);
    const postResult = await executeCanonicalGeneration(postReq);

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(mockGenerate.mock.calls[0][0].prompt).toBe(campaignReq.prompt.text);
    expect(mockGenerate.mock.calls[1][0].prompt).toBe(postReq.prompt.text);
    expect(campaignResult.surface).toBe("campaign");
    expect(postResult.surface).toBe("quick_tool");
    expect(campaignResult.outputKey).toBe(postResult.outputKey);
  });

  it("rejects incomplete GenerationRequest before provider call", async () => {
    const bad = baseRequest({
      surface: "campaign",
      destination: {
        kind: "derivation",
        id: "der-1",
        storagePrefix: "derivations/der-1",
      },
      prompt: { text: "   " },
    });
    await expect(executeCanonicalGeneration(bad)).rejects.toThrow(/prompt/);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("plans and passes three creative routes for social posts", async () => {
    const request = baseRequest({
      surface: "quick_tool",
      intent: { mode: "social_post", objective: "Qualified trials" },
      identity: {
        clientProfileId: "client-1",
        referenceImages: [
          { buffer: Buffer.from("product"), mimeType: "image/png", name: "exact-product.png" },
        ],
        brandConstraints: "Restrained blue palette",
      },
      destination: {
        kind: "creative_work_output",
        id: "out-2",
        storagePrefix: "creative-work/out-2",
        workItemId: "work-2",
      },
    });

    await executeCanonicalGeneration(request);

    expect(mockPlanRoutes).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "social_post",
        objective: "Qualified trials",
        referenceNames: ["exact-product.png"],
      })
    );
    const generationInput = mockGenerate.mock.calls[0][0];
    expect(generationInput.routes?.map((route) => route.id)).toEqual([
      "route-1",
      "route-2",
      "route-3",
    ]);
    expect(generationInput.routes?.[0].prompt).toContain("Render one");
    expect(generationInput.routes?.[0].prompt).toContain("MANDATORY CONTRACT");
    expect(generationInput.selectCandidate).toEqual(expect.any(Function));
    const selection = await generationInput.selectCandidate?.(
      ROUTES.map((route) => ({
        routeId: route.id,
        buffer: Buffer.from(route.id),
        mimeType: "image/png",
      }))
    );
    expect(selection).toEqual({
      winnerIndex: 1,
      refinementPrompt: "Remove the synthetic glow.",
      reason: "route-2 wins",
    });
  });

  it("falls back to the direct prompt when route planning fails", async () => {
    mockPlanRoutes.mockRejectedValueOnce(new Error("planner unavailable"));
    const request = baseRequest({
      surface: "quick_tool",
      intent: { mode: "social_post", objective: "Qualified trials" },
      destination: {
        kind: "creative_work_output",
        id: "out-fallback",
        storagePrefix: "creative-work/out-fallback",
        workItemId: "work-fallback",
      },
    });

    await executeCanonicalGeneration(request);

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: request.prompt.text,
        routes: undefined,
        selectCandidate: undefined,
      })
    );
    expect(mockSelectCandidate).not.toHaveBeenCalled();
  });
});

describe("pipeline policy parity across failure phases", () => {
  it("pre_provider: Criar Post refunds, derivation job does not", () => {
    expect(
      decideCreativeWorkRefund({
        surface: "quick_tool",
        failurePhase: "pre_provider",
        workItemId: "w",
        outputId: "o",
      }).refund
    ).toBe(true);
    expect(
      decideDerivationRefund({
        surface: "campaign",
        generationMode: "art_variation",
        failurePhase: "pre_provider",
      }).refund
    ).toBe(false);
  });

  it("post_provider: neither surface refunds inside the job", () => {
    expect(
      decideCreativeWorkRefund({
        surface: "quick_tool",
        failurePhase: "post_provider",
        workItemId: "w",
        outputId: "o",
      }).refund
    ).toBe(false);
    expect(
      decideDerivationRefund({
        surface: "campaign",
        generationMode: "art_variation",
        failurePhase: "post_provider",
      }).refund
    ).toBe(false);
  });

  it("low_quality: Criar Post refunds; derivation does not", () => {
    expect(
      decideCreativeWorkRefund({
        surface: "quick_tool",
        failurePhase: "low_quality",
        workItemId: "w",
        outputId: "o",
      }).refund
    ).toBe(true);
    expect(
      decideDerivationRefund({
        surface: "campaign",
        generationMode: "art_variation",
        failurePhase: "low_quality",
      }).refund
    ).toBe(false);
  });

  it("duplicate: both surfaces skip when output already exists", () => {
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
});
