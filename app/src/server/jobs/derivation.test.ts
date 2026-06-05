import { describe, it, expect, vi, beforeEach } from "vitest";

const sharpOperations = vi.hoisted(() => [] as Array<{ method: string; args: unknown[] }>);

vi.mock("sharp", () => ({
  default: vi.fn((input: unknown) => {
    sharpOperations.push({ method: "sharp", args: [input] });
    const chain = {
      resize: vi.fn((...args: unknown[]) => {
        sharpOperations.push({ method: "resize", args });
        return chain;
      }),
      blur: vi.fn((...args: unknown[]) => {
        sharpOperations.push({ method: "blur", args });
        return chain;
      }),
      modulate: vi.fn((...args: unknown[]) => {
        sharpOperations.push({ method: "modulate", args });
        return chain;
      }),
      composite: vi.fn((...args: unknown[]) => {
        sharpOperations.push({ method: "composite", args });
        return chain;
      }),
      png: vi.fn(() => chain),
      toBuffer: vi.fn(() => Promise.resolve(Buffer.from("normalized"))),
    };
    return chain;
  }),
}));

// Expose the OpenAI images mock so tests can assert request parameters (e.g. size).
const mockOpenAIImages = vi.hoisted(() => ({
  edit: vi.fn(() =>
    Promise.resolve({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    })
  ),
  generate: vi.fn(() =>
    Promise.resolve({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    })
  ),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    images = mockOpenAIImages;
  },
  toFile: vi.fn((buffer: Buffer, name: string, opts: { type: string }) => ({
    buffer,
    name,
    type: opts.type,
  })),
}));

vi.mock("../storage/r2", () => ({
  uploadBuffer: vi.fn(() => Promise.resolve()),
  downloadBuffer: vi.fn(() => Promise.resolve(Buffer.from("mock-image"))),
}));

vi.mock("../repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  refreshCampaignStatus: vi.fn(),
}));

vi.mock("../repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
}));

vi.mock("../repositories/plan", () => ({
  getPlanByCampaign: vi.fn(),
}));

vi.mock("../db/repositories/brand-kit", () => ({
  getBrandKitByWorkspace: vi.fn(),
}));

vi.mock("../repositories/competitor-analysis", () => ({
  getCompetitorAnalysesByCampaign: vi.fn(),
}));

const mockUpdateDerivationPromptProvenance = vi.hoisted(() => vi.fn(() => Promise.resolve({})));

vi.mock("../repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  updateDerivationScore: vi.fn(),
  updateDerivationPromptProvenance: mockUpdateDerivationPromptProvenance,
}));

vi.mock("../ai/creative-quality-gate", () => ({
  runCompletedDerivationQualityGate: vi.fn(() => Promise.resolve()),
}));

vi.mock("../repositories/client-reference", () => ({
  getClientReferencesByIds: vi.fn(() => Promise.resolve([])),
  getClientProfile: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/memory/brand-memory-context", () => ({
  getBrandMemoryContext: vi.fn(() => Promise.resolve({ items: [], block: "" })),
}));

vi.mock("../repositories/usage", () => ({
  trackUsage: vi.fn(),
}));

vi.mock("./client", () => ({
  inngest: {
    createFunction: vi.fn((_opts: unknown, handler: unknown) => ({
      fn: handler,
    })),
    realtime: {
      publish: vi.fn(() => Promise.resolve()),
    },
  },
}));

vi.mock("@/server/ai/creative-score", () => ({
  scoreDerivationHeuristic: vi.fn(() => ({
    qualityScore: 75,
    scoreStatus: "heuristic",
    scoreBreakdown: null,
    scoreIssues: null,
    regenerationSuggestion: null,
  })),
  analyzeDerivationCreative: vi.fn(() =>
    Promise.resolve({
      qualityScore: 80,
      scoreStatus: "analyzed",
      scoreBreakdown: null,
      scoreIssues: null,
      regenerationSuggestion: null,
    })
  ),
}));

vi.mock("@/server/ai/creative-diagnosis", () => ({
  normalizeCreativeDiagnosis: vi.fn(() => null),
}));

vi.mock("../validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_IMAGE_MODEL: "gpt-image-1",
    DATABASE_URL: "postgres://test",
    BETTER_AUTH_SECRET: "secret",
    BETTER_AUTH_URL: "http://localhost",
    R2_ACCOUNT_ID: "test",
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET: "test",
    R2_PUBLIC_BASE_URL: "http://localhost",
    INNGEST_EVENT_KEY: "test",
    INNGEST_SIGNING_KEY: "test",
    APP_URL: "http://localhost",
  },
}));

const mockLimit = vi.fn(() => Promise.resolve([]));
const mockOrderBy = vi.fn(() => ({
  limit: mockLimit,
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockLimit,
          orderBy: mockOrderBy,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
        returning: vi.fn(() => Promise.resolve([{ status: "processing" }])),
      })),
    })),
  },
}));

import { runCompletedDerivationQualityGate } from "../ai/creative-quality-gate";
import { derivationJob, normalizeGeneratedImage } from "./derivation";
import { getDerivationById } from "../repositories/derivation";
import { getCampaignById } from "../repositories/campaign";
import { getAssetsByCampaign } from "../repositories/asset";
import { getPlanByCampaign } from "../repositories/plan";
import { getBrandKitByWorkspace } from "../db/repositories/brand-kit";
import { getCompetitorAnalysesByCampaign } from "../repositories/competitor-analysis";
import { downloadBuffer } from "../storage/r2";
import { getBrandMemoryContext } from "@/server/memory/brand-memory-context";
import { env } from "../validation/env";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockGetAssetsByCampaign = vi.mocked(getAssetsByCampaign);
const mockGetPlanByCampaign = vi.mocked(getPlanByCampaign);
const mockGetBrandKitByWorkspace = vi.mocked(getBrandKitByWorkspace);
const mockGetCompetitorAnalysesByCampaign = vi.mocked(getCompetitorAnalysesByCampaign);
const mockDownloadBuffer = vi.mocked(downloadBuffer);
const mockGetBrandMemoryContext = vi.mocked(getBrandMemoryContext);
const mockRunCompletedDerivationQualityGate = vi.mocked(runCompletedDerivationQualityGate);

async function runDerivationJob(eventData: Record<string, unknown>) {
  const event = { data: eventData } as unknown;
  const stepNames: string[] = [];
  const step = {
    run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
      stepNames.push(name);
      if (name === "check-idempotency") {
        return { outputKey: null, status: "queued" };
      }
      return fn();
    }),
    realtime: {
      publish: vi.fn(() => Promise.resolve()),
    },
  } as unknown;

  const result = await (derivationJob as unknown as { fn: (args: { event: unknown; step: unknown }) => Promise<unknown> }).fn({ event, step });
  return { result, stepNames };
}

describe("derivationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDerivationPromptProvenance.mockResolvedValue({});
    sharpOperations.length = 0;
    mockOpenAIImages.edit.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    });
    mockOpenAIImages.generate.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    });
    mockGetBrandKitByWorkspace.mockResolvedValue(null as never);
    mockGetCompetitorAnalysesByCampaign.mockResolvedValue([]);
    mockGetBrandMemoryContext.mockResolvedValue({ items: [], block: "" });
  });

  it("normalizes generated images without cropping the foreground", async () => {
    const output = await normalizeGeneratedImage(
      Buffer.from("wide-generated-image"),
      { width: 1080, height: 1920 },
      "art_variation"
    );

    expect(output).toEqual(Buffer.from("normalized"));
    expect(sharpOperations).toContainEqual({
      method: "resize",
      args: [
        1080,
        1920,
        expect.objectContaining({ fit: "cover", position: "centre" }),
      ],
    });
    expect(sharpOperations).toContainEqual({
      method: "resize",
      args: [
        1080,
        1920,
        expect.objectContaining({
          fit: "contain",
          position: "centre",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        }),
      ],
    });
    expect(sharpOperations).toContainEqual({
      method: "composite",
      args: [[expect.objectContaining({ gravity: "centre" })]],
    });
  });

  it("normalizes format adaptations without blurred padding or letterboxing", async () => {
    sharpOperations.length = 0;

    const output = await normalizeGeneratedImage(
      Buffer.from("portrait-generated-image"),
      { width: 1080, height: 1920 },
      "format_adaptation"
    );

    expect(output).toEqual(Buffer.from("normalized"));
    expect(sharpOperations).toContainEqual({
      method: "resize",
      args: [
        1080,
        1920,
        expect.objectContaining({ fit: "cover", position: "attention" }),
      ],
    });
    expect(sharpOperations.some((op) => op.method === "blur")).toBe(false);
    expect(sharpOperations.some((op) => op.method === "composite")).toBe(false);
    expect(
      sharpOperations.some(
        (op) =>
          op.method === "resize" &&
          typeof op.args[2] === "object" &&
          op.args[2] !== null &&
          "fit" in op.args[2] &&
          op.args[2].fit === "contain"
      )
    ).toBe(false);
  });

  it("persists contract and provenance for campaign-asset art variation", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "art_variation",
      format: "1:1",
      ctaText: "Shop Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Acme",
      product: "Widget",
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: "20% off",
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/campaign.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      locale: "en",
      generationMode: "art_variation",
      variantIndex: 0,
      ctaText: "Shop Now",
      format: "1:1",
    });

    expect(mockUpdateDerivationPromptProvenance).toHaveBeenCalled();
    const finalCall = mockUpdateDerivationPromptProvenance.mock.calls.at(-1);
    expect(finalCall?.[0]).toBe("derivation-id");
    expect(finalCall?.[1]).toBe("workspace-1");
    expect(finalCall?.[2]).toEqual(
      expect.objectContaining({
        creativeContract: expect.objectContaining({
          generationMode: "art_variation",
          targetFormat: "1:1",
          ctaSemantics: { kind: "explicit", text: "Shop Now" },
          baseAssetId: "asset-1",
          sourcePackage: "campaign_asset",
          client: "Acme",
          product: "Widget",
          offer: "20% off",
        }),
        promptProvenance: expect.objectContaining({
          schemaVersion: 1,
          sourcePackage: "campaign_asset",
          source: expect.objectContaining({
            kind: "campaign_asset",
            assetId: "asset-1",
            assetKey: "assets/campaign.png",
          }),
          generationMode: "art_variation",
          targetFormat: "1:1",
          model: "gpt-image-1",
          imageOperation: "edit",
          revisedPrompt: "revised",
          outputKey: expect.stringContaining("derivations/derivation-id/"),
        }),
        prompt: "revised",
      })
    );
  });

  it("uses parent outputKey as reference image for package format adaptation", async () => {
    mockGetDerivationById.mockImplementation(async (id: string) => {
      if (id === "parent-id") {
        return {
          id: "parent-id",
          campaignId: "campaign-id",
          workspaceId: "workspace-1",
          outputKey: "derivations/parent/output.png",
          status: "approved",
          generationMode: "art_variation",
          format: "1:1",
          parentId: null,
          ctaText: null,
          variantIndex: null,
          feedback: null,
          prompt: null,
          qualityScore: null,
          scoreStatus: "pending",
        } as Awaited<ReturnType<typeof getDerivationById>>;
      }
      return {
        id: "child-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        parentId: "parent-id",
        status: "queued",
        generationMode: "format_adaptation",
        format: "9:16",
        ctaText: "Comprar agora",
        variantIndex: 0,
        feedback: null,
        prompt: null,
        qualityScore: null,
        scoreStatus: "pending",
      } as Awaited<ReturnType<typeof getDerivationById>>;
    });

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Test",
      product: null,
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    const { stepNames } = await runDerivationJob({
      derivationId: "child-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      locale: "pt-BR",
      generationMode: "format_adaptation",
      variantIndex: 0,
      ctaText: "Comprar agora",
      format: "9:16",
    });

    expect(mockDownloadBuffer).toHaveBeenCalledWith("derivations/parent/output.png");
    expect(stepNames).toContain("quality-gate");
    expect(mockRunCompletedDerivationQualityGate).toHaveBeenCalledWith(
      expect.objectContaining({
        derivationId: "child-id",
        workspaceId: "workspace-1",
        contract: expect.objectContaining({ generationMode: "format_adaptation" }),
      })
    );

    const finalProvenanceCall = mockUpdateDerivationPromptProvenance.mock.calls.at(-1);
    expect(finalProvenanceCall?.[2]).toEqual(
      expect.objectContaining({
        creativeContract: expect.objectContaining({
          generationMode: "format_adaptation",
          targetFormat: "9:16",
          ctaSemantics: { kind: "explicit", text: "Comprar agora" },
          baseAssetId: null,
          sourcePackage: "approved_derivation",
        }),
        promptProvenance: expect.objectContaining({
          sourcePackage: "approved_derivation",
          source: expect.objectContaining({
            kind: "approved_derivation",
            derivationId: "parent-id",
            outputKey: "derivations/parent/output.png",
          }),
          generationMode: "format_adaptation",
          targetFormat: "9:16",
          imageOperation: "edit",
          revisedPrompt: "revised",
        }),
      })
    );
  });

  it("throws when parent derivation has no outputKey for package format adaptation", async () => {
    mockGetDerivationById.mockImplementation(async (id: string) => {
      if (id === "parent-id") {
        return {
          id: "parent-id",
          campaignId: "campaign-id",
          workspaceId: "workspace-1",
          outputKey: null,
          status: "approved",
          generationMode: "art_variation",
          format: "1:1",
          parentId: null,
          ctaText: null,
          variantIndex: null,
          feedback: null,
          prompt: null,
          qualityScore: null,
          scoreStatus: "pending",
        } as Awaited<ReturnType<typeof getDerivationById>>;
      }
      return {
        id: "child-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        parentId: "parent-id",
        status: "queued",
        generationMode: "format_adaptation",
        format: "9:16",
        ctaText: "Comprar agora",
        variantIndex: 0,
        feedback: null,
        prompt: null,
        qualityScore: null,
        scoreStatus: "pending",
      } as Awaited<ReturnType<typeof getDerivationById>>;
    });

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Test",
      product: null,
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/campaign.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    await expect(
      runDerivationJob({
        derivationId: "child-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        locale: "pt-BR",
        generationMode: "format_adaptation",
        variantIndex: 0,
        ctaText: "Comprar agora",
        format: "9:16",
      })
    ).rejects.toThrow("Parent derivation output is missing");
  });

  it("uses campaign asset for manual format_adaptation without parent", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "4:5",
      ctaText: "Shop Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Test",
      product: null,
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "format_adaptation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/campaign.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      locale: "en",
      generationMode: "format_adaptation",
      variantIndex: 0,
      ctaText: "Shop Now",
      format: "4:5",
    });

    expect(mockDownloadBuffer).toHaveBeenCalledWith("assets/campaign.png");
  });
});

// ---------------------------------------------------------------------------
// Target-aspect generation size assertions for format_adaptation (gpt-image-2)
// ---------------------------------------------------------------------------

function buildFormatAdaptationJob(format: string, isPreview?: boolean) {
  return {
    derivationId: "size-test-id",
    campaignId: "campaign-id",
    workspaceId: "workspace-1",
    locale: "en",
    generationMode: "format_adaptation",
    variantIndex: 0,
    ctaText: "Buy Now",
    format,
    isPreview,
  };
}

describe("derivationJob — format adaptation generation sizes (gpt-image-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharpOperations.length = 0;

    // Override model to gpt-image-2 for this suite
    (env as unknown as Record<string, string>).OPENAI_IMAGE_MODEL = "gpt-image-2";

    mockOpenAIImages.edit.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    });
    mockOpenAIImages.generate.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    });
    mockGetBrandKitByWorkspace.mockResolvedValue(null as never);
    mockGetCompetitorAnalysesByCampaign.mockResolvedValue([]);
    mockGetBrandMemoryContext.mockResolvedValue({ items: [], block: "" });

    mockGetDerivationById.mockResolvedValue({
      id: "size-test-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "4:5",
      ctaText: "Buy Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Test",
      product: null,
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "format_adaptation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/campaign.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);
  });

  afterEach(() => {
    (env as unknown as Record<string, string>).OPENAI_IMAGE_MODEL = "gpt-image-1";
  });

  it("4:5 format adaptation edit request receives target-aspect size 1024x1280", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "size-test-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "4:5",
      ctaText: "Buy Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await runDerivationJob(buildFormatAdaptationJob("4:5"));

    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1280" })
    );
    expect(mockOpenAIImages.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1024" })
    );
  });

  it("9:16 format adaptation edit request receives target-aspect size 1152x2048", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "size-test-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "9:16",
      ctaText: "Buy Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await runDerivationJob(buildFormatAdaptationJob("9:16"));

    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1152x2048" })
    );
    expect(mockOpenAIImages.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1024" })
    );
  });

  it("4:5 preview format adaptation does NOT send square 1024x1024 to OpenAI", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "size-test-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "4:5",
      ctaText: "Buy Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await runDerivationJob(buildFormatAdaptationJob("4:5", true));

    expect(mockOpenAIImages.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1024" })
    );
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1280" })
    );
  });

  it("9:16 preview format adaptation does NOT send square 1024x1024 to OpenAI", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "size-test-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "9:16",
      ctaText: "Buy Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await runDerivationJob(buildFormatAdaptationJob("9:16", true));

    expect(mockOpenAIImages.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1024" })
    );
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1152x2048" })
    );
  });

  it("normalizeGeneratedImage for format_adaptation never uses blur, composite, or fit:contain", async () => {
    sharpOperations.length = 0;

    await normalizeGeneratedImage(
      Buffer.from("portrait-generated"),
      { width: 1080, height: 1350 },
      "format_adaptation"
    );

    expect(sharpOperations.some((op) => op.method === "blur")).toBe(false);
    expect(sharpOperations.some((op) => op.method === "composite")).toBe(false);
    expect(
      sharpOperations.some(
        (op) =>
          op.method === "resize" &&
          typeof op.args[2] === "object" &&
          op.args[2] !== null &&
          "fit" in op.args[2] &&
          (op.args[2] as { fit: string }).fit === "contain"
      )
    ).toBe(false);
    expect(sharpOperations).toContainEqual(
      expect.objectContaining({
        method: "resize",
        args: [1080, 1350, expect.objectContaining({ fit: "cover" })],
      })
    );
  });
});
